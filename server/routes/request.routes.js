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

    const maxRes = await db.query(`SELECT id FROM manager_requests WHERE id LIKE 'REQ-%'`);
    const nums = maxRes.rows.map(r => parseInt(String(r.id).replace('REQ-', ''), 10)).filter(n => !isNaN(n));
    const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 101;
    const id = 'REQ-' + nextNum;

    let dataPayload = requestData;
    if (typeof dataPayload === 'string') {
      try { dataPayload = JSON.parse(dataPayload); } catch (_) {}
    }

    const result = await db.query(
      `INSERT INTO manager_requests (id, company_id, type, request_data, status, submitted_by, created_at)
       VALUES ($1, $2, $3, $4, 'Pending', $5, NOW())
       RETURNING *`,
      [id, companyId, type, JSON.stringify(dataPayload || {}), req.user.id]
    );

    res.status(201).json({ success: true, request: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/requests/:id/approve (Manager/Owner approves request)
router.post('/:id/approve', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'super_admin', 'owner', 'branch_manager'), async (req, res) => {
  try {
    const reqId = req.params.id;
    let reqRes = await db.query(`SELECT * FROM manager_requests WHERE id = $1`, [reqId]);
    let request;

    if (reqRes.rows.length === 0) {
      // If request was created locally / offline, upsert it from request payload
      if (req.body && req.body.type) {
        const type = req.body.type;
        let dataPayload = req.body.requestData || req.body.data || {};
        if (typeof dataPayload === 'string') {
          try { dataPayload = JSON.parse(dataPayload); } catch (_) {}
        }
        const companyId = req.user.companyId || 'COMP-001';
        const insRes = await db.query(
          `INSERT INTO manager_requests (id, company_id, type, request_data, status, submitted_by, created_at)
           VALUES ($1, $2, $3, $4, 'Pending', $5, NOW())
           ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type
           RETURNING *`,
          [reqId, companyId, type, JSON.stringify(dataPayload || {}), req.user.id || 'USR-MANAGER']
        );
        request = insRes.rows[0];
      } else {
        return res.status(404).json({ success: false, message: `Request ${reqId} not found` });
      }
    } else {
      request = reqRes.rows[0];
    }

    if (request.status === 'Approved') {
      return res.json({ success: true, message: `Request ${reqId} is already Approved`, request });
    }

    const type = request.type;
    let data = request.request_data;
    while (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (parsed === data) break;
        data = parsed;
      } catch (_) { break; }
    }
    data = data || {};
    const companyId = request.company_id || 'COMP-001';

    // Execute requested action
    if (type === 'Add Driver') {
      const maxRes = await db.query(`SELECT id FROM drivers WHERE id LIKE 'DRV-%'`);
      const nums = maxRes.rows.map(r => parseInt(String(r.id).replace('DRV-', ''), 10)).filter(n => !isNaN(n));
      const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 101;
      const id = 'DRV-' + nextNum;

      const driverName = data.name || 'New Driver';
      const licenseNum = data.license || data.license_number || ('DL-' + id);
      const phoneNum = data.phone || '+91 00000 00000';
      const expYears = Number(data.experience || data.experience_years || 1);

      const userId = 'USR-' + id;
      const cleanUsername = (driverName ? driverName.toLowerCase().replace(/[^a-z0-9]/g, '') : 'driver_' + nextNum) || ('driver_' + nextNum);

      // 1. Create login credentials in users table first so foreign key is satisfied
      try {
        await db.query(
          `INSERT INTO users (id, company_id, username, email, password_hash, full_name, phone, role, emp_id, status)
           VALUES ($1, $2, $3, $4, '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', $5, $6, 'DRIVER', $7, 'ACTIVE')
           ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone`,
          [userId, companyId, cleanUsername, `${cleanUsername}@lcos.com`, driverName, phoneNum, id]
        );
      } catch (uErr) {
        console.warn('⚠️ [Driver User Creation Notice in Request Approval]:', uErr.message);
      }

      // 2. Insert driver record
      await db.query(
        `INSERT INTO drivers (id, company_id, user_id, name, license_number, phone, experience_years, performance_score, warnings_count, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 100, 0, 'Available')
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, license_number = EXCLUDED.license_number, phone = EXCLUDED.phone`,
        [id, companyId, userId, driverName, licenseNum, phoneNum, expYears]
      );
    } else if (type === 'Add Vehicle') {
      const vehId = (data.id || data.vehicleId || '').toUpperCase().trim();
      if (vehId) {
        await db.query(
          `INSERT INTO vehicles (id, company_id, type, capacity_tons, ownership, status)
           VALUES ($1, $2, $3, $4, $5, 'Available')
           ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type`,
          [vehId, companyId, data.type || 'Lorry', Number(data.capacity || 10), data.owner || 'Self Owned']
        );
      }
    } else if (type === 'Add Stock') {
      const branchId = data.branchId;
      const commodityId = data.commodityId;
      const quantity = Number(data.quantity || data.qty || 0);
      if (branchId && commodityId) {
        await db.query(
          `INSERT INTO stock (branch_id, commodity_id, available_qty, in_transit_qty, delivered_qty, pending_qty)
           VALUES ($1, $2, $3, 0, 0, 0)
           ON CONFLICT (branch_id, commodity_id) DO UPDATE
           SET available_qty = stock.available_qty + EXCLUDED.available_qty, updated_at = NOW()`,
          [branchId, commodityId, quantity]
        );
      }
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
