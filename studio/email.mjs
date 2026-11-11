export const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function renderEmail(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (key === 'url' || key === 'unsubscribe') return escapeHtml(safeUrl(values[key]) || '#');
    if (key === 'image_url') return 'https://www.bunacircleco.com/assets/event-cart-indoor.jpg';
    const value = values[key] || (key === 'address' ? 'Business mailing address required' : '');
    return escapeHtml(value).replace(/\r?\n/g, '<br>');
  });
}

export function normalizeEmail(value) {
  const email = String(value).trim().toLowerCase();
  return email.length <= 254 && /^[^\s@<>\x00-\x1f,;]+@[^\s@<>\x00-\x1f,;]+\.[^\s@<>\x00-\x1f,;]+$/.test(email) ? email : '';
}

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') { field += '"'; index++; }
      else if (character === '"') { quoted = false; closed = true; }
      else field += character;
    } else if (character === '"' && !field && !closed) quoted = true;
    else if (character === ',') { row.push(field); field = ''; closed = false; }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index++;
      row.push(field); rows.push(row); row = []; field = ''; closed = false;
    } else {
      if (closed || character === '"') throw new Error('CSV has misplaced quotation marks. Export it again as CSV.');
      field += character;
    }
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field.');
  if (row.length || field || closed) rows.push([...row, field]);
  return rows.filter(row => row.some(cell => cell.trim()));
}

export function csvContacts(text) {
  const [headers = [], ...rows] = parseCsv(text);
  const normalized = headers.map(header => header.trim().toLowerCase());
  const emailColumn = normalized.findIndex(header => ['email', 'email address', 'e-mail'].includes(header));
  const nameColumn = normalized.findIndex(header => ['name', 'contact name', 'full name'].includes(header));
  if (emailColumn === -1) throw new Error('CSV needs a column named Email or Email Address.');
  return rows.map(row => ({ email: row[emailColumn] || '', name: (row[nameColumn] || '').trim().slice(0, 150) }));
}
