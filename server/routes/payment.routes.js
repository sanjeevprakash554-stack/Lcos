const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticateToken, optionalAuthenticateToken, authorizeRoles, JWT_SECRET } = require('../middleware/auth');
const { createOrder, verifySignature, processPaymentSuccess } = require('../services/paymentService');

// POST /api/payments/create-order
router.post('/create-order', optionalAuthenticateToken, async (req, res) => {
  try {
    const { planId } = req.body;
    const companyId = (req.user && req.user.companyId) || 'COMP-001';

    const planRes = await db.query(`SELECT * FROM subscription_plans WHERE id = $1`, [planId]);
    if (planRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invalid subscription plan selected' });
    }

    const plan = planRes.rows[0];
    const order = await createOrder(plan.price_inr, 'INR');

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_TCr9Me1AydiZMF',
      plan: {
        id: plan.id,
        name: plan.name,
        priceInr: plan.price_inr,
      },
    });
  } catch (err) {
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

    const planRes = await db.query(`SELECT * FROM subscription_plans WHERE id = $1`, [planId]);
    const amount = planRes.rows[0] ? Number(planRes.rows[0].price_inr) : 2999;

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
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/payments/webhook (Indian Gateway Webhook handling)
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body.event;
    const payload = req.body.payload;

    console.log(`[Payment Webhook Received]: Event ${event}`);

    if (event === 'payment.captured' && payload) {
      const paymentEntity = payload.payment.entity;
      const notes = paymentEntity.notes || {};
      const companyId = notes.companyId || 'COMP-001';
      const planId = notes.planId || 'PLAN-PRO';
      const amount = paymentEntity.amount / 100;

      await processPaymentSuccess(companyId, planId, amount, paymentEntity.order_id, paymentEntity.id, paymentEntity.id, payload);
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
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
