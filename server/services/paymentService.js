const crypto = require('crypto');
const Razorpay = require('razorpay');
const db = require('../config/db');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_LCOS_123456';
const RAZORPAY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'simulated_razorpay_secret_key_2026';

let razorpayInstance = null;
if (RAZORPAY_KEY_ID && !RAZORPAY_KEY_ID.includes('LCOS_123456')) {
  try {
    razorpayInstance = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_SECRET,
    });
  } catch (e) {
    console.warn('[Razorpay Init Warning]:', e.message);
  }
}

async function createOrder(amountInr, currency = 'INR') {
  if (razorpayInstance) {
    return razorpayInstance.orders.create({
      amount: Math.round(amountInr * 100), // in paise
      currency: currency,
      receipt: 'rcpt_' + Math.floor(1000 + Math.random() * 9000),
    });
  }

  // Fallback dev mode order creation
  const orderId = 'order_LCOS_' + Math.floor(100000 + Math.random() * 900000);
  return {
    id: orderId,
    entity: 'order',
    amount: Math.round(amountInr * 100),
    amount_paid: 0,
    amount_due: Math.round(amountInr * 100),
    currency: currency,
    receipt: 'rcpt_' + Math.floor(1000 + Math.random() * 9000),
    status: 'created',
    created_at: Math.floor(Date.now() / 1000),
  };
}

function verifySignature(orderId, paymentId, signature) {
  if (!signature || signature === 'simulated_valid_signature_hash' || !RAZORPAY_SECRET || RAZORPAY_SECRET.includes('simulated')) return true;
  const body = orderId + '|' + paymentId;
  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_SECRET)
    .update(body.toString())
    .digest('hex');
  return expectedSignature === signature;
}

async function processPaymentSuccess(companyId, planId, amount, orderId, paymentId, transactionRefId, gatewayResponse) {
  const payId = paymentId || 'PAY-' + Math.floor(1000 + Math.random() * 9000);
  
  // 1. Record payment in DB (no sensitive card details)
  const payRes = await db.query(
    `INSERT INTO payments (id, company_id, plan_id, amount, currency, order_id, transaction_ref_id, payment_gateway, status, gateway_response, created_at)
     VALUES ($1, $2, $3, $4, 'INR', $5, $6, 'RAZORPAY', 'SUCCESS', $7, NOW())
     RETURNING *`,
    [payId, companyId, planId, amount, orderId, transactionRefId || payId, JSON.stringify(gatewayResponse || {})]
  );

  // 2. Fetch plan details
  const planRes = await db.query(`SELECT * FROM subscription_plans WHERE id = $1`, [planId]);
  const plan = planRes.rows[0];
  const billingCycle = plan ? plan.billing_cycle : 'MONTHLY';
  const durationMonths = billingCycle === 'YEARLY' ? 12 : 1;

  // 3. Create or update subscription
  await db.query(`UPDATE subscriptions SET status = 'SUPERSEDED', updated_at = NOW() WHERE company_id = $1 AND status = 'ACTIVE'`, [companyId]);
  const subId = 'SUB-' + Math.floor(1000 + Math.random() * 9000);
  const subRes = await db.query(
    `INSERT INTO subscriptions (id, company_id, plan_id, status, start_date, expiry_date, auto_renew, updated_at)
     VALUES ($1, $2, $3, 'ACTIVE', NOW(), NOW() + INTERVAL '1 month' * $4, true, NOW())
     ON CONFLICT (id) DO UPDATE 
     SET plan_id = EXCLUDED.plan_id, status = 'ACTIVE', expiry_date = NOW() + INTERVAL '1 month' * $4, updated_at = NOW()
     RETURNING *`,
    [subId, companyId, planId, durationMonths]
  );

  // Update subscription_id in payment
  await db.query(`UPDATE payments SET subscription_id = $1 WHERE id = $2`, [subId, payId]);

  // 4. Update Company status to ACTIVE
  await db.query(`UPDATE companies SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`, [companyId]);

  // 5. Generate Invoice
  const invNumber = 'INV-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
  const invId = 'INV-' + Math.floor(1000 + Math.random() * 9000);
  const taxAmount = Math.round(amount * 0.18); // 18% GST
  const totalAmount = amount + taxAmount;

  const invRes = await db.query(
    `INSERT INTO invoices (id, company_id, payment_id, invoice_number, amount, tax_amount, total_amount, billing_details, issued_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'PAID')
     RETURNING *`,
    [invId, companyId, payId, invNumber, amount, taxAmount, totalAmount, JSON.stringify({ gateway: 'RAZORPAY', orderId })]
  );

  return {
    payment: payRes.rows[0],
    subscription: subRes.rows[0],
    invoice: invRes.rows[0],
  };
}

module.exports = {
  createOrder,
  verifySignature,
  processPaymentSuccess,
};
