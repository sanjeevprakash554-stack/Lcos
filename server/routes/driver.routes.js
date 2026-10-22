const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// GET /api/drivers
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId || 'COMP-001';
    const result = await db.query(
      `SELECT * FROM drivers WHERE company_id = $1 OR company_id IS NULL ORDER BY name ASC`,
      [companyId]
    );
    res.json({ success: true, drivers: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/drivers (Register Driver)
router.post('/', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'TRACKING_TEAM', 'tracking_team', 'ADMIN', 'admin'), async (req, res) => {
  try {
    const { name, license, phone, experience } = req.body;
    const companyId = req.user.companyId || 'COMP-001';

    if (!name || !license || !phone) {
      return res.status(400).json({ success: false, message: 'Driver name, license, and phone are required' });
    }

    // Safely generate next driver ID
    const maxRes = await db.query(`SELECT id FROM drivers WHERE id LIKE 'DRV-%'`);
    const nums = maxRes.rows.map(r => parseInt(String(r.id).replace('DRV-', ''), 10)).filter(n => !isNaN(n));
    const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 101;
    const id = 'DRV-' + nextNum;

    const result = await db.query(
      `INSERT INTO drivers (id, company_id, name, license_number, phone, experience_years, performance_score, warnings_count, status)
       VALUES ($1, $2, $3, $4, $5, $6, 100, 0, 'Available')
       RETURNING *`,
      [id, companyId, name, license, phone, experience || 1]
    );

    res.status(201).json({ success: true, driver: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/drivers/:id/status
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status, warningsCount, performanceScore } = req.body;
    const result = await db.query(
      `UPDATE drivers 
       SET status = COALESCE($1, status),
           warnings_count = COALESCE($2, warnings_count),
           performance_score = COALESCE($3, performance_score),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, warningsCount, performanceScore, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Driver not found' });
    res.json({ success: true, driver: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
