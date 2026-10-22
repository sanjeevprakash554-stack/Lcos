const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, optionalAuthenticateToken, authorizeRoles } = require('../middleware/auth');

// GET /api/subscriptions/plans (Public & Protected)
router.get('/plans', async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM subscription_plans WHERE is_active = true ORDER BY price_inr ASC`);
    res.json({ success: true, plans: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/subscriptions/plans (Super Admin Configurable Plans)
router.post('/plans', authenticateToken, authorizeRoles('SUPER_ADMIN'), async (req, res) => {
  try {
    const { id, name, billingCycle, priceInr, maxVehicles, maxUsers, features } = req.body;

    if (!id || !name || priceInr === undefined) {
      return res.status(400).json({ success: false, message: 'Plan id, name, and price in INR required' });
    }

    const result = await db.query(
      `INSERT INTO subscription_plans (id, name, billing_cycle, price_inr, max_vehicles, max_users, features, is_active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
       ON CONFLICT (id) DO UPDATE 
       SET name = EXCLUDED.name, billing_cycle = EXCLUDED.billing_cycle, price_inr = EXCLUDED.price_inr,
           max_vehicles = EXCLUDED.max_vehicles, max_users = EXCLUDED.max_users, features = EXCLUDED.features, updated_at = NOW()
       RETURNING *`,
      [id, name, billingCycle || 'MONTHLY', priceInr, maxVehicles || 50, maxUsers || 10, JSON.stringify(features || [])]
    );

    res.json({ success: true, plan: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/subscriptions/current
router.get('/current', optionalAuthenticateToken, async (req, res) => {
  try {
    const companyId = (req.user && req.user.companyId) || 'COMP-001';
    const query = `
      SELECT s.*, p.name AS plan_name, p.billing_cycle, p.price_inr, p.max_vehicles, p.max_users, p.features,
             c.name AS company_name, c.status AS company_status
      FROM subscriptions s
      LEFT JOIN subscription_plans p ON p.id = s.plan_id
      LEFT JOIN companies c ON c.id = s.company_id
      WHERE s.company_id = $1
      ORDER BY (CASE WHEN s.status = 'ACTIVE' THEN 1 ELSE 2 END), s.updated_at DESC, s.created_at DESC
      LIMIT 1
    `;
    const result = await db.query(query, [companyId]);

    if (result.rows.length === 0) {
      return res.json({ success: true, subscription: null, isExpired: true, message: 'No active subscription found' });
    }

    const sub = result.rows[0];
    const isExpired = new Date(sub.expiry_date) < new Date() || sub.status !== 'ACTIVE';

    if (isExpired && sub.status === 'ACTIVE') {
      await db.query(`UPDATE subscriptions SET status = 'EXPIRED' WHERE id = $1`, [sub.id]);
      await db.query(`UPDATE companies SET status = 'EXPIRED' WHERE id = $1`, [companyId]);
      sub.status = 'EXPIRED';
      sub.company_status = 'EXPIRED';
    }

    res.json({ success: true, subscription: sub, isExpired });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/subscriptions/simulate-status (For test toggle on landing page)
router.post('/simulate-status', optionalAuthenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const companyId = (req.user && req.user.companyId) || 'COMP-001';

    if (status === 'EXPIRED') {
      await db.query(`UPDATE subscriptions SET status = 'EXPIRED', expiry_date = NOW() - INTERVAL '1 day', updated_at = NOW() WHERE company_id = $1`, [companyId]);
      await db.query(`UPDATE companies SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`, [companyId]);
    } else {
      await db.query(`UPDATE subscriptions SET status = 'ACTIVE', expiry_date = NOW() + INTERVAL '30 days', updated_at = NOW() WHERE company_id = $1`, [companyId]);
      await db.query(`UPDATE companies SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`, [companyId]);
    }

    res.json({ success: true, message: `Subscription status set to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
