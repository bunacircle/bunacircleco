import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvContacts, normalizeEmail, parseCsv, renderEmail, safeUrl } from '../studio/email.mjs';

test('imports spreadsheet CSV with BOM, quoted commas, quotes and multiline names', () => {
  assert.deepEqual(csvContacts('\uFEFFEmail Address,Contact Name\r\nA@Example.com,"Doe, Alex"\r\nb@example.com,"B ""Bee""\nSmith"'), [
    {email: 'A@Example.com', name: 'Doe, Alex'}, {email: 'b@example.com', name: 'B "Bee"\nSmith'}
  ]);
  assert.throws(() => csvContacts('name,phone\nAlex,123'), /Email/);
  assert.throws(() => parseCsv('email\n"unclosed'), /unclosed/);
  assert.throws(() => parseCsv('"email"oops'), /misplaced/);
});
test('normalizes emails and rejects separators, controls and malformed addresses', () => {
  assert.equal(normalizeEmail('  Alex@Example.com  '), 'alex@example.com');
  for (const value of ['bad', 'a@b', 'a@example.com\nBcc:x@example.com', '<a@example.com>', 'a@example.com,b@example.com']) assert.equal(normalizeEmail(value), '');
});
test('email preview escapes input and blocks executable links', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('https://user:password@example.com'), '');
  assert.equal(renderEmail('{{headline}} {{url}} {{address}}', {headline:'<img onerror="bad">\nHello',url:'javascript:alert(1)'}), '&lt;img onerror=&quot;bad&quot;&gt;<br>Hello # Business mailing address required');
});
