const MAX_BODY_BYTES = 25_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    submissionId: cleanString(raw.submissionId, 64),
    startedAt: Number(raw.startedAt),
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
    turnstileToken: cleanString(raw.turnstileToken, 2048),
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

  const startedRecently = Number.isFinite(inquiry.startedAt)
    && inquiry.startedAt <= Date.now()
    && Date.now() - inquiry.startedAt >= 1_500
    && Date.now() - inquiry.startedAt < 86_400_000;
  const eventDateIsValid = DATE_PATTERN.test(inquiry.eventDate) && inquiry.eventDate >= currentDate();

  if (
    !ID_PATTERN.test(inquiry.submissionId)
    || requiredStrings.some((value) => !value)
    || !EMAIL_PATTERN.test(inquiry.email)
    || !TIME_PATTERN.test(inquiry.startTime)
    || !TIME_PATTERN.test(inquiry.endTime)
    || inquiry.endTime <= inquiry.startTime
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
    || !inquiry.turnstileToken
    || !startedRecently
  ) {
    return { ok: false, message: "Please review the required event details and try again." };
  }

  if (inquiry.eventTypes.includes("Other") && !inquiry.otherEventType) {
    return { ok: false, message: "Please describe the other event occasion." };
  }
  if (inquiry.preferredServices.includes("Other") && !inquiry.otherService) {
    return { ok: false, message: "Please describe the other service you have in mind." };
  }

  return { ok: true, inquiry };
};

const allowedOrigins = (env) => new Set(
  cleanString(
    env.ALLOWED_ORIGINS || "https://www.bunacircleco.com,https://bunacircleco.com",
    1000,
  ).split(",").map((origin) => origin.trim()).filter(Boolean),
);

const verifyTurnstile = async (token, request, env, fetcher) => {
  if (!env.TURNSTILE_SECRET_KEY) throw new Error("turnstile_not_configured");
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
    idempotency_key: crypto.randomUUID(),
  });
  const remoteIp = request.headers.get("CF-Connecting-IP");
  if (remoteIp) body.set("remoteip", remoteIp);

  const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return false;

  const result = await response.json();
  if (!result || result.success !== true) return false;

  const expectedHosts = new Set([...allowedOrigins(env)].map((origin) => {
    try { return new URL(origin).hostname; } catch { return ""; }
  }).filter(Boolean));
  return typeof result.hostname === "string" && expectedHosts.has(result.hostname);
};

const forwardInquiry = async (inquiry, env, fetcher) => {
  if (!env.APPS_SCRIPT_URL || !env.APPS_SCRIPT_SECRET) {
    throw new Error("apps_script_not_configured");
  }

  const { turnstileToken, website, startedAt, ...storedInquiry } = inquiry;
  const response = await fetcher(env.APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      sharedSecret: env.APPS_SCRIPT_SECRET,
      receivedAt: new Date().toISOString(),
      source: "bunacircleco.com/book",
      inquiry: storedInquiry,
    }),
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("apps_script_invalid_response");
  }
  if (!response.ok || result?.ok !== true || typeof result.referenceId !== "string") {
    throw new Error("apps_script_rejected");
  }
  return result;
};

export const handleRequest = async (request, env, fetcher = fetch) => {
  const url = new URL(request.url);

  if (url.pathname === "/api/inquiries/config" && request.method === "GET") {
    if (!env.TURNSTILE_SITE_KEY) {
      return apiError(503, "SERVICE_UNAVAILABLE", "Secure booking is temporarily unavailable.");
    }
    return jsonResponse({ siteKey: env.TURNSTILE_SITE_KEY });
  }

  if (url.pathname !== "/api/inquiries") {
    return env.ASSETS.fetch(request);
  }
  if (request.method !== "POST") {
    return apiError(405, "METHOD_NOT_ALLOWED", "This endpoint accepts booking submissions only.");
  }

  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins(env).has(origin)) {
    return apiError(403, "ORIGIN_NOT_ALLOWED", "This submission origin is not allowed.");
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return apiError(413, "PAYLOAD_TOO_LARGE", "The inquiry is too large to process.");
  }

  let raw;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return apiError(413, "PAYLOAD_TOO_LARGE", "The inquiry is too large to process.");
    }
    raw = JSON.parse(text);
  } catch {
    return apiError(400, "INVALID_JSON", "The submitted inquiry is invalid.");
  }

  const validation = validateInquiry(raw);
  if (!validation.ok) {
    return apiError(422, "VALIDATION_ERROR", validation.message);
  }

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (idempotencyKey !== validation.inquiry.submissionId) {
    return apiError(422, "IDEMPOTENCY_MISMATCH", "The submission identifier is invalid.");
  }

  if (validation.inquiry.website) {
    return jsonResponse({
      ok: true,
      referenceId: `BC-${validation.inquiry.submissionId.slice(0, 8).toUpperCase()}`,
    });
  }

  let turnstileValid = false;
  try {
    turnstileValid = await verifyTurnstile(validation.inquiry.turnstileToken, request, env, fetcher);
  } catch (error) {
    console.error("turnstile_verification_failed", { reason: error.message });
    return apiError(503, "SERVICE_UNAVAILABLE", "Secure booking is temporarily unavailable.");
  }
  if (!turnstileValid) {
    return apiError(403, "VERIFICATION_FAILED", "Secure verification failed. Please try again.");
  }

  try {
    const result = await forwardInquiry(validation.inquiry, env, fetcher);
    return jsonResponse({ ok: true, referenceId: result.referenceId });
  } catch (error) {
    console.error("inquiry_forward_failed", { reason: error.message });
    return apiError(502, "DELIVERY_FAILED", "We could not send your inquiry. Please try again shortly.");
  }
};

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
