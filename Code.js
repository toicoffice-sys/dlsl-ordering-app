// ============================================================
// DLSL Ordering App (GreenBite) — Google Apps Script
// Version: 1.0.0
// Last Updated: 2026-05-04
// Developer: A2OM · DLSL TOIC
// Description: Campus food & merchandise ordering app for DLSL
// Changelog:
//   v1.0.0 - 2026-05-04 - Move SPREADSHEET_ID to PropertiesService (security fix)
// ============================================================

const SPREADSHEET_ID   = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
const IMAGES_FOLDER_NAME = 'DLSL Ordering App — Images';

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
  USERS:           'Users',
  CONCESSIONAIRES: 'Concessionaires',
  PRODUCTS:        'Products',
  ORDERS:          'Orders',
  ORDER_ITEMS:     'OrderItems',
  RATINGS:         'Ratings',
  SESSIONS:        'Sessions',
  OTPS:            'OTPs',
  ANNOUNCEMENTS:   'Announcements'
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

  // Rate-limit: 60 s between sends
  const otpSheet = getSheet(SHEETS.OTPS);
  const otpRows = otpSheet.getDataRange().getValues();
  const now = new Date();

  for (let i = 1; i < otpRows.length; i++) {
    if ((otpRows[i][0] || '').toLowerCase() === email) {
      const sentAt = new Date(otpRows[i][4] || 0);
      const diff = (now - sentAt) / 1000;
      if (diff < 60) return { success: false, error: `Wait ${Math.ceil(60 - diff)}s before requesting again.` };
      otpSheet.deleteRow(i + 1);
      break;
    }
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(now.getTime() + 10 * 60 * 1000);
  otpSheet.appendRow([email, otp, expires.toISOString(), 0, now.toISOString()]);

  sendOTPEmail(user.name, email, otp);
  return { success: true, name: user.name };
}

function verifyOTP(email, code) {
  email = (email || '').toLowerCase().trim();
  code  = (code  || '').trim();

  const otpSheet = getSheet(SHEETS.OTPS);
  const otpRows  = otpSheet.getDataRange().getValues();
  const now      = new Date();

  for (let i = 1; i < otpRows.length; i++) {
    if ((otpRows[i][0] || '').toLowerCase() !== email) continue;

    const storedOTP = otpRows[i][1].toString();
    const expires   = new Date(otpRows[i][2]);
    const attempts  = parseInt(otpRows[i][3]) || 0;

    if (attempts >= 5) {
      otpSheet.deleteRow(i + 1);
      return { success: false, error: 'Too many failed attempts. Request a new OTP.' };
    }
    if (now > expires) {
      otpSheet.deleteRow(i + 1);
      return { success: false, error: 'OTP expired. Please request a new one.' };
    }
    if (storedOTP !== code) {
      otpSheet.getRange(i + 1, 4).setValue(attempts + 1);
      return { success: false, error: `Invalid OTP. ${4 - attempts} attempt(s) left.` };
    }

    otpSheet.deleteRow(i + 1);

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

    return {
      success: true,
      token,
      user: userData,
      stallData,
      concessionaires: getConcessionaires(true),
      announcements:   getAnnouncements()
    };
  }

  return { success: false, error: 'OTP not found. Please request a new one.' };
}

function resendOTP(email) {
  return requestAccess(email);
}

function logout(token) {
  if (!token) return { success: false };
  const sheet = getSheet(SHEETS.SESSIONS);
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === token) { sheet.deleteRow(i + 1); return { success: true }; }
  }
  return { success: false };
}

// ------------------------------------------------------------
// Session management
// ------------------------------------------------------------

function createSession(email, role, userData) {
  const token   = Utilities.getUuid();
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 h
  getSheet(SHEETS.SESSIONS).appendRow([token, email, role, JSON.stringify(userData), expires.toISOString()]);
  return token;
}

function validateSession(token) {
  if (!token) return null;
  const sheet = getSheet(SHEETS.SESSIONS);
  const rows  = sheet.getDataRange().getValues();
  const now   = new Date();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== token) continue;
    const expires = new Date(rows[i][4]);
    if (expires <= now) { sheet.deleteRow(i + 1); return null; }
    return { email: rows[i][1], role: rows[i][2], userData: JSON.parse(rows[i][3]) };
  }
  return null;
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

function getSheet(name) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  let   sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); initSheetHeaders(sheet, name); }
  return sheet;
}

function initSheetHeaders(sheet, name) {
  const map = {
    [SHEETS.USERS]:           ['UserID','Name','Email','Role','IDNumber','Phone','Status','CreatedAt'],
    [SHEETS.CONCESSIONAIRES]: ['StallID','Email','StallName','Location','Description','OperatingHours','Status','Rating','TotalRatings','LogoURL','ApprovalStatus','CreatedAt'],
    [SHEETS.PRODUCTS]:        ['ProductID','StallID','StallName','Name','Category','Description','Price','Stock','ImageURL','IsAvailable','ApprovalStatus','CreatedAt'],
    [SHEETS.ORDERS]:          ['OrderID','CustomerEmail','CustomerName','StallID','StallName','Items','Subtotal','ServiceFee','Total','PaymentMethod','PaymentRef','PaymentStatus','Status','PickupCode','Notes','CreatedAt','UpdatedAt'],
    [SHEETS.RATINGS]:         ['RatingID','CustomerEmail','StallID','OrderID','Stars','Comment','CreatedAt'],
    [SHEETS.SESSIONS]:        ['Token','Email','Role','UserData','ExpiresAt'],
    [SHEETS.OTPS]:            ['Email','OTP','ExpiresAt','Attempts','SentAt'],
    [SHEETS.ANNOUNCEMENTS]:   ['AnnID','Title','Body','Author','CreatedAt','ExpiresAt']
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
    Object.fromEntries(headers.map((h, i) => [h, row[i]]))
  );
}

function getStallByEmail(email) {
  const rows = sheetToObjects(getSheet(SHEETS.CONCESSIONAIRES));
  return rows.find(r => (r.Email || '').toLowerCase() === email.toLowerCase()) || null;
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
  const now = new Date();
  [{ name: SHEETS.SESSIONS, col: 4 }, { name: SHEETS.OTPS, col: 2 }].forEach(({ name, col }) => {
    const sheet = getSheet(name);
    const rows  = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (new Date(rows[i][col]) <= now) sheet.deleteRow(i + 1);
    }
  });
}

function setupCleanupTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'cleanupExpiredRows') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cleanupExpiredRows').timeBased().everyHours(1).create();
  return { success: true, message: 'Cleanup trigger created — runs every hour.' };
}
