import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, validateInquiry } from "../worker.mjs";

const tomorrow = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

const validInquiry = () => ({
  submissionId: crypto.randomUUID(),
  startedAt: Date.now() - 3_000,
  contactName: "Aster Example",
  email: "aster@example.com",
  phone: "(703) 555-0100",
  organization: "Example Events",
  eventTypes: ["Wedding"],
  otherEventType: "",
  eventDate: tomorrow(),
  startTime: "10:00",
  endTime: "13:00",
  setting: "Indoor",
  electricity: "Yes",
  guestCount: 120,
  location: "Alexandria, VA 22314",
  preferredServices: ["Full coffee cart and matcha"],
  otherService: "",
  customService: "Yes",
  budgetRange: "$1,500–$2,499",
  notes: "A warm morning reception.",
  consent: true,
  website: "",
  turnstileToken: "test-token",
});

const env = {
  ALLOWED_ORIGINS: "https://www.bunacircleco.com",
  TURNSTILE_SITE_KEY: "public-site-key",
  TURNSTILE_SECRET_KEY: "secret-key",
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/example/exec",
  APPS_SCRIPT_SECRET: "shared-secret",
  ASSETS: { fetch: () => new Response("asset") },
};

test("validates a complete inquiry", () => {
  const result = validateInquiry(validInquiry());
  assert.equal(result.ok, true);
  assert.equal(result.inquiry.email, "aster@example.com");
});

test("rejects incomplete and malformed inquiry data", () => {
  const inquiry = validInquiry();
  inquiry.email = "not-an-email";
  inquiry.eventTypes = [];
  const result = validateInquiry(inquiry);
  assert.equal(result.ok, false);
});

test("returns the public Turnstile site key", async () => {
  const response = await handleRequest(
    new Request("https://www.bunacircleco.com/api/inquiries/config"),
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { siteKey: "public-site-key" });
});

test("accepts a verified inquiry and forwards only to the configured Apps Script", async () => {
  const inquiry = validInquiry();
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("siteverify")) {
      return Response.json({ success: true, hostname: "www.bunacircleco.com" });
    }
    return Response.json({ ok: true, referenceId: "BC-20261020-AB12CD" });
  };
  const response = await handleRequest(new Request(
    "https://www.bunacircleco.com/api/inquiries",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": inquiry.submissionId,
        "Origin": "https://www.bunacircleco.com",
      },
      body: JSON.stringify(inquiry),
    },
  ), env, fetcher);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, referenceId: "BC-20261020-AB12CD" });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, env.APPS_SCRIPT_URL);
  const forwarded = JSON.parse(calls[1].options.body);
  assert.equal(forwarded.sharedSecret, env.APPS_SCRIPT_SECRET);
  assert.equal(forwarded.inquiry.turnstileToken, undefined);
  assert.equal(forwarded.inquiry.email, inquiry.email);
});

test("blocks an untrusted origin before calling external services", async () => {
  const inquiry = validInquiry();
  let calls = 0;
  const response = await handleRequest(new Request(
    "https://www.bunacircleco.com/api/inquiries",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": inquiry.submissionId,
        "Origin": "https://example.com",
      },
      body: JSON.stringify(inquiry),
    },
  ), env, async () => { calls += 1; });

  assert.equal(response.status, 403);
  assert.equal(calls, 0);
});

test("silently accepts a honeypot submission without storing or emailing it", async () => {
  const inquiry = validInquiry();
  inquiry.website = "https://spam.example";
  let calls = 0;
  const response = await handleRequest(new Request(
    "https://www.bunacircleco.com/api/inquiries",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": inquiry.submissionId,
        "Origin": "https://www.bunacircleco.com",
      },
      body: JSON.stringify(inquiry),
    },
  ), env, async () => { calls += 1; });

  assert.equal(response.status, 200);
  assert.equal(calls, 0);
});
