import { escapeHtml, normalizeEmail, renderEmail, safeUrl } from './studio/email.mjs';

const encoder = new TextEncoder();
const sender = 'bunacircle@gmail.com';
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}});
const fail = (message, status = 400) => json({ok:false, error:{message}}, status);
const bytes = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
const base64 = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sign = async (value, secret) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return base64(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
};
const digest = async value => base64(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
async function verifySignature(value, signature, secret) {
  try {
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
    return await crypto.subtle.verify('HMAC',key,bytes(signature),encoder.encode(value));
  } catch { return false; }
}

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('The request is empty.');
  const chunks = [];
  let size = 0;
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 30000) { await reader.cancel(); throw new Error('The campaign is too large.'); }
    chunks.push(value);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk,offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(combined));
}

export async function verifyAccess(request, env, fetcher = fetch) {
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.PROMOTIONS_ACCESS_TEAM || '') || !env.PROMOTIONS_ACCESS_AUD) return false;
  try {
    const token = request.headers.get('Cf-Access-Jwt-Assertion') || '';
    if (token.length > 12000) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const header = JSON.parse(new TextDecoder().decode(bytes(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(bytes(parts[1])));
    const issuer = `https://${env.PROMOTIONS_ACCESS_TEAM}`;
    const now = Date.now() / 1000;
    if (header.alg !== 'RS256' || claims.iss !== issuer || !Array.isArray(claims.aud) || !claims.aud.includes(env.PROMOTIONS_ACCESS_AUD) || !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 60 || (claims.nbf !== undefined && claims.nbf > now + 60) || claims.email !== sender) return false;
    const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, {cf:{cacheTtl:300}});
    if (!response.ok) return false;
    const {keys} = await response.json();
    const jwk = keys?.find(key => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]), encoder.encode(parts.slice(0,2).join('.')));
  } catch { return false; }
}

export function validatePromotion(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('The email is invalid.');
  const limits = {subject:150, preheader:200, eyebrow:100, headline:150, body:2000, cta:70, url:500};
  const message = {};
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof raw[field] !== 'string' || raw[field].length > limit || /[\x00-\x08\x0b-\x1f]/.test(raw[field])) throw new Error(`Check the ${field} field.`);
    message[field] = raw[field].trim();
  }
  if (!message.subject || /[\r\n]/.test(message.subject) || !message.headline || !message.body || !message.cta || !safeUrl(message.url)) throw new Error('Complete the subject, headline, message and button link.');
  return message;
}

async function bridge(env, action, data, fetcher) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(env.PROMOTIONS_SCRIPT_URL || '') || (env.PROMOTIONS_BRIDGE_SECRET || '').length < 32) throw new Error('The Gmail connection has not been configured.');
  // Keep the signed wire text ASCII so HTTP charset decoding cannot change its bytes.
  const payload = JSON.stringify({action, issuedAt:Date.now(), ...data})
    .replace(/[\u007f-\uffff]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4,'0')}`);
  const body = JSON.stringify({payload, signature:await sign(payload, env.PROMOTIONS_BRIDGE_SECRET)});
  if (body.length > 600000) throw new Error('This email is too large for the selected audience. Start a new campaign with a shorter message or fewer contacts.');
  const response = await fetcher(env.PROMOTIONS_SCRIPT_URL, {
    method:'POST', headers:{'Content-Type':'application/json; charset=utf-8'},
    body,
    signal:AbortSignal.timeout(120000), redirect:'follow',
  });
  if (!response.ok) throw new Error('Google did not confirm the request. Check the delivery log before trying again.');
  const result = await response.json();
  if (!result || result.ok !== true) throw new Error(result?.error?.message || 'Google did not confirm the request. Check the delivery log.');
  return result;
}

async function tokenKey(secret) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode(secret)), 'AES-GCM', false, ['encrypt','decrypt']);
}

export async function unsubscribeToken(email, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv}, await tokenKey(secret), encoder.encode(email));
  return `${base64(iv)}.${base64(encrypted)}`;
}

export async function tokenEmail(token, secret) {
  const [iv, body] = token.split('.');
  const decoded = await crypto.subtle.decrypt({name:'AES-GCM', iv:bytes(iv)}, await tokenKey(secret), bytes(body));
  const email = normalizeEmail(new TextDecoder().decode(decoded));
  if (!email) throw new Error('Invalid unsubscribe link.');
  return email;
}

function unsubscribePage(message, button = '') {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Buna Circle email preferences</title><body style="background:#f4efe5;color:#20361f;font:17px/1.7 Arial,sans-serif;margin:8% auto;padding:24px;max-width:540px"><p style="letter-spacing:3px">BUNA CIRCLE</p><h1 style="font:36px Georgia,serif">Email preferences</h1><p>${escapeHtml(message)}</p>${button}<p style="font-size:13px">This affects promotional emails. You can still receive replies about your event inquiry.</p></body></html>`, {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"}});
}

export async function handlePromotions(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  if (url.pathname === '/unsubscribe') {
    try {
      if ((env.PROMOTIONS_BRIDGE_SECRET || '').length < 32) throw new Error();
      const token = url.searchParams.get('t') || '';
      if (token.length > 1000) throw new Error();
      const email = await tokenEmail(token, env.PROMOTIONS_BRIDGE_SECRET);
      if (request.method === 'GET') return unsubscribePage('Choose below to stop promotional emails from Buna Circle.', '<form method="post"><button style="background:#20361f;color:#fbf8f1;border:0;padding:16px;font:inherit">Unsubscribe</button></form>');
      if (request.method !== 'POST') return fail('Use the unsubscribe form.', 405);
      if (request.headers.get('Origin') !== url.origin) return fail('Please use the unsubscribe link in your email.', 403);
      await bridge(env, 'unsubscribe', {email}, fetcher);
      return unsubscribePage('You’re unsubscribed from Buna Circle promotional emails.');
    } catch { return unsubscribePage('We could not update your preferences. Please try again later or email bunacircle@gmail.com to unsubscribe.'); }
  }
  if (!await verifyAccess(request, env, fetcher)) return fail('Sign in through the Buna Circle staff email studio.', 403);
  if (url.pathname === '/studio' || url.pathname.startsWith('/studio/')) {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control','private, no-store');
    headers.set('Referrer-Policy','no-referrer');
    headers.set('X-Frame-Options','DENY');
    return new Response(response.body, {status:response.status, headers});
  }
  if (request.method !== 'POST') return fail('Use the email studio.', 405);
  if (request.headers.get('Origin') !== url.origin) return fail('Use the Buna Circle email studio.', 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return fail('Invalid request format.', 415);
  try {
    const raw = await readBody(request);
    if (url.pathname === '/api/promotions/status') {
      const result = await bridge(env, 'status', {}, fetcher);
      if (!Number.isInteger(result.available) || result.available < 0) throw new Error('Google returned an invalid quota.');
      return json({ok:true, sender, available:result.available, hasAddress:!!env.PROMOTIONS_MAILING_ADDRESS, address:env.PROMOTIONS_MAILING_ADDRESS || ''});
    }
    if (url.pathname === '/api/promotions/contacts') {
      const result = await bridge(env, 'contacts', {}, fetcher);
      if (!Array.isArray(result.contacts) || result.contacts.length > 1000 || result.contacts.some(contact => !normalizeEmail(contact.email) || typeof contact.name !== 'string')) throw new Error('Google returned an invalid contact list.');
      return json({ok:true, contacts:result.contacts});
    }
    if (!['/api/promotions/test','/api/promotions/send'].includes(url.pathname)) return fail('Unknown studio action.',404);
    const message = validatePromotion(raw.message);
    if (!/^[a-f0-9-]{36}$/.test(raw.id || '')) return fail('A campaign reference is required.');
    const isTest = url.pathname.endsWith('/test');
    const address = env.PROMOTIONS_MAILING_ADDRESS || 'TEST PREVIEW — business mailing address pending';
    const fingerprint = await digest(JSON.stringify({message,address}));
    if (!isTest) {
      if (!env.PROMOTIONS_MAILING_ADDRESS) return fail('Configure the business mailing address before sending.');
      if (raw.consentConfirmed !== true) return fail('Confirm that your selected audience agreed to promotional emails.');
      const [expiry, signature] = String(raw.testReceipt || '').split('.');
      if (!/^\d+$/.test(expiry) || Number(expiry) < Date.now() || Number(expiry) > Date.now() + 3600000 || !await verifySignature(`${fingerprint}.${expiry}`,signature,env.PROMOTIONS_BRIDGE_SECRET)) return fail('Send and review a test of this message before sending the campaign.');
    }
    const emails = isTest ? [sender] : [...new Set((Array.isArray(raw.emails) ? raw.emails : []).map(normalizeEmail))];
    if (!emails.length || emails.includes('') || emails.length > 20) return fail('Select between 1 and 20 valid email addresses.');
    const asset = await env.ASSETS.fetch(new Request(`${url.origin}/studio/template.html`));
    if (!asset.ok) throw new Error('The email template could not load.');
    const template = (await asset.text()).replace(/<p[^>]*>DRAFT PREVIEW[\s\S]*?<\/p>/, '');
    const recipients = await Promise.all(emails.map(async email => {
      const unsubscribe = `${url.origin}/unsubscribe?t=${await unsubscribeToken(email, env.PROMOTIONS_BRIDGE_SECRET)}`;
      return {email, html:renderEmail(template, {...message,address,unsubscribe}),
        text:[message.headline, message.body, `${message.cta}: ${message.url}`, 'Warmly,\nBuna Circle Co.\nSip. Connect. Belong.',address,`Unsubscribe: ${unsubscribe}`].join('\n\n')};
    }));
    const result = await bridge(env, 'send', {id:raw.id, subject:(isTest?'[TEST] ':'')+message.subject, fingerprint, recipients, isTest, consentConfirmed:raw.consentConfirmed === true}, fetcher);
    if (!Array.isArray(result.deliveries) || result.deliveries.length !== emails.length || new Set(result.deliveries.map(item => item.email)).size !== emails.length || result.deliveries.some(item => !emails.includes(item.email) || !['sent','suppressed','unknown','not_sent'].includes(item.status))) throw new Error('Check the delivery log before trying again: Google returned an incomplete result.');
    const expiry = String(Date.now() + 1800000);
    return json({ok:true, deliveries:result.deliveries, ...(isTest && result.deliveries[0]?.status === 'sent' ? {testReceipt:`${expiry}.${await sign(`${fingerprint}.${expiry}`,env.PROMOTIONS_BRIDGE_SECRET)}`} : {})});
  } catch (error) {
    // Delivery timeouts are uncertain; the script's durable ledger prevents automatic resends.
    return fail(error.message || 'The request could not be completed. Check the delivery log before retrying.', 502);
  }
}
