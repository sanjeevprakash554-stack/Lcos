const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, role } = req.body;

    if (!username) {
      return res.status(400).json({ success: false, message: 'Username is required' });
    }

    // 1. Find user by exact username
    let userRes = await db.query(
      `SELECT u.*, c.name AS company_name 
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
       WHERE LOWER(u.username) = LOWER($1)
       ORDER BY (CASE WHEN u.company_id = 'COMP-001' THEN 1 ELSE 2 END)
       LIMIT 1`,
      [username]
    );

    let user = userRes.rows[0];

    // 2. Find user by Driver ID (e.g. DRV-101) or Full Name or Phone
    if (!user) {
      const cleanDigits = String(username).replace(/[^0-9]/g, '');
      const phoneFilter = cleanDigits.length >= 7 ? `%${cleanDigits.slice(-10)}%` : 'NO_PHONE_MATCH';

      userRes = await db.query(
        `SELECT u.*, c.name AS company_name 
         FROM users u
         LEFT JOIN companies c ON c.id = u.company_id
         WHERE LOWER(u.emp_id) = LOWER($1)
            OR LOWER(u.full_name) = LOWER($1)
            OR (u.phone IS NOT NULL AND u.phone LIKE $2)
         ORDER BY (CASE WHEN u.company_id = 'COMP-001' THEN 1 ELSE 2 END)
         LIMIT 1`,
        [username, phoneFilter]
      );
      user = userRes.rows[0];
    }

    // 3. Check drivers table directly (by ID e.g. DRV-101, Phone, or Name)
    if (!user) {
      const cleanDigits = String(username).replace(/[^0-9]/g, '');
      const phoneFilter = cleanDigits.length >= 7 ? `%${cleanDigits.slice(-10)}%` : 'NO_PHONE_MATCH';

      const driverRes = await db.query(
        `SELECT d.*, c.name AS company_name 
         FROM drivers d
         LEFT JOIN companies c ON c.id = d.company_id
         WHERE LOWER(d.id) = LOWER($1)
            OR LOWER(d.name) = LOWER($1)
            OR (d.phone IS NOT NULL AND d.phone LIKE $2)
         LIMIT 1`,
        [username, phoneFilter]
      );

      if (driverRes.rows.length > 0) {
        const d = driverRes.rows[0];
        // If linked to an existing user, load that user
        if (d.user_id) {
          const linkedRes = await db.query(
            `SELECT u.*, c.name AS company_name 
             FROM users u
             LEFT JOIN companies c ON c.id = u.company_id
             WHERE u.id = $1`,
            [d.user_id]
          );
          user = linkedRes.rows[0];
        }

        // If driver has no user record, auto-create one on-the-fly!
        if (!user) {
          const autoUsername = (d.id ? d.id.toLowerCase().replace(/[^a-z0-9]/g, '') : 'driver_' + Date.now());
          const newUserId = 'USR-' + (d.id || Date.now());
          try {
            await db.query(
              `INSERT INTO users (id, company_id, username, email, password_hash, full_name, phone, role, emp_id, status)
               VALUES ($1, $2, $3, $4, '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', $5, $6, 'DRIVER', $7, 'ACTIVE')`,
              [newUserId, d.company_id || 'COMP-001', autoUsername, `${autoUsername}@lcos.com`, d.name, d.phone, d.id]
            );
            await db.query(`UPDATE drivers SET user_id = $1 WHERE id = $2`, [newUserId, d.id]);
          } catch (_) {}

          user = {
            id: newUserId,
            company_id: d.company_id || 'COMP-001',
            username: autoUsername,
            full_name: d.name,
            phone: d.phone,
            role: 'DRIVER',
            emp_id: d.id,
            company_name: d.company_name || 'Vattara Logistics Pvt Ltd'
          };
        }
      }
    }

    // 4. Role-based fallback
    if (!user && role) {
      userRes = await db.query(
        `SELECT u.*, c.name AS company_name 
         FROM users u
         LEFT JOIN companies c ON c.id = u.company_id
         WHERE LOWER(u.role) = LOWER($1)
         ORDER BY (CASE WHEN u.company_id = 'COMP-001' THEN 1 ELSE 2 END)
         LIMIT 1`,
        [role]
      );
      user = userRes.rows[0];
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found. Drivers can sign in with their Username (driver1), Driver ID (DRV-101), or Mobile Number.' });
    }

    // Resolve driverId if role is DRIVER
    let driverId = null;
    if (user.role && user.role.toUpperCase() === 'DRIVER') {
      try {
        const dRes = await db.query(
          `SELECT id FROM drivers WHERE user_id = $1 OR id = $2 LIMIT 1`,
          [user.id, user.emp_id]
        );
        if (dRes.rows.length > 0) {
          driverId = dRes.rows[0].id;
        } else if (user.emp_id && user.emp_id.startsWith('DRV-')) {
          driverId = user.emp_id;
        }
      } catch (dErr) {
        if (user.emp_id && user.emp_id.startsWith('DRV-')) {
          driverId = user.emp_id;
        }
      }
    }

    const payload = {
      id: user.id,
      companyId: user.company_id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      empId: user.emp_id,
      driverId: driverId || undefined,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    // Update last login
    await db.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);

    logAudit(user.company_id, user.id, user.role, 'LOGIN', 'auth', { role: user.role }, req.ip);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        companyId: user.company_id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        empId: user.emp_id,
        driverId: driverId,
        companyName: user.company_name,
      },
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ success: false, message: 'Server error during authentication' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userRes = await db.query(
      `SELECT u.id, u.company_id, u.username, u.email, u.full_name, u.role, u.emp_id, c.name AS company_name, c.status AS company_status
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userData = { ...userRes.rows[0] };
    if (userData.role && userData.role.toUpperCase() === 'DRIVER') {
      try {
        const dRes = await db.query(
          `SELECT id FROM drivers WHERE user_id = $1 OR id = $2 LIMIT 1`,
          [userData.id, userData.emp_id]
        );
        userData.driverId = dRes.rows[0]?.id || userData.emp_id;
      } catch (e) {
        userData.driverId = userData.emp_id;
      }
    }

    res.json({ success: true, user: userData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, (req, res) => {
  logAudit(req.user.companyId, req.user.id, req.user.role, 'LOGOUT', 'auth', {}, req.ip);
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
