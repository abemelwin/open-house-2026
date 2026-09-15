/**
 * ES Print Group Open House — Registration Backend
 * Google Apps Script Web App
 *
 * Features:
 * - Saves registrations to Google Sheets (auto-creates event tabs)
 * - Sends confirmation + admin notification emails via RESEND API
 *   (From Name is dynamic = the Event Title)
 * - Checkbox columns (Q, R, S) to trigger follow-up emails on check
 *   Q = Reminder (visit is tomorrow)
 *   R = Thank You / Feedback
 *   S = No-Show / Missed Visit
 *
 * Replace the constants below with your actual values.
 */

// ============================================================
// SERVE HTML FORM (for iframe embedding in Webflow)
// ============================================================

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('registration-form')
    .setTitle('ES Print Open House Registration')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
// CONFIGURATION
// ============================================================

//Change these SHEET_ID & NOTIFY_EMAIL

// Multi-sheet routing: bawat event/city ay may sariling Google Sheet.
// Ang MATCHING ay base sa KEYWORD na makikita sa Event name (case-insensitive).
// Halimbawa: kung ang event name ay "CABANATUAN OPEN HOUSE 2026", may keyword
// na "CABANATUAN" ito, kaya mapupunta sa unang entry sa ibaba.
//
// Idagdag lang ang bagong lungsod dito kapag may bagong event sheet:
//   { keyword: 'BAGONG LUNGSOD', sheetId: 'xxxxxxxxxxxxxxxxxxxxxxxxx' },
const SHEET_ROUTES = [            
  { keyword: 'CABANATUAN', sheetId: '1ylC8OAcemJ6r2JsdGpf5Qo-zK2EcRidyuIhe4Z7Bh_c' },
  { keyword: 'TACLOBAN',   sheetId: '1NWyZLaUmEzi0f607eMwH5dSoogfkGrv8RdZELKqj-ZU' },
  { keyword: 'CDO',        sheetId: '1-HAB-m0yLeOy4o5cAeLuTySaIrHHfcuvfcOB2DXsIqE' },
  { keyword: 'CAGAYAN',    sheetId: '1-HAB-m0yLeOy4o5cAeLuTySaIrHHfcuvfcOB2DXsIqE' },
  { keyword: 'BACOLOD',    sheetId: '1TCQ-RJtLfezFABaluhQgC0j3GWzYqFMeK2ZlwOI6SXc' },
  { keyword: 'MAKATI',     sheetId: '1Twi2RAiFGr9Uix2_8hRir3FnjlkJ_-OgmMnE4a5HlUg' },
  { keyword: 'CEBU',       sheetId: '1LxWsmteQjSvtcKYul_M4bjGxCtAH3lt-qQNsXXLOPNg' }
];

// Fallback: kung walang tumugmang keyword sa itaas, dito pupunta ang registration
// (para hindi mawala ang data kahit may typo o bagong event na hindi pa naidadagdag sa listahan)
const DEFAULT_SHEET_ID = '17DB_Dl5bYoziqHw-xMsSU7DAjyawZ8Jp-SrcznzQZgk';

const NOTIFY_EMAIL = 'sales@esprintmedia.com'; //optional to if want nyo may update na may nag register sa form

//Dont change the LOGO_URL
const LOGO_URL  = 'https://drive.google.com/uc?export=view&id=1M2mUhwk8OTaGQ2iPxOWOBaErchSrS1Tx';

// ============================================================
// RESEND CONFIGURATION
// ============================================================
// 1. Sign up sa https://resend.com and verify your sending domain (DNS records).
// 2. Get your API key from the Resend dashboard.
// 3. Huwag i-hardcode dito ang key. Sa halip, sa Apps Script editor:
//    Project Settings (gear icon) > Script Properties > Add property
//      Key:   RESEND_API_KEY
//      Value: re_xxxxxxxxxxxxxxxxxxxx
// 4. Palitan lang ang FROM_ADDRESS_DOMAIN sa iyong VERIFIED domain sa Resend.
//    Ang bahaging bago ng "@" ay maaaring anuman (hal. noreply, events, hello),
//    pero ang domain mismo ay dapat siyang verified domain sa Resend account mo.
const FROM_ADDRESS = 'sales@esprintmedia.com'; // <-- gamitin sa sandaling ma-verify ang root domain sa Resend
const REPLY_TO_ADDRESS = 'sales@esprintmedia.com'; // pareho na sa FROM_ADDRESS ngayon

// Ang tab kung saan pupunta ang bawat website form submission sa loob
// ng BAWAT city spreadsheet. Huwag baguhin maliban kung binago rin
// ang pangalan ng tab sa Google Sheets.
const SUBMISSIONS_TAB_NAME = 'WEBSITE FORM SUBMISSIONS';

// Column positions (1-indexed) — dapat tumugma sa ORDER ng headers
// sa tab na "WEBSITE FORM SUBMISSIONS" ng bawat city spreadsheet.
// Walang "Event" column dahil dedicated na ang buong spreadsheet sa isang city.
const COL_EMAIL       = 2;   // Column B = Email Address
const COL_NAME        = 3;   // Column C = Full Name
const COL_DAY         = 9;   // Column I = Choose a day to visit
const COL_TIME        = 10;  // Column J = Preferred Time
const COL_COMPANIONS  = 8;   // Column H = Do you have companion(s)
const COL_REMINDER    = 15;  // Column O = Reminder checkbox
const COL_THANKYOU    = 16;  // Column P = Thank You checkbox
const COL_NOSHOW      = 17;  // Column Q = No-Show checkbox

// ============================================================
// SHEET ROUTING HELPER
// ============================================================

/**
 * MASTER LOG — Sine-save ang LAHAT ng incoming submissions sa fallback sheet,
 * sa isang dedicated tab na "ALL SUBMISSIONS LOG". Ito ang safety net:
 * kahit ma-reject o mag-error sa routing, nandito pa rin
 * ang record ng bawat client na nag-submit.
 */
function logToMasterSheet(data) {
  var ss = SpreadsheetApp.openById(DEFAULT_SHEET_ID);
  var logTab = ss.getSheetByName('ALL SUBMISSIONS LOG');

  if (!logTab) {
    logTab = ss.insertSheet('ALL SUBMISSIONS LOG');
    var headers = [
      'Received At', 'Event (from form)', 'Email', 'Full Name', 'Company',
      'Industry', 'Address', 'Contact', 'Companions', 'Day', 'Time',
      'Existing Machines', 'Interested In', 'Inviter', 'Source', 'Status'
    ];
    logTab.getRange(1, 1, 1, headers.length).setValues([headers]);
    var headerRange = logTab.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#1a237e');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    logTab.setFrozenRows(1);
  }

  logTab.appendRow([
    new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
    data.event || '',
    data.email || '',
    data.name || '',
    data.company || '',
    data.industry || '',
    data.address || '',
    data.contact || '',
    data.companions || '',
    data.day || '',
    data.time || '',
    data.existingMachines || '',
    data.interestedIn || '',
    data.inviter || '',
    data.source || '',
    'RECEIVED'
  ]);
}

/**
 * Hahanapin ang tamang Google Sheet ID base sa event name.
 * Susundan ang unang keyword na matutugma (case-insensitive).
 * Kung walang tumugma, gagamitin ang DEFAULT_SHEET_ID.
 */
function resolveSheetId(eventName) {
  var upperEvent = String(eventName || '').toUpperCase();

  for (var i = 0; i < SHEET_ROUTES.length; i++) {
    if (upperEvent.indexOf(SHEET_ROUTES[i].keyword.toUpperCase()) !== -1) {
      Logger.log('✅ ROUTING: "' + eventName + '" → matched keyword "' + SHEET_ROUTES[i].keyword + '"');
      return SHEET_ROUTES[i].sheetId;
    }
  }

  // ⚠️ LOG: para makita sa Executions kung may nahuhulog sa fallback
  Logger.log('⚠️ ROUTING FALLBACK: "' + eventName + '" → walang keyword na nag-match sa SHEET_ROUTES. Napunta sa DEFAULT_SHEET_ID.');
  return DEFAULT_SHEET_ID;
}

// ============================================================
// RESEND EMAIL HELPER
// ============================================================

/**
 * Sends an email via the Resend API.
 * @param {string} toEmail       - Recipient email address
 * @param {string} subject       - Email subject
 * @param {string} htmlBody      - HTML content
 * @param {string} fromDisplayName - The name shown as sender (e.g. the event title)
 */
function sendViaResend(toEmail, subject, htmlBody, fromDisplayName) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('RESEND_API_KEY');
  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY in Script Properties. Set it under Project Settings > Script Properties.');
  }

  // Sanitize the display name so it doesn't break the "From" header
  // (strip angle brackets, quotes, and line breaks)
  var safeName = 'ES PRINT ' + String(fromDisplayName || '')
    .replace(/[<>"\r\n]/g, '')
    .trim();

  var fromField = safeName + ' <' + FROM_ADDRESS + '>';

  var payload = {
    from: fromField,
    to: [toEmail],
    subject: subject,
    html: htmlBody,
    reply_to: REPLY_TO_ADDRESS
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch('https://api.resend.com/emails', options);
  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Resend API error (' + code + '): ' + body);
  }

  return JSON.parse(body);
}

// ============================================================
// MAIN POST HANDLER
// ============================================================

/**
 * Handles POST requests from the registration form.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Maghintay ng hanggang 30 seconds para iwas race condition / sabay-sabay na submissions
    lock.waitLock(30000);

    var data = JSON.parse(e.postData.contents);

    // Siguraduhing may official Philippine Standard Time timestamp para sa Column A
    if (!data.submittedAt || String(data.submittedAt).trim() === '') {
      data.submittedAt = Utilities.formatDate(new Date(), 'Asia/Manila', 'dd/MM/yyyy HH:mm:ss');
    }

    // --- MASTER LOG: i-save LAHAT ng dumating na request sa fallback sheet ---
    try {
      logToMasterSheet(data);
    } catch (logErr) {
      Logger.log('⚠️ Master log failed: ' + logErr.message);
    }

    // --- 1. Save to Google Sheet (auto-routed base sa event/city) ---
    var targetSheetId = resolveSheetId(data.event);
    var ss = SpreadsheetApp.openById(targetSheetId);

    // Gamitin ang aktwal na pangalan ng spreadsheet bilang event title
    // (hal. "CDO OPEN HOUSE 2026") — ito ang gagamitin sa mga email,
    // tugma ito sa nakikita sa checkbox column headers ng sheet.
    var eventTitle = ss.getName();
    data.event = eventTitle;

    // Palaging sa parehong tab pupunta ang mga website submissions
    var sheet = ss.getSheetByName(SUBMISSIONS_TAB_NAME);

    // Auto-create ang tab kung wala pa (hal. bagong city na hindi pa naisesetup)
    if (!sheet) {
      sheet = ss.insertSheet(SUBMISSIONS_TAB_NAME);

      var headers = [
        'Timestamps', 'Email Address', 'Full Name', 'Company Name',
        'Industry/Line of Business', 'Address', 'Contact Number',
        'Do you have companion(s)', 'Choose a day to visit', 'Preferred Time',
        'What are your existing machines?', 'What type of printing machine are you interested in?',
        'Who invited you?', 'Where did you learn about this event?',
        '⏰ Reminder: Your Scheduled Visit to ES Print ' + eventTitle + ' is Tomorrow!',
        '🙏 Thank You for Attending the ES Print: ' + eventTitle + '! — Share Your Feedback',
        '⏰  You Missed Your Scheduled Visit at ES Print ' + eventTitle
      ];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

      // Style header row: red background, white bold text, frozen
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground('#e3202a');
      headerRange.setFontColor('#ffffff');
      headerRange.setFontWeight('bold');
      sheet.setFrozenRows(1);

      // Style checkbox column headers with distinct colors
      sheet.getRange(1, COL_REMINDER).setBackground('#ff9800');  // Orange
      sheet.getRange(1, COL_THANKYOU).setBackground('#4caf50');  // Green
      sheet.getRange(1, COL_NOSHOW).setBackground('#f44336');    // Red
    }

    // Awtomatikong i-unhide ang lahat ng rows kung sakaling may naka-hide sa sheet
    try {
      sheet.showRows(1, sheet.getMaxRows());
    } catch (unhideErr) {}

    // Hanapin ang unang totoong bakanteng row sa Email Column (Column B) para hindi tumalon sa dulo
    var maxRows = sheet.getMaxRows();
    var emailValues = sheet.getRange(1, COL_EMAIL, maxRows, 1).getValues();
    var targetRow = -1;
    for (var r = 1; r < emailValues.length; r++) {
      if (!emailValues[r][0] || String(emailValues[r][0]).trim() === '') {
        targetRow = r + 1;
        break;
      }
    }
    if (targetRow === -1) {
      targetRow = maxRows + 1;
      sheet.insertRowAfter(maxRows);
    }

    var rowValues = [
      data.submittedAt,
      data.email,
      data.name,
      data.company,
      data.industry,
      data.address,
      data.contact,
      data.companions,
      data.day,
      data.time,
      data.existingMachines,
      data.interestedIn,
      data.inviter,
      data.source,
      false,
      false,
      false
    ];

    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    var newRow = targetRow;

    // Insert checkboxes in columns O, P, Q for the new row
    sheet.getRange(newRow, COL_REMINDER).insertCheckboxes();
    sheet.getRange(newRow, COL_THANKYOU).insertCheckboxes();
    sheet.getRange(newRow, COL_NOSHOW).insertCheckboxes();

    Logger.log('📍 SUCCESS: Appended to Sheet "' + ss.getName() + '" (ID: ' + targetSheetId + ') > Tab "' + SUBMISSIONS_TAB_NAME + '" > Row ' + newRow);

    // I-release ang lock pagkatapos maisulat sa Google Sheet
    lock.releaseLock();

    // --- 2. Send confirmation email to registrant (via Resend) ---
    // Naka-wrap sa sariling try/catch para kahit mag-fail ang Resend
    // (naubos na ang limit, network error, etc.), hindi maaapektuhan
    // ang registration — naka-save na sa sheet at success pa rin sa user.
    try {
      var confirmSubject = 'Registration Confirmed – See You at ES Print: ' + eventTitle + '!';
      var confirmHtml = buildConfirmationEmail(data);
      sendViaResend(data.email, confirmSubject, confirmHtml, eventTitle);
    } catch (emailErr) {
      // Log lang para makita sa Apps Script Executions kung may failed email
      Logger.log('⚠️ Confirmation email failed: ' + emailErr.message);
    }

    // --- 3. Send admin notification email (via Resend) ---
    try {
      var adminSubject = '[New Registration] ' + data.name + ' — ' + eventTitle;
      var adminHtml = buildAdminNotificationEmail(data);
      sendViaResend(NOTIFY_EMAIL, adminSubject, adminHtml, eventTitle);
    } catch (emailErr) {
      Logger.log('⚠️ Admin notification email failed: ' + emailErr.message);
    }

    // --- 4. Return success ---
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    if (lock) {
      try { lock.releaseLock(); } catch(e) {}
    }
    Logger.log('❌ Error in doPost: ' + err.message);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// ONEDIT TRIGGER — Sends emails when checkbox is checked
// ============================================================

/**
 * Installable onEdit trigger.
 * When a checkbox in column O, P, or Q is checked (TRUE),
 * it sends the corresponding email to the registrant.
 *
 * SETUP: Run setupTrigger() once to install this trigger sa LAHAT ng city sheets.
 */
function onCheckboxEdit(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var row = range.getRow();
  var col = range.getColumn();

  // I-ignore ang edits sa ibang tabs (TOTAL CHECK, MANUAL, COMPANIONS SUBMISSIONS, WALK-IN SUBMISSIONS)
  if (sheet.getName() !== SUBMISSIONS_TAB_NAME) return;

  // Ignore header row
  if (row <= 1) return;

  // Only respond to columns O, P, Q
  if (col !== COL_REMINDER && col !== COL_THANKYOU && col !== COL_NOSHOW) return;

  // Only trigger when value is TRUE (checked)
  if (e.value !== 'TRUE') return;

  // Ang event title ay ang pangalan mismo ng spreadsheet (hal. "CDO OPEN HOUSE 2026")
  var event = e.source.getName();

  // Get registrant data from the row
  var rowData = sheet.getRange(row, 1, 1, 14).getValues()[0];
  var email    = rowData[COL_EMAIL - 1];
  var name     = rowData[COL_NAME - 1];
  var day      = rowData[COL_DAY - 1];
  var time     = rowData[COL_TIME - 1];

  if (!email) return; // No email in row, skip

  try {
    if (col === COL_REMINDER) {
      // --- REMINDER EMAIL ---
      var subject = 'Reminder: Your Scheduled Visit to ' + event + ' is Tomorrow!';
      var html = buildReminderEmail(name, event, day, time);
      sendViaResend(email, subject, html, event);

    } else if (col === COL_THANKYOU) {
      // --- THANK YOU EMAIL ---
      var subject = 'Thank You for Attending the ES Print: ' + event + '! — Share Your Feedback';
      var html = buildThankYouEmail(name, event);
      sendViaResend(email, subject, html, event);

    } else if (col === COL_NOSHOW) {
      // --- NO-SHOW EMAIL ---
      var subject = 'You Missed Your Scheduled Visit at ES Print ' + event;
      var html = buildNoShowEmail(name, event);
      sendViaResend(email, subject, html, event);
    }

    // Flash the cell green to indicate success
    range.setBackground('#d4edda');
    SpreadsheetApp.flush();

  } catch (err) {
    // Flash the cell red to indicate failure, uncheck it
    range.setValue(false);
    range.setBackground('#f8d7da');
    SpreadsheetApp.getActiveSpreadsheet().toast('Email failed: ' + err.message, '❌ Error', 5);
  }
}

// ============================================================
// FOLLOW-UP EMAIL TEMPLATES
// ============================================================

/**
 * Reminder email — sent the day before the visit.
 */
function buildReminderEmail(name, event, day, time) {
  return '<!DOCTYPE html>'
    + '<html><head><meta charset="UTF-8"></head>'
    + '<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f0f0f0;">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">'
    + '<tr><td style="background:#222222;height:6px;padding:0;"></td></tr>'
    + '<tr><td style="background:#e3202a;height:4px;padding:0;"></td></tr>'
    + '<tr><td style="padding:32px 36px;font-size:14px;color:#333;line-height:1.8;">'
    + '<p style="margin:0 0 12px;">Dear <strong>' + name + '</strong>,</p>'
    + '<p style="margin:0 0 12px;">This is a friendly reminder that your scheduled visit to the <strong>ES Print ' + event + '</strong> is tomorrow. We look forward to welcoming you.</p>'
    + '<p style="margin:0 0 12px;"><strong>Date:</strong> ' + day + '<br>'
    + '<strong>Time:</strong> ' + time + '</p>'
    + '<p style="margin:0 0 12px;">Your reservation has been confirmed, and your slot is secured.</p>'
    + '<p style="margin:0 0 12px;">If you have any questions or need directions, please reply to this email or contact us at sales@esprintmedia.com.</p>'
    + '<p style="margin:0;">We look forward to seeing you,<br><strong>Team ES Print Media Inc.</strong></p>'
    + '</td></tr>'
    + '<tr><td style="background:#e3202a;height:4px;padding:0;"></td></tr>'
    + '<tr><td style="background:#222222;height:6px;padding:0;"></td></tr>'
    + '<tr><td style="padding:16px;text-align:center;font-size:12px;color:#999;background:#f9f9f9;">'
    + '<a href="https://www.esprintmedia.com" style="color:#e3202a;text-decoration:none;">www.esprintmedia.com</a>'
    + '</td></tr>'
    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}

/**
 * Thank You email — sent after the registrant attended.
 */
function buildThankYouEmail(name, event) {
  return '<!DOCTYPE html>'
    + '<html><head><meta charset="UTF-8"></head>'
    + '<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f0f0f0;">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">'
    + '<tr><td style="background:#222222;height:6px;padding:0;"></td></tr>'
    + '<tr><td style="background:#e3202a;height:4px;padding:0;"></td></tr>'
    + '<tr><td style="padding:32px 36px;font-size:14px;color:#333;line-height:1.8;">'
    + '<p style="margin:0 0 12px;">Dear <strong>' + name + '</strong>,</p>'
    + '<p style="margin:0 0 12px;">Thank you for attending the <strong>ES Print ' + event + '</strong>. We appreciate your time and hope you found the event valuable.</p>'
    + '<p style="margin:0 0 12px;">We\'d love to hear your feedback. Please take a moment to complete our short survey:</p>'
    + '<p style="margin:0 0 12px;"><strong>Survey Link:</strong><br>'
    + '<a href="https://docs.google.com/forms/d/e/1FAIpQLSfpmL1idLm6Cq8e8BjXfAPTmmuHQ7JcOd9VRtqrvJakG1EztA/viewform" style="color:#e3202a;">Click here to complete the survey</a></p>'
    + '<p style="margin:0 0 12px;">As a thank you, you\'ll receive an exclusive offer after completing the survey.</p>'
    + '<p style="margin:0 0 12px;">If you have any questions, feel free to reply to this email or contact us at sales@esprintmedia.com.</p>'
    + '<p style="margin:0;">Thank you, and we look forward to seeing you again.<br><strong>Team ES Print Media Inc.</strong></p>'
    + '</td></tr>'
    + '<tr><td style="background:#e3202a;height:4px;padding:0;"></td></tr>'
    + '<tr><td style="background:#222222;height:6px;padding:0;"></td></tr>'
    + '<tr><td style="padding:16px;text-align:center;font-size:12px;color:#999;background:#f9f9f9;">'
    + '<a href="https://www.esprintmedia.com" style="color:#e3202a;text-decoration:none;">www.esprintmedia.com</a>'
    + '</td></tr>'
    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}

/**
 * No-Show email — sent when registrant didn't attend.
 */
function buildNoShowEmail(name, event) {
  return '<!DOCTYPE html>'
    + '<html><head><meta charset="UTF-8"></head>'
    + '<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f0f0f0;">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">'
    + '<tr><td style="background:#222222;height:6px;padding:0;"></td></tr>'
    + '<tr><td style="background:#e3202a;height:4px;padding:0;"></td></tr>'
    + '<tr><td style="padding:32px 36px;font-size:14px;color:#333;line-height:1.8;">'
    + '<p style="margin:0 0 12px;">Dear <strong>' + name + '</strong>,</p>'
    + '<p style="margin:0 0 12px;">We noticed you were unable to attend your scheduled visit to the <strong>ES Print ' + event + '</strong>.</p>'
    + '<p style="margin:0 0 12px;">If the event is still ongoing, we\'d be pleased to welcome you on another day.</p>'
    + '<p style="margin:0 0 12px;"><strong>Time:</strong> 8:00 AM – 5:00 PM</p>'
    + '<p style="margin:0 0 12px;">If the event has already concluded, we\'d still be happy to arrange a private tour, product demonstration, or consultation at your convenience.</p>'
    + '<p style="margin:0 0 12px;">To schedule a visit or for any inquiries, simply reply to this email or contact us at sales@esprintmedia.com.</p>'
    + '<p style="margin:0;">We look forward to hearing from you.<br><strong>Team ES Print Media Inc.</strong></p>'
    + '</td></tr>'
    + '<tr><td style="background:#e3202a;height:4px;padding:0;"></td></tr>'
    + '<tr><td style="background:#222222;height:6px;padding:0;"></td></tr>'
    + '<tr><td style="padding:16px;text-align:center;font-size:12px;color:#999;background:#f9f9f9;">'
    + '<a href="https://www.esprintmedia.com" style="color:#e3202a;text-decoration:none;">www.esprintmedia.com</a>'
    + '</td></tr>'
    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}

// ============================================================
// REGISTRATION EMAIL TEMPLATES
// ============================================================

/**
 * Builds a branded HTML confirmation email for the registrant.
 */
function buildConfirmationEmail(data) {
  return '<!DOCTYPE html>'
    + '<html><head><meta charset="UTF-8"></head>'
    + '<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f0f0f0;">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">'
    + '<tr><td style="background:#222222;height:6px;padding:0;"></td></tr>'
    + '<tr><td style="background:#e3202a;height:4px;padding:0;"></td></tr>'
    + '<tr><td style="padding:28px 24px;text-align:center;border-bottom:1px solid #e0e0e0;">'
    + '<img src="' + LOGO_URL + '" alt="ES Print" style="max-width:140px;height:auto;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;">'
    + '<h1 style="color:#e3202a;margin:8px 0 4px;font-size:20px;">' + data.event + '</h1>'
    + '<p style="color:#666;margin:0;font-size:13px;">Registration Confirmed</p>'
    + '</td></tr>'
    + '<tr><td style="padding:28px 32px;font-size:14px;color:#333;line-height:1.7;">'
    + '<p style="margin:0 0 12px;">Hi <strong>' + data.name + '</strong>,</p>'
    + '<p style="margin:0 0 20px;">Thank you for registering! We look forward to seeing you at the event. Below are your registration details:</p>'
    + '<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #e0e0e0;border-radius:6px;font-size:14px;">'
    + '<tr style="background:#f9f9f9;"><td style="font-weight:bold;width:40%;border-bottom:1px solid #e0e0e0;">Event</td><td style="border-bottom:1px solid #e0e0e0;">' + data.event + '</td></tr>'
    + '<tr><td style="font-weight:bold;border-bottom:1px solid #e0e0e0;">Name</td><td style="border-bottom:1px solid #e0e0e0;">' + data.name + '</td></tr>'
    + '<tr style="background:#f9f9f9;"><td style="font-weight:bold;border-bottom:1px solid #e0e0e0;">Day</td><td style="border-bottom:1px solid #e0e0e0;">' + data.day + '</td></tr>'
    + '<tr><td style="font-weight:bold;border-bottom:1px solid #e0e0e0;">Time</td><td style="border-bottom:1px solid #e0e0e0;">' + data.time + '</td></tr>'
    + '<tr style="background:#f9f9f9;"><td style="font-weight:bold;">Companions</td><td>' + data.companions + '</td></tr>'
    + '</table>'
    + '<p style="font-size:13px;color:#666;margin:20px 0 0;">If you have questions, reply to this email or contact your ES Print representative.</p>'
    + '</td></tr>'
    + '<tr><td style="background:#e3202a;height:4px;padding:0;"></td></tr>'
    + '<tr><td style="background:#222222;height:6px;padding:0;"></td></tr>'
    + '<tr><td style="padding:14px;text-align:center;font-size:12px;color:#999;background:#f9f9f9;">'
    + '<a href="https://www.esprintmedia.com" style="color:#e3202a;text-decoration:none;">www.esprintmedia.com</a>'
    + '</td></tr>'
    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}

/**
 * Builds a structured HTML admin notification email.
 */
function buildAdminNotificationEmail(data) {
  return '<!DOCTYPE html>'
    + '<html><head><meta charset="UTF-8"></head>'
    + '<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f0f0f0;">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">'
    + '<tr><td style="background:#222222;height:6px;padding:0;"></td></tr>'
    + '<tr><td style="background:#e3202a;height:4px;padding:0;"></td></tr>'
    + '<tr><td style="padding:32px 36px;font-size:14px;color:#333;line-height:1.8;">'
    + '<p style="margin:0 0 12px;">Dear Admin,</p>'
    + '<p style="margin:0 0 12px;"><strong>' + data.name + '</strong> just registered for <strong>ES Print: ' + data.event + '</strong>.</p>'
    + '<p style="margin:0 0 4px;"><strong>Form</strong></p>'
    + '<p style="margin:0 0 12px;">' + data.event + '</p>'
    + '<p style="margin:0 0 4px;"><strong>Site</strong></p>'
    + '<p style="margin:0 0 12px;">ES Print Media Inc.</p>'
    + '<p style="margin:0 0 8px;"><strong>Submitted content</strong></p>'
    + '<p style="margin:0;line-height:2;">'
    + 'Timestamps: ' + data.submittedAt + '<br>'
    + 'Email Address: ' + data.email + '<br>'
    + 'Full Name: ' + data.name + '<br>'
    + 'Company Name: ' + data.company + '<br>'
    + 'Industry/Line of Business: ' + data.industry + '<br>'
    + 'Address: ' + data.address + '<br>'
    + 'Contact Number: ' + data.contact + '<br>'
    + 'Do you have companion(s): ' + data.companions + '<br>'
    + 'Choose a day to visit: ' + data.day + '<br>'
    + 'Preferred Time: ' + data.time + '<br>'
    + 'What are your existing machines?: ' + data.existingMachines + '<br>'
    + 'What type of printing machine are you interested in?: ' + data.interestedIn + '<br>'
    + 'Who invited you?: ' + data.inviter + '<br>'
    + 'Where did you learn about this event?: ' + data.source
    + '</p>'
    + '</td></tr>'
    + '<tr><td style="background:#e3202a;height:4px;padding:0;"></td></tr>'
    + '<tr><td style="background:#222222;height:6px;padding:0;"></td></tr>'
    + '<tr><td style="padding:16px;text-align:center;font-size:12px;color:#999;background:#f9f9f9;">'
    + '<a href="https://www.esprintmedia.com" style="color:#e3202a;text-decoration:none;">www.esprintmedia.com</a>'
    + '</td></tr>'
    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}

// ============================================================
// SETUP — Run this ONCE to install the onEdit trigger
// ============================================================

/**
 * Run this function ONCE to install the trigger that listens
 * for checkbox changes. Go to: Run > setupTrigger
 *
 * MAHALAGA: dahil maraming Google Sheet na ngayon (isa per city/event),
 * kailangan i-install ang trigger sa BAWAT sheet nang hiwalay — hindi
 * sapat na isa lang, dahil ang onEdit trigger ay naka-tali sa isang
 * specific spreadsheet lang bawat isa.
 */
function setupTrigger() {
  // Remove existing triggers to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onCheckboxEdit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Kolektahin ang lahat ng sheet IDs: yung nasa SHEET_ROUTES + ang DEFAULT_SHEET_ID
  var allSheetIds = SHEET_ROUTES.map(function(route) { return route.sheetId; });
  allSheetIds.push(DEFAULT_SHEET_ID);

  // Alisin ang duplicates (kung sakaling may parehong ID)
  var uniqueSheetIds = allSheetIds.filter(function(id, index) {
    return allSheetIds.indexOf(id) === index;
  });

  // I-install ang trigger sa BAWAT sheet
  for (var j = 0; j < uniqueSheetIds.length; j++) {
    var ss = SpreadsheetApp.openById(uniqueSheetIds[j]);
    ScriptApp.newTrigger('onCheckboxEdit')
      .forSpreadsheet(ss)
      .onEdit()
      .create();
    Logger.log('✅ Trigger installed sa: ' + ss.getName());
  }

  Logger.log('✅ Lahat ng triggers ay na-install! Checkboxes ay active na sa lahat ng sheets.');
}

// ============================================================
// TEST FUNCTIONS
// ============================================================

/**
 * Quick test to confirm Resend is configured correctly.
 * Sends a single test email using a fake event title as the From Name.
 */
function testResendConnection() {
  sendViaResend(
    'espmi.melwindave@gmail.com',
    'Resend Test — ES Print',
    '<p>This is a test email sent via Resend.</p>',
    'TEST EVENT TITLE'
  );
  Logger.log('✅ Test email sent via Resend.');
}

/**
 * Test function to verify the entire flow works.
 * Select this function in the dropdown and click Run.
 */
function testDoPost() {
  var fakeEvent = {
    postData: {
      contents: JSON.stringify({
        event: 'MAKATI OPEN HOUSE 2026',
        eventSlug: 'makati-open-house-2026',
        submittedAt: Utilities.formatDate(new Date(), 'Asia/Manila', 'dd/MM/yyyy HH:mm:ss'),
        email: 'test-makati@esprintmedia.com',
        name: 'Test Makati Registrant',
        company: 'ES Print Media',
        industry: 'DIGITAL PRINTING',
        address: '2305 Marconi St, Makati City',
        contact: '09123456789',
        companions: '1',
        day: 'August 11 | Tuesday',
        time: 'Morning (8am to 12nn)',
        existingMachines: 'DTF',
        interestedIn: 'UV Flatbed',
        inviter: 'Self',
        source: 'Website'
      })
    }
  };
  var result = doPost(fakeEvent);
  Logger.log('📋 Test result: ' + result.getContent());
}
