const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticateToken, optionalAuthenticateToken, authorizeRoles, JWT_SECRET } = require('../middleware/auth');
const { createOrder, verifySignature, verifyWebhookSignature, processPaymentSuccess } = require('../services/paymentService');

// Default fallback plans if DB is cold or during first-boot migration
const DEFAULT_PLANS = {
  'PLAN-BASIC': { id: 'PLAN-BASIC', name: 'Starter Logistics Plan', price_inr: 999 },
  'PLAN-PRO': { id: 'PLAN-PRO', name: 'Fleet Professional Plan', price_inr: 2999 },
  'PLAN-ENT': { id: 'PLAN-ENT', name: 'Enterprise Operations Plan', price_inr: 19999 },
};

// POST /api/payments/create-order
router.post('/create-order', optionalAuthenticateToken, async (req, res) => {
  try {
    const { planId } = req.body;
    const companyId = (req.user && req.user.companyId) || 'COMP-001';

    let plan = null;
    try {
      const planRes = await db.query(`SELECT * FROM subscription_plans WHERE id = $1`, [planId]);
      if (planRes.rows.length > 0) plan = planRes.rows[0];
    } catch (_) {}

    if (!plan) {
      plan = DEFAULT_PLANS[planId];
    }

    if (!plan) {
      return res.status(404).json({ success: false, message: 'Invalid subscription plan selected' });
    }

    const order = await createOrder(plan.price_inr, 'INR');

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_TCr9Me1AydiZMF',
      plan: {
        id: plan.id,
        name: plan.name,
        priceInr: plan.price_inr,
      },
    });
  } catch (err) {
    console.error('Payment order creation error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/payments/verify
router.post('/verify', optionalAuthenticateToken, async (req, res) => {
  try {
    const { orderId, paymentId, signature, planId } = req.body;
    const companyId = (req.user && req.user.companyId) || 'COMP-001';

    const isValid = verifySignature(orderId, paymentId, signature);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature verification failed' });
    }

    let amount = 2999;
    try {
      const planRes = await db.query(`SELECT * FROM subscription_plans WHERE id = $1`, [planId]);
      if (planRes.rows[0]) amount = Number(planRes.rows[0].price_inr);
      else if (DEFAULT_PLANS[planId]) amount = DEFAULT_PLANS[planId].price_inr;
    } catch (_) {
      if (DEFAULT_PLANS[planId]) amount = DEFAULT_PLANS[planId].price_inr;
    }

    const result = await processPaymentSuccess(companyId, planId, amount, orderId, paymentId, paymentId, { signature, status: 'SUCCESS' });

    // Generate JWT token for immediate access
    const payload = {
      id: req.user ? req.user.id : 'usr_owner_01',
      companyId: companyId,
      username: 'owner',
      fullName: 'Executive Owner',
      role: 'OWNER',
      empId: 'EMP-001',
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      success: true,
      message: 'Payment verified and subscription activated successfully!',
      token,
      payment: result.payment,
      subscription: result.subscription,
      invoice: result.invoice,
    });
  } catch (err) {
    console.error('Payment verification error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/payments/webhook (Indian Gateway Webhook handling)
router.post('/webhook', (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (signature) {
    if (!webhookSecret) {
      console.warn('❌ [Razorpay Webhook] Webhook secret not configured on server.');
      return res.status(400).json({ status: 'missing_webhook_secret' });
    }
    const isValid = verifyWebhookSignature(req.rawBody || JSON.stringify(req.body), signature, webhookSecret);
    if (!isValid) {
      console.warn('❌ [Razorpay Webhook] Invalid signature rejected.');
      return res.status(400).json({ status: 'invalid_signature' });
    }
  }

  // Fast acknowledge 200 OK immediately so Razorpay does not retry or timeout
  res.status(200).json({ status: 'ok' });

  // Process payment captured event asynchronously in background
  setImmediate(async () => {
    try {
      const event = req.body?.event;
      const payload = req.body?.payload;

      console.log(`[Payment Webhook Received]: Event ${event}`);

      if (event === 'payment.captured' && payload) {
        const paymentEntity = payload.payment.entity;
        const notes = paymentEntity.notes || {};
        const companyId = notes.companyId || 'COMP-001';
        const planId = notes.planId || 'PLAN-PRO';
        const amount = paymentEntity.amount / 100;

        await processPaymentSuccess(companyId, planId, amount, paymentEntity.order_id, paymentEntity.id, paymentEntity.id, payload);
        console.log(`✅ [Payment Webhook] Activated subscription for company ${companyId} (plan: ${planId}, amount: ₹${amount})`);
      }
    } catch (err) {
      console.error('Async payment webhook processing error:', err);
    }
  });
});

// GET /api/payments/history
router.get('/history', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER'), async (req, res) => {
  try {
    const companyId = req.user.role === 'SUPER_ADMIN' ? (req.query.companyId || req.user.companyId) : req.user.companyId;
    let query = `
      SELECT p.*, c.name AS company_name, sp.name AS plan_name
      FROM payments p
      LEFT JOIN companies c ON c.id = p.company_id
      LEFT JOIN subscription_plans sp ON sp.id = p.plan_id
    `;
    const params = [];
    if (companyId) {
      params.push(companyId);
      query += ` WHERE p.company_id = $1`;
    }
    query += ` ORDER BY p.created_at DESC`;

    const result = await db.query(query, params);
    res.json({ success: true, payments: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
