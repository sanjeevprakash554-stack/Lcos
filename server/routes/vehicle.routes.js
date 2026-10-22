const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// GET /api/vehicles
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId || 'COMP-001';
    const result = await db.query(
      `SELECT * FROM vehicles WHERE company_id = $1 OR company_id IS NULL ORDER BY id ASC`,
      [companyId]
    );
    res.json({ success: true, vehicles: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/vehicles
router.post('/', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), async (req, res) => {
  try {
    const { id, type, capacity, owner } = req.body;
    const companyId = req.user.companyId || 'COMP-001';

    if (!id || !type || !capacity) {
      return res.status(400).json({ success: false, message: 'Vehicle reg number, type, and capacity required' });
    }

    const regNo = id.toUpperCase();
    const result = await db.query(
      `INSERT INTO vehicles (id, company_id, type, capacity_tons, ownership, status)
       VALUES ($1, $2, $3, $4, $5, 'Available')
       ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, capacity_tons = EXCLUDED.capacity_tons
       RETURNING *`,
      [regNo, companyId, type, capacity, owner || 'Self Owned']
    );

    res.status(201).json({ success: true, vehicle: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
