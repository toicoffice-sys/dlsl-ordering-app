// ============================================================
// DLSL Ordering App — Notifications.js
// All outbound email notifications
// ============================================================

const APP_NAME  = 'DLSL Ordering App';
const APP_COLOR = '#1B5E20';
const APP_GOLD  = '#C9A84C';

function emailWrapper(content) {
  return `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
  <div style="background:${APP_COLOR};padding:20px 28px;display:flex;align-items:center;">
    <span style="color:${APP_GOLD};font-size:20px;font-weight:bold;">${APP_NAME}</span>
    <span style="color:#a5d6a7;margin-left:8px;font-size:13px;">| De La Salle Lipa</span>
  </div>
  <div style="padding:28px;background:#fff;">${content}</div>
  <div style="background:#f5f5f5;padding:14px 28px;font-size:12px;color:#9e9e9e;text-align:center;">
    This is an automated message from ${APP_NAME} &bull; RESGO, DLSL
  </div>
</div>`;
}

function btn(label, note) {
  return `<p style="margin:24px 0 0;">
    <span style="display:inline-block;background:${APP_COLOR};color:#fff;padding:10px 24px;border-radius:6px;font-weight:bold;">${label}</span>
    ${note ? `<span style="margin-left:10px;color:#555;font-size:13px;">${note}</span>` : ''}
  </p>`;
}

function statusBadge(status) {
  const map = {
    pending:   ['#FF9800','Pending'],
    confirmed: ['#2196F3','Confirmed'],
    preparing: ['#9C27B0','Preparing'],
    ready:     [APP_COLOR,'Ready for Pickup'],
    completed: ['#4CAF50','Completed'],
    cancelled: ['#F44336','Cancelled']
  };
  const [color, label] = map[status] || ['#9e9e9e', status];
  return `<span style="display:inline-block;background:${color};color:#fff;padding:4px 12px;border-radius:12px;font-size:13px;font-weight:bold;">${label}</span>`;
}

// OTP
function sendOTPEmail(name, email, otp) {
  const body = emailWrapper(`
    <p>Hello, <strong>${name}</strong>!</p>
    <p>Your One-Time Password (OTP) to log in to the <strong>${APP_NAME}</strong> is:</p>
    <div style="text-align:center;padding:24px 0;">
      <span style="font-size:40px;font-weight:bold;letter-spacing:10px;color:${APP_COLOR};">${otp}</span>
    </div>
    <p style="color:#757575;font-size:13px;">This OTP expires in <strong>10 minutes</strong>. Never share it with anyone.</p>
  `);
  MailApp.sendEmail({ to: email, subject: `${APP_NAME} — Your OTP Code`, htmlBody: body });
}

// Account created
function notifyAccountCreated(email, name, role) {
  const roleLabel = { student:'Student', parent:'Parent', partner:'Partner',
                      concessionaire:'Concessionaire', admin:'Admin' }[role] || role;
  const body = emailWrapper(`
    <p>Hello, <strong>${name}</strong>!</p>
    <p>Your <strong>${APP_NAME}</strong> account has been created with role: <strong>${roleLabel}</strong>.</p>
    <p>You may now log in using this email address and a One-Time Password (OTP) sent to your inbox at login time.</p>
    <p style="color:#757575;font-size:13px;">If you did not expect this, please contact RESGO.</p>
  `);
  MailApp.sendEmail({ to: email, subject: `Welcome to ${APP_NAME}`, htmlBody: body });
}

// New order — notify concessionaire
function notifyNewOrder(stallEmail, customerName, orderId, pickupCode, items, total, paymentMethod) {
  if (!stallEmail) return;
  const itemList = (items || []).map(i =>
    `<tr><td style="padding:6px 0;">${i.name}</td><td style="text-align:center;">${i.qty}</td><td style="text-align:right;">₱${Number(i.subtotal).toFixed(2)}</td></tr>`
  ).join('');

  const body = emailWrapper(`
    <p>You have a new order!</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;">
      <tr style="background:#f5f5f5;">
        <th style="text-align:left;padding:6px;">Item</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Subtotal</th>
      </tr>
      ${itemList}
      <tr style="border-top:2px solid #e0e0e0;font-weight:bold;">
        <td colspan="2" style="padding:8px 0;">Total</td>
        <td style="text-align:right;">₱${Number(total).toFixed(2)}</td>
      </tr>
    </table>
    <p><strong>Customer:</strong> ${customerName}<br>
       <strong>Order ID:</strong> ${orderId}<br>
       <strong>Pickup Code:</strong> <span style="font-size:20px;font-weight:bold;color:${APP_COLOR};">${pickupCode}</span><br>
       <strong>Payment:</strong> ${paymentMethod.replace(/_/g,' ').toUpperCase()}</p>
    <p style="color:#757575;font-size:13px;">Log in to the app to confirm and start preparing this order.</p>
  `);
  MailApp.sendEmail({ to: stallEmail, subject: `New Order — ${orderId}`, htmlBody: body });
}

// Order placed — notify customer
function notifyCustomerOrderPlaced(email, name, orderId, pickupCode, stallName, items, total) {
  const itemList = (items || []).map(i =>
    `<tr><td style="padding:6px 0;">${i.name}</td><td style="text-align:center;">${i.qty}</td><td style="text-align:right;">₱${Number(i.subtotal).toFixed(2)}</td></tr>`
  ).join('');

  const body = emailWrapper(`
    <p>Hello, <strong>${name}</strong>! Your order has been placed.</p>
    <p><strong>Stall:</strong> ${stallName}<br>
       <strong>Order ID:</strong> ${orderId}</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;">
      <tr style="background:#f5f5f5;">
        <th style="text-align:left;padding:6px;">Item</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Subtotal</th>
      </tr>
      ${itemList}
      <tr style="border-top:2px solid #e0e0e0;font-weight:bold;">
        <td colspan="2" style="padding:8px 0;">Total</td>
        <td style="text-align:right;">₱${Number(total).toFixed(2)}</td>
      </tr>
    </table>
    <div style="background:#E8F5E9;border-radius:8px;padding:16px;text-align:center;margin:16px 0;">
      <p style="margin:0;color:#555;font-size:13px;">Your Pickup Code</p>
      <p style="margin:8px 0 0;font-size:36px;font-weight:bold;letter-spacing:6px;color:${APP_COLOR};">${pickupCode}</p>
      <p style="margin:8px 0 0;font-size:12px;color:#888;">Show this code when picking up your order.</p>
    </div>
    <p style="color:#757575;font-size:13px;">You will receive another email when your order status changes. Thank you!</p>
  `);
  MailApp.sendEmail({ to: email, subject: `Order Confirmed — ${orderId}`, htmlBody: body });
}

// Order status update — notify customer
function notifyOrderStatusUpdate(email, name, orderId, stallName, status, pickupCode, message) {
  if (!email) return;

  const readyExtra = status === 'ready'
    ? `<div style="background:#E8F5E9;border-radius:8px;padding:16px;text-align:center;margin:16px 0;">
        <p style="margin:0;font-size:13px;color:#555;">Your Pickup Code</p>
        <p style="margin:8px 0 0;font-size:36px;font-weight:bold;letter-spacing:6px;color:${APP_COLOR};">${pickupCode}</p>
        <p style="margin:8px 0 0;font-size:12px;color:#888;">Proceed to ${stallName} and show this code.</p>
       </div>` : '';

  const body = emailWrapper(`
    <p>Hello, <strong>${name}</strong>!</p>
    <p>Your order <strong>${orderId}</strong> at <strong>${stallName}</strong> has been updated:</p>
    <p style="margin:16px 0;">${statusBadge(status)}</p>
    ${message ? `<p style="background:#FFF8E1;padding:12px;border-radius:6px;font-size:14px;color:#5D4037;">${message}</p>` : ''}
    ${readyExtra}
    <p style="color:#757575;font-size:13px;">Log in to the app to view your full order history.</p>
  `);

  const subjects = {
    confirmed: 'Order Confirmed',
    preparing: 'Your Order is Being Prepared',
    ready:     '🎉 Your Order is Ready for Pickup!',
    completed: 'Order Completed — Thank you!',
    cancelled: 'Order Cancelled'
  };

  MailApp.sendEmail({ to: email, subject: `${subjects[status] || 'Order Update'} — ${orderId}`, htmlBody: body });
}

// Product approval notification
function notifyProductApproval(email, productName, status, reason) {
  const approved = status === APPROVAL.APPROVED;
  const body = emailWrapper(`
    <p>Hello!</p>
    <p>Your product <strong>${productName}</strong> has been <strong>${approved ? 'approved' : 'rejected'}</strong>.</p>
    ${!approved && reason ? `<p style="background:#FFEBEE;padding:12px;border-radius:6px;font-size:14px;color:#c62828;"><strong>Reason:</strong> ${reason}</p>` : ''}
    ${approved
      ? `<p>Your product is now visible to customers in the app.</p>`
      : `<p>Please review your product and resubmit. Contact RESGO if you have questions.</p>`
    }
  `);
  MailApp.sendEmail({
    to: email,
    subject: `Product ${approved ? 'Approved' : 'Rejected'} — ${productName}`,
    htmlBody: body
  });
}

// Menu submission — notify admin
function notifyAdminMenuSubmission(stallName, productName) {
  try {
    const adminRows = sheetToObjects(getSheet(SHEETS.USERS)).filter(r => r.Role === ROLES.ADMIN && r.Status === 'active');
    if (!adminRows.length) return;

    const body = emailWrapper(`
      <p><strong>${stallName}</strong> has submitted a new product for approval:</p>
      <p style="font-size:18px;font-weight:bold;color:${APP_COLOR};">${productName}</p>
      <p>Log in as Admin to review and approve the pending menu items.</p>
    `);
    adminRows.forEach(admin => {
      MailApp.sendEmail({ to: admin.Email, subject: `Menu Approval Required — ${stallName}`, htmlBody: body });
    });
  } catch (e) { /* non-critical */ }
}

// Stall approval notification
function notifyStallApproval(email, stallName, status) {
  const approved = status === APPROVAL.APPROVED;
  const body = emailWrapper(`
    <p>Hello <strong>${stallName}</strong>!</p>
    <p>Your stall registration has been <strong>${approved ? 'approved' : 'rejected'}</strong>.</p>
    ${approved
      ? `<p>You can now log in to the ${APP_NAME} to manage your menu, view orders, and set your operating hours.</p>`
      : `<p>Please contact RESGO for more information.</p>`
    }
  `);
  MailApp.sendEmail({ to: email, subject: `Stall ${approved ? 'Approved' : 'Rejected'} — ${stallName}`, htmlBody: body });
}
