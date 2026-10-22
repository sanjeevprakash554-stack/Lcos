const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// GET /api/requests
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId || 'COMP-001';
    const result = await db.query(
      `SELECT * FROM manager_requests WHERE company_id = $1 OR company_id IS NULL ORDER BY created_at DESC`,
      [companyId]
    );
    res.json({ success: true, requests: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/requests (Submit request)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { type, requestData } = req.body;
    const companyId = req.user.companyId || 'COMP-001';

    const countRes = await db.query(`SELECT COUNT(*) FROM manager_requests`);
    const id = 'REQ-' + (parseInt(countRes.rows[0].count, 10) + 101);

    const result = await db.query(
      `INSERT INTO manager_requests (id, company_id, type, request_data, status, submitted_by, created_at)
       VALUES ($1, $2, $3, $4, 'Pending', $5, NOW())
       RETURNING *`,
      [id, companyId, type, JSON.stringify(requestData || {}), req.user.id]
    );

    res.status(201).json({ success: true, request: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/requests/:id/approve (Manager/Owner approves request)
router.post('/:id/approve', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), async (req, res) => {
  try {
    const reqRes = await db.query(`SELECT * FROM manager_requests WHERE id = $1`, [req.params.id]);
    if (reqRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Request not found' });

    const request = reqRes.rows[0];
    if (request.status !== 'Pending') {
      return res.status(400).json({ success: false, message: `Request is already ${request.status}` });
    }

    const type = request.type;
    const data = request.request_data || {};
    const companyId = request.company_id || 'COMP-001';

    // Execute requested action
    if (type === 'Add Driver') {
      const driverCountRes = await db.query(`SELECT COUNT(*) FROM drivers`);
      const id = 'DRV-' + (parseInt(driverCountRes.rows[0].count, 10) + 101);
      await db.query(
        `INSERT INTO drivers (id, company_id, name, license_number, phone, experience_years, performance_score, warnings_count, status)
         VALUES ($1, $2, $3, $4, $5, $6, 100, 0, 'Available')`,
        [id, companyId, data.name, data.license, data.phone, data.experience || 1]
      );
    } else if (type === 'Add Vehicle') {
      await db.query(
        `INSERT INTO vehicles (id, company_id, type, capacity_tons, ownership, status)
         VALUES ($1, $2, $3, $4, $5, 'Available')
         ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type`,
        [data.id.toUpperCase(), companyId, data.type, data.capacity, data.owner || 'Self Owned']
      );
    } else if (type === 'Add Stock') {
      await db.query(
        `INSERT INTO stock (branch_id, commodity_id, available_qty, in_transit_qty, delivered_qty, pending_qty)
         VALUES ($1, $2, $3, 0, 0, 0)
         ON CONFLICT (branch_id, commodity_id) DO UPDATE
         SET available_qty = stock.available_qty + EXCLUDED.available_qty, updated_at = NOW()`,
        [data.branchId, data.commodityId, Number(data.quantity)]
      );
    }

    const updatedReq = await db.query(
      `UPDATE manager_requests SET status = 'Approved', approved_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    res.json({ success: true, request: updatedReq.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
