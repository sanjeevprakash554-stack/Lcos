const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// GET /api/users
router.get('/', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), async (req, res) => {
  try {
    const companyId = req.user.role === 'SUPER_ADMIN' ? (req.query.companyId || req.user.companyId) : req.user.companyId;
    let query = `SELECT id, company_id, username, email, full_name, role, emp_id, status, last_login, created_at FROM users`;
    let params = [];
    if (companyId) {
      query += ` WHERE company_id = $1`;
      params.push(companyId);
    }
    query += ` ORDER BY created_at DESC`;
    const result = await db.query(query, params);
    res.json({ success: true, users: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/users (Create User)
router.post('/', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), async (req, res) => {
  try {
    const { username, email, password, fullName, phone, role, empId } = req.body;
    const companyId = req.user.role === 'SUPER_ADMIN' ? (req.body.companyId || 'COMP-001') : req.user.companyId;

    if (!username || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'Required user fields missing' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const userId = 'USR-' + Math.floor(1000 + Math.random() * 9000);

    const result = await db.query(
      `INSERT INTO users (id, company_id, username, email, password_hash, full_name, phone, role, emp_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE')
       RETURNING id, username, email, full_name, role, emp_id`,
      [userId, companyId, username, email, hash, fullName, phone, role, empId]
    );

    res.status(201).json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
