import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handlePromotions, verifyAccess, tokenEmail, unsubscribeToken, validatePromotion } from '../promotions.mjs';

const origin='https://www.bunacircleco.com';
const secret='test-only-bridge-key-never-use-in-production';
const message={subject:'Gather with Buna Circle',preheader:'You’re invited',eyebrow:'WELCOME',headline:'Good coffee.\nBetter gatherings.',body:'Hello <friend>',cta:'Plan an event',url:`${origin}/book/`};
let keys,jwk,template;
const env={PROMOTIONS_ACCESS_TEAM:'test.cloudflareaccess.com',PROMOTIONS_ACCESS_AUD:'studio-test',PROMOTIONS_BRIDGE_SECRET:secret,PROMOTIONS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',PROMOTIONS_MAILING_ADDRESS:'TEST business address'};
before(async()=>{
  keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'test'};
  template=await readFile(new URL('../studio/template.html',import.meta.url),'utf8');
  env.ASSETS={fetch:async()=>new Response(template)};
});
const b64=value=>Buffer.from(typeof value==='string'?value:new Uint8Array(value)).toString('base64url');
async function jwt(overrides={}) {
  const data=b64(JSON.stringify({alg:'RS256',kid:'test'}))+'.'+b64(JSON.stringify({iss:'https://test.cloudflareaccess.com',aud:['studio-test'],email:'bunacircle@gmail.com',iat:Date.now()/1000,exp:Date.now()/1000+600,...overrides}));
  return data+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(data)));
}
async function request(path,body={},options={}) {
  return new Request(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'Cf-Access-Jwt-Assertion':await jwt(),...options.headers},body:JSON.stringify(body)});
}
const fetcher=async(url,init)=>{
  if(url.endsWith('/certs'))return Response.json({keys:[jwk]});
  const {payload,signature}=JSON.parse(init.body);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  assert.ok(await crypto.subtle.verify('HMAC',key,Buffer.from(signature,'base64url'),new TextEncoder().encode(payload)));
  const body=JSON.parse(payload);
  if(body.action==='status')return Response.json({ok:true,available:70});
  if(body.action==='unsubscribe')return Response.json({ok:true});
  return Response.json({ok:true,deliveries:body.recipients.map(recipient=>({email:recipient.email,status:'sent'}))});
};
test('authenticates the owner JWT and rejects spoofed headers, wrong audience and expired sessions',async()=>{
  assert.equal(await verifyAccess(await request('/studio/'),env,fetcher),true);
  for(const overrides of [{email:'other@example.com'},{aud:['wrong']},{exp:1},{iss:'https://attacker.example'}]) {
    assert.equal(await verifyAccess(new Request(origin+'/studio/',{headers:{'Cf-Access-Jwt-Assertion':await jwt(overrides)}}),env,fetcher),false);
  }
  assert.equal(await verifyAccess(new Request(origin+'/studio/',{headers:{'Cf-Access-Authenticated-User-Email':'bunacircle@gmail.com'}}),env,fetcher),false);
  assert.equal((await handlePromotions(new Request(origin+'/studio/'),env,fetcher)).status,403);
  assert.equal((await handlePromotions(await request('/api/promotions/status'),{},fetcher)).status,403);
});
test('requires a current content-matched owner test and consent before campaign sending',async()=>{
  const id=crypto.randomUUID();
  const testResult=await (await handlePromotions(await request('/api/promotions/test',{id,message,emails:['other@example.com']}),env,fetcher)).json();
  assert.deepEqual(testResult.deliveries,[{email:'bunacircle@gmail.com',status:'sent'}]);
  const body={id:crypto.randomUUID(),message,emails:['Alex@example.com','alex@example.com'],consentConfirmed:true,testReceipt:testResult.testReceipt};
  const success=await (await handlePromotions(await request('/api/promotions/send',body),env,fetcher)).json();
  assert.deepEqual(success.deliveries,[{email:'alex@example.com',status:'sent'}]);
  for(const altered of [{consentConfirmed:false},{testReceipt:''},{message:{...message,body:'Changed'}},{emails:Array.from({length:21},(_,index)=>`a${index}@example.com`)}]) {
    assert.notEqual((await handlePromotions(await request('/api/promotions/send',{...body,...altered}),env,fetcher)).status,200);
  }
  assert.notEqual((await handlePromotions(await request('/api/promotions/send',body),{...env,PROMOTIONS_MAILING_ADDRESS:''},fetcher)).status,200);
});
test('blocks cross-origin sends and validates template input',async()=>{
  assert.equal((await handlePromotions(await request('/api/promotions/test',{}, {headers:{Origin:'https://attacker.example'}}),env,fetcher)).status,403);
  assert.throws(()=>validatePromotion({...message,subject:'Hi\nBcc: other@example.com'}));
  assert.throws(()=>validatePromotion({...message,url:'javascript:alert(1)'}));
  const oversized=await handlePromotions(await request('/api/promotions/test',{message:'x'.repeat(31000)}),env,fetcher);
  assert.notEqual(oversized.status,200);
  assert.match((await oversized.json()).error.message,/too large/);
});
test('encrypts unsubscribe addresses; GET confirms and POST suppresses without owner login',async()=>{
  const token=await unsubscribeToken('alex@example.com',secret);
  assert.equal(await tokenEmail(token,secret),'alex@example.com');
  assert.equal(token.includes('alex'),false);
  await assert.rejects(()=>tokenEmail(token,'wrong secret'));
  let calls=0;
  const tracked=async(...args)=>{calls++;return fetcher(...args);};
  const url=origin+'/unsubscribe?t='+token;
  const page=await handlePromotions(new Request(url),env,tracked);
  assert.ok((await page.text()).includes('method="post"'));
  assert.equal(calls,0);
  const result=await handlePromotions(new Request(url,{method:'POST',headers:{Origin:origin}}),env,tracked);
  assert.ok((await result.text()).includes('You’re unsubscribed'));
  assert.equal(calls,1);
});
