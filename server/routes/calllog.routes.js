const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/calllogs
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId || 'COMP-001';
    const categoryFilter = req.query.category;
    const searchQuery = req.query.search;

    let query = `SELECT * FROM call_logs WHERE company_id = $1 OR company_id IS NULL`;
    const params = [companyId];

    if (categoryFilter) {
      params.push(categoryFilter);
      query += ` AND call_category = $${params.length}`;
    }

    if (searchQuery) {
      params.push(`%${searchQuery}%`);
      query += ` AND (trip_id ILIKE $${params.length} OR conversation_notes ILIKE $${params.length} OR caller ILIKE $${params.length})`;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await db.query(query, params);
    res.json({ success: true, callLogs: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/calllogs
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { tripId, category, caller, recipient, locationCheckin, empId, notes } = req.body;
    const companyId = req.user.companyId || 'COMP-001';

    if (!category || !caller || !notes) {
      return res.status(400).json({ success: false, message: 'Category, caller, and notes required' });
    }

    const id = 'CL-' + Date.now().toString().slice(-5) + Math.floor(100 + Math.random() * 900);

    const result = await db.query(
      `INSERT INTO call_logs (id, company_id, trip_id, call_category, caller, recipient, location_checkin, operator_emp_id, conversation_notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [id, companyId, tripId || null, category, caller, recipient || 'Admin Office', locationCheckin || null, empId || req.user.empId, notes]
    );

    if (tripId) {
      await db.query(`UPDATE trips SET last_update_timestamp = NOW() WHERE id = $1`, [tripId]);
    }

    res.status(201).json({ success: true, callLog: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
