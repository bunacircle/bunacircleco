# Buna Circle promotional email studio

The Cloudflare-hosted `/studio/` page sends through the existing business Google Apps Script and Gmail account. It does not use Cloudflare Email Service or an external marketing email vendor. `bunacircle@gmail.com` is the sender and reply-to address; forwarding `info@bunacircleco.com` does not grant permission to send as that address.

## Install the script bridge

1. Open the response spreadsheet's existing bound project, ID `1bUVqrlpSbIh_0f3U0CV3Yw42T8fleKjuzd89MnGRsi6repangN_kHyxz`.
2. Add a script file named **Promotions** and paste the complete `Promotions.gs` file. Keep `Code.gs` and the existing spreadsheet `onFormSubmit` trigger unchanged. No additional trigger is needed.
3. Save, then run **initializePromotions** once as `bunacircle@gmail.com`. It generates a private bridge secret and creates two tabs: **Marketing Deliveries** and **Marketing Suppressions**. It never sends email. Review any Google authorization prompt before accepting it.
4. In **Project Settings → Script properties**, locate `PROMOTIONS_BRIDGE_SECRET`. The account owner must transfer its value directly to the Cloudflare Worker secret of the same name. Do not send it in chat, commit it, place it in a URL, or put it in browser JavaScript. Do not rotate it casually: unsubscribe links use this secret and require the same key to remain valid.
5. Deploy **Web app**, **Execute as: Me (bunacircle@gmail.com)**, **Who has access: Anyone**. This makes the HTTP bridge reachable, but all actions require a server-generated HMAC signature and a five-minute timestamp. The owner must approve this new access before deployment. Copy the `/exec` URL into the Worker variable `PROMOTIONS_SCRIPT_URL`.

## Protect the studio with Cloudflare Access

Create one self-hosted Access application with an Allow policy for **only bunacircle@gmail.com**, using email one-time PIN or the existing Google identity provider. Include these application paths on both `www.bunacircleco.com` and `bunacircleco.com`:

- `/studio` and `/studio/*`
- `/api/promotions/*`

Keep `/unsubscribe` public so recipients can update their preferences without a staff account. Do not apply the staff application to the public site or inquiry API. Do not add a bypass policy for the studio. Worker code also verifies the Access JWT's signature, issuer, audience, expiry and exact staff email, including requests through alternate Worker hostnames. Without configuration it rejects studio access.

Set these production Worker variables, preserving the existing inquiry bindings/secrets:

`wrangler.jsonc` sets `keep_vars: true` so later Git deployments retain these dashboard-managed runtime variables. Keep private connection values out of the repository.

| Name | Value |
| --- | --- |
| `PROMOTIONS_ACCESS_TEAM` | Your actual team hostname, such as `your-team.cloudflareaccess.com`, without `https://` |
| `PROMOTIONS_ACCESS_AUD` | The Access application's audience tag |
| `PROMOTIONS_SCRIPT_URL` | The deployed Apps Script `/exec` URL |
| `PROMOTIONS_MAILING_ADDRESS` | The business's real postal mailing address or PO box |
| `PROMOTIONS_BRIDGE_SECRET` (**secret**) | The generated value from Script properties |

Use a different script/secret and test data for preview deployments. Do not let a preview send through the production mailbox. Leaving preview variables unset makes the preview studio unavailable by design.

## Use the studio

1. Sign in at `https://www.bunacircleco.com/studio/`. Confirm the displayed sender and available quota.
2. Edit the subject and message. Paste selected emails, import CSV, or load existing inquiry contacts. Loading inquiry contacts does not establish marketing permission. Addresses are deduplicated and the persistent unsubscribe list is enforced again on the server before each campaign.
3. Select at most **20** contacts who agreed to promotions. Send a test to the business Gmail, inspect its content and links in Inbox/Spam, then check the review and audience-permission boxes. A campaign requires a test receipt matching the exact current content and mailing address, valid for 30 minutes.
4. Send once. The page locks that campaign's message and audience. Each recipient gets a separate email. Edits/contacts remain in tab memory only; refreshing clears them. The delivery record remains in the spreadsheet.
5. For a timeout, retain the campaign reference and check **Marketing Deliveries** and Apps Script **Executions**. **sent** means MailApp returned successfully, **unknown** means delivery could have happened and will not be repeated automatically, **not_sent** means no attempt occurred, and **suppressed** means unsubscribed. Retrying the same campaign replays completed results and may attempt only unclaimed recipients. Do not start a new campaign just to retry an unknown delivery. A fresh test can renew an expired receipt while keeping the same locked campaign.
6. **Start a new campaign** deliberately resets the campaign ID and requires a new test. It can send similar content again; the ledger prevents accidental retries of one campaign, not intentional future promotions to the same customer.

The current Google consumer-account limit is 100 email recipients/day, shared with inquiry notifications. The script checks Google's remaining quota and leaves 30 recipient slots when sending promotions. Inquiry volume and other scripts can consume that reserve; it is not a guarantee of future availability. The script stops a campaign after a mail error rather than automatically retrying uncertain delivery. This is a small-volume sender, not a background bulk-mail queue.

## Verify before enabling campaigns

- Run `npm test` and a Wrangler dry run. Tests cover the Worker access checks and a mocked Apps Script runtime; they do not prove live mail delivery.
- Confirm anonymous requests, a different email's login, and direct Worker hostname access cannot use the studio API.
- With permission, send **one** test to `bunacircle@gmail.com`. Verify actual Inbox/Spam arrival, branding, sender/reply-to, public image and working button.
- Use a controlled test address to verify unsubscribe: opening the link displays confirmation, and pressing **Unsubscribe** adds the address once to Marketing Suppressions. A later controlled campaign must skip it, including when manually typed or imported.
- Verify the same campaign ID does not deliver twice and both log tabs persist. Do not sort/delete raw response rows or remove suppression/delivery records.
- Submit one authorized inquiry only if a regression concern remains; the existing inquiry tests already cover its trigger/template contract.

Google references: [web apps](https://developers.google.com/apps-script/guides/web), [daily quotas](https://developers.google.com/apps-script/guides/services/quotas). Cloudflare reference: [validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
