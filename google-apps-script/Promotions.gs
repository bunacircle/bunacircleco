// Add as a separate file in the existing spreadsheet-bound project. Keep Code.gs and its trigger.
const PROMOTIONS_SHEET_ID = '1XJvk5y7VSpvCONnF0dlNYJqh_jWDEiHGNI2WntbIuk4';
const PROMOTIONS_SENDER = 'bunacircle@gmail.com';
const PROMOTIONS_RESERVE = 30;

function initializePromotions() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('PROMOTIONS_BRIDGE_SECRET')) {
    properties.setProperty('PROMOTIONS_BRIDGE_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
  const book = SpreadsheetApp.openById(PROMOTIONS_SHEET_ID);
  promotionsSheet_(book, 'Marketing Suppressions', ['Email', 'Unsubscribed at']);
  promotionsSheet_(book, 'Marketing Deliveries', ['Campaign ID', 'Email', 'Request hash', 'Subject', 'Status', 'Updated at']);
}

function doGet() {
  return promotionsJson_({ok:false, error:{message:'Use the protected Buna Circle email studio.'}});
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    const contents = event && event.postData && event.postData.contents;
    if (!contents || contents.length > 600000) throw new Error('Invalid request.');
    const envelope = JSON.parse(contents);
    const secret = PropertiesService.getScriptProperties().getProperty('PROMOTIONS_BRIDGE_SECRET');
    if (!secret || secret.length < 32 || typeof envelope.payload !== 'string') throw new Error('Connection is not configured.');
    const signature = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(envelope.payload, secret)).replace(/=+$/, '');
    if (!promotionsEqual_(signature, envelope.signature)) throw new Error('Request could not be verified.');
    const request = JSON.parse(envelope.payload);
    if (!Number.isFinite(request.issuedAt) || Math.abs(Date.now() - request.issuedAt) > 300000) throw new Error('Request expired.');
    if (Session.getEffectiveUser().getEmail() !== PROMOTIONS_SENDER) throw new Error('Deploy this script as bunacircle@gmail.com.');
    if (request.action === 'status') return promotionsJson_({ok:true, available:Math.max(0, MailApp.getRemainingDailyQuota() - PROMOTIONS_RESERVE)});
    locked = lock.tryLock(5000);
    if (!locked) throw new Error('Another campaign is running. Wait and check the delivery log.');
    const book = SpreadsheetApp.openById(PROMOTIONS_SHEET_ID);
    const suppressionSheet = promotionsSheet_(book, 'Marketing Suppressions', ['Email', 'Unsubscribed at']);
    const suppressed = new Set(suppressionSheet.getDataRange().getValues().slice(1).map(function(row) { return String(row[0]).toLowerCase(); }));
    if (request.action === 'unsubscribe') {
      const email = promotionsEmail_(request.email);
      if (!suppressed.has(email)) { suppressionSheet.appendRow([promotionsCell_(email), new Date().toISOString()]); SpreadsheetApp.flush(); }
      return promotionsJson_({ok:true});
    }
    if (request.action === 'contacts') {
      const source = book.getSheetByName('Form Responses 1');
      if (!source) throw new Error('The response sheet is unavailable.');
      const values = source.getDataRange().getDisplayValues();
      const headers = values.shift().map(function(value) { return value.trim().toLowerCase(); });
      const emailIndex = headers.indexOf('email address');
      const nameIndex = headers.indexOf('contact name');
      if (emailIndex < 0) throw new Error('The response sheet needs an Email Address column.');
      const contacts = new Map();
      values.forEach(function(row) {
        try {
          const email = promotionsEmail_(row[emailIndex]);
          if (!suppressed.has(email) && contacts.size < 1000) contacts.set(email, {email:email, name:String(row[nameIndex] || '').slice(0,150)});
        } catch (_) { /* Ignore incomplete historical rows. */ }
      });
      return promotionsJson_({ok:true, contacts:Array.from(contacts.values())});
    }
    if (request.action !== 'send') throw new Error('Unknown action.');
    if (!/^[a-f0-9-]{36}$/.test(request.id || '') || typeof request.fingerprint !== 'string' || !/^[\w-]{43}$/.test(request.fingerprint)) throw new Error('Invalid campaign reference.');
    if (typeof request.subject !== 'string' || !request.subject.trim() || request.subject.length > 160 || /[\r\n\x00-\x1f]/.test(request.subject)) throw new Error('Invalid subject.');
    if (!Array.isArray(request.recipients) || !request.recipients.length || request.recipients.length > 20) throw new Error('Select between 1 and 20 recipients.');
    const recipients = request.recipients.map(function(recipient) {
      const email = promotionsEmail_(recipient.email);
      if (typeof recipient.html !== 'string' || recipient.html.length > 30000 || typeof recipient.text !== 'string' || recipient.text.length > 10000) throw new Error('Invalid email content.');
      return {email:email, html:recipient.html, text:recipient.text};
    });
    if (new Set(recipients.map(function(recipient) { return recipient.email; })).size !== recipients.length) throw new Error('Duplicate recipient.');
    if (request.isTest === true) {
      if (recipients.length !== 1 || recipients[0].email !== PROMOTIONS_SENDER || request.subject.indexOf('[TEST] ') !== 0) throw new Error('Tests must go only to the business Gmail account.');
    } else if (request.isTest !== false || request.consentConfirmed !== true) throw new Error('Audience permission must be confirmed.');
    const ledger = promotionsSheet_(book, 'Marketing Deliveries', ['Campaign ID', 'Email', 'Request hash', 'Subject', 'Status', 'Updated at']);
    const hash = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify({fingerprint:request.fingerprint, subject:request.subject, emails:recipients.map(function(recipient) { return recipient.email; })}))).replace(/=+$/, '');
    const previous = ledger.getDataRange().getValues().slice(1).filter(function(row) { return row[0] === request.id; });
    if (previous.some(function(row) { return row[2] !== hash; })) throw new Error('This campaign reference already belongs to different content. Start a new campaign.');
    const known = new Map(previous.map(function(row) { return [row[1],row[4]]; }));
    const needed = recipients.filter(function(recipient) { return !known.has(recipient.email) && (request.isTest || !suppressed.has(recipient.email)); }).length;
    if (needed > Math.max(0, MailApp.getRemainingDailyQuota() - PROMOTIONS_RESERVE)) throw new Error('Not enough promotional quota. Thirty recipient slots are reserved for inquiries.');
    const deliveries = [];
    let stopped = false;
    recipients.forEach(function(recipient) {
      if (known.has(recipient.email)) {
        deliveries.push({email:recipient.email, status:known.get(recipient.email) === 'sent' ? 'sent' : 'unknown'});
      } else if (!request.isTest && suppressed.has(recipient.email)) {
        deliveries.push({email:recipient.email, status:'suppressed'});
      } else if (stopped || MailApp.getRemainingDailyQuota() <= PROMOTIONS_RESERVE) {
        stopped = true;
        deliveries.push({email:recipient.email, status:'not_sent'});
      } else {
        ledger.appendRow([request.id, promotionsCell_(recipient.email), hash, promotionsCell_(request.subject), 'unknown', new Date().toISOString()]);
        SpreadsheetApp.flush(); // Persist the claim before MailApp; never resend an uncertain delivery.
        const rowNumber = ledger.getLastRow();
        try {
          MailApp.sendEmail({to:recipient.email, name:'Buna Circle Co.', replyTo:PROMOTIONS_SENDER, subject:request.subject, body:recipient.text, htmlBody:recipient.html});
          ledger.getRange(rowNumber,5,1,2).setValues([['sent', new Date().toISOString()]]);
          SpreadsheetApp.flush();
          deliveries.push({email:recipient.email, status:'sent'});
        } catch (_) {
          stopped = true;
          deliveries.push({email:recipient.email, status:'unknown'});
        }
      }
    });
    return promotionsJson_({ok:true, deliveries:deliveries});
  } catch (error) {
    return promotionsJson_({ok:false, error:{message:error.message || 'Request failed. Check the Marketing Deliveries sheet.'}});
  } finally {
    if (locked) lock.releaseLock();
  }
}

function promotionsEmail_(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@<>\x00-\x1f,;]+@[^\s@<>\x00-\x1f,;]+\.[^\s@<>\x00-\x1f,;]+$/.test(email)) throw new Error('Invalid email address.');
  return email;
}
function promotionsEqual_(left, right) {
  if (typeof right !== 'string' || left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index++) different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return different === 0;
}
function promotionsCell_(value) { return /^[=+\-@']/.test(value) ? "'" + value : value; }
function promotionsSheet_(book, name, headers) {
  let sheet = book.getSheetByName(name);
  if (!sheet) { sheet = book.insertSheet(name); sheet.appendRow(headers); }
  if (sheet.getRange(1,1,1,headers.length).getValues()[0].join('|') !== headers.join('|')) throw new Error('Check the headers in ' + name + '.');
  return sheet;
}
function promotionsJson_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
