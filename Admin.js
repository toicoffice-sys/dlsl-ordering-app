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

  // Ensure user account exists with StallID linked
  ensureUsersStallIdColumn();
  const users = sheetToObjects(getSheet(SHEETS.USERS));
  if (!users.some(r => (r.Email || '').toLowerCase() === emailLc)) {
    getSheet(SHEETS.USERS).appendRow([
      genId('USR'), stallName.trim(), emailLc, ROLES.CONCESSIONAIRE,
      '', '', 'active', now(), stallId
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

// ------------------------------------------------------------
// Audit Log
// ------------------------------------------------------------

function getAuditLog(token, limit, offset) {
  const g = requireAdmin(token);
  if (!g.ok) return { success: false, error: g.error };
  const rows = sheetToObjects(getSheet(SHEETS.AUDIT_LOG))
    .sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
  const total  = rows.length;
  const start  = parseInt(offset) || 0;
  const end    = start + (parseInt(limit) || 100);
  return { success: true, logs: rows.slice(start, end), total };
}

// Customer/any role: get audit trail for a specific order they own
function getOrderAuditLog(token, orderId) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  // Verify the order belongs to this user (or is admin/concessionaire)
  const orders = sheetToObjects(getSheet(SHEETS.ORDERS));
  const order  = orders.find(r => r.OrderID === orderId);
  if (!order) return { success: false, error: 'Order not found.' };
  const isOwner = order.CustomerEmail.toLowerCase() === session.email.toLowerCase();
  const isStaff = session.role === ROLES.ADMIN || session.role === ROLES.CONCESSIONAIRE;
  if (!isOwner && !isStaff) return { success: false, error: 'Unauthorized.' };

  const logs = sheetToObjects(getSheet(SHEETS.AUDIT_LOG))
    .filter(r => r.RecordID === orderId)
    .sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

  return { success: true, logs, order };
}

// ------------------------------------------------------------
// Export: CSV
// ------------------------------------------------------------

function exportReportCSV(token, startDate, endDate) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.CONCESSIONAIRE)
    return { success: false, error: 'Unauthorized.' };

  const stall   = session.role === ROLES.CONCESSIONAIRE ? getStallByEmail(session.email) : null;
  const orders  = sheetToObjects(getSheet(SHEETS.ORDERS));
  const start   = startDate ? new Date(startDate) : null;
  const end     = endDate   ? new Date(endDate + 'T23:59:59') : null;

  const filtered = orders.filter(r => {
    if (stall && r.StallID !== stall.StallID) return false;
    if (r.Status === ORDER_STATUS.CANCELLED) return false;
    const d = new Date(r.CreatedAt);
    if (start && d < start) return false;
    if (end   && d > end)   return false;
    return true;
  });

  const headers = ['OrderID','Date','CustomerName','StallName','Items','PaymentMethod','PaymentRef','Total','Status'];
  const rows = filtered.map(r => {
    const items = safeParseJSON(r.Items).map(i => `${i.qty}x ${i.name}`).join('; ');
    return [
      r.OrderID,
      (r.CreatedAt || '').substring(0, 10),
      r.CustomerName,
      r.StallName,
      `"${items}"`,
      r.PaymentMethod,
      r.PaymentRef || '',
      r.Total,
      r.Status
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  logAudit(session.email, 'EXPORT', 'Reports', '', `CSV export ${startDate} to ${endDate}`);
  return { success: true, csv, filename: `greenbite_report_${startDate}_${endDate}.csv` };
}

// ------------------------------------------------------------
// Export: Email Report
// ------------------------------------------------------------

function emailReport(token, startDate, endDate, recipientEmail) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.CONCESSIONAIRE)
    return { success: false, error: 'Unauthorized.' };

  const csvRes = exportReportCSV(token, startDate, endDate);
  if (!csvRes.success) return csvRes;

  const reportRes = getSalesReport(token, startDate, endDate);
  if (!reportRes.success) return reportRes;

  const r    = reportRes.report;
  const to   = recipientEmail || session.email;
  const name = session.userData?.name || session.email;

  const topProductsHtml = r.topProducts.map((p, i) =>
    `<tr><td>${i+1}</td><td>${p.name}</td><td>${p.qty}</td><td>₱${Number(p.revenue).toFixed(2)}</td></tr>`
  ).join('');

  const body = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#1B5E20;padding:20px 28px;">
    <span style="color:#C9A84C;font-size:18px;font-weight:bold;">GreenBite — Sales Report</span>
    <span style="color:#a5d6a7;font-size:13px;margin-left:8px;">${startDate} to ${endDate}</span>
  </div>
  <div style="padding:24px;background:#fff;">
    <p>Hello <strong>${name}</strong>,</p>
    <p>Here is your sales report for the period <strong>${startDate}</strong> to <strong>${endDate}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9f9f9;border-radius:8px;">
      <tr><td style="padding:10px 16px;font-weight:bold;">Total Orders</td><td style="padding:10px 16px;">${r.totalOrders}</td></tr>
      <tr><td style="padding:10px 16px;font-weight:bold;">Total Revenue</td><td style="padding:10px 16px;">₱${Number(r.totalRevenue).toFixed(2)}</td></tr>
      <tr><td style="padding:10px 16px;font-weight:bold;">Avg Order Value</td><td style="padding:10px 16px;">₱${Number(r.averageOrderValue).toFixed(2)}</td></tr>
    </table>
    <h3 style="font-size:14px;color:#1B5E20;">Top Products</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr style="background:#f5f5f5;"><th style="padding:8px;">#</th><th style="padding:8px;">Product</th><th style="padding:8px;">Qty</th><th style="padding:8px;">Revenue</th></tr>
      ${topProductsHtml}
    </table>
    <p style="margin-top:16px;font-size:12px;color:#888;">A CSV attachment is included for spreadsheet import.</p>
  </div>
  <div style="background:#f5f5f5;padding:12px 28px;font-size:12px;color:#9e9e9e;text-align:center;">
    GreenBite · De La Salle Lipa RESGO · A2OM Automation
  </div>
</div>`;

  const csvBlob = Utilities.newBlob(csvRes.csv, 'text/csv', csvRes.filename);
  MailApp.sendEmail({
    to: to,
    subject: `GreenBite Sales Report — ${startDate} to ${endDate}`,
    htmlBody: body,
    attachments: [csvBlob]
  });

  logAudit(session.email, 'EXPORT', 'Reports', '', `Email report sent to ${to} for ${startDate}–${endDate}`);
  return { success: true };
}

// ------------------------------------------------------------
// Scheduled Reports
// ------------------------------------------------------------

function getScheduledReports(token) {
  const g = requireAdmin(token);
  if (!g.ok) return { success: false, error: g.error };
  return { success: true, reports: sheetToObjects(getSheet(SHEETS.SCHEDULED_REPORTS)) };
}

function saveScheduledReport(token, data) {
  const g = requireAdmin(token);
  if (!g.ok) return { success: false, error: g.error };
  const { name, frequency, recipients } = data || {};
  if (!name || !frequency || !recipients) return { success: false, error: 'Name, frequency, and recipients are required.' };
  getSheet(SHEETS.SCHEDULED_REPORTS).appendRow([
    genId('RPT'), name, frequency, recipients, '', true, now()
  ]);
  logAudit(g.session.email, 'CREATE', 'ScheduledReports', '', `${name} (${frequency})`);
  return { success: true };
}

function deleteScheduledReport(token, reportId) {
  const g = requireAdmin(token);
  if (!g.ok) return { success: false, error: g.error };
  const sheet = getSheet(SHEETS.SCHEDULED_REPORTS);
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === reportId) { sheet.deleteRow(i + 1); return { success: true }; }
  }
  return { success: false, error: 'Report not found.' };
}

// Called by time-based trigger — do NOT rename
function runScheduledReports() {
  const reports = sheetToObjects(getSheet(SHEETS.SCHEDULED_REPORTS))
    .filter(r => r.IsActive === true || r.IsActive === 'TRUE');
  const today   = new Date().toISOString().substring(0, 10);
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon...
  const dayOfMonth = new Date().getDate();

  reports.forEach(rep => {
    const freq = (rep.Frequency || '').toLowerCase();
    const shouldRun =
      freq === 'daily' ||
      (freq === 'weekly'  && dayOfWeek === 1) ||
      (freq === 'monthly' && dayOfMonth === 1);
    if (!shouldRun) return;

    const endDate   = today;
    const startDate = freq === 'daily'
      ? today
      : freq === 'weekly'
        ? new Date(Date.now() - 7  * 86400000).toISOString().substring(0, 10)
        : new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10);

    (rep.Recipients || '').split(',').forEach(email => {
      email = email.trim();
      if (!email) return;
      try {
        const csvRes    = exportReportCSVRaw(startDate, endDate, null);
        const reportRes = getSalesReportRaw(startDate, endDate, null);
        if (!csvRes || !reportRes.success) return;
        const csvBlob = Utilities.newBlob(csvRes, 'text/csv', `report_${startDate}.csv`);
        MailApp.sendEmail({
          to: email,
          subject: `GreenBite ${rep.Name} — ${startDate} to ${endDate}`,
          body: `Scheduled report attached.\nPeriod: ${startDate} to ${endDate}\nOrders: ${reportRes.report.totalOrders}\nRevenue: ₱${Number(reportRes.report.totalRevenue).toFixed(2)}`,
          attachments: [csvBlob]
        });
      } catch(e) {}
    });

    // Update LastSent
    const sheet = getSheet(SHEETS.SCHEDULED_REPORTS);
    const rows  = sheet.getDataRange().getValues();
    const hdr   = rows[0];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === rep.ReportID) {
        sheet.getRange(i + 1, hdr.indexOf('LastSent') + 1).setValue(today);
        break;
      }
    }
  });
}

// Internal helpers (no token validation — called from trigger)
function exportReportCSVRaw(startDate, endDate, stallId) {
  const orders = sheetToObjects(getSheet(SHEETS.ORDERS));
  const start  = startDate ? new Date(startDate) : null;
  const end    = endDate   ? new Date(endDate + 'T23:59:59') : null;
  const filtered = orders.filter(r => {
    if (stallId && r.StallID !== stallId) return false;
    if (r.Status === ORDER_STATUS.CANCELLED) return false;
    const d = new Date(r.CreatedAt);
    if (start && d < start) return false;
    if (end   && d > end)   return false;
    return true;
  });
  const headers = ['OrderID','Date','CustomerName','StallName','Total','Status'];
  const rows = filtered.map(r => [r.OrderID, (r.CreatedAt||'').substring(0,10), r.CustomerName, r.StallName, r.Total, r.Status].join(','));
  return [headers.join(','), ...rows].join('\n');
}

function getSalesReportRaw(startDate, endDate, stallId) {
  const orders = sheetToObjects(getSheet(SHEETS.ORDERS));
  const start  = startDate ? new Date(startDate) : null;
  const end    = endDate   ? new Date(endDate + 'T23:59:59') : null;
  const filtered = orders.filter(r => {
    if (stallId && r.StallID !== stallId) return false;
    if (r.Status === ORDER_STATUS.CANCELLED) return false;
    const d = new Date(r.CreatedAt);
    if (start && d < start) return false;
    if (end   && d > end)   return false;
    return true;
  });
  const totalRevenue = filtered.reduce((s, r) => s + Number(r.Total || 0), 0);
  return { success: true, report: { totalOrders: filtered.length, totalRevenue } };
}

// ------------------------------------------------------------
// DLSP Shared Supplier Database — read-only integration
//
// Primary path:  UrlFetchApp → DLSP service API (getServiceSuppliers)
//                Requires Script Properties:
//                  SUPPLIER_DB_URL  — deployed web app URL of DLSP app
//                  SUPPLIER_API_KEY — shared secret matching DLSP SERVICE_API_KEY
//
// Fallback path: SpreadsheetApp.openById (same-account only)
//                Requires Script Property:
//                  SUPPLIER_DB_ID   — DLSP spreadsheet ID
// ------------------------------------------------------------

function getSharedSuppliers(token, query) {
  const g = requireAdmin(token);
  if (!g.ok) return { success: false, error: g.error };

  const props  = PropertiesService.getScriptProperties();
  const dbUrl  = props.getProperty('SUPPLIER_DB_URL');
  const apiKey = props.getProperty('SUPPLIER_API_KEY');
  const dbId   = props.getProperty('SUPPLIER_DB_ID');

  // ── Primary: service API call ──────────────────────────────
  if (dbUrl && apiKey) {
    try {
      const payload = JSON.stringify({ apiKey, query: query || '', schoolCode: 'DLSL' });
      const resp    = UrlFetchApp.fetch(dbUrl, {
        method:      'post',
        contentType: 'application/json',
        payload,
        muteHttpExceptions: true,
      });
      const result = JSON.parse(resp.getContentText());
      if (result.success) return result;
      // fall through to spreadsheet fallback on API error
      console.warn('getSharedSuppliers: API returned error — ' + result.error);
    } catch(e) {
      console.warn('getSharedSuppliers: UrlFetchApp failed — ' + e.message);
    }
  }

  // ── Fallback: direct spreadsheet read (same-account) ──────
  if (!dbId) return {
    success: false,
    error: 'DLSP Supplier Database not configured. Set SUPPLIER_DB_URL + SUPPLIER_API_KEY (or SUPPLIER_DB_ID) in Script Properties.'
  };

  try {
    const ss    = SpreadsheetApp.openById(dbId);
    const sheet = ss.getSheetByName('Suppliers');
    if (!sheet) return { success: false, error: 'Suppliers sheet not found in the shared database.' };

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, suppliers: [] };

    const headers = data[0];
    const iActive = headers.indexOf('IsActive');
    const iName   = headers.indexOf('CompanyName');

    let rows = data.slice(1)
      .filter(r => {
        if (!r[iName]) return false;
        const active = String(r[iActive] ?? '').toUpperCase().trim();
        return active !== 'FALSE' && active !== 'NO' && active !== '0';
      })
      .map(r => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = r[i]);
        return obj;
      });

    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter(s =>
        ['CompanyName','TradeName','Category','SupplierEmail','ContactPerson','City','Address']
          .some(f => String(s[f] ?? '').toLowerCase().includes(q))
      );
    }

    const suppliers = rows.map(s => ({
      SupplierID:       s.SupplierID       || '',
      CompanyName:      s.CompanyName      || '',
      TradeName:        s.TradeName        || '',
      Email:            s.SupplierEmail    || '',
      ContactPerson:    s.ContactPerson    || '',
      ContactNumber:    s.ContactNumber    || '',
      Category:         s.Category         || '',
      SubCategory:      s.SubCategory      || '',
      Address:          s.Address          || '',
      City:             s.City             || '',
      AccredStatus:     s.AccredStatus     || '',
      CentralVerified:  s.CentralVerified === true || s.CentralVerified === 'TRUE',
      RegisteredSchool: s.RegisteredSchool || '',
    }));

    return { success: true, suppliers, total: suppliers.length };
  } catch(e) {
    return { success: false, error: 'Failed to connect to DLSP Supplier Database: ' + e.message };
  }
}
