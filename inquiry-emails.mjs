export const duplicateInquiry = () => new Response(JSON.stringify({
  ok: false,
  error: {
    code: 'DUPLICATE_EVENT',
    message: 'An inquiry or submission attempt already exists for this email, event date, start time, and venue. Please reply to your confirmation or contact bunacircle@gmail.com to update this event.',
  },
}), { status: 409, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export const eventHash = async ({ email, eventDate, startTime, location }) => {
  const normalize = (value) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  const key = JSON.stringify([normalize(email), eventDate, startTime, normalize(location)]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const reserveInquiryEvent = async (inquiry, env) => {
  // Missing history must stop delivery, otherwise older inquiries would bypass the check.
  const history = JSON.parse(env.INQUIRY_EVENT_HISTORY);
  if (!Array.isArray(history) || history.some((hash) => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('Invalid inquiry event history');
  }
  const hash = await eventHash(inquiry);
  // shortcut: history is a snapshot; refresh it if inquiries are added outside the website.
  if (history.includes(hash)) return duplicateInquiry();
  // Reuse the namespace, but never read the old email-only claims.
  const id = env.INQUIRY_EMAILS.idFromName('event-v1:' + hash);
  return env.INQUIRY_EMAILS.get(id).fetch('https://inquiry-email/reserve', { method: 'POST' });
};

export class InquiryEmail {
  constructor(ctx) {
    this.storage = ctx.storage;
  }

  async fetch(request) {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const reserved = await this.storage.transaction(async (transaction) => {
      if (await transaction.get('reserved')) return false;
      await transaction.put('reserved', true);
      return true;
    });
    // Keep the claim after any delivery attempt: a timeout can hide a successful Google submission.
    return reserved ? new Response(null, { status: 201 }) : duplicateInquiry();
  }
}
