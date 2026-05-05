// ============================================================
// DLSL Ordering App (GreenBite) — Google Apps Script
// Version: 1.0.0
// Last Updated: 2026-05-04
// Developer: A2OM · DLSL TOIC
// Description: Campus food & merchandise ordering app for DLSL
// Changelog:
//   v1.0.0 - 2026-05-04 - Move SPREADSHEET_ID to PropertiesService (security fix)
// ============================================================

const SPREADSHEET_ID        = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
const IMAGES_FOLDER_NAME    = 'DLSL Ordering App — Images';
const PROOFS_FOLDER_NAME    = 'DLSL Ordering App — Payment Proofs';

function savePaymentProof(base64Data, mimeType, filename) {
  if (!base64Data) return '';
  try {
    const folders = DriveApp.getFoldersByName(PROOFS_FOLDER_NAME);
    const folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(PROOFS_FOLDER_NAME);
    const decoded = Utilities.base64Decode(base64Data);
    const blob    = Utilities.newBlob(decoded, mimeType || 'image/jpeg', filename || 'proof.jpg');
    const file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    // Store just the file ID so we can serve it via getPaymentProof()
    return 'drive:' + file.getId();
  } catch (e) { return ''; }
}

// Serve proof of payment as base64 through GAS (avoids Drive domain restrictions)
function getPaymentProof(token, orderId) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const order = sheetToObjects(getSheet(SHEETS.ORDERS)).find(r => r.OrderID === orderId);
  if (!order) return { success: false, error: 'Order not found.' };

  const isOwner = order.CustomerEmail.toLowerCase() === session.email.toLowerCase();
  const isStaff = session.role === ROLES.ADMIN || session.role === ROLES.CONCESSIONAIRE;
  if (!isOwner && !isStaff) return { success: false, error: 'Unauthorized.' };
  if (!order.ProofURL) return { success: false, error: 'No proof attached.' };

  try {
    // Support both old drive.google.com URLs and new 'drive:ID' format
    const fileId = order.ProofURL.startsWith('drive:')
      ? order.ProofURL.slice(6)
      : order.ProofURL.replace('https://drive.google.com/uc?export=view&id=', '');
    const file     = DriveApp.getFileById(fileId);
    const blob     = file.getBlob();
    const base64   = Utilities.base64Encode(blob.getBytes());
    const mimeType = blob.getContentType() || 'image/jpeg';
    return { success: true, data: base64, mimeType };
  } catch(e) {
    return { success: false, error: 'Unable to load proof: ' + e.message };
  }
}

// ------------------------------------------------------------
// Image upload to Google Drive
// ------------------------------------------------------------

function uploadImage(token, base64Data, mimeType, filename) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const allowed = [ROLES.ADMIN, ROLES.CONCESSIONAIRE];
  if (!allowed.includes(session.role)) return { success: false, error: 'Unauthorized.' };

  try {
    // Find or create the shared images folder
    let folder;
    const folders = DriveApp.getFoldersByName(IMAGES_FOLDER_NAME);
    folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(IMAGES_FOLDER_NAME);

    const decoded = Utilities.base64Decode(base64Data);
    const blob    = Utilities.newBlob(decoded, mimeType, filename);
    const file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const url = 'https://drive.google.com/uc?export=view&id=' + file.getId();
    return { success: true, url };
  } catch (e) {
    return { success: false, error: 'Upload failed: ' + e.message };
  }
}

const SHEETS = {
  USERS:             'Users',
  CONCESSIONAIRES:   'Concessionaires',
  PRODUCTS:          'Products',
  ORDERS:            'Orders',
  ORDER_ITEMS:       'OrderItems',
  RATINGS:           'Ratings',
  SESSIONS:          'Sessions',
  OTPS:              'OTPs',
  ANNOUNCEMENTS:     'Announcements',
  AUDIT_LOG:         'AuditLog',
  SCHEDULED_REPORTS: 'ScheduledReports'
};

const ROLES = {
  STUDENT:       'student',
  PARENT:        'parent',
  PARTNER:       'partner',
  CONCESSIONAIRE:'concessionaire',
  ADMIN:         'admin'
};

const ORDER_STATUS = {
  PENDING:    'pending',
  CONFIRMED:  'confirmed',
  PREPARING:  'preparing',
  READY:      'ready',
  COMPLETED:  'completed',
  CANCELLED:  'cancelled'
};

const APPROVAL = {
  PENDING:  'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

// ------------------------------------------------------------
// Web app entry
// ------------------------------------------------------------

function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('GreenBite')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getAppScript() {
  return HtmlService.createTemplateFromFile('Scripts').getRawContent();
}

// ------------------------------------------------------------
// Authentication — Email OTP
// ------------------------------------------------------------

function requestAccess(email) {
  email = (email || '').toLowerCase().trim();
  if (!email) return { success: false, error: 'Email is required.' };

  if (!SPREADSHEET_ID) return { success: false, error: 'App not configured. Run setupScriptProperties() in the Apps Script editor.' };

  try {
    const usersSheet = getSheet(SHEETS.USERS);
    const rows = usersSheet.getDataRange().getValues();
    let user = null;

    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][2] || '').toLowerCase() === email) {
        user = { id: rows[i][0], name: rows[i][1], email: rows[i][2], role: rows[i][3], status: rows[i][6] };
        break;
      }
    }

    if (!user) return { success: false, error: 'Email not registered. Contact RESGO to create your account.' };
    if (user.status !== 'active') return { success: false, error: 'Account is inactive. Please contact RESGO.' };

    // Rate-limit: 60 s between sends — checked via PropertiesService (no sheet scan)
    const propKey  = 'otp_' + email;
    const existing = PropertiesService.getScriptProperties().getProperty(propKey);
    if (existing) {
      try {
        const d    = JSON.parse(existing);
        const diff = (Date.now() - new Date(d.sentAt).getTime()) / 1000;
        if (diff < 60) return { success: false, error: `Wait ${Math.ceil(60 - diff)}s before requesting again.` };
      } catch(e) { /* corrupted entry — overwrite below */ }
    }

    const otp     = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const sentAt  = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty(
      propKey, JSON.stringify({ code: otp, expires, attempts: 0, sentAt })
    );

    sendOTPEmail(user.name, email, otp);
    return { success: true, name: user.name };
  } catch(e) {
    return { success: false, error: 'Server error: ' + e.message };
  }
}

function verifyOTP(email, code) {
  email = (email || '').toLowerCase().trim();
  code  = (code  || '').trim();

  // OTP stored in PropertiesService — O(1) lookup, no sheet scan
  const propKey = 'otp_' + email;
  const raw     = PropertiesService.getScriptProperties().getProperty(propKey);
  if (!raw) return { success: false, error: 'OTP not found. Please request a new one.' };

  let otpData;
  try { otpData = JSON.parse(raw); }
  catch(e) { return { success: false, error: 'OTP data corrupted. Please request a new one.' }; }

  if (otpData.attempts >= 5) {
    PropertiesService.getScriptProperties().deleteProperty(propKey);
    return { success: false, error: 'Too many failed attempts. Request a new OTP.' };
  }
  if (Date.now() > new Date(otpData.expires).getTime()) {
    PropertiesService.getScriptProperties().deleteProperty(propKey);
    return { success: false, error: 'OTP expired. Please request a new one.' };
  }
  if (otpData.code !== code) {
    otpData.attempts++;
    PropertiesService.getScriptProperties().setProperty(propKey, JSON.stringify(otpData));
    return { success: false, error: `Invalid OTP. ${5 - otpData.attempts} attempt(s) left.` };
  }

  // OTP correct — single-use, delete immediately
  PropertiesService.getScriptProperties().deleteProperty(propKey);

  // Look up user
  const usersSheet = getSheet(SHEETS.USERS);
  const rows = usersSheet.getDataRange().getValues();
  let userData = null;
  for (let j = 1; j < rows.length; j++) {
    if ((rows[j][2] || '').toLowerCase() === email) {
      userData = { id: rows[j][0], name: rows[j][1], email: rows[j][2],
                   role: rows[j][3], idNumber: rows[j][4], phone: rows[j][5] };
      break;
    }
  }
  if (!userData) return { success: false, error: 'User not found.' };

  const token = createSession(email, userData.role, userData);

  // Attach stall data for concessionaires
  let stallData = null;
  if (userData.role === ROLES.CONCESSIONAIRE) {
    stallData = getStallByEmail(email);
  }

  logAudit(email, 'LOGIN', 'Auth', userData.id, `Role: ${userData.role}`);

  return {
    success: true,
    token,
    user: userData,
    stallData,
    concessionaires: getConcessionaires(true),
    announcements:   getAnnouncements()
  };
}

function resendOTP(email) {
  return requestAccess(email);
}

function logout(token) {
  if (!token) return { success: true };
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('sess_' + token);
    if (raw) {
      const sess = JSON.parse(raw);
      PropertiesService.getScriptProperties().deleteProperty('sess_' + token);
      logAudit(sess.email, 'LOGOUT', 'Auth', '', '');
    }
  } catch(e) {}
  return { success: true };
}

// ------------------------------------------------------------
// Session management
// ------------------------------------------------------------

function createSession(email, role, userData) {
  const token   = Utilities.getUuid();
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(); // 8 h
  PropertiesService.getScriptProperties().setProperty(
    'sess_' + token,
    JSON.stringify({ email, role, userData, expires })
  );
  return token;
}

function validateSession(token) {
  if (!token) return null;
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('sess_' + token);
    if (!raw) return null;
    const sess = JSON.parse(raw);
    if (Date.now() > new Date(sess.expires).getTime()) {
      PropertiesService.getScriptProperties().deleteProperty('sess_' + token);
      return null;
    }
    return { email: sess.email, role: sess.role, userData: sess.userData };
  } catch(e) { return null; }
}

// ------------------------------------------------------------
// Diagnostics — run from Apps Script editor to troubleshoot
// ------------------------------------------------------------

/**
 * Run this from Extensions > Apps Script editor to diagnose setup issues.
 * Select runDiagnostics from the function dropdown and click Run.
 * Check the Execution Log for results.
 */
function runDiagnostics() {
  const props = PropertiesService.getScriptProperties();
  const ssId  = props.getProperty('SPREADSHEET_ID');
  Logger.log('=== GreenBite Setup Diagnostics ===');
  Logger.log('SPREADSHEET_ID set: ' + (ssId ? 'YES → ' + ssId : 'NO ← Run setupScriptProperties() first!'));

  if (!ssId) {
    Logger.log('❌ SPREADSHEET_ID missing. Run setupScriptProperties() then re-run this.');
    return;
  }

  try {
    const ss = SpreadsheetApp.openById(ssId);
    Logger.log('Spreadsheet: ' + ss.getName() + ' (' + ssId + ')');

    const usersSheet = ss.getSheetByName('Users');
    if (!usersSheet) { Logger.log('❌ Users sheet not found. Run initializeApp() first.'); return; }

    const rows = usersSheet.getDataRange().getValues();
    Logger.log('Users sheet rows (incl. header): ' + rows.length);
    Logger.log('Header: ' + rows[0].join(' | '));
    Logger.log('--- Users ---');
    for (let i = 1; i < rows.length; i++) {
      Logger.log(`  [${i}] ${rows[i][1]} | ${rows[i][2]} | role=${rows[i][3]} | status=${rows[i][6]}`);
    }
    Logger.log('✅ Diagnostics complete.');
  } catch(e) {
    Logger.log('❌ Error opening spreadsheet: ' + e.message);
  }
}

/**
 * Check a specific email's login eligibility.
 * Usage: change the email below and run from the editor.
 */
function checkEmail() {
  const email = 'paste-email-here@dlsl.edu.ph'; // ← change this
  const ssId  = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!ssId) { Logger.log('❌ SPREADSHEET_ID not set.'); return; }
  const rows = SpreadsheetApp.openById(ssId).getSheetByName('Users').getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][2]||'').toLowerCase() === email.toLowerCase().trim()) {
      Logger.log('✅ Found: ' + JSON.stringify({
        name: rows[i][1], email: rows[i][2], role: rows[i][3], status: rows[i][6]
      }));
      if (rows[i][6] !== 'active') Logger.log('⚠️  Status is NOT active → login will fail.');
      return;
    }
  }
  Logger.log('❌ Email not found in Users sheet: ' + email);
}

// ------------------------------------------------------------
// Bootstrap / init
// ------------------------------------------------------------

function initializeApp() {
  Object.values(SHEETS).forEach(name => getSheet(name));

  const usersSheet = getSheet(SHEETS.USERS);
  if (usersSheet.getLastRow() <= 1) {
    usersSheet.appendRow([
      genId('USR'), 'RESGO Admin', 'resgo@dlsl.edu.ph',
      ROLES.ADMIN, 'ADMIN-001', '', 'active', now()
    ]);
  }
  return { success: true, message: 'App initialized.' };
}

function getBootData(token) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const concessionaires = getConcessionaires();
  const announcements   = getAnnouncements();

  let stallData = null;
  if (session.role === ROLES.CONCESSIONAIRE) {
    stallData = getStallByEmail(session.email);
  }

  return { success: true, user: session.userData, role: session.role,
           concessionaires, announcements, stallData };
}

// ------------------------------------------------------------
// Shared helpers
// ------------------------------------------------------------

/**
 * Appends a row to a sheet by column name — order of columns in the sheet doesn't matter.
 * Missing columns in `data` are written as empty string.
 */
function appendNamedRow(sheet, data) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => data.hasOwnProperty(h) ? data[h] : '');
  sheet.appendRow(row);
}

/**
 * Auto-repairs the Orders sheet column layout if ProofURL is missing from the header.
 * Called automatically on first order placement after a broken patchSheetHeaders run.
 * Safe to call repeatedly — exits immediately if header is already correct.
 */
function _ensureOrdersSheetRepaired() {
  const EXPECTED = ['OrderID','CustomerEmail','CustomerName','StallID','StallName','Items',
                    'Subtotal','ServiceFee','Total','PaymentMethod','PaymentRef','ProofURL',
                    'PaymentStatus','Status','PickupCode','Notes','CreatedAt','UpdatedAt'];

  const sheet   = getSheet(SHEETS.ORDERS);
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;

  const hdr = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  // Already correct?
  if (EXPECTED.every((h, i) => hdr[i] === h) && hdr.length === EXPECTED.length) return;

  // ProofURL already present somewhere — just a column order issue; full repair needed
  // Run the same logic as repairOrdersSheet but without token check
  const allData = sheet.getDataRange().getValues();
  if (allData.length <= 1) {
    // No data rows — just rewrite the header
    sheet.getRange(1, 1, 1, EXPECTED.length).setValues([EXPECTED]);
    sheet.getRange(1, 1, 1, EXPECTED.length)
      .setBackground('#1B5E20').setFontColor('#FFFFFF').setFontWeight('bold');
    return;
  }

  const orderStatuses = new Set(Object.values(ORDER_STATUS));
  const newData = [EXPECTED];

  for (let r = 1; r < allData.length; r++) {
    const row = allData[r];
    if (!row[0]) continue;
    const isNewFmt = String(row[13] || '') === ORDER_STATUS.PENDING;
    if (isNewFmt) {
      newData.push(EXPECTED.map((_, i) => (i < row.length ? row[i] : '')));
    } else {
      const newRow = EXPECTED.map((_, i) => {
        if (i <= 10)  return row[i];
        if (i === 11) return '';
        return i - 1 < row.length ? row[i - 1] : '';
      });
      newData.push(newRow);
    }
  }

  sheet.clearContents();
  sheet.getRange(1, 1, newData.length, EXPECTED.length).setValues(newData);
  sheet.getRange(1, 1, 1, EXPECTED.length)
    .setBackground('#1B5E20').setFontColor('#FFFFFF').setFontWeight('bold');

  logAudit('system', 'UPDATE', 'Orders', '', 'Auto-repaired Orders sheet column layout');
}

function getSheet(name) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  let   sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); initSheetHeaders(sheet, name); }
  return sheet;
}

// One-time migration: add any columns missing from existing sheets
// Call this from the Admin panel (fixSheetHeaders) or run manually once
function patchSheetHeaders(sheet, name) {
  const map = {
    [SHEETS.ORDERS]: ['OrderID','CustomerEmail','CustomerName','StallID','StallName','Items','Subtotal','ServiceFee','Total','PaymentMethod','PaymentRef','ProofURL','PaymentStatus','Status','PickupCode','Notes','CreatedAt','UpdatedAt'],
    [SHEETS.USERS]:  ['UserID','Name','Email','Role','IDNumber','Phone','Status','CreatedAt','StallID'],
    [SHEETS.AUDIT_LOG]:         ['LogID','Timestamp','UserEmail','Action','Module','RecordID','Details'],
    [SHEETS.SCHEDULED_REPORTS]: ['ReportID','Name','Frequency','Recipients','LastSent','IsActive','CreatedAt']
  };
  const expected = map[name];
  if (!expected) return;
  const lastCol = sheet.getLastColumn();
  if (lastCol >= expected.length) return; // all columns already present
  const current = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    : [];
  for (let i = current.length; i < expected.length; i++) {
    const cell = sheet.getRange(1, i + 1);
    cell.setValue(expected[i])
      .setBackground('#1B5E20').setFontColor('#FFFFFF').setFontWeight('bold');
  }
}

// Admin endpoint: patch all sheets that may be missing new columns
function fixSheetHeaders(token) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) return { success: false, error: 'Unauthorized.' };
  const names = [SHEETS.ORDERS, SHEETS.USERS, SHEETS.AUDIT_LOG, SHEETS.SCHEDULED_REPORTS];
  names.forEach(name => {
    const sheet = getSheet(name);
    patchSheetHeaders(sheet, name);
  });
  return { success: true, message: 'Sheet headers patched.' };
}

/**
 * One-time repair for Orders sheet column misalignment.
 *
 * Background: patchSheetHeaders() previously appended a duplicate 'UpdatedAt' column
 * instead of inserting the missing 'ProofURL' column at the correct position.
 * Orders placed after the ProofURL code was deployed have columns 11-17 in the
 * CORRECT positions relative to the expected header — but the header labels were wrong.
 * Orders placed before the ProofURL code have columns shifted by 1 starting at position 11.
 *
 * Detection heuristic:
 *   - New-format rows: position 13 = ORDER_STATUS.PENDING ("pending") — written by placeOrder
 *   - Old-format rows: position 13 = pickupCode (5-char random, never "pending")
 *
 * Run once from the Admin panel after deploying this fix.
 */
function repairOrdersSheet(token) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN) return { success: false, error: 'Admin only.' };

  const EXPECTED = ['OrderID','CustomerEmail','CustomerName','StallID','StallName','Items',
                    'Subtotal','ServiceFee','Total','PaymentMethod','PaymentRef','ProofURL',
                    'PaymentStatus','Status','PickupCode','Notes','CreatedAt','UpdatedAt'];

  const sheet   = getSheet(SHEETS.ORDERS);
  const allData = sheet.getDataRange().getValues();
  if (allData.length <= 1) return { success: true, message: 'No order rows to repair.' };

  // Check if header is already correct
  const hdr = allData[0];
  const alreadyOk = EXPECTED.every((h, i) => hdr[i] === h) && hdr.length === EXPECTED.length;
  if (alreadyOk) return { success: true, message: 'Orders sheet is already in the correct format.' };

  let newFormat = 0, oldFormat = 0;
  const newData = [EXPECTED];

  for (let r = 1; r < allData.length; r++) {
    const row = allData[r];
    if (!row[0]) continue; // skip blank rows

    // Heuristic: new-format rows have ORDER_STATUS.PENDING at position 13
    // (placeOrder wrote the order status constant there before the header was fixed)
    // Old-format rows have a 5-char pickupCode at position 13 — never "pending"
    const isNewFmt = String(row[13] || '') === ORDER_STATUS.PENDING;

    if (isNewFmt) {
      // Data positions already match the expected header — just copy as-is
      newData.push(EXPECTED.map((_, i) => (i < row.length ? row[i] : '')));
      newFormat++;
    } else {
      // Old format: no ProofURL (insert '' at position 11, shift 11-17 right by 1)
      const newRow = EXPECTED.map((_, i) => {
        if (i <= 10)  return row[i];          // cols 0-10 unchanged
        if (i === 11) return '';              // ProofURL (old orders had none)
        return i - 1 < row.length ? row[i - 1] : ''; // shift 12-17 ← from 11-16
      });
      newData.push(newRow);
      oldFormat++;
    }
  }

  // Rewrite the sheet
  sheet.clearContents();
  sheet.getRange(1, 1, newData.length, EXPECTED.length).setValues(newData);
  sheet.getRange(1, 1, 1, EXPECTED.length)
    .setBackground('#1B5E20').setFontColor('#FFFFFF').setFontWeight('bold');

  logAudit(session.email, 'UPDATE', 'Orders', '',
    `Sheet repaired: ${newFormat} new-format rows, ${oldFormat} old-format rows fixed.`);
  return { success: true,
           message: `Done! ${newFormat} new-format + ${oldFormat} old-format rows repaired.` };
}

function initSheetHeaders(sheet, name) {
  const map = {
    [SHEETS.USERS]:           ['UserID','Name','Email','Role','IDNumber','Phone','Status','CreatedAt','StallID'],
    [SHEETS.CONCESSIONAIRES]: ['StallID','Email','StallName','Location','Description','OperatingHours','Status','Rating','TotalRatings','LogoURL','ApprovalStatus','CreatedAt'],
    [SHEETS.PRODUCTS]:        ['ProductID','StallID','StallName','Name','Category','Description','Price','Stock','ImageURL','IsAvailable','ApprovalStatus','CreatedAt'],
    [SHEETS.ORDERS]:          ['OrderID','CustomerEmail','CustomerName','StallID','StallName','Items','Subtotal','ServiceFee','Total','PaymentMethod','PaymentRef','ProofURL','PaymentStatus','Status','PickupCode','Notes','CreatedAt','UpdatedAt'],
    [SHEETS.RATINGS]:         ['RatingID','CustomerEmail','StallID','OrderID','Stars','Comment','CreatedAt'],
    [SHEETS.SESSIONS]:        ['Token','Email','Role','UserData','ExpiresAt'],
    [SHEETS.OTPS]:            ['Email','OTP','ExpiresAt','Attempts','SentAt'],
    [SHEETS.ANNOUNCEMENTS]:    ['AnnID','Title','Body','Author','CreatedAt','ExpiresAt'],
    [SHEETS.AUDIT_LOG]:        ['LogID','Timestamp','UserEmail','Action','Module','RecordID','Details'],
    [SHEETS.SCHEDULED_REPORTS]:['ReportID','Name','Frequency','Recipients','LastSent','IsActive','CreatedAt']
  };
  const h = map[name];
  if (!h) return;
  sheet.appendRow(h);
  sheet.getRange(1, 1, 1, h.length)
    .setBackground('#1B5E20').setFontColor('#FFFFFF').setFontWeight('bold');
}

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function now() { return new Date().toISOString(); }

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row =>
    Object.fromEntries(headers.map((h, i) => {
      const v = row[i];
      // Convert Date objects to ISO strings so the client always gets parseable dates
      return [h, v instanceof Date ? v.toISOString() : v];
    }))
  );
}

// ------------------------------------------------------------
// Audit Log
// ------------------------------------------------------------

function logAudit(userEmail, action, module_, recordId, details) {
  try {
    getSheet(SHEETS.AUDIT_LOG).appendRow([
      genId('LOG'), new Date().toISOString(), userEmail || '',
      action, module_ || '', recordId || '',
      typeof details === 'object' ? JSON.stringify(details) : (details || '')
    ]);
  } catch(e) {} // non-critical — never break the main flow
}

function getStallByEmail(email) {
  const emailLc = (email || '').toLowerCase().trim();
  const stalls  = sheetToObjects(getSheet(SHEETS.CONCESSIONAIRES));

  // Primary: stall's own email matches the Concessionaires sheet
  const direct = stalls.find(r => (r.Email || '').toLowerCase().trim() === emailLc);
  if (direct) return direct;

  // Secondary: user in Users sheet with role=concessionaire and a StallID
  // Read raw values to avoid header-mapping issues when StallID column was added later
  const usersSheet = getSheet(SHEETS.USERS);
  const raw        = usersSheet.getDataRange().getValues();
  if (raw.length < 2) return null;

  const hdr      = raw[0].map(h => String(h).trim());
  const iEmail   = hdr.indexOf('Email');
  const iRole    = hdr.indexOf('Role');
  // StallID is column 9 per schema — fall back to index 8 if header not yet present
  const iStallId = hdr.indexOf('StallID') !== -1 ? hdr.indexOf('StallID') : 8;

  for (let i = 1; i < raw.length; i++) {
    const rowEmail   = String(raw[i][iEmail]  || '').toLowerCase().trim();
    const rowRole    = String(raw[i][iRole]   || '');
    const rowStallId = String(raw[i][iStallId]|| '').trim();
    if (rowEmail === emailLc && rowRole === ROLES.CONCESSIONAIRE && rowStallId) {
      return stalls.find(r => String(r.StallID).trim() === rowStallId) || null;
    }
  }
  return null;
}

function ensureUsersStallIdColumn() {
  const sheet   = getSheet(SHEETS.USERS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (!headers.includes('StallID')) {
    const col = headers.length + 1;
    const cell = sheet.getRange(1, col);
    cell.setValue('StallID');
    cell.setBackground('#1B5E20').setFontColor('#FFFFFF').setFontWeight('bold');
  }
}

function getConcessionaires(activeOnly = true) {
  const key = 'conc_' + activeOnly;
  const hit = cacheGet(key);
  if (hit) return hit;
  const rows   = sheetToObjects(getSheet(SHEETS.CONCESSIONAIRES));
  // Include 'offline' stalls so they appear in the list (but can't accept orders)
  const result = activeOnly
    ? rows.filter(r => (r.Status === 'active' || r.Status === 'offline') && r.ApprovalStatus === APPROVAL.APPROVED)
    : rows;
  cachePut(key, result);
  return result;
}

function toggleStallOnline(token, isOnline) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };
  if (session.role !== ROLES.CONCESSIONAIRE) return { success: false, error: 'Unauthorized.' };

  const stall = getStallByEmail(session.email);
  if (!stall) return { success: false, error: 'Stall not found.' };

  const newStatus = isOnline ? 'active' : 'offline';
  const sheet   = getSheet(SHEETS.CONCESSIONAIRES);
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== stall.StallID) continue;
    sheet.getRange(i + 1, headers.indexOf('Status') + 1).setValue(newStatus);
    cacheBust('conc_true', 'conc_false');
    return { success: true, isOnline };
  }
  return { success: false, error: 'Stall not found.' };
}

function getAnnouncements() {
  const hit = cacheGet('announcements');
  if (hit) return hit;
  const rows   = sheetToObjects(getSheet(SHEETS.ANNOUNCEMENTS));
  const now_   = new Date();
  const result = rows.filter(r => !r.ExpiresAt || new Date(r.ExpiresAt) > now_);
  cachePut('announcements', result);
  return result;
}

// ------------------------------------------------------------
// Cache helpers (CacheService, 5-min TTL by default)
// ------------------------------------------------------------

function cacheGet(key) {
  try {
    const hit = CacheService.getScriptCache().get(key);
    return hit ? JSON.parse(hit) : null;
  } catch(e) { return null; }
}

function cachePut(key, data, ttl) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(data), ttl || 300);
  } catch(e) {}
}

function cacheBust(...keys) {
  try { CacheService.getScriptCache().removeAll(keys); } catch(e) {}
}

// ------------------------------------------------------------
// Maintenance: cleanup expired sessions + OTPs
// ------------------------------------------------------------

function cleanupExpiredRows() {
  const now   = Date.now();
  const props = PropertiesService.getScriptProperties().getProperties();
  let removed = 0;
  Object.keys(props).forEach(k => {
    if (!k.startsWith('sess_') && !k.startsWith('otp_')) return;
    try {
      const d       = JSON.parse(props[k]);
      const expires = new Date(d.expires || 0).getTime();
      if (now > expires) {
        PropertiesService.getScriptProperties().deleteProperty(k);
        removed++;
      }
    } catch(e) {
      PropertiesService.getScriptProperties().deleteProperty(k); // corrupt entry
      removed++;
    }
  });
  if (removed > 0) console.log('cleanupExpiredRows: removed ' + removed + ' expired entries.');
}

function setupCleanupTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'cleanupExpiredRows') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cleanupExpiredRows').timeBased().everyHours(1).create();
  return { success: true, message: 'Cleanup trigger created — runs every hour.' };
}
