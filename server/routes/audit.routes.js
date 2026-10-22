const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// GET /api/audit-logs
router.get('/', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER'), async (req, res) => {
  try {
    const companyId = req.user.role === 'SUPER_ADMIN' ? (req.query.companyId || req.user.companyId) : req.user.companyId;
    let query = `
      SELECT a.*, u.username, u.full_name
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
    `;
    const params = [];

    if (companyId) {
      params.push(companyId);
      query += ` WHERE a.company_id = $1 OR a.company_id IS NULL`;
    }

    query += ` ORDER BY a.created_at DESC LIMIT 100`;

    const result = await db.query(query, params);
    res.json({ success: true, logs: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
