const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId || 'COMP-001';
    const result = await db.query(
      `SELECT * FROM notifications 
       WHERE company_id = $1 OR company_id IS NULL 
       ORDER BY created_at DESC LIMIT 50`,
      [companyId]
    );
    res.json({ success: true, notifications: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ success: true, notification: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
