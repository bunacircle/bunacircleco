# Buna Circle Co.

Production website for Buna Circle's Ethiopian specialty coffee cart and catering service in DC, Maryland, and Virginia.

## Booking architecture

The native `/book/` form stays on `bunacircleco.com` and submits to a same-origin Cloudflare Worker:

1. Cloudflare Turnstile verifies the visitor without exposing backend credentials.
2. The Worker validates and normalizes the inquiry.
3. The Worker forwards it to a private Google Apps Script web app using a shared secret.
4. Apps Script appends one row to Google Sheets and sends branded confirmation and staff-notification emails.

The Sheet is the system of record, so this flow does not require an application database.

## Local verification

```sh
npm test
npm run check
python3 -m http.server 8080
```

Open `http://localhost:8080`. A static preview displays the form, but submission remains unavailable until the Worker bindings are configured.

## 1. Configure Google Sheets and Apps Script

1. Sign in with the Buna Circle Google account and create or choose the booking-response spreadsheet.
2. Open **Extensions → Apps Script** from the Sheet.
3. Add the repository files `google-apps-script/Code.gs` and `google-apps-script/EmailTemplates.gs` to the script project. Enable **Show "appsscript.json" manifest file in editor** in Project Settings and copy `google-apps-script/appsscript.json` into it.
4. In **Project Settings → Script properties**, add:

   - `SHEET_ID`: the ID between `/d/` and `/edit` in the spreadsheet URL
   - `SHARED_SECRET`: a randomly generated secret used only by Apps Script and Cloudflare
   - `STAFF_TO`: `info@bunacircleco.com`
   - `STAFF_CC`: `bunacircle@gmail.com`
   - `FROM_ALIAS`: `info@bunacircleco.com`

5. In Gmail settings for the deploying account, confirm `info@bunacircleco.com` is a verified **Send mail as** address. If it is not ready, omit `FROM_ALIAS`; replies will still go to that address.
6. Choose **Deploy → New deployment → Web app**. Set **Execute as** to **Me** and access to **Anyone**, authorize the requested Sheet and Gmail permissions, then deploy.
7. Copy the deployment URL ending in `/exec`. Use the deployed URL, not the editor or test URL.

The script creates an `Inquiries` tab with headers on the first successful request. Submission IDs and payload hashes prevent duplicate rows or emails when a request is retried.

## 2. Configure Cloudflare Turnstile

Create a Turnstile widget named **Buna Circle booking** and allow both hostnames:

- `www.bunacircleco.com`
- `bunacircleco.com`

Copy its site key and secret key.

## 3. Configure the Cloudflare Worker

The Worker needs these bindings:

| Binding | Type | Value |
| --- | --- | --- |
| `TURNSTILE_SITE_KEY` | Text | Turnstile site key |
| `TURNSTILE_SECRET_KEY` | Secret | Turnstile secret key |
| `APPS_SCRIPT_URL` | Text | Apps Script `/exec` URL |
| `APPS_SCRIPT_SECRET` | Secret | Same value as Apps Script `SHARED_SECRET` |
| `ALLOWED_ORIGINS` | Text | `https://www.bunacircleco.com,https://bunacircleco.com` |

Store the two secrets as encrypted Worker secrets. Never commit them to this repository.

For a Wrangler-managed deployment:

```sh
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put APPS_SCRIPT_SECRET
npx wrangler deploy
```

Add the three non-secret variables in Cloudflare's Worker settings or through the equivalent Wrangler configuration for the production environment. Keep `main` as the production branch for Git-connected deployments.

## API contract

- `GET /api/inquiries/config` returns the public Turnstile site key.
- `POST /api/inquiries` accepts a JSON inquiry plus a matching `Idempotency-Key` header.
- Responses use `{ "ok": true, "reference": "..." }` on success and a stable `code` plus user-safe `message` on failure.

Only same-origin production requests are accepted. The Worker verifies Turnstile server-side, caps field lengths, rejects unknown option values, and never forwards the Turnstile token to Google.

## Deployment checklist

- Run `npm test` and `npm run check`.
- Submit a production test inquiry from desktop and mobile.
- Confirm one Sheet row is created with the same reference shown to the visitor.
- Confirm the customer receives the Buna Circle confirmation email.
- Confirm `info@bunacircleco.com` receives the staff notification and can reply to the customer.
- Retry the same submission ID and confirm no duplicate row or email is created.
- Confirm the homepage, `/book/`, and custom domain all load over HTTPS.
