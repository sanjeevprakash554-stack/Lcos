const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// GET /api/branches
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId || 'COMP-001';
    const result = await db.query(
      `SELECT * FROM branches WHERE company_id = $1 OR company_id IS NULL ORDER BY name ASC`,
      [companyId]
    );
    res.json({ success: true, branches: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/branches
router.post('/', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), async (req, res) => {
  try {
    const { name, manager, phone, x, y } = req.body;
    const companyId = req.user.companyId || 'COMP-001';

    if (!name) return res.status(400).json({ success: false, message: 'Branch name is required' });

    const id = 'BR-' + name.slice(0, 3).toUpperCase();
    const result = await db.query(
      `INSERT INTO branches (id, company_id, name, manager_name, phone, x_coord, y_coord)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET manager_name = EXCLUDED.manager_name, phone = EXCLUDED.phone
       RETURNING *`,
      [id, companyId, name, manager, phone, x || 50, y || 50]
    );

    // Initialize stock entries for new branch
    const commodities = await db.query(`SELECT id FROM commodities WHERE company_id = $1 OR company_id IS NULL`, [companyId]);
    for (const com of commodities.rows) {
      await db.query(
        `INSERT INTO stock (branch_id, commodity_id, available_qty, in_transit_qty, delivered_qty, pending_qty)
         VALUES ($1, $2, 0, 0, 0, 0)
         ON CONFLICT (branch_id, commodity_id) DO NOTHING`,
        [id, com.id]
      );
    }

    res.status(201).json({ success: true, branch: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
