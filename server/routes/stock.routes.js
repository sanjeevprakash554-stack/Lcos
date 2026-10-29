const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// GET /api/stock
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId || 'COMP-001';
    const query = `
      SELECT s.*, b.name AS branch_name, b.manager_name, c.name AS commodity_name
      FROM stock s
      JOIN branches b ON b.id = s.branch_id
      JOIN commodities c ON c.id = s.commodity_id
      WHERE b.company_id = $1 OR b.company_id IS NULL
      ORDER BY b.name ASC, c.name ASC
    `;
    // Ensure baseline buffer: any depleted or low stock (< 100) is automatically replenished to at least 1,000 units
    try {
      await db.query(`UPDATE stock SET available_qty = 1000, updated_at = NOW() WHERE available_qty < 100`);
    } catch (_) {}

    let result = await db.query(query, [companyId]);

    // If stock table is completely empty or missing entries, initialize baseline warehouse buffer (1,000 units each)
    if (!result.rows || result.rows.length === 0) {
      try {
        await db.query(`
          INSERT INTO stock (branch_id, commodity_id, available_qty, in_transit_qty, delivered_qty, pending_qty)
          SELECT b.id, c.id, 1000, 0, 0, 0
          FROM branches b
          CROSS JOIN commodities c
          ON CONFLICT (branch_id, commodity_id) DO UPDATE SET
            available_qty = CASE WHEN stock.available_qty < 100 THEN stock.available_qty + 1000 ELSE stock.available_qty END
        `);
        result = await db.query(query, [companyId]);
      } catch (initErr) {
        console.warn('⚠️ [Stock Auto-init Notice]:', initErr.message);
      }
    }

    // Format structure as needed by frontend state: { branchId: { commodityId: { available, inTransit, delivered, pending } } }
    const stockMap = {};
    (result.rows || []).forEach(r => {
      if (!stockMap[r.branch_id]) stockMap[r.branch_id] = {};
      stockMap[r.branch_id][r.commodity_id] = {
        available: Number(r.available_qty || 0),
        inTransit: Number(r.in_transit_qty || 0),
        delivered: Number(r.delivered_qty || 0),
        pending: Number(r.pending_qty || 0)
      };
    });

    res.json({ success: true, stock: stockMap, rawRows: result.rows || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/stock/add (Replenish Warehouse Stock Directly)
router.post('/add', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'TRACKING_TEAM', 'ALL'), async (req, res) => {
  try {
    const { branchId, commodityId, quantity } = req.body;
    const qty = Number(quantity);

    if (!branchId || !commodityId || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Branch, commodity, and positive quantity required' });
    }

    const result = await db.query(
      `INSERT INTO stock (branch_id, commodity_id, available_qty, in_transit_qty, delivered_qty, pending_qty)
       VALUES ($1, $2, $3, 0, 0, 0)
       ON CONFLICT (branch_id, commodity_id) DO UPDATE
       SET available_qty = stock.available_qty + EXCLUDED.available_qty, updated_at = NOW()
       RETURNING *`,
      [branchId, commodityId, qty]
    );

    // Record Call Log / Audit Log
    const callLogId = 'CL-' + Math.floor(1000 + Math.random() * 9000);
    try {
      await db.query(
        `INSERT INTO call_logs (id, company_id, call_category, caller, recipient, conversation_notes)
         VALUES ($1, $2, 'Dispatch Confirmation', 'Supervisor / Operator', 'Warehouse Inventory', $3)`,
        [callLogId, req.user.companyId || 'COMP-001', `Warehouse stock replenished directly: +${qty} units of ${commodityId} at ${branchId}`]
      );
    } catch (_) {}

    res.json({ success: true, stockEntry: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
