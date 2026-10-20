# Buna Circle Co.

Static single-page website for Buna Circle's Ethiopian specialty coffee cart and catering service in DC, Maryland, and Virginia.

## Architecture

- GitHub stores the source.
- Cloudflare Pages hosts the static site and custom domain at no application-hosting cost.
- A branded, three-step form at `/book/` collects inquiries.
- A Cloudflare Worker forwards validated submissions to the existing Google Form.
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

The `wrangler.jsonc` configuration serves static assets and routes `/api/*` through `worker.mjs`. Deploy the GitHub branch through the existing Cloudflare Workers project, using `npx wrangler deploy` as the deploy command. No API keys or Apps Script web-app deployment are needed for form submission.

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
