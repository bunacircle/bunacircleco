import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHmac, createHash, randomUUID } from 'node:crypto';

const source = readFileSync(new URL('../google-apps-script/Promotions.gs',import.meta.url),'utf8');
const secret = 'test-only-bridge-secret-never-use-in-production';

function runtime() {
  const sheets = new Map();
  const sent = [];
  let quota = 100, failSend = false, locked = false;
  class Sheet {
    rows = [];
    appendRow(row) { this.rows.push(row.map(value=>typeof value==='string' && value.startsWith("'") ? value.slice(1) : value)); }
    getLastRow() { return this.rows.length; }
    getDataRange() { return {getValues:()=>this.rows.map(row=>[...row]), getDisplayValues:()=>this.rows.map(row=>row.map(String))}; }
    getRange(row,column,height,width) {
      return {getValues:()=>Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>this.rows[row-1+y]?.[column-1+x] || '')),
        setValues:values=>values.forEach((values,y)=>values.forEach((value,x)=>{ this.rows[row-1+y][column-1+x]=value; }))};
    }
  }
  const book = {getSheetByName:name=>sheets.get(name), insertSheet:name=>{const sheet=new Sheet();sheets.set(name,sheet);return sheet;}};
  const context = vm.createContext({
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>secret})},
    Utilities:{computeHmacSha256Signature:(value,key)=>createHmac('sha256',key).update(value).digest(), base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url'), computeDigest:(_,value)=>createHash('sha256').update(value).digest(),DigestAlgorithm:{SHA_256:'sha256'}},
    SpreadsheetApp:{openById:()=>book,flush:()=>{}},
    LockService:{getScriptLock:()=>({tryLock:()=>{assert.equal(locked,false);locked=true;return true;},releaseLock:()=>{locked=false;}})},
    Session:{getEffectiveUser:()=>({getEmail:()=>'bunacircle@gmail.com'})},
    MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:message=>{if(failSend)throw new Error('uncertain'); sent.push(message);quota--; }},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>text})},
  });
  vm.runInContext(source,context);
  function invoke(request, signatureOverride) {
    const payload = JSON.stringify({issuedAt:Date.now(),...request});
    const signature = signatureOverride || createHmac('sha256',secret).update(payload).digest('base64url');
    return JSON.parse(context.doPost({postData:{contents:JSON.stringify({payload,signature})}}));
  }
  return {invoke, sheets, sent, book, setQuota:value=>{quota=value;}, fail:()=>{failSend=true;}};
}
function campaign(emails=['alex@example.com']) {
  return {action:'send',id:randomUUID(),fingerprint:'a'.repeat(43),subject:'Gather with Buna Circle',isTest:false,consentConfirmed:true,recipients:emails.map(email=>({email,html:'<p>Welcome</p>',text:'Welcome'}))};
}
test('rejects unsigned and expired calls before sheet access or email',()=>{
  const app=runtime();
  assert.equal(app.invoke(campaign(),'forged').ok,false);
  assert.equal(app.invoke({...campaign(),issuedAt:0}).ok,false);
  assert.equal(app.sheets.size,0);
  assert.equal(app.sent.length,0);
});
test('sends individually, replays safely and rejects changed campaign intent',()=>{
  const app=runtime(), request=campaign(['alex@example.com','sam@example.com']);
  assert.equal(app.invoke(request).deliveries.length,2);
  assert.equal(app.sent.length,2);
  const retry={...request,recipients:request.recipients.map(recipient=>({...recipient,html:'<p>Fresh encrypted unsubscribe link</p>'}))};
  assert.equal(app.invoke(retry).deliveries[0].status,'sent');
  assert.equal(app.sent.length,2);
  assert.equal(app.invoke({...request,fingerprint:'b'.repeat(43)}).ok,false);
  assert.ok(app.sent.every(message=>!message.cc&&!message.bcc));
});
test('retains uncertain claims and stops before later recipients',()=>{
  const app=runtime(),request=campaign(['alex@example.com','sam@example.com']);
  app.fail();
  assert.deepEqual(app.invoke(request).deliveries.map(item=>item.status),['unknown','not_sent']);
  assert.equal(app.invoke(request).deliveries[0].status,'unknown');
  assert.equal(app.sent.length,0);
  assert.equal(app.sheets.get('Marketing Deliveries').rows.filter(row=>row[1]==='alex@example.com').length,1);
});
test('honors unsubscribe for manually entered emails and inquiry imports',()=>{
  const app=runtime();
  app.book.insertSheet('Form Responses 1').rows=[['Email Address','Contact Name'],['ALEX@example.com','Alex'],['sam@example.com','Sam'],['sam@example.com','Sam again']];
  assert.equal(app.invoke({action:'unsubscribe',email:'ALEX@example.com'}).ok,true);
  assert.equal(app.invoke({action:'unsubscribe',email:'alex@example.com'}).ok,true);
  assert.equal(app.sheets.get('Marketing Suppressions').rows.length,2);
  assert.deepEqual(app.invoke({action:'contacts'}).contacts,[{email:'sam@example.com',name:'Sam again'}]);
  assert.deepEqual(app.invoke(campaign(['alex@example.com','sam@example.com'])).deliveries.map(item=>item.status),['suppressed','sent']);
  assert.equal(app.sent.length,1);
});
test('keeps quota for inquiries and restricts tests to the owner',()=>{
  const app=runtime();
  app.setQuota(30);
  assert.equal(app.invoke({action:'status'}).available,0);
  assert.equal(app.invoke(campaign()).ok,false);
  app.setQuota(100);
  assert.equal(app.invoke({...campaign(),isTest:true,subject:'[TEST] Preview'}).ok,false);
  assert.equal(app.invoke({...campaign(['bunacircle@gmail.com']),isTest:true,subject:'[TEST] Preview',consentConfirmed:false}).ok,true);
});
test('treats formula-like email addresses as literal text for suppression and retries',()=>{
  for (const email of ['=alex@example.com',"'alex@example.com",'+alex@example.com']) {
    const app=runtime(), request=campaign([email]);
    assert.equal(app.invoke(request).deliveries[0].status,'sent');
    assert.equal(app.invoke(request).deliveries[0].status,'sent');
    assert.equal(app.sent.length,1);
    app.invoke({action:'unsubscribe',email});
    assert.equal(app.invoke(campaign([email])).deliveries[0].status,'suppressed');
  }
});
