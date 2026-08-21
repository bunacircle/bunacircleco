const NOTIFICATION_TO = 'info@bunacircleco.com';
const NOTIFICATION_CC = 'bunacircle@gmail.com';

function onFormSubmit(event) {
  const responses = event.namedValues || {};
  const customerEmail = firstValue(responses, ['Email', 'Email address', 'Customer email']);
  const customerName = firstValue(responses, ['Full name', 'Name']) || 'New customer';
  const lines = Object.entries(responses).map(([question, answers]) => {
    const value = Array.isArray(answers) ? answers.join(', ') : answers;
    return `${question}: ${value}`;
  });

  MailApp.sendEmail({
    to: NOTIFICATION_TO,
    cc: NOTIFICATION_CC,
    replyTo: customerEmail || NOTIFICATION_CC,
    subject: `New Buna Circle inquiry — ${customerName}`,
    body: `A new event inquiry was submitted.\n\n${lines.join('\n')}\n\nOpen the linked response spreadsheet to manage this inquiry.`,
    name: 'Buna Circle Website',
  });
}

function firstValue(responses, labels) {
  for (const label of labels) {
    const value = responses[label];
    if (value && value[0]) return String(value[0]).trim();
  }
  return '';
}
