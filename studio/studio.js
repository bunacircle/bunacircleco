import { csvContacts, normalizeEmail, renderEmail, safeUrl } from './email.mjs';

const form = document.querySelector('#editor');
const status = document.querySelector('#status');
const contacts = new Map();
let template = '';
let connection = null;
let busy = false;
let testReceipt = '';
let testId = crypto.randomUUID();
let campaignId = crypto.randomUUID();
let campaignRequest = null;

const deliveryStatus = document.querySelector('#delivery-status');
const messageValues = () => Object.fromEntries(new FormData(form));

async function api(action, data = {}) {
  const response = await fetch(`/api/promotions/${action}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  let result;
  try { result = await response.json(); } catch { throw new Error('Sign in to the staff studio again, then check the delivery log before retrying.'); }
  if (!response.ok || result.ok !== true) throw new Error(result?.error?.message || 'The request failed. Check the delivery log before retrying.');
  return result;
}

function updateSendControls() {
  const selected = [...contacts.values()].filter(contact => contact.selected).length;
  document.querySelector('#test').disabled = busy || !connection;
  document.querySelector('#send').disabled = busy || !connection?.hasAddress || !testReceipt || !document.querySelector('#reviewed').checked || !document.querySelector('#permission').checked || !selected || selected > 20;
  document.querySelector('#send').textContent = campaignRequest ? 'Check / retry same campaign' : `Send to ${selected} selected contact${selected === 1 ? '' : 's'}`;
  for (const element of document.querySelectorAll('#editor input, #editor textarea, #emails, #add, #csv, #load-contacts, #contacts input, #select, #clear')) element.disabled = busy || !!campaignRequest;
  document.querySelector('#new-campaign').disabled = busy;
}

function invalidateTest() {
  testReceipt = '';
  testId = crypto.randomUUID();
  document.querySelector('#reviewed').checked = false;
  updateSendControls();
}

function updatePreview() {
  const values = messageValues();
  document.querySelector('#subject-preview').textContent = values.subject;
  document.querySelector('#preheader-preview').textContent = values.preheader;
  form.elements.url.setCustomValidity(safeUrl(values.url) ? '' : 'Enter an http or https link.');
  if (template) document.querySelector('iframe').srcdoc = renderEmail(template, {...values, address:connection?.address || 'Business mailing address added when configured'});
}

function renderContacts() {
  const query = document.querySelector('#search').value.trim().toLowerCase();
  const container = document.querySelector('#contacts');
  container.replaceChildren();
  let visible = 0;
  for (const contact of contacts.values()) {
    if (!`${contact.email} ${contact.name}`.toLowerCase().includes(query)) continue;
    visible++;
    const label = document.createElement('label');
    label.className = 'contact';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = contact.selected;
    checkbox.addEventListener('change', () => { contact.selected = checkbox.checked; updateCount(); });
    const details = document.createElement('span');
    details.textContent = contact.email;
    if (contact.name) {
      const name = document.createElement('small');
      name.textContent = contact.name;
      details.append(name);
    }
    label.append(checkbox, details);
    container.append(label);
  }
  if (!visible) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = contacts.size ? 'No matching contacts.' : 'Your audience starts here. Add emails or import a contact list.';
    container.append(empty);
  }
  updateCount();
}

function updateCount() {
  document.querySelector('#count').textContent = `${[...contacts.values()].filter(contact => contact.selected).length} of ${contacts.size} selected`;
  updateSendControls();
}

function addContacts(rows) {
  let added = 0, invalid = 0, duplicate = 0, overLimit = 0;
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (!email) { invalid++; continue; }
    if (contacts.has(email)) { duplicate++; continue; }
    if (contacts.size >= 1000) { overLimit++; continue; }
    contacts.set(email, { email, name: row.name || '', selected: true });
    added++;
  }
  renderContacts();
  status.textContent = `${added} added. ${duplicate} duplicates skipped. ${invalid} invalid addresses skipped.${overLimit ? ` ${overLimit} skipped: 1,000-contact limit reached.` : ''}`;
}

document.querySelector('#add').addEventListener('click', () => {
  const input = document.querySelector('#emails');
  addContacts(input.value.split(/[\s,;]+/).filter(Boolean).map(email => ({ email })));
  input.value = '';
});
document.querySelector('#csv').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('Choose a CSV smaller than 2 MB.');
    addContacts(csvContacts(await file.text()));
  } catch (error) { status.textContent = error.message; }
  event.target.value = '';
});
document.querySelector('#search').addEventListener('input', renderContacts);
document.querySelector('#select').addEventListener('click', () => {
  const query = document.querySelector('#search').value.trim().toLowerCase();
  for (const contact of contacts.values()) if (`${contact.email} ${contact.name}`.toLowerCase().includes(query)) contact.selected = true;
  renderContacts();
});
document.querySelector('#clear').addEventListener('click', () => {
  for (const contact of contacts.values()) contact.selected = false;
  renderContacts();
});
form.addEventListener('input', () => { invalidateTest(); updatePreview(); });
form.addEventListener('submit', event => event.preventDefault());
document.querySelector('#reviewed').addEventListener('change', updateSendControls);
document.querySelector('#permission').addEventListener('change', updateSendControls);
document.querySelector('#load-contacts').addEventListener('click', async () => {
  busy = true;
  updateSendControls();
  try { addContacts((await api('contacts')).contacts); }
  catch (error) { status.textContent = error.message; }
  finally { busy = false; updateSendControls(); }
});
document.querySelector('#test').addEventListener('click', async () => {
  if (!form.reportValidity()) return;
  const message = campaignRequest?.message || messageValues();
  busy = true;
  updateSendControls();
  deliveryStatus.textContent = 'Sending one test to bunacircle@gmail.com…';
  try {
    const result = await api('test', {id:testId, message});
    testReceipt = result.testReceipt || '';
    if (testReceipt) {
      testId = crypto.randomUUID();
      document.querySelector('#reviewed').checked = false;
      if (campaignRequest) campaignRequest.testReceipt = testReceipt;
    }
    deliveryStatus.textContent = testReceipt ? 'Google accepted your test. Check Gmail and Spam, then confirm you reviewed it. The test is valid for 30 minutes.' : 'Test delivery is unknown. Check Marketing Deliveries and Gmail before trying again.';
  } catch (error) { deliveryStatus.textContent = error.message; }
  finally { busy = false; updateSendControls(); }
});
document.querySelector('#send').addEventListener('click', async () => {
  if (!form.reportValidity()) return;
  campaignRequest ||= {id:campaignId, message:messageValues(), emails:[...contacts.values()].filter(contact => contact.selected).map(contact => contact.email), consentConfirmed:true, testReceipt};
  busy = true;
  updateSendControls();
  deliveryStatus.textContent = 'Sending individually. Keep this tab open; do not start another campaign.';
  try {
    const result = await api('send', campaignRequest);
    const list = document.querySelector('#delivery-results');
    list.replaceChildren();
    for (const delivery of result.deliveries) {
      const item = document.createElement('li');
      item.textContent = `${delivery.email}: ${delivery.status.replace('_',' ')}`;
      list.append(item);
    }
    deliveryStatus.textContent = `Campaign ${campaignId}. Results are saved in Marketing Deliveries. Unknown deliveries will not be sent again automatically.`;
  } catch (error) { deliveryStatus.textContent = `${error.message} Campaign: ${campaignId}. Keep this reference when checking the delivery log.`; }
  finally { busy = false; updateSendControls(); }
});
document.querySelector('#new-campaign').addEventListener('click', () => {
  campaignId = crypto.randomUUID();
  campaignRequest = null;
  document.querySelector('#permission').checked = false;
  invalidateTest();
  document.querySelector('#delivery-results').replaceChildren();
  deliveryStatus.textContent = 'New campaign started. Send and review a fresh test before sending again.';
});
updatePreview();
updateSendControls();
try {
  const response = await fetch('template.html');
  if (!response.ok) throw new Error('Template unavailable.');
  template = await response.text();
  updatePreview();
} catch {
  document.querySelector('.preview .help').textContent = 'The email preview could not load. Please reload this page.';
}
try {
  connection = await api('status');
  document.querySelector('#connection').textContent = `${connection.sender} · ${connection.available} promotional recipients available at connection. Quota is checked again before sending.${connection.hasAddress ? '' : ' Business mailing address still needs configuration.'}`;
  updatePreview();
} catch (error) { document.querySelector('#connection').textContent = error.message; }
updateSendControls();
