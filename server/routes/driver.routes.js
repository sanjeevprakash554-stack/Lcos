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

    const userId = 'USR-' + id;
    const cleanUsername = (name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : 'driver_' + nextNum) || ('driver_' + nextNum);
    const defaultPassword = 'password123';

    // 1. Create login credentials in users table first so foreign key is satisfied
    try {
      await db.query(
        `INSERT INTO users (id, company_id, username, email, password_hash, full_name, phone, role, emp_id, status)
         VALUES ($1, $2, $3, $4, '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', $5, $6, 'DRIVER', $7, 'ACTIVE')
         ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone`,
        [userId, companyId, cleanUsername, `${cleanUsername}@lcos.com`, name, phone, id]
      );
    } catch (uErr) {
      console.warn('⚠️ [Driver User Creation Notice]:', uErr.message);
    }

    // 2. Insert driver record with valid user_id
    const result = await db.query(
      `INSERT INTO drivers (id, company_id, user_id, name, license_number, phone, experience_years, performance_score, warnings_count, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 100, 0, 'Available')
       RETURNING *`,
      [id, companyId, userId, name, license, phone, experience || 1]
    );

    res.status(201).json({
      success: true,
      driver: result.rows[0],
      credentials: {
        username: cleanUsername,
        driverId: id,
        password: defaultPassword,
        phone: phone,
        loginUrl: '/driver-track.html'
      }
    });
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
