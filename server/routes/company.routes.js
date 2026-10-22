const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// GET /api/companies (Super Admin & Owner)
router.get('/', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER'), async (req, res) => {
  try {
    const query = `
      SELECT c.*, s.status AS subscription_status, p.name AS plan_name, s.expiry_date
      FROM companies c
      LEFT JOIN subscriptions s ON s.company_id = c.id
      LEFT JOIN subscription_plans p ON p.id = s.plan_id
      ORDER BY c.created_at DESC
    `;
    const result = await db.query(query);
    res.json({ success: true, companies: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/companies/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Company not found' });
    res.json({ success: true, company: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
