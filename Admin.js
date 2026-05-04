// ============================================================
// DLSL Ordering App — Admin.js
// User management, concessionaire management, analytics
// ============================================================

// ------------------------------------------------------------
// Guard helper
// ------------------------------------------------------------

function requireAdmin(token) {
  const session = validateSession(token);
  if (!session) return { ok: false, error: 'Session expired.' };
  if (session.role !== ROLES.ADMIN) return { ok: false, error: 'Admin access required.' };
  return { ok: true, session };
}

// ------------------------------------------------------------
// User management
// ------------------------------------------------------------

function getUsers(token) {
  const g = requireAdmin(token);
  if (!g.ok) return { success: false, error: g.error };

  const rows = sheetToObjects(getSheet(SHEETS.USERS));
  return { success: true, users: rows };
}

function addUser(token, data) {
  const g = requireAdmin(token);
  if (!g.ok) return { success: false, error: g.error };

  const { name, email, role, idNumber, phone, stallId } = data || {};
  if (!name || !email || !role) return { success: false, error: 'Name, email, and role are required.' };

  if (role === ROLES.CONCESSIONAIRE && !stallId)
    return { success: false, error: 'Please select a stall to assign this concessionaire account.' };

  const validRoles = Object.values(ROLES);
  if (!validRoles.includes(role)) return { success: false, error: 'Invalid role.' };

  const emailLc = email.toLowerCase().trim();
  const existing = sheetToObjects(getSheet(SHEETS.USERS));
  if (existing.some(r => (r.Email || '').toLowerCase() === emailLc))
    return { success: false, error: 'Email already registered.' };

  ensureUsersStallIdColumn();
  getSheet(SHEETS.USERS).appendRow([
    genId('USR'), name.trim(), emailLc, role,
    (idNumber || '').trim(), (phone || '').trim(), 'active', now(),
    role === ROLES.CONCESSIONAIRE ? (stallId || '') : ''
  ]);

  notifyAccountCreated(emailLc, name.trim(), role);
  return { success: true };
}

// Concessionaire: get staff users linked to their stall
function getConcStaff(token) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };
  if (session.role !== ROLES.CONCESSIONAIRE && session.role !== ROLES.ADMIN)
    return { success: false, error: 'Unauthorized.' };

  const stall = getStallByEmail(session.email);
  if (!stall) return { success: false, error: 'Stall not found.' };

  const users = sheetToObjects(getSheet(SHEETS.USERS))
    .filter(r => r.StallID === stall.StallID && r.Role === ROLES.CONCESSIONAIRE && r.Status === 'active');

  return { success: true, users, stallName: stall.StallName };
}

// Concessionaire: add staff user for their own stall
function addConcStaff(token, data) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };
  if (session.role !== ROLES.CONCESSIONAIRE && session.role !== ROLES.ADMIN)
    return { success: false, error: 'Unauthorized.' };

  const stall = getStallByEmail(session.email);
  if (!stall) return { success: false, error: 'Stall not found.' };

  const { name, email, idNumber, phone } = data || {};
  if (!name || !email) return { success: false, error: 'Name and email are required.' };

  const emailLc = email.toLowerCase().trim();
  const existing = sheetToObjects(getSheet(SHEETS.USERS));
  if (existing.some(r => (r.Email || '').toLowerCase() === emailLc))
    return { success: false, error: 'Email already registered.' };

  ensureUsersStallIdColumn();
  getSheet(SHEETS.USERS).appendRow([
    genId('USR'), name.trim(), emailLc, ROLES.CONCESSIONAIRE,
    (idNumber || '').trim(), (phone || '').trim(), 'active', now(), stall.StallID
  ]);

  notifyAccountCreated(emailLc, name.trim(), ROLES.CONCESSIONAIRE);
  return { success: true };
}

function updateUser(token, userId, data) {
  const g = requireAdmin(token);
  if (!g.ok) return { success: false, error: g.error };

  const sheet   = getSheet(SHEETS.USERS);
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== userId) continue;

    ensureUsersStallIdColumn();
    const updatable = { Name: data.name, Role: data.role, IDNumber: data.idNumber,
                        Phone: data.phone, Status: data.status, StallID: data.stallId };
    for (const [key, val] of Object.entries(updatable)) {
      const col = headers.indexOf(key);
      if (col >= 0 && val !== undefined) sheet.getRange(i + 1, col + 1).setValue(val);
    }
    return { success: true };
  }
  return { success: false, error: 'User not found.' };
}

function deactivateUser(token, userId) {
  return updateUser(token, userId, { status: 'inactive' });
}

// ------------------------------------------------------------
// Concessionaire management
// ------------------------------------------------------------

function addConcessionaire(token, data) {
  const g = requireAdmin(token);
  if (!g.ok) return { success: false, error: g.error };

  const { email, stallName, location, description, operatingHours, logoUrl } = data || {};
  if (!email || !stallName) return { success: false, error: 'Email and stall name are required.' };

  const emailLc = email.toLowerCase().trim();
  const existing = sheetToObjects(getSheet(SHEETS.CONCESSIONAIRES));
  if (existing.some(r => (r.Email || '').toLowerCase() === emailLc))
    return { success: false, error: 'Concessionaire email already registered.' };

  const stallId = genId('STL');
  getSheet(SHEETS.CONCESSIONAIRES).appendRow([
    stallId, emailLc, stallName.trim(), (location || '').trim(),
    (description || '').trim(), (operatingHours || '').trim(),
    'active', 0, 0, (logoUrl || '').trim(), APPROVAL.APPROVED, now()
  ]);
  cacheBust('conc_true', 'conc_false');

  // Ensure user account exists
  const users = sheetToObjects(getSheet(SHEETS.USERS));
  if (!users.some(r => (r.Email || '').toLowerCase() === emailLc)) {
    getSheet(SHEETS.USERS).appendRow([
      genId('USR'), stallName.trim(), emailLc, ROLES.CONCESSIONAIRE,
      '', '', 'active', now()
    ]);
    notifyAccountCreated(emailLc, stallName.trim(), ROLES.CONCESSIONAIRE);
  }

  return { success: true, stallId };
}

function updateConcessionaire(token, stallId, data) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  // Concessionaires can update their own stall; admin can update any
  if (session.role === ROLES.CONCESSIONAIRE) {
    const ownStall = getStallByEmail(session.email);
    if (!ownStall || ownStall.StallID !== stallId)
      return { success: false, error: 'Unauthorized.' };
  } else if (session.role !== ROLES.ADMIN) {
    return { success: false, error: 'Unauthorized.' };
  }

  const sheet   = getSheet(SHEETS.CONCESSIONAIRES);
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== stallId) continue;

    const updatable = {
      StallName: data.stallName, Location: data.location, Description: data.description,
      OperatingHours: data.operatingHours, LogoURL: data.logoUrl,
      ...(session.role === ROLES.ADMIN ? { Status: data.status, ApprovalStatus: data.approvalStatus } : {})
    };
    for (const [key, val] of Object.entries(updatable)) {
      const col = headers.indexOf(key);
      if (col >= 0 && val !== undefined) sheet.getRange(i + 1, col + 1).setValue(val);
    }
    cacheBust('conc_true', 'conc_false');
    return { success: true };
  }
  return { success: false, error: 'Stall not found.' };
}

function setOperatingHours(token, hours) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const stall = getStallByEmail(session.email);
  if (!stall) return { success: false, error: 'Stall not found.' };

  return updateConcessionaire(token, stall.StallID, { operatingHours: hours });
}

function getConcessionaireApplications(token) {
  const g = requireAdmin(token);
  if (!g.ok) return { success: false, error: g.error };

  const rows = sheetToObjects(getSheet(SHEETS.CONCESSIONAIRES));
  return { success: true, stalls: rows.filter(r => r.ApprovalStatus === APPROVAL.PENDING) };
}

function approveConcessionaire(token, stallId, approved) {
  const g = requireAdmin(token);
  if (!g.ok) return { success: false, error: g.error };

  const status   = approved ? APPROVAL.APPROVED : APPROVAL.REJECTED;
  const stallStatus = approved ? 'active' : 'suspended';

  const sheet   = getSheet(SHEETS.CONCESSIONAIRES);
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== stallId) continue;
    sheet.getRange(i + 1, headers.indexOf('ApprovalStatus') + 1).setValue(status);
    sheet.getRange(i + 1, headers.indexOf('Status') + 1).setValue(stallStatus);
    cacheBust('conc_true', 'conc_false');

    const email     = rows[i][headers.indexOf('Email')];
    const stallName = rows[i][headers.indexOf('StallName')];
    notifyStallApproval(email, stallName, status);
    return { success: true };
  }
  return { success: false, error: 'Stall not found.' };
}

// ------------------------------------------------------------
// Announcements
// ------------------------------------------------------------

function addAnnouncement(token, title, body, expiresAt) {
  const g = requireAdmin(token);
  if (!g.ok) return { success: false, error: g.error };

  getSheet(SHEETS.ANNOUNCEMENTS).appendRow([
    genId('ANN'), title.trim(), body.trim(),
    g.session.userData.name, now(), expiresAt || ''
  ]);
  cacheBust('announcements');
  return { success: true };
}

function deleteAnnouncement(token, annId) {
  const g = requireAdmin(token);
  if (!g.ok) return { success: false, error: g.error };

  const sheet = getSheet(SHEETS.ANNOUNCEMENTS);
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === annId) {
      sheet.deleteRow(i + 1);
      cacheBust('announcements');
      return { success: true };
    }
  }
  return { success: false, error: 'Announcement not found.' };
}

// ------------------------------------------------------------
// Analytics
// ------------------------------------------------------------

function getSalesReport(token, startDate, endDate) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.CONCESSIONAIRE)
    return { success: false, error: 'Unauthorized.' };

  const stall    = session.role === ROLES.CONCESSIONAIRE ? getStallByEmail(session.email) : null;
  const orders   = sheetToObjects(getSheet(SHEETS.ORDERS));
  const start    = startDate ? new Date(startDate) : null;
  const end      = endDate   ? new Date(endDate)   : null;

  const filtered = orders.filter(r => {
    if (stall && r.StallID !== stall.StallID) return false;
    if (r.Status === ORDER_STATUS.CANCELLED) return false;
    const d = new Date(r.CreatedAt);
    if (start && d < start) return false;
    if (end   && d > end)   return false;
    return true;
  });

  const totalRevenue = filtered.reduce((s, r) => s + Number(r.Total || 0), 0);
  const totalOrders  = filtered.length;

  // Sales by stall
  const byStall = {};
  filtered.forEach(r => {
    if (!byStall[r.StallName]) byStall[r.StallName] = { orders: 0, revenue: 0 };
    byStall[r.StallName].orders++;
    byStall[r.StallName].revenue += Number(r.Total || 0);
  });

  // Top products
  const productCounts = {};
  filtered.forEach(r => {
    const items = safeParseJSON(r.Items);
    (items || []).forEach(item => {
      if (!productCounts[item.name]) productCounts[item.name] = { qty: 0, revenue: 0, stall: r.StallName };
      productCounts[item.name].qty     += item.qty;
      productCounts[item.name].revenue += item.subtotal;
    });
  });

  const topProducts = Object.entries(productCounts)
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  // Daily revenue
  const byDay = {};
  filtered.forEach(r => {
    const day = (r.CreatedAt || '').substring(0, 10);
    byDay[day] = (byDay[day] || 0) + Number(r.Total || 0);
  });
  const dailyRevenue = Object.entries(byDay)
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    success: true,
    report: {
      totalRevenue,
      totalOrders,
      averageOrderValue: totalOrders ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
      byStall,
      topProducts,
      dailyRevenue,
      period: { start: startDate, end: endDate }
    }
  };
}

function getDashboardStats(token) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const orders = sheetToObjects(getSheet(SHEETS.ORDERS));
  const stall  = session.role === ROLES.CONCESSIONAIRE ? getStallByEmail(session.email) : null;

  const relevant = stall ? orders.filter(r => r.StallID === stall.StallID) : orders;
  const today = new Date().toISOString().substring(0, 10);
  const todayOrders = relevant.filter(r => r.CreatedAt?.startsWith(today));

  return {
    success: true,
    stats: {
      totalOrdersToday:   todayOrders.length,
      pendingOrders:      relevant.filter(r => r.Status === ORDER_STATUS.PENDING).length,
      preparingOrders:    relevant.filter(r => r.Status === ORDER_STATUS.PREPARING).length,
      readyOrders:        relevant.filter(r => r.Status === ORDER_STATUS.READY).length,
      todayRevenue:       todayOrders.filter(r => r.Status !== ORDER_STATUS.CANCELLED)
                                     .reduce((s, r) => s + Number(r.Total || 0), 0),
      totalUsers:         session.role === ROLES.ADMIN
                            ? sheetToObjects(getSheet(SHEETS.USERS)).length : undefined,
      totalStalls:        session.role === ROLES.ADMIN
                            ? sheetToObjects(getSheet(SHEETS.CONCESSIONAIRES)).length : undefined,
      pendingApprovals:   session.role === ROLES.ADMIN
                            ? sheetToObjects(getSheet(SHEETS.PRODUCTS)).filter(r => r.ApprovalStatus === APPROVAL.PENDING).length : undefined
    }
  };
}
