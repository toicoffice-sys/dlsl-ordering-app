// ============================================================
// DLSL Ordering App — Orders.js
// Order placement, tracking, status management
// ============================================================

const SERVICE_FEE = 0; // Set to e.g. 5 for a ₱5 convenience fee

// ------------------------------------------------------------
// Customer: place order
// ------------------------------------------------------------

function placeOrder(token, orderData) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const { stallId, items, paymentMethod, paymentRef, notes, proofData, proofMimeType } = orderData || {};

  if (!stallId || !items || !items.length)
    return { success: false, error: 'Stall and items are required.' };

  const validMethods = ['cash_on_pickup', 'gcash', 'maya'];
  if (!validMethods.includes(paymentMethod))
    return { success: false, error: 'Invalid payment method.' };

  // Ensure Orders sheet has correct column layout (auto-repairs if ProofURL column is missing)
  _ensureOrdersSheetRepaired();

  // Validate stall
  const concessionaires = getConcessionaires(true);
  const stall = concessionaires.find(c => String(c.StallID) === String(stallId));
  if (!stall) return { success: false, error: 'Stall not found or not accepting orders.' };
  if (stall.Status === 'offline') return { success: false, error: `${stall.StallName} is currently offline and not accepting orders.` };

  // Validate items and stock
  const productSheet  = getSheet(SHEETS.PRODUCTS);
  const productRows   = productSheet.getDataRange().getValues();
  const productHeaders = productRows[0];

  let subtotal = 0;
  const validatedItems = [];

  for (const item of items) {
    let found = false;
    for (let i = 1; i < productRows.length; i++) {
      const p = Object.fromEntries(productHeaders.map((h, j) => [h, productRows[i][j]]));
      if (p.ProductID !== item.productId) continue;
      if (p.StallID !== stallId) return { success: false, error: `Product ${p.Name} does not belong to this stall.` };
      if (p.ApprovalStatus !== APPROVAL.APPROVED) return { success: false, error: `Product ${p.Name} is not available.` };
      if (!p.IsAvailable) return { success: false, error: `${p.Name} is currently unavailable.` };

      const qty = Math.max(1, parseInt(item.qty) || 1);
      if (p.Stock >= 0 && p.Stock < qty)
        return { success: false, error: `Insufficient stock for ${p.Name}. Available: ${p.Stock}.` };

      const lineTotal = Number(p.Price) * qty;
      subtotal += lineTotal;
      validatedItems.push({ productId: p.ProductID, name: p.Name, price: Number(p.Price), qty, subtotal: lineTotal });

      // Deduct stock if tracked
      if (p.Stock >= 0) {
        productSheet.getRange(i + 1, productHeaders.indexOf('Stock') + 1).setValue(p.Stock - qty);
      }
      found = true;
      break;
    }
    if (!found) return { success: false, error: `Product not found: ${item.productId}.` };
  }

  const total      = subtotal + SERVICE_FEE;
  const orderId    = genId('ORD');
  const pickupCode = genPickupCode();
  const timestamp  = now();

  const payStatus = paymentMethod === 'cash_on_pickup' ? 'pending' : 'awaiting_confirmation';

  // Upload proof of payment to Drive if provided
  const proofUrl = (paymentMethod !== 'cash_on_pickup' && proofData)
    ? savePaymentProof(proofData, proofMimeType, `proof_${orderId}.${(proofMimeType||'image/jpeg').split('/')[1]}`)
    : '';

  appendNamedRow(getSheet(SHEETS.ORDERS), {
    OrderID:       orderId,
    CustomerEmail: session.email,
    CustomerName:  session.userData.name,
    StallID:       stallId,
    StallName:     stall.StallName,
    Items:         JSON.stringify(validatedItems),
    Subtotal:      subtotal,
    ServiceFee:    SERVICE_FEE,
    Total:         total,
    PaymentMethod: paymentMethod,
    PaymentRef:    paymentRef || '',
    ProofURL:      proofUrl,
    PaymentStatus: payStatus,
    Status:        ORDER_STATUS.PENDING,
    PickupCode:    pickupCode,
    Notes:         (notes || '').trim(),
    CreatedAt:     timestamp,
    UpdatedAt:     timestamp
  });

  logAudit(session.email, 'CREATE', 'Orders', orderId, `Stall: ${stall.StallName}, Total: ${total}, Payment: ${paymentMethod}`);

  // Notify concessionaire + customer
  notifyNewOrder(stall.Email, session.userData.name, orderId, pickupCode, validatedItems, total, paymentMethod);
  notifyCustomerOrderPlaced(session.email, session.userData.name, orderId, pickupCode, stall.StallName, validatedItems, total);

  return { success: true, orderId, pickupCode, total };
}

// ------------------------------------------------------------
// Customer: view own orders
// ------------------------------------------------------------

function getMyOrders(token) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const rows = sheetToObjects(getSheet(SHEETS.ORDERS));
  const orders = rows
    .filter(r => (r.CustomerEmail || '').toLowerCase() === session.email.toLowerCase())
    .map(r => ({ ...r, Items: safeParseJSON(r.Items) }))
    .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));

  return { success: true, orders };
}

function getOrderDetail(token, orderId) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const rows = sheetToObjects(getSheet(SHEETS.ORDERS));
  const order = rows.find(r => r.OrderID === orderId);
  if (!order) return { success: false, error: 'Order not found.' };

  // Customers can only see their own orders
  if (session.role !== ROLES.ADMIN &&
      session.role !== ROLES.CONCESSIONAIRE &&
      order.CustomerEmail.toLowerCase() !== session.email.toLowerCase())
    return { success: false, error: 'Unauthorized.' };

  return { success: true, order: { ...order, Items: safeParseJSON(order.Items) } };
}

// ------------------------------------------------------------
// Concessionaire: manage orders for their stall
// ------------------------------------------------------------

function getStallOrders(token, filter) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const stall = session.role === ROLES.ADMIN ? null : getStallByEmail(session.email);
  if (!stall && session.role !== ROLES.ADMIN)
    return { success: false, error: 'Stall not found.' };

  const rows = sheetToObjects(getSheet(SHEETS.ORDERS));
  let orders = rows
    .filter(r => stall ? String(r.StallID) === String(stall.StallID) : true)
    .map(r => ({ ...r, Items: safeParseJSON(r.Items) }))
    .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));

  if (filter?.status) orders = orders.filter(r => r.Status === filter.status);
  if (filter?.date)   orders = orders.filter(r => r.CreatedAt?.startsWith(filter.date));

  return { success: true, orders };
}

function updateOrderStatus(token, orderId, status, message) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const allowed = Object.values(ORDER_STATUS);
  if (!allowed.includes(status)) return { success: false, error: 'Invalid status.' };

  const sheet   = getSheet(SHEETS.ORDERS);
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== orderId) continue;

    const stallId  = rows[i][headers.indexOf('StallID')];
    const ownStall = getStallByEmail(session.email);

    if (session.role === ROLES.CONCESSIONAIRE && ownStall?.StallID !== stallId)
      return { success: false, error: 'Unauthorized.' };

    sheet.getRange(i + 1, headers.indexOf('Status') + 1).setValue(status);
    sheet.getRange(i + 1, headers.indexOf('UpdatedAt') + 1).setValue(now());

    const customerEmail = rows[i][headers.indexOf('CustomerEmail')];
    const customerName  = rows[i][headers.indexOf('CustomerName')];
    const stallName     = rows[i][headers.indexOf('StallName')];
    const pickupCode    = rows[i][headers.indexOf('PickupCode')];

    logAudit(session.email, 'UPDATE', 'Orders', orderId, `Status → ${status}${message ? ': ' + message : ''}`);
    notifyOrderStatusUpdate(customerEmail, customerName, orderId, stallName, status, pickupCode, message);

    return { success: true };
  }
  return { success: false, error: 'Order not found.' };
}

function confirmPayment(token, orderId) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const sheet   = getSheet(SHEETS.ORDERS);
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== orderId) continue;

    const stallId       = rows[i][headers.indexOf('StallID')];
    const ownStall      = getStallByEmail(session.email);
    const isAdmin       = session.role === ROLES.ADMIN;

    if (!isAdmin && ownStall?.StallID !== stallId)
      return { success: false, error: 'Unauthorized.' };

    const customerEmail = rows[i][headers.indexOf('CustomerEmail')];
    const customerName  = rows[i][headers.indexOf('CustomerName')];
    const stallName     = rows[i][headers.indexOf('StallName')];
    const pickupCode    = rows[i][headers.indexOf('PickupCode')];

    // Mark payment as paid and auto-confirm the order
    sheet.getRange(i + 1, headers.indexOf('PaymentStatus') + 1).setValue('paid');
    sheet.getRange(i + 1, headers.indexOf('Status') + 1).setValue(ORDER_STATUS.CONFIRMED);
    sheet.getRange(i + 1, headers.indexOf('UpdatedAt') + 1).setValue(now());

    logAudit(session.email, 'UPDATE', 'Orders', orderId, 'Payment verified → Status: confirmed');

    // Notify customer: payment verified + order confirmed
    notifyPaymentVerified(customerEmail, customerName, orderId, stallName);
    notifyOrderStatusUpdate(customerEmail, customerName, orderId, stallName, ORDER_STATUS.CONFIRMED, pickupCode, 'Your payment has been verified. Your order is now confirmed and will be prepared shortly.');

    return { success: true };
  }
  return { success: false, error: 'Order not found.' };
}

// ------------------------------------------------------------
// Concessionaire: reject payment (bogus/fake)
// ------------------------------------------------------------

function rejectPayment(token, orderId, reason) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const sheet   = getSheet(SHEETS.ORDERS);
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== orderId) continue;

    const stallId  = rows[i][headers.indexOf('StallID')];
    const ownStall = getStallByEmail(session.email);
    const isAdmin  = session.role === ROLES.ADMIN;

    if (!isAdmin && ownStall?.StallID !== stallId)
      return { success: false, error: 'Unauthorized.' };

    const currentStatus = rows[i][headers.indexOf('Status')];
    if ([ORDER_STATUS.PREPARING, ORDER_STATUS.READY, ORDER_STATUS.COMPLETED].includes(currentStatus))
      return { success: false, error: 'Cannot reject payment — order is already being prepared.' };

    const customerEmail = rows[i][headers.indexOf('CustomerEmail')];
    const customerName  = rows[i][headers.indexOf('CustomerName')];
    const stallName     = rows[i][headers.indexOf('StallName')];

    // Mark payment as rejected and cancel the order
    sheet.getRange(i + 1, headers.indexOf('PaymentStatus') + 1).setValue('rejected');
    sheet.getRange(i + 1, headers.indexOf('Status') + 1).setValue(ORDER_STATUS.CANCELLED);
    sheet.getRange(i + 1, headers.indexOf('UpdatedAt') + 1).setValue(now());

    // Restore stock
    const items = safeParseJSON(rows[i][headers.indexOf('Items')]);
    restoreStock(items);

    logAudit(session.email, 'UPDATE', 'Orders', orderId, `Payment rejected. Reason: ${reason}`);

    // Notify customer
    notifyPaymentRejected(customerEmail, customerName, orderId, stallName, reason);

    return { success: true };
  }
  return { success: false, error: 'Order not found.' };
}

// ------------------------------------------------------------
// Customer: cancel order
// ------------------------------------------------------------

function cancelOrder(token, orderId) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  const sheet   = getSheet(SHEETS.ORDERS);
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== orderId) continue;

    const custEmail = rows[i][headers.indexOf('CustomerEmail')];
    if (custEmail.toLowerCase() !== session.email.toLowerCase() && session.role !== ROLES.ADMIN)
      return { success: false, error: 'Unauthorized.' };

    const currentStatus = rows[i][headers.indexOf('Status')];
    if ([ORDER_STATUS.PREPARING, ORDER_STATUS.READY, ORDER_STATUS.COMPLETED].includes(currentStatus))
      return { success: false, error: 'Cannot cancel — order is already being prepared or ready for pickup.' };

    sheet.getRange(i + 1, headers.indexOf('Status') + 1).setValue(ORDER_STATUS.CANCELLED);
    sheet.getRange(i + 1, headers.indexOf('UpdatedAt') + 1).setValue(now());

    // Restore stock
    const items = safeParseJSON(rows[i][headers.indexOf('Items')]);
    restoreStock(items);

    logAudit(session.email, 'DELETE', 'Orders', orderId, 'Order cancelled by customer');

    return { success: true };
  }
  return { success: false, error: 'Order not found.' };
}

// ------------------------------------------------------------
// Ratings
// ------------------------------------------------------------

function submitRating(token, stallId, orderId, stars, comment) {
  const session = validateSession(token);
  if (!session) return { success: false, error: 'Session expired.' };

  stars = parseInt(stars);
  if (isNaN(stars) || stars < 1 || stars > 5)
    return { success: false, error: 'Rating must be between 1 and 5.' };

  // Verify the order belongs to the user and is completed
  const orderRows = sheetToObjects(getSheet(SHEETS.ORDERS));
  const order = orderRows.find(r => r.OrderID === orderId);
  if (!order) return { success: false, error: 'Order not found.' };
  if (order.CustomerEmail.toLowerCase() !== session.email.toLowerCase())
    return { success: false, error: 'Unauthorized.' };
  if (order.Status !== ORDER_STATUS.COMPLETED)
    return { success: false, error: 'You can only rate completed orders.' };

  // Check for duplicate rating
  const ratingRows = sheetToObjects(getSheet(SHEETS.RATINGS));
  if (ratingRows.some(r => r.OrderID === orderId && r.CustomerEmail.toLowerCase() === session.email.toLowerCase()))
    return { success: false, error: 'You have already rated this order.' };

  getSheet(SHEETS.RATINGS).appendRow([
    genId('RTG'), session.email, stallId, orderId, stars, (comment || '').trim(), now()
  ]);

  recalculateStallRating(stallId);

  return { success: true };
}

function getStallRatings(stallId) {
  const rows = sheetToObjects(getSheet(SHEETS.RATINGS));
  return rows.filter(r => r.StallID === stallId)
             .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function genPickupCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return []; }
}

function recalculateStallRating(stallId) {
  const ratings = sheetToObjects(getSheet(SHEETS.RATINGS)).filter(r => r.StallID === stallId);
  if (!ratings.length) return;

  const avg   = ratings.reduce((s, r) => s + Number(r.Stars), 0) / ratings.length;
  const sheet = getSheet(SHEETS.CONCESSIONAIRES);
  const rows  = sheet.getDataRange().getValues();
  const hdr   = rows[0];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === stallId) {
      sheet.getRange(i + 1, hdr.indexOf('Rating') + 1).setValue(Math.round(avg * 10) / 10);
      sheet.getRange(i + 1, hdr.indexOf('TotalRatings') + 1).setValue(ratings.length);
      break;
    }
  }
}

function restoreStock(items) {
  if (!items || !items.length) return;
  const sheet   = getSheet(SHEETS.PRODUCTS);
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  for (const item of items) {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] !== item.productId) continue;
      const currentStock = rows[i][headers.indexOf('Stock')];
      if (currentStock >= 0) {
        sheet.getRange(i + 1, headers.indexOf('Stock') + 1).setValue(currentStock + item.qty);
      }
      break;
    }
  }
}
