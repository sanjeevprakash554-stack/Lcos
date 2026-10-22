const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// GET /api/admin/settings
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM system_settings`);
    const settings = {};
    result.rows.forEach(r => {
      settings[r.key] = r.value;
    });
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/settings (Update Settings, e.g., 20-min stoppage threshold)
router.post('/settings', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER'), async (req, res) => {
  try {
    const { key, value } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ success: false, message: 'Setting key and value required' });
    }

    const result = await db.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING *`,
      [key, JSON.stringify(value)]
    );

    res.json({ success: true, setting: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/saas-stats (Super Admin Dashboard Revenue & System Metrics)
router.get('/saas-stats', authenticateToken, authorizeRoles('SUPER_ADMIN'), async (req, res) => {
  try {
    const totalCompaniesRes = await db.query(`SELECT COUNT(*) FROM companies`);
    const activeSubsRes = await db.query(`SELECT COUNT(*) FROM subscriptions WHERE status = 'ACTIVE'`);
    const revenueRes = await db.query(`SELECT SUM(amount) FROM payments WHERE status = 'SUCCESS'`);
    const totalVehiclesRes = await db.query(`SELECT COUNT(*) FROM vehicles`);

    res.json({
      success: true,
      stats: {
        totalCompanies: parseInt(totalCompaniesRes.rows[0].count, 10),
        activeSubscriptions: parseInt(activeSubsRes.rows[0].count, 10),
        totalRevenueInr: parseFloat(revenueRes.rows[0].sum || 0),
        totalVehiclesManaged: parseInt(totalVehiclesRes.rows[0].count, 10),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
