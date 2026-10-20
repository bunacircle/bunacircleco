const NOTIFICATION_TO = 'info@bunacircleco.com';
const NOTIFICATION_CC = 'bunacircle@gmail.com';
const CONTACT_EMAIL = 'bunacircle@gmail.com';

function onFormSubmit(event) {
  if (!event || !event.namedValues) {
    throw new Error('Submit the linked Google Form to test this function. Do not run it manually.');
  }
  const responses = event.namedValues;
  const email = inquiryValue_(responses, ['Email Address', 'Email', 'Customer email']);
  const name = inquiryValue_(responses, ['Contact Name', 'Full name', 'Name']) || 'there';
  const reference = event.range ? 'BC-' + String(event.range.getRow()).padStart(6, '0') : '';
  const summary = [
    ['Occasion', inquiryValue_(responses, ['Event Name / Occasion', 'Event type'])],
    ['Date', inquiryValue_(responses, ['Event Date'])],
    ['Start time', inquiryValue_(responses, ['Event Start Time', 'Start time'])],
    ['End time', inquiryValue_(responses, ['Event End Time', 'End time'])],
    ['Location', inquiryValue_(responses, ['Event location', 'Venue'])],
    ['Guests', inquiryValue_(responses, ['Estimated Number of Guests', 'Guest count'])],
    ['Coffee experience', inquiryValue_(responses, ['Preferred Service', 'Requested coffee service'])],
  ];
  const allDetails = Object.keys(responses).map(function(key) {
    return [key, Array.isArray(responses[key]) ? responses[key].join(', ') : String(responses[key])];
  });
  const staffIntro = 'A new event inquiry is ready for review. Reply directly to this email to contact the customer.';
  MailApp.sendEmail({
    to: NOTIFICATION_TO, cc: NOTIFICATION_CC,
    replyTo: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : CONTACT_EMAIL,
    name: 'Buna Circle Co.',
    subject: 'New Buna Circle inquiry — ' + name + (reference ? ' · ' + reference : ''),
    body: staffIntro + '\n\n' + emailRowsText_(allDetails) + (reference ? '\n\nReference: ' + reference : ''),
    htmlBody: emailShell_('New event inquiry', staffIntro,
      '<p style="margin:0 0 24px">' + escapeEmailHtml_(staffIntro) + '</p>'
      + emailSection_('Event at a glance', summary)
      + emailSection_('Complete submission', allDetails)
      + emailReference_(reference)),
  });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Team notification sent, but the customer email is missing or invalid. Review the response sheet.');
  }
  const greeting = 'Hi ' + name.split(/\s+/)[0] + ',';
  const thanks = 'Thank you for considering Buna Circle for your gathering. Your inquiry is with our team, and we’re looking forward to learning more about your plans.';
  const next = 'We’ll review your date, venue, and service preferences, then reply with availability, package options, and next steps.';
  const note = 'This confirms receipt of your inquiry. Your date and booking are not reserved yet.';
  MailApp.sendEmail({
    to: email, replyTo: CONTACT_EMAIL, name: 'Buna Circle Co.',
    subject: 'We received your Buna Circle inquiry' + (reference ? ' · ' + reference : ''),
    body: [greeting, thanks, 'YOUR EVENT', emailRowsText_(summary), 'WHAT HAPPENS NEXT', next, note,
      reference ? 'Your reference: ' + reference : '',
      'Need to update a detail? Reply to this email.', 'Warmly,\nBuna Circle Co.\nSip. Connect. Belong.',
      CONTACT_EMAIL + ' · (703) 646-0333\nhttps://www.bunacircleco.com'].filter(Boolean).join('\n\n'),
    htmlBody: emailShell_('Your gathering starts here.', 'We received your event inquiry. Here’s what happens next.',
      '<p style="margin:0 0 16px">' + escapeEmailHtml_(greeting) + '</p>'
      + '<p style="margin:0 0 24px">' + escapeEmailHtml_(thanks) + '</p>'
      + emailSection_('Your event', summary)
      + '<h2 style="margin:28px 0 12px;font:24px Georgia,serif;color:#20361f">What happens next</h2>'
      + '<p style="margin:0 0 18px">' + escapeEmailHtml_(next) + '</p>'
      + '<p style="padding:16px;border-left:3px solid #b78c4d;background:#f4efe5;font-size:14px">' + escapeEmailHtml_(note) + '</p>'
      + emailReference_(reference)
      + '<p style="margin:24px 0">Need to update a detail? Just reply to this email.</p>'
      + '<p style="margin:0">Warmly,<br><b>Buna Circle Co.</b><br><span style="color:#a75334">Sip. Connect. Belong.</span></p>'),
  });
}

function inquiryValue_(responses, labels) {
  const keys = Object.keys(responses);
  for (const label of labels) {
    const prefix = label.toLowerCase().trim();
    const key = keys.find(function(key) {
      const normalized = key.replace(/\s+/g, ' ').trim().toLowerCase();
      return normalized === prefix || normalized.indexOf(prefix + ' ') === 0 || normalized.indexOf(prefix + ':') === 0;
    });
    if (key) return (Array.isArray(responses[key]) ? responses[key].join(', ') : String(responses[key])).trim();
  }
  return '';
}

function escapeEmailHtml_(value) {
  return String(value).replace(/[&<>"']/g, function(char) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
  });
}

function emailRowsText_(rows) {
  return rows.filter(function(row) { return row[1]; }).map(function(row) { return row[0] + ': ' + row[1]; }).join('\n');
}

function emailSection_(title, rows) {
  return '<h2 style="margin:28px 0 12px;font:24px Georgia,serif;color:#20361f">' + escapeEmailHtml_(title) + '</h2>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ded5c5;table-layout:fixed">'
    + rows.filter(function(row) { return row[1]; }).map(function(row) {
      return '<tr><th scope="row" align="left" valign="top" width="36%" style="padding:12px 12px 12px 0;border-bottom:1px solid #ded5c5;font:600 12px/1.5 Arial,sans-serif;color:#536055;overflow-wrap:anywhere">'
        + escapeEmailHtml_(row[0]) + '</th><td valign="top" style="padding:12px 0;border-bottom:1px solid #ded5c5;font:15px/1.5 Arial,sans-serif;color:#162218;overflow-wrap:anywhere;word-break:break-word">'
        + escapeEmailHtml_(row[1]).replace(/\n/g, '<br>') + '</td></tr>';
    }).join('') + '</table>';
}

function emailReference_(reference) {
  return reference ? '<p style="margin:24px 0;padding:14px 16px;border:1px solid #b78c4d;font-size:13px;color:#536055">Inquiry reference <b style="color:#20361f">' + escapeEmailHtml_(reference) + '</b></p>' : '';
}

function emailShell_(title, preheader, content) {
  return '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;background:#f4efe5;color:#162218">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + escapeEmailHtml_(preheader) + '</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe5"><tr><td align="center" style="padding:24px 12px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fbf8f1;border:1px solid #ded5c5">'
    + '<tr><td style="padding:28px 24px;background:#20361f;color:#f4efe5">'
    + '<p style="margin:0;font:24px Georgia,serif;letter-spacing:3px">BUNA CIRCLE</p>'
    + '<p style="margin:8px 0 0;font:10px/1.6 Arial,sans-serif;letter-spacing:2px;color:#d2ad78">CONNECTION · CONVERSATION · COMMUNITY</p></td></tr>'
    + '<tr><td style="padding:32px 24px;font:16px/1.65 Arial,sans-serif">'
    + '<p style="margin:0 0 12px;font:700 11px Arial,sans-serif;letter-spacing:2px;color:#a75334">EVENT INQUIRY</p>'
    + '<h1 style="margin:0 0 24px;font:36px/1.15 Georgia,serif;color:#162218">' + escapeEmailHtml_(title) + '</h1>'
    + content + '</td></tr><tr><td style="padding:24px;background:#162218;color:#f4efe5;font:12px/1.8 Arial,sans-serif">'
    + '<b>Buna Circle Co.</b> · DC, Maryland &amp; Virginia<br>'
    + '<a href="mailto:' + CONTACT_EMAIL + '" style="color:#f4efe5">' + CONTACT_EMAIL + '</a><br>'
    + '<a href="tel:+17036460333" style="color:#f4efe5">(703) 646-0333</a> · '
    + '<a href="https://www.bunacircleco.com" style="color:#f4efe5">Visit our website</a>'
    + '</td></tr></table></td></tr></table></body></html>';
}
