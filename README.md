# Buna Circle Co.

Static single-page website for Buna Circle's Ethiopian specialty coffee cart and catering service in DC, Maryland, and Virginia.

## Architecture

- GitHub stores the source.
- Cloudflare Workers hosts the static site and custom domain.
- A branded, three-step form at `/book/` collects inquiries.
- A Cloudflare Worker checks email uniqueness, then forwards validated submissions to the existing Google Form.
- A SQLite-backed Durable Object reserves each normalized email before delivery.
- Google Sheets stores responses.
- A Google Apps Script form-submit trigger emails each inquiry to `info@bunacircleco.com` and `bunacircle@gmail.com`.
- No application database, server to maintain, or paid form-processing API is required.

## Configure the inquiry form

1. Sign in to Google with `bunacircle@gmail.com` and create a form named **Buna Circle Event Inquiry**.
2. Add: full name, email, phone, event type, date, start/end time, venue, guest count, requested coffee service, indoor/outdoor, details, referral source, and consent to be contacted.
3. Link the form to a Google Sheet.
4. From the linked Sheet, open **Extensions → Apps Script** and paste `google-apps-script/Code.gs` into the editor.
5. In Apps Script, open **Triggers → Add Trigger**, select `onFormSubmit`, event source **From spreadsheet**, event type **On form submit**, and authorize it using `bunacircle@gmail.com`.
6. Submit one test response and verify that both notification addresses receive it. Keep the test response as an audit record until setup is confirmed.

The script looks for an email question named `Email`, `Email address`, or `Customer email`. If the form uses another label, add it to the label list in `Code.gs`.

## Deploy with Cloudflare Workers

The `wrangler.jsonc` configuration serves static assets and routes `/api/*` through `worker.mjs`. Deploy the GitHub branch through the existing Cloudflare Workers project, using `npx wrangler deploy` as the deploy command. No Apps Script web-app deployment is needed. Configure the private historical email hashes described below before deploying email uniqueness.

`POST /api/inquiries` accepts the fields in `book/book.js` and returns `{ "ok": true }` only after Google confirms receipt. Errors return `{ "ok": false, "error": { "code": "…", "message": "…" } }` with a non-2xx status. The Worker validates required fields, dates, times, choices, consent, origin, and body size. It never logs submissions or automatically retries uncertain deliveries.

The Google Form's public submission endpoint and entry IDs are coupled to its schema. If you delete/recreate questions, change required fields, or customize Google's default confirmation text, update `toGoogleForm` and the receipt check in `worker.mjs`, then repeat an end-to-end submission. Keep the spreadsheet's existing `onFormSubmit` trigger: writing to Sheets directly would not activate it.

Run `npm test` for mapping, validation, rejected requests, and delivery-result tests. Google accepting a response confirms recording, not email delivery: check Apps Script Executions and both inboxes separately. On October 20, the Gmail inbox showed a bounce for `info@bunacircleco.com`; the native form uses Gmail as its contact fallback until that mailbox is repaired.

## Local preview

Run any static server from the repository root, for example:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Before launch

- Confirm the Google Form entry mapping matches the current questions.
- Test submission delivery to both email addresses.
- Confirm the domain uses HTTPS.
- Confirm mobile and desktop layouts.
- Replace any copy, menu items, or service claims that are not final business offerings.

## Branded inquiry emails

`google-apps-script/Code.gs` contains the complete spreadsheet-trigger script and inline HTML templates. Each new submission sends a structured team notification, followed by a customer receipt with event details, next steps, and a row-based inquiry reference. Both messages include plain-text fallbacks; submitted values are HTML escaped.

Paste the complete file into the existing response spreadsheet's Apps Script project and save. Retain the existing `onFormSubmit` trigger; do not add a second trigger or run the handler manually. Test by submitting the form with your own email address and checking both messages. Template changes apply to future submissions only. References use spreadsheet row numbers: do not sort/delete rows in the raw response tab; use a separate view to manage inquiries.

Customer replies go to `bunacircle@gmail.com` while the domain mailbox is being repaired. This script does not claim to send from the custom-domain address or reserve dates. Each submission uses three email-recipient quota units (two staff recipients plus the customer). Avoid manually rerunning an execution after a partial delivery, since that can duplicate messages.

## One inquiry per email

The website accepts at most one delivery attempt per email address, with leading/trailing spaces removed and case ignored. Different addresses remain independent; Gmail aliases and plus-addresses are not merged. The existing Sheet and email trigger are unchanged. Duplicate submissions return HTTP 409 with `DUPLICATE_EMAIL`; the booking page displays the message without clearing the entered details.

Before deploying this version, export the current response Sheet privately and hash each nonempty Email Address value using SHA-256 after `trim().toLowerCase()`. Set the Cloudflare Worker **secret** `INQUIRY_EMAIL_HISTORY` to a JSON array of those 64-character lowercase hex hashes. Keep the secret on future deployments. Do not put the Sheet, email list, or hashes in the public repository. For local tests, use `INQUIRY_EMAIL_HISTORY="[]"` in ignored `.dev.vars`. A missing/invalid secret or unavailable Durable Object stops submission with HTTP 503 before contacting Google.

`wrangler.jsonc` creates the `INQUIRY_EMAILS` binding and SQLite namespace through migration `inquiry-email-v1`. Each object is named by the email hash and stores a boolean claim in an atomic transaction. The claim persists across deployments and is never automatically released: Google may have recorded a submission even when its response times out. A customer whose first attempt failed must contact the team to check the Sheet before retrying. After confirming no inquiry was saved, an operator can remove only that hash's `reserved` key through Cloudflare's Durable Object storage tools to permit another attempt. Do not delete claims without checking the Sheet and email history first.

Historical hashes are a deployment-time snapshot. Submissions made directly to the old Google Form, or rows added manually after that export, bypass this website check. Use the native website form for inquiries; if other sources remain active, refresh the private history before deployment or move all intake behind one shared duplicate check. Existing duplicate rows are retained.

Run `npm test` for normalization, historical matches, concurrent requests, retries after uncertain delivery, storage failures, and the existing validation/email checks.
