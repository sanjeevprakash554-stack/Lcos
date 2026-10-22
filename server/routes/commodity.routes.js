const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// GET /api/commodities
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId || 'COMP-001';
    const result = await db.query(
      `SELECT * FROM commodities WHERE company_id = $1 OR company_id IS NULL ORDER BY name ASC`,
      [companyId]
    );
    res.json({ success: true, commodities: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/commodities
router.post('/', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), async (req, res) => {
  try {
    const { name, unit, weight, value } = req.body;
    const companyId = req.user.companyId || 'COMP-001';

    if (!name || !unit || !weight) {
      return res.status(400).json({ success: false, message: 'Name, unit, and weight are required' });
    }

    const id = 'COM-' + name.slice(0, 3).toUpperCase();
    const result = await db.query(
      `INSERT INTO commodities (id, company_id, name, unit, weight_kg, unit_value)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET unit = EXCLUDED.unit, weight_kg = EXCLUDED.weight_kg, unit_value = EXCLUDED.unit_value
       RETURNING *`,
      [id, companyId, name, unit, weight, value || 0]
    );

    // Initialize stock for all branches
    const branches = await db.query(`SELECT id FROM branches WHERE company_id = $1 OR company_id IS NULL`, [companyId]);
    for (const br of branches.rows) {
      await db.query(
        `INSERT INTO stock (branch_id, commodity_id, available_qty, in_transit_qty, delivered_qty, pending_qty)
         VALUES ($1, $2, 0, 0, 0, 0)
         ON CONFLICT (branch_id, commodity_id) DO NOTHING`,
        [br.id, id]
      );
    }

    res.status(201).json({ success: true, commodity: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
