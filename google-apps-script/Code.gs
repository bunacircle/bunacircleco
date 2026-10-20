const INQUIRY_SHEET_NAME = 'Inquiries';
const INQUIRY_HEADERS = [
  'Received At', 'Submission ID', 'Payload Hash', 'Reference ID', 'Status',
  'Contact Name', 'Email', 'Phone', 'Organization / Host', 'Event Types',
  'Other Event Type', 'Event Date', 'Start Time', 'End Time', 'Setting',
  'Electricity', 'Guest Count', 'Preferred Services', 'Other Service',
  'Custom Service', 'Budget Range', 'Location', 'Notes', 'Source',
  'Customer Email Sent At', 'Staff Email Sent At',
];

function doGet() {
  return jsonOutput_({ ok: true, service: 'Buna Circle inquiries' });
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  let hasLock = false;

  try {
    const config = getConfig_();
    const request = JSON.parse(event && event.postData && event.postData.contents || '{}');
    if (!safeEqual_(String(request.sharedSecret || ''), config.sharedSecret)) {
      return jsonOutput_({ ok: false, error: { code: 'UNAUTHORIZED' } });
    }

    const inquiry = validateInquiry_(request.inquiry);
    const receivedAt = parseReceivedAt_(request.receivedAt);
    const source = cleanString_(request.source, 120) || 'bunacircleco.com/book';
    const payloadHash = hashPayload_(inquiry);

    lock.waitLock(20000);
    hasLock = true;

    const sheet = getInquirySheet_(config.sheetId);
    const existing = findSubmission_(sheet, inquiry.submissionId);
    let rowNumber;
    let referenceId;

    if (existing) {
      rowNumber = existing.rowNumber;
      referenceId = existing.referenceId;
      if (existing.payloadHash !== payloadHash) {
        return jsonOutput_({ ok: false, error: { code: 'IDEMPOTENCY_CONFLICT' } });
      }
    } else {
      referenceId = createReferenceId_(receivedAt, inquiry.submissionId);
      sheet.appendRow(sheetSafeRow_([
        receivedAt,
        inquiry.submissionId,
        payloadHash,
        referenceId,
        'New',
        inquiry.contactName,
        inquiry.email,
        inquiry.phone,
        inquiry.organization,
        inquiry.eventTypes.join(', '),
        inquiry.otherEventType,
        inquiry.eventDate,
        inquiry.startTime,
        inquiry.endTime,
        inquiry.setting,
        inquiry.electricity,
        inquiry.guestCount,
        inquiry.preferredServices.join(', '),
        inquiry.otherService,
        inquiry.customService,
        inquiry.budgetRange,
        inquiry.location,
        inquiry.notes,
        source,
        '',
        '',
      ]));
      rowNumber = sheet.getLastRow();
    }

    const customerSentCell = sheet.getRange(rowNumber, 25);
    const staffSentCell = sheet.getRange(rowNumber, 26);

    if (!customerSentCell.getValue()) {
      sendCustomerConfirmation_(inquiry, referenceId, config);
      customerSentCell.setValue(new Date());
    }
    if (!staffSentCell.getValue()) {
      sendStaffNotification_(inquiry, referenceId, config);
      staffSentCell.setValue(new Date());
    }

    sheet.getRange(rowNumber, 5).setValue('New');
    SpreadsheetApp.flush();
    return jsonOutput_({ ok: true, referenceId: referenceId });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'inquiry_processing_failed',
      reason: String(error && error.message || error),
    }));
    return jsonOutput_({ ok: false, error: { code: 'SUBMISSION_FAILED' } });
  } finally {
    if (hasLock) lock.releaseLock();
  }
}

function getConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const config = {
    sheetId: properties.getProperty('SHEET_ID'),
    sharedSecret: properties.getProperty('SHARED_SECRET'),
    staffTo: properties.getProperty('STAFF_TO') || 'info@bunacircleco.com',
    staffCc: properties.getProperty('STAFF_CC') || 'bunacircle@gmail.com',
    fromAlias: properties.getProperty('FROM_ALIAS') || 'info@bunacircleco.com',
  };
  if (!config.sheetId || !config.sharedSecret) throw new Error('Missing required script properties');
  return config;
}

function getInquirySheet_(sheetId) {
  const spreadsheet = SpreadsheetApp.openById(sheetId);
  let sheet = spreadsheet.getSheetByName(INQUIRY_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(INQUIRY_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(INQUIRY_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, INQUIRY_HEADERS.length)
      .setBackground('#20361f')
      .setFontColor('#f4efe5')
      .setFontWeight('bold');
  }
  return sheet;
}

function findSubmission_(sheet, submissionId) {
  if (sheet.getLastRow() < 2) return null;
  const match = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1)
    .createTextFinder(submissionId)
    .matchEntireCell(true)
    .findNext();
  if (!match) return null;
  const rowNumber = match.getRow();
  return {
    rowNumber: rowNumber,
    payloadHash: String(sheet.getRange(rowNumber, 3).getValue()),
    referenceId: String(sheet.getRange(rowNumber, 4).getValue()),
  };
}

function validateInquiry_(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid inquiry payload');
  }
  const inquiry = {
    submissionId: cleanString_(raw.submissionId, 64),
    contactName: cleanString_(raw.contactName, 100),
    email: cleanString_(raw.email, 160).toLowerCase(),
    phone: cleanString_(raw.phone, 30),
    organization: cleanString_(raw.organization, 140),
    eventTypes: cleanArray_(raw.eventTypes, 8, 120),
    otherEventType: cleanString_(raw.otherEventType, 120),
    eventDate: cleanString_(raw.eventDate, 10),
    startTime: cleanString_(raw.startTime, 5),
    endTime: cleanString_(raw.endTime, 5),
    setting: cleanString_(raw.setting, 20),
    electricity: cleanString_(raw.electricity, 3),
    guestCount: Number(raw.guestCount),
    location: cleanString_(raw.location, 240),
    preferredServices: cleanArray_(raw.preferredServices, 8, 160),
    otherService: cleanString_(raw.otherService, 160),
    customService: cleanString_(raw.customService, 3),
    budgetRange: cleanString_(raw.budgetRange, 40),
    notes: cleanString_(raw.notes, 2000),
    consent: raw.consent === true,
  };

  const required = [
    inquiry.submissionId, inquiry.contactName, inquiry.email, inquiry.phone,
    inquiry.organization, inquiry.eventDate, inquiry.startTime, inquiry.endTime,
    inquiry.setting, inquiry.electricity, inquiry.location,
    inquiry.customService, inquiry.budgetRange,
  ];
  if (
    required.some(function(value) { return !value; })
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email)
    || !Number.isInteger(inquiry.guestCount)
    || inquiry.guestCount < 1
    || inquiry.guestCount > 5000
    || inquiry.eventTypes.length === 0
    || inquiry.preferredServices.length === 0
    || !inquiry.consent
  ) {
    throw new Error('Inquiry validation failed');
  }
  return inquiry;
}

function parseReceivedAt_(value) {
  const date = new Date(value);
  return isNaN(date.getTime()) ? new Date() : date;
}

function createReferenceId_(receivedAt, submissionId) {
  const datePart = Utilities.formatDate(receivedAt, 'America/New_York', 'yyyyMMdd');
  return 'BC-' + datePart + '-' + submissionId.replace(/-/g, '').slice(0, 6).toUpperCase();
}

function hashPayload_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    stableStringify_(value),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function stableStringify_(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify_).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function(key) {
      return JSON.stringify(key) + ':' + stableStringify_(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sheetSafeRow_(row) {
  return row.map(function(value) {
    if (typeof value !== 'string') return value;
    return /^[=+\-@]/.test(value) ? "'" + value : value;
  });
}

function cleanString_(value, maxLength) {
  return typeof value === 'string'
    ? value.trim().replace(/\u0000/g, '').slice(0, maxLength)
    : '';
}

function cleanArray_(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value.map(function(item) {
    return cleanString_(item, maxLength);
  }).filter(Boolean).slice(0, maxItems);
}

function safeEqual_(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function jsonOutput_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
