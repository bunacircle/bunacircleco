function sendCustomerConfirmation_(inquiry, referenceId, config) {
  const options = emailOptions_(config, {
    htmlBody: customerEmailHtml_(inquiry, referenceId),
    replyTo: config.fromAlias,
  });
  GmailApp.sendEmail(
    inquiry.email,
    'We received your Buna Circle event inquiry',
    customerEmailText_(inquiry, referenceId),
    options
  );
}

function sendStaffNotification_(inquiry, referenceId, config) {
  const options = emailOptions_(config, {
    htmlBody: staffEmailHtml_(inquiry, referenceId),
    replyTo: inquiry.email,
  });
  if (config.staffCc) options.cc = config.staffCc;
  GmailApp.sendEmail(
    config.staffTo,
    'New inquiry · ' + inquiry.eventDate + ' · ' + inquiry.contactName,
    staffEmailText_(inquiry, referenceId),
    options
  );
}

function emailOptions_(config, extra) {
  const options = Object.assign({ name: 'Buna Circle Co.' }, extra || {});
  const aliases = GmailApp.getAliases();
  if (config.fromAlias && aliases.indexOf(config.fromAlias) !== -1) {
    options.from = config.fromAlias;
  }
  return options;
}

function customerEmailText_(inquiry, referenceId) {
  return [
    'Hi ' + firstName_(inquiry.contactName) + ',',
    '',
    'Thank you for considering Buna Circle for your event. We received your inquiry and will review the details shortly.',
    '',
    'YOUR EVENT',
    'Date: ' + formatEventDate_(inquiry.eventDate),
    'Occasion: ' + eventTypeText_(inquiry),
    'Location: ' + inquiry.location,
    'Estimated guests: ' + inquiry.guestCount,
    'Coffee experience: ' + serviceText_(inquiry),
    '',
    'WHAT HAPPENS NEXT',
    'We will review availability, service requirements, and your vision. Expect a response with package recommendations and next steps within 1–2 business days.',
    '',
    'Your inquiry reference is ' + referenceId + '.',
    '',
    'Warmly,',
    'Buna Circle Co.',
    'Sip. Connect. Belong.',
    '(703) 646-0333 · info@bunacircleco.com',
  ].join('\n');
}

function customerEmailHtml_(inquiry, referenceId) {
  const content = ''
    + '<p style="margin:0 0 18px">Hi ' + escapeHtml_(firstName_(inquiry.contactName)) + ',</p>'
    + '<p style="margin:0 0 24px">Thank you for considering Buna Circle for your event. We received your inquiry and will review the details shortly.</p>'
    + sectionTitle_('Your event')
    + detailTable_([
      ['Date', formatEventDate_(inquiry.eventDate)],
      ['Occasion', eventTypeText_(inquiry)],
      ['Location', inquiry.location],
      ['Estimated guests', String(inquiry.guestCount)],
      ['Coffee experience', serviceText_(inquiry)],
    ])
    + sectionTitle_('What happens next')
    + '<p style="margin:0 0 24px">We’ll review availability, service requirements, and your vision for the gathering. Expect a response with package recommendations and next steps within 1–2 business days.</p>'
    + '<div style="margin:28px 0;padding:16px 18px;border:1px solid #b78c4d;background:#f4efe5">'
    + '<span style="display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#687069">Your inquiry reference</span>'
    + '<strong style="display:block;margin-top:4px;font-family:Georgia,serif;font-size:21px;color:#a75334">' + escapeHtml_(referenceId) + '</strong>'
    + '</div>'
    + '<p style="margin:0">Warmly,<br><strong>Buna Circle Co.</strong><br><span style="color:#a75334">Sip. Connect. Belong.</span></p>';
  return emailShell_('Thank you for inviting us into the circle.', 'Your event inquiry is safely with our team.', content);
}

function staffEmailText_(inquiry, referenceId) {
  return [
    'New Buna Circle event inquiry',
    'Reference: ' + referenceId,
    '',
    'Contact: ' + inquiry.contactName,
    'Email: ' + inquiry.email,
    'Phone: ' + inquiry.phone,
    'Organization / host: ' + inquiry.organization,
    '',
    'Occasion: ' + eventTypeText_(inquiry),
    'Date: ' + inquiry.eventDate,
    'Time: ' + inquiry.startTime + '–' + inquiry.endTime,
    'Setting: ' + inquiry.setting,
    'Electricity: ' + inquiry.electricity,
    'Guests: ' + inquiry.guestCount,
    'Location: ' + inquiry.location,
    '',
    'Preferred service: ' + serviceText_(inquiry),
    'Custom service: ' + inquiry.customService,
    'Budget: ' + inquiry.budgetRange,
    'Notes: ' + (inquiry.notes || 'None provided'),
    '',
    'Reply directly to this email to contact the customer.',
  ].join('\n');
}

function staffEmailHtml_(inquiry, referenceId) {
  const content = ''
    + '<p style="margin:0 0 22px">A new event inquiry is ready for review. Reply to this email to contact the customer directly.</p>'
    + sectionTitle_('Contact')
    + detailTable_([
      ['Name', inquiry.contactName],
      ['Email', inquiry.email],
      ['Phone', inquiry.phone],
      ['Organization / host', inquiry.organization],
    ])
    + sectionTitle_('Event')
    + detailTable_([
      ['Occasion', eventTypeText_(inquiry)],
      ['Date', formatEventDate_(inquiry.eventDate)],
      ['Time', inquiry.startTime + '–' + inquiry.endTime],
      ['Setting', inquiry.setting],
      ['Electricity', inquiry.electricity],
      ['Estimated guests', String(inquiry.guestCount)],
      ['Location', inquiry.location],
    ])
    + sectionTitle_('Service')
    + detailTable_([
      ['Preferred service', serviceText_(inquiry)],
      ['Custom service', inquiry.customService],
      ['Budget', inquiry.budgetRange],
      ['Notes', inquiry.notes || 'None provided'],
    ])
    + '<div style="margin:28px 0 0;padding:14px 18px;background:#f4efe5;color:#20361f"><strong>Reference:</strong> ' + escapeHtml_(referenceId) + '</div>';
  return emailShell_('New event inquiry', formatEventDate_(inquiry.eventDate) + ' · ' + inquiry.contactName, content);
}

function emailShell_(title, preheader, content) {
  return '<!doctype html><html><body style="margin:0;padding:0;background:#f4efe5;color:#162218">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + escapeHtml_(preheader) + '</div>'
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4efe5"><tr><td align="center" style="padding:28px 12px">'
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fbf8f1;border:1px solid #ded5c5">'
    + '<tr><td style="padding:24px 32px;background:#20361f;color:#f4efe5">'
    + '<div style="font-family:Georgia,serif;font-size:21px;letter-spacing:.14em">BUNA CIRCLE</div>'
    + '<div style="margin-top:5px;font:10px Arial,sans-serif;letter-spacing:.16em;color:#d8c5a6">CONNECTION · CONVERSATION · COMMUNITY</div>'
    + '</td></tr>'
    + '<tr><td style="padding:38px 32px;font:16px/1.6 Arial,sans-serif">'
    + '<div style="margin-bottom:8px;font-size:11px;font-weight:bold;letter-spacing:.16em;text-transform:uppercase;color:#a75334">Buna Circle Co.</div>'
    + '<h1 style="margin:0 0 24px;font:600 34px/1.12 Georgia,serif;color:#162218">' + escapeHtml_(title) + '</h1>'
    + content
    + '</td></tr>'
    + '<tr><td style="padding:22px 32px;background:#162218;color:#d8d5ca;font:12px/1.6 Arial,sans-serif">'
    + 'Buna Circle Co. · DC, Maryland &amp; Virginia<br>'
    + '<a href="https://www.bunacircleco.com" style="color:#f4efe5">www.bunacircleco.com</a> · '
    + '<a href="mailto:info@bunacircleco.com" style="color:#f4efe5">info@bunacircleco.com</a> · (703) 646-0333'
    + '</td></tr></table></td></tr></table></body></html>';
}

function sectionTitle_(title) {
  return '<h2 style="margin:28px 0 10px;padding-bottom:7px;border-bottom:1px solid #ded5c5;font:600 20px Georgia,serif;color:#20361f">' + escapeHtml_(title) + '</h2>';
}

function detailTable_(rows) {
  return '<table role="presentation" width="100%" cellspacing="0" cellpadding="0">'
    + rows.map(function(row) {
      return '<tr><td style="width:34%;padding:7px 10px 7px 0;vertical-align:top;font:700 12px Arial,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:#687069">'
        + escapeHtml_(row[0])
        + '</td><td style="padding:7px 0;vertical-align:top;font:15px/1.5 Arial,sans-serif;color:#162218">'
        + escapeHtml_(row[1])
        + '</td></tr>';
    }).join('')
    + '</table>';
}

function eventTypeText_(inquiry) {
  const values = inquiry.eventTypes.filter(function(value) { return value !== 'Other'; });
  if (inquiry.eventTypes.indexOf('Other') !== -1 && inquiry.otherEventType) values.push(inquiry.otherEventType);
  return values.join(', ');
}

function serviceText_(inquiry) {
  const values = inquiry.preferredServices.filter(function(value) { return value !== 'Other'; });
  if (inquiry.preferredServices.indexOf('Other') !== -1 && inquiry.otherService) values.push(inquiry.otherService);
  return values.join(', ');
}

function formatEventDate_(dateString) {
  const parts = String(dateString).split('-');
  if (parts.length !== 3) return dateString;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return Utilities.formatDate(date, 'America/New_York', 'MMMM d, yyyy');
}

function firstName_(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
