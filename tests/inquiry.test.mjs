import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, toGoogleForm, validateInquiry } from '../worker.mjs';
import { InquiryEmail, emailHash } from '../inquiry-emails.mjs';
const valid = {
  contactName: 'TEST Native Form', email: 'test@example.com', phone: '2025550100',
  organization: 'Test only', eventTypes: ['Wedding', 'Other'], otherEventType: 'Reception',
  eventDate: '2099-12-20', startTime: '14:30', endTime: '16:00', setting: 'Indoor',
  electricity: 'Yes', guestCount: 80, location: 'Washington, DC',
  preferredServices: ['Full coffee cart and matcha', 'Other'], otherService: 'Decaf',
  customService: 'No', budgetRange: 'Not sure yet', notes: 'Integration test', consent: true,
};
const request = (data = valid, origin = 'https://www.bunacircleco.com') => new Request('https://www.bunacircleco.com/api/inquiries', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
});
// A shared transactional store models Durable Object persistence across instances.
const duplicateEnv = (history = []) => {
  const stores = new Map();
  return {
    INQUIRY_EMAIL_HISTORY: JSON.stringify(history),
    INQUIRY_EMAILS: {
      idFromName: (hash) => hash,
      get: (id) => ({ fetch: (url, options) => {
        if (!stores.has(id)) {
          const values = new Map();
          let queue = Promise.resolve();
          stores.set(id, { transaction: (callback) => {
            const result = queue.then(() => callback({ get: (key) => values.get(key), put: (key, value) => values.set(key, value) }));
            queue = result.catch(() => {});
            return result;
          } });
        }
        return new InquiryEmail({ storage: stores.get(id) }).fetch(new Request(url, options));
      } }),
    },
  };
};
test('maps dates, 24-hour times, exact service choices, and Other answers to Google', () => {
  const p = toGoogleForm(validateInquiry(valid).inquiry);
  assert.deepEqual(p.getAll('entry.283827731'), ['Wedding', '__other_option__']);
  assert.equal(p.get('entry.283827731.other_option_response'), 'Reception');
  assert.deepEqual(p.getAll('entry.1874275231'), ['Full coffee cart + matcha', '__other_option__']);
  assert.equal(p.get('entry.459757787_year'), '2099');
  assert.equal(p.get('entry.1050720942_hour'), '14');
  assert.equal(p.get('entry.1050720942_minute'), '30');
  assert.equal(p.get('entry.625484560_minute'), '0');
});
test('rejects bad email, impossible dates, inverted times, missing consent and empty choices', () => {
  for (const change of [{ email: 'bad' }, {eventDate: '2099-02-31'}, {endTime: '13:00'}, {consent: false}, {eventTypes: []}, {guestCount: 0}, {otherService: ''}]) {
    assert.equal(validateInquiry({...valid, ...change}).ok, false, JSON.stringify(change));
  }
});
test('rejects cross-origin and oversized submissions before contacting Google', async () => {
  const noFetch = () => { throw new Error('must not call Google'); };
  assert.equal((await handleRequest(request(valid, 'https://example.com'), {}, noFetch)).status, 403);
  assert.equal((await handleRequest(request({...valid, notes:'x'.repeat(26000)}), {}, noFetch)).status, 413);
});
test('reports success only after Google confirms receipt; never retries an uncertain POST', async () => {
  let calls = 0;
  const accepted = await handleRequest(request(), duplicateEnv(), async (url, options) => {
    calls++;
    assert.equal(options.method, 'POST');
    assert.equal(options.body.get('entry.204922629'), 'test@example.com');
    return new Response('Your response has been recorded.');
  });
  assert.deepEqual(await accepted.json(), {ok: true});
  assert.equal(calls, 1);
  for (const response of [new Response('Please complete required questions'), new Response('Service unavailable', {status:503})]) {
    assert.equal((await handleRequest(request(), duplicateEnv(), async () => response)).status, 502);
  }
  assert.equal((await handleRequest(request(), duplicateEnv(), async () => { throw Error('timeout'); })).status, 502);
});
test('static requests use the asset binding and API GET cannot submit', async () => {
  const result = await handleRequest(new Request('https://www.bunacircleco.com/book/'), {ASSETS:{fetch:()=>new Response('booking page')}});
  assert.equal(await result.text(), 'booking page');
  assert.equal((await handleRequest(new Request('https://www.bunacircleco.com/api/inquiries'), {})).status, 405);
});

test('requires at least 60 minutes, including times that cross an hour boundary', () => {
  for (const [startTime, endTime, expected] of [
    ['10:00', '10:00', false], ['10:00', '10:59', false],
    ['10:00', '11:00', true], ['10:00', '11:01', true],
    ['10:45', '11:44', false], ['10:45', '11:45', true],
    ['23:00', '00:00', false], ['22:59', '23:59', true],
  ]) {
    const result = validateInquiry({...valid, startTime, endTime});
    assert.equal(result.ok, expected, `${startTime}–${endTime}`);
    if (!expected) assert.equal(result.message, 'End time must be at least one hour after start time.');
  }
});
test('API rejects a short event without forwarding to Google', async () => {
  const response = await handleRequest(request({...valid, startTime:'10:00', endTime:'10:59'}), {}, () => assert.fail('must not submit to Google'));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.message, 'End time must be at least one hour after start time.');
});

test('blocks an existing sheet email after normalizing spaces and capitalization', async () => {
  const env = duplicateEnv([await emailHash('test@example.com')]);
  const response = await handleRequest(request({...valid, email: '  TEST@Example.COM  '}), env, () => assert.fail('must not submit a duplicate'));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'DUPLICATE_EMAIL');
});
test('concurrent submissions and later retries forward the same email only once', async () => {
  const env = duplicateEnv();
  let calls = 0;
  const accepted = async () => { calls++; return new Response('Your response has been recorded.'); };
  const results = await Promise.all(Array.from({length: 8}, () => handleRequest(request(), env, accepted)));
  assert.equal(results.filter((response) => response.status === 200).length, 1);
  assert.equal(results.filter((response) => response.status === 409).length, 7);
  assert.equal((await handleRequest(request({...valid, email: 'TEST@EXAMPLE.COM'}), env, accepted)).status, 409);
  assert.equal(calls, 1);
  assert.equal((await handleRequest(request({...valid, email: 'another@example.com'}), env, accepted)).status, 200);
});
test('uncertain Google delivery keeps the claim to prevent duplicate records or emails', async () => {
  const env = duplicateEnv();
  assert.equal((await handleRequest(request(), env, () => { throw Error('timeout'); })).status, 502);
  assert.equal((await handleRequest(request(), env, () => assert.fail('must not retry'))).status, 409);
});
test('missing, invalid or unavailable duplicate storage fails before contacting Google', async () => {
  for (const env of [{}, duplicateEnv(['bad hash']), {...duplicateEnv(), INQUIRY_EMAILS: {idFromName: () => {throw Error('unavailable');}}}]) {
    assert.equal((await handleRequest(request(), env, () => assert.fail('must not submit without duplicate protection'))).status, 503);
  }
});
