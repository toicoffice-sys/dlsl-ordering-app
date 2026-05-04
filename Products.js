// ============================================================
// DLSL Ordering App — Products.js
// Catalog browsing, concessionaire product management
// ============================================================

// ------------------------------------------------------------
// Public: browsing
// ------------------------------------------------------------

function getProductsByStall(stallId) {
  const key = 'products_' + stallId;
  const hit = cacheGet(key);
  if (hit) return hit;
  const rows   = sheetToObjects(getSheet(SHEETS.PRODUCTS));
  const result = rows.filter(r =>
    r.StallID === stallId &&
    r.ApprovalStatus === APPROVAL.APPROVED &&
    r.IsAvailable === true
  );
  cachePut(key, result);
  return result;
}

function searchProducts(query) {
  query = (query || '').toLowerCase().trim();
  const rows = sheetToObjects(getSheet(SHEETS.PRODUCTS));
  return rows.filter(r => {
    if (r.ApprovalStatus !== APPROVAL.APPROVED || !r.IsAvailable) return false;
    return (r.Name || '').toLowerCase().includes(query) ||
           (r.Category || '').toLowerCase().includes(query) ||
           (r.StallName || '').toLowerCase().includes(query);
  });
}

function getCategories(stallId) {
  const rows = sheetToObjects(getSheet(SHEETS.PRODUCTS));
  const cats = new Set(
    rows
      .filter(r => (!stallId || r.StallID === stallId) && r.ApprovalStatus === APPROVAL.APPROVED)
      .map(r => r.Category)
      .filter(Boolean)
  );
  return [...cats].sort();
}

// ------------------------------------------------------------
// Concessionaire: manage own products
// ------------------------------------------------------------

function addProduct(token, data) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };
  if (session.role !== ROLES.CONCESSIONAIRE && session.role !== ROLES.ADMIN)
    return { success: false, error: 'Unauthorized.' };

  const stall = session.role === ROLES.ADMIN
    ? { StallID: data.stallId, StallName: data.stallName }
    : getStallByEmail(session.email);

  if (!stall) return { success: false, error: 'Stall not found.' };
  if (stall.Status !== 'active') return { success: false, error: 'Stall is not active.' };

  const required = ['name', 'category', 'price'];
  for (const f of required) {
    if (!data[f]) return { success: false, error: `Field "${f}" is required.` };
  }
  if (isNaN(data.price) || Number(data.price) <= 0)
    return { success: false, error: 'Price must be a positive number.' };

  const product = {
    ProductID:     genId('PRD'),
    StallID:       stall.StallID,
    StallName:     stall.StallName,
    Name:          data.name.trim(),
    Category:      data.category.trim(),
    Description:   (data.description || '').trim(),
    Price:         Number(data.price),
    Stock:         Number(data.stock ?? -1), // -1 = unlimited
    ImageURL:      (data.imageUrl || '').trim(),
    IsAvailable:   true,
    ApprovalStatus: session.role === ROLES.ADMIN ? APPROVAL.APPROVED : APPROVAL.PENDING,
    CreatedAt:     now()
  };

  getSheet(SHEETS.PRODUCTS).appendRow(Object.values(product));
  cacheBust('products_' + stall.StallID, 'conc_true', 'conc_false');

  if (session.role !== ROLES.ADMIN) {
    notifyAdminMenuSubmission(stall.StallName, product.Name);
  }

  return { success: true, product };
}

function updateProduct(token, productId, data) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const sheet = getSheet(SHEETS.PRODUCTS);
  const rows  = sheet.getDataRange().getValues();
  const headers = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== productId) continue;

    const isOwner = session.role === ROLES.CONCESSIONAIRE &&
                    rows[i][headers.indexOf('StallID')] &&
                    getStallByEmail(session.email)?.StallID === rows[i][headers.indexOf('StallID')];
    const isAdmin = session.role === ROLES.ADMIN;

    if (!isOwner && !isAdmin) return { success: false, error: 'Unauthorized.' };

    const updatable = {
      Name: data.name, Category: data.category, Description: data.description,
      Price: data.price !== undefined ? Number(data.price) : undefined,
      Stock: data.stock !== undefined ? Number(data.stock) : undefined,
      ImageURL: data.imageUrl, IsAvailable: data.isAvailable
    };

    for (const [key, val] of Object.entries(updatable)) {
      const col = headers.indexOf(key);
      if (col >= 0 && val !== undefined) sheet.getRange(i + 1, col + 1).setValue(val);
    }

    // Reset approval if concessionaire changes content
    if (!isAdmin && (data.name || data.description || data.price !== undefined)) {
      const approvalCol = headers.indexOf('ApprovalStatus');
      sheet.getRange(i + 1, approvalCol + 1).setValue(APPROVAL.PENDING);
    }

    cacheBust('products_' + rows[i][headers.indexOf('StallID')], 'conc_true', 'conc_false');
    return { success: true };
  }
  return { success: false, error: 'Product not found.' };
}

function deleteProduct(token, productId) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const sheet   = getSheet(SHEETS.PRODUCTS);
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== productId) continue;

    const stallId = rows[i][headers.indexOf('StallID')];
    const ownStall = getStallByEmail(session.email);
    if (session.role === ROLES.CONCESSIONAIRE && ownStall?.StallID !== stallId)
      return { success: false, error: 'Unauthorized.' };

    sheet.deleteRow(i + 1);
    cacheBust('products_' + stallId, 'conc_true', 'conc_false');
    return { success: true };
  }
  return { success: false, error: 'Product not found.' };
}

function toggleProductAvailability(token, productId, isAvailable) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const sheet   = getSheet(SHEETS.PRODUCTS);
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== productId) continue;

    const stallId  = rows[i][headers.indexOf('StallID')];
    const ownStall = getStallByEmail(session.email);
    if (session.role === ROLES.CONCESSIONAIRE && ownStall?.StallID !== stallId)
      return { success: false, error: 'Unauthorized.' };

    sheet.getRange(i + 1, headers.indexOf('IsAvailable') + 1).setValue(isAvailable);
    cacheBust('products_' + rows[i][headers.indexOf('StallID')]);
    return { success: true };
  }
  return { success: false, error: 'Product not found.' };
}

// ------------------------------------------------------------
// Admin: menu approval
// ------------------------------------------------------------

function approveProduct(token, productId, approved, reason) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN)
    return { success: false, error: 'Admin access required.' };

  const sheet   = getSheet(SHEETS.PRODUCTS);
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== productId) continue;

    const status  = approved ? APPROVAL.APPROVED : APPROVAL.REJECTED;
    const stallId = rows[i][headers.indexOf('StallID')];
    sheet.getRange(i + 1, headers.indexOf('ApprovalStatus') + 1).setValue(status);
    cacheBust('products_' + stallId, 'conc_true', 'conc_false');

    const stallEmail = getConcessionaireEmailByStallId(stallId);
    if (stallEmail) notifyProductApproval(stallEmail, rows[i][headers.indexOf('Name')], status, reason);

    return { success: true };
  }
  return { success: false, error: 'Product not found.' };
}

function getPendingProducts(token) {
  const session = validateSession(token);
  if (!session || session.role !== ROLES.ADMIN)
    return { success: false, error: 'Admin access required.' };

  const rows = sheetToObjects(getSheet(SHEETS.PRODUCTS));
  return { success: true, products: rows.filter(r => r.ApprovalStatus === APPROVAL.PENDING) };
}

// ------------------------------------------------------------
// Inventory management
// ------------------------------------------------------------

function updateStock(token, productId, stock) {
  return updateProduct(token, productId, { stock });
}

function getInventory(token) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const stall = getStallByEmail(session.email);
  if (!stall && session.role !== ROLES.ADMIN)
    return { success: false, error: 'Stall not found.' };

  const rows = sheetToObjects(getSheet(SHEETS.PRODUCTS));
  const products = session.role === ROLES.ADMIN
    ? rows
    : rows.filter(r => r.StallID === stall.StallID);

  return { success: true, products };
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function getConcessionaireEmailByStallId(stallId) {
  const rows = sheetToObjects(getSheet(SHEETS.CONCESSIONAIRES));
  return rows.find(r => r.StallID === stallId)?.Email || null;
}
