# Buna Circle Co.

Static single-page website for Buna Circle's Ethiopian specialty coffee cart and catering service in DC, Maryland, and Virginia.

## Architecture

- GitHub stores the source.
- Cloudflare Pages hosts the static site and custom domain at no application-hosting cost.
- Google Forms collects inquiries.
- Google Sheets stores responses.
- A Google Apps Script form-submit trigger emails each inquiry to `info@bunacircleco.com` and `bunacircle@gmail.com`.
- No application database, server, or paid form-processing API is required.

## Configure the inquiry form

1. Sign in to Google with `bunacircle@gmail.com` and create a form named **Buna Circle Event Inquiry**.
2. Add: full name, email, phone, event type, date, start/end time, venue, guest count, requested coffee service, indoor/outdoor, details, referral source, and consent to be contacted.
3. Link the form to a Google Sheet.
4. In Google Forms, choose **Send → Embed (`<>`)** and copy the URL from the iframe `src`.
5. Paste that URL into `googleFormEmbedUrl` in `config.js`.
6. From the linked Sheet, open **Extensions → Apps Script** and paste `google-apps-script/Code.gs` into the editor.
7. In Apps Script, open **Triggers → Add Trigger**, select `onFormSubmit`, event source **From spreadsheet**, event type **On form submit**, and authorize it using `bunacircle@gmail.com`.
8. Submit one test response and verify that both notification addresses receive it. Keep the test response as an audit record until setup is confirmed.

The script looks for an email question named `Email`, `Email address`, or `Customer email`. If the form uses another label, add it to the label list in `Code.gs`.

## Deploy with Cloudflare Pages

1. Push this repository to GitHub.
2. In Cloudflare, create a Pages project and connect `bunacircle/bunacircleco`.
3. Use production branch `main`.
4. Framework preset: **None**.
5. Build command: leave empty.
6. Build output directory: `/`.
7. Deploy, then add `www.bunacircleco.com` under **Custom domains**.
8. Redirect the apex domain `bunacircleco.com` to `https://www.bunacircleco.com` using a Cloudflare Redirect Rule.

Cloudflare reads `_headers` to apply the included security and cache headers. The `CNAME` file is harmless on Cloudflare and also makes the repository ready for GitHub Pages as a fallback.

## Local preview

Run any static server from the repository root, for example:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Before launch

- Set the live Google Form embed URL in `config.js`.
- Test submission delivery to both email addresses.
- Confirm the domain uses HTTPS.
- Confirm mobile and desktop layouts.
- Replace any copy, menu items, or service claims that are not final business offerings.
