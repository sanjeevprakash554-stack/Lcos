const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/invoices
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.role === 'SUPER_ADMIN' ? (req.query.companyId || req.user.companyId) : req.user.companyId;
    let query = `
      SELECT i.*, c.name AS company_name
      FROM invoices i
      LEFT JOIN companies c ON c.id = i.company_id
    `;
    const params = [];
    if (companyId) {
      params.push(companyId);
      query += ` WHERE i.company_id = $1`;
    }
    query += ` ORDER BY i.issued_at DESC`;

    const result = await db.query(query, params);
    res.json({ success: true, invoices: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/invoices/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT i.*, c.name AS company_name, c.email AS company_email, c.phone AS company_phone, c.address AS company_address,
             p.payment_gateway, p.transaction_ref_id
      FROM invoices i
      LEFT JOIN companies c ON c.id = i.company_id
      LEFT JOIN payments p ON p.id = i.payment_id
      WHERE i.id = $1 OR i.invoice_number = $1
    `;
    const result = await db.query(query, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    res.json({ success: true, invoice: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
