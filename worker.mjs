import { reserveInquiryEvent } from './inquiry-emails.mjs';
export { InquiryEmail } from './inquiry-emails.mjs';

const MAX_BODY_BYTES = 25_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const EVENT_TYPES = new Set([
  "Private party",
  "Wedding",
  "Corporate event",
  "Church or ministry event",
  "School event",
  "Other",
]);
const SERVICES = new Set([
  "Full coffee cart service",
  "Full coffee cart and matcha",
  "Full coffee cart, matcha, and refreshers",
  "Full coffee cart and refreshers",
  "Other",
]);
const SETTINGS = new Set(["Indoor", "Outdoor", "Both"]);
const YES_NO = new Set(["Yes", "No"]);
const BUDGETS = new Set([
  "Under $1,000",
  "$1,000–$1,499",
  "$1,500–$2,499",
  "$2,500–$3,999",
  "$4,000+",
  "Not sure yet",
]);

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  },
});

const apiError = (status, code, message) => jsonResponse({
  ok: false,
  error: { code, message },
}, status);

const cleanString = (value, maxLength) => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\u0000/g, "").slice(0, maxLength);
};

const cleanArray = (value, allowed, maxItems = 8) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => cleanString(item, 120))
    .filter((item) => allowed.has(item))
  )].slice(0, maxItems);
};

const currentDate = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const validateInquiry = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "The submitted inquiry is invalid." };
  }

  const inquiry = {
    contactName: cleanString(raw.contactName, 100),
    email: cleanString(raw.email, 160).toLowerCase(),
    phone: cleanString(raw.phone, 30),
    organization: cleanString(raw.organization, 140),
    eventTypes: cleanArray(raw.eventTypes, EVENT_TYPES),
    otherEventType: cleanString(raw.otherEventType, 120),
    eventDate: cleanString(raw.eventDate, 10),
    startTime: cleanString(raw.startTime, 5),
    endTime: cleanString(raw.endTime, 5),
    setting: cleanString(raw.setting, 20),
    electricity: cleanString(raw.electricity, 3),
    guestCount: Number(raw.guestCount),
    location: cleanString(raw.location, 240),
    preferredServices: cleanArray(raw.preferredServices, SERVICES),
    otherService: cleanString(raw.otherService, 160),
    customService: cleanString(raw.customService, 3),
    budgetRange: cleanString(raw.budgetRange, 40),
    notes: cleanString(raw.notes, 2000),
    consent: raw.consent === true,
    website: cleanString(raw.website, 200),
  };

  const requiredStrings = [
    inquiry.contactName,
    inquiry.email,
    inquiry.phone,
    inquiry.organization,
    inquiry.eventDate,
    inquiry.startTime,
    inquiry.endTime,
    inquiry.setting,
    inquiry.electricity,
    inquiry.location,
    inquiry.customService,
    inquiry.budgetRange,
  ];

  const eventDateIsValid = DATE_PATTERN.test(inquiry.eventDate)
    && !Number.isNaN(Date.parse(inquiry.eventDate))
    && new Date(inquiry.eventDate).toISOString().slice(0, 10) === inquiry.eventDate
    && inquiry.eventDate >= currentDate();

  if (
    requiredStrings.some((value) => !value)
    || !EMAIL_PATTERN.test(inquiry.email)
    || !TIME_PATTERN.test(inquiry.startTime)
    || !TIME_PATTERN.test(inquiry.endTime)
    || !eventDateIsValid
    || !Number.isInteger(inquiry.guestCount)
    || inquiry.guestCount < 1
    || inquiry.guestCount > 5000
    || inquiry.eventTypes.length === 0
    || inquiry.preferredServices.length === 0
    || !SETTINGS.has(inquiry.setting)
    || !YES_NO.has(inquiry.electricity)
    || !YES_NO.has(inquiry.customService)
    || !BUDGETS.has(inquiry.budgetRange)
    || !inquiry.consent
  ) {
    return { ok: false, message: "Please review the required event details and try again." };
  }

  const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  if (minutes(inquiry.endTime) - minutes(inquiry.startTime) < 60) {
    return { ok: false, message: "End time must be at least one hour after start time." };
  }

  if (inquiry.eventTypes.includes("Other") && !inquiry.otherEventType) {
    return { ok: false, message: "Please describe the other event occasion." };
  }
  if (inquiry.preferredServices.includes("Other") && !inquiry.otherService) {
    return { ok: false, message: "Please describe the other service you have in mind." };
  }

  return { ok: true, inquiry };
};

// These entry IDs belong to the existing public Google Form. Recheck after editing its questions.
export const toGoogleForm = (inquiry) => {
  const body = new URLSearchParams({
    'entry.1336250650': inquiry.contactName,
    'entry.204922629': inquiry.email,
    'entry.1613987353': inquiry.phone,
    'entry.1469293796': inquiry.organization,
    'entry.356717295': inquiry.setting,
    'entry.660270336': inquiry.electricity,
    'entry.2069240841': String(inquiry.guestCount),
    'entry.290729520': inquiry.customService,
    'entry.868784124': inquiry.budgetRange,
    'entry.1055948399': inquiry.location,
    'entry.881923755': inquiry.notes,
    'entry.459757787_year': inquiry.eventDate.slice(0, 4),
    'entry.459757787_month': String(Number(inquiry.eventDate.slice(5, 7))),
    'entry.459757787_day': String(Number(inquiry.eventDate.slice(8, 10))),
    'entry.1050720942_hour': String(Number(inquiry.startTime.slice(0, 2))),
    'entry.1050720942_minute': String(Number(inquiry.startTime.slice(3))),
    'entry.625484560_hour': String(Number(inquiry.endTime.slice(0, 2))),
    'entry.625484560_minute': String(Number(inquiry.endTime.slice(3))),
  });
  const eventValues = {
    'Private party': 'Private Party (Graduation, Baby Shower, Bridal Shower ....)',
    'Corporate event': 'Corporate Event',
    'Church or ministry event': 'Church / Ministry Event',
    'School event': 'School Event',
  };
  const serviceValues = {
    'Full coffee cart and matcha': 'Full coffee cart + matcha',
    'Full coffee cart, matcha, and refreshers': 'Full coffee cart + matcha + refreshers (mocktails)',
    'Full coffee cart and refreshers': 'Full coffee cart + refreshers (mocktails)',
  };
  for (const [id, values, mapping, other] of [
    ['283827731', inquiry.eventTypes, eventValues, inquiry.otherEventType],
    ['1874275231', inquiry.preferredServices, serviceValues, inquiry.otherService],
  ]) {
    for (const value of values) {
      body.append(`entry.${id}`, value === 'Other' ? '__other_option__' : mapping[value] || value);
    }
    if (values.includes('Other')) body.set(`entry.${id}.other_option_response`, other);
  }
  return body;
};

export const handleRequest = async (request, env, fetcher = fetch) => {
  const url = new URL(request.url);
  if (url.pathname !== '/api/inquiries') return env.ASSETS.fetch(request);
  if (request.method !== 'POST') return apiError(405, 'METHOD_NOT_ALLOWED', 'Please submit the inquiry form.');
  if (request.headers.get('Origin') !== url.origin) return apiError(403, 'ORIGIN_NOT_ALLOWED', 'Please submit from the Buna Circle website.');
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return apiError(415, 'CONTENT_TYPE', 'The inquiry format is invalid.');
  let raw;
  try {
    const reader = request.body?.getReader();
    if (!reader) return apiError(400, 'INVALID_JSON', 'The inquiry is empty.');
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return apiError(413, 'PAYLOAD_TOO_LARGE', 'Please shorten your inquiry.');
      }
      chunks.push(value);
    }
    raw = JSON.parse(await new Blob(chunks).text());
  } catch {
    return apiError(400, 'INVALID_JSON', 'The inquiry could not be read.');
  }
  if (raw?.website) return apiError(422, 'VALIDATION_ERROR', 'Please review your inquiry.');
  const result = validateInquiry(raw);
  if (!result.ok) return apiError(422, 'VALIDATION_ERROR', result.message);
  try {
    const reservation = await reserveInquiryEvent(result.inquiry, env);
    if (reservation.status === 409) return reservation;
    if (reservation.status !== 201) throw new Error('Event reservation unavailable');
  } catch {
    return apiError(503, 'DUPLICATE_CHECK_UNAVAILABLE', 'We could not check for an existing inquiry. Please try again later or contact bunacircle@gmail.com.');
  }
  try {
    const response = await fetcher('https://docs.google.com/forms/d/e/1FAIpQLSetlgDZbeQFbq-WjON5xLFuaXxiStmQE7CNvdmOjuXy-CchAQ/formResponse?hl=en', {
      method: 'POST',
      body: toGoogleForm(result.inquiry),
      signal: AbortSignal.timeout(20_000),
    });
    const html = await response.text();
    // A 200 can also be a validation-error page. Only Google's receipt confirms acceptance.
    if (!response.ok || !html.includes('Your response has been recorded.')) {
      return apiError(502, 'DELIVERY_FAILED', 'We could not confirm your inquiry. Please contact bunacircle@gmail.com before resubmitting.');
    }
    return jsonResponse({ ok: true });
  } catch {
    return apiError(502, 'DELIVERY_UNCONFIRMED', 'We could not confirm delivery. Please contact bunacircle@gmail.com before resubmitting.');
  }
};

export default { fetch(request, env) { return handleRequest(request, env); } };
