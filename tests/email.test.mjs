import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../google-apps-script/Code.gs',import.meta.url),'utf8');
function run(overrides={}) {
 const messages=[];const context={MailApp:{sendEmail:m=>messages.push(m)}};vm.createContext(context);vm.runInContext(source,context);
 const event={range:{getRow:()=>12},namedValues:{'Contact Name':['Amina <Guest>'],'Email Address':['guest@example.com'],'Event Date':['12/20/2026'],'Event Start Time (please be as specific as you can) ':['14:30'],'Preferred Service':['Full coffee cart + matcha'],'Additional Notes:':['<script>alert(1)</script>'],...overrides}};
 context.onFormSubmit(event);return {messages,context};
}
test('sends branded staff and customer messages with correct reply-to and plain text',()=>{
 const {messages}=run();assert.equal(messages.length,2);assert.equal(messages[0].to,'info@bunacircleco.com');assert.equal(messages[0].cc,'bunacircle@gmail.com');assert.equal(messages[0].replyTo,'guest@example.com');assert.equal(messages[1].to,'guest@example.com');assert.equal(messages[1].replyTo,'bunacircle@gmail.com');
 for(const m of messages){assert(m.htmlBody.includes('BUNA CIRCLE'));assert(m.body.includes('BC-000012'));assert(m.htmlBody.includes('14:30'));assert(!m.htmlBody.includes('<script>'));}
 assert(messages[1].body.includes('not reserved yet'));assert(messages[0].subject.includes('Amina'));assert(messages[0].htmlBody.includes('&lt;script&gt;'));
 fs.writeFileSync(new URL('../email-preview.html',import.meta.url),messages[1].htmlBody);
 fs.writeFileSync(new URL('../team-email-preview.html',import.meta.url),messages[0].htmlBody);
});
test('matches actual Google question capitalization and whitespace',()=>{
 const {context}=run();assert.equal(context.inquiryValue_({'Email Address ':['person@example.com']},['Email address']),'person@example.com');
});
test('manual runs fail before sending email',()=>{
 const {context}=run();context.MailApp.sendEmail=()=>assert.fail('must not send');assert.throws(()=>context.onFormSubmit(),/linked Google Form/);
});
