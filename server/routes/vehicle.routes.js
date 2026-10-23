const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');
const { authenticateToken, authorizeRoles, requireRealAuth } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');

// GET /api/vehicles
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId || 'COMP-001';
    const result = await db.query(
      `SELECT * FROM vehicles WHERE company_id = $1 OR company_id IS NULL ORDER BY id ASC`,
      [companyId]
    );

    // Sanitize output so hashed device_key is NEVER exposed
    const vehicles = result.rows.map(({ device_key, ...v }) => ({
      ...v,
      has_device_key: !!device_key,
    }));

    res.json({ success: true, vehicles });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/vehicles
router.post('/', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER'), async (req, res) => {
  try {
    const { id, type, capacity, owner } = req.body;
    const companyId = req.user.companyId || 'COMP-001';

    if (!id || !type || !capacity) {
      return res.status(400).json({ success: false, message: 'Vehicle reg number, type, and capacity required' });
    }

    const regNo = id.toUpperCase();
    const result = await db.query(
      `INSERT INTO vehicles (id, company_id, type, capacity_tons, ownership, status)
       VALUES ($1, $2, $3, $4, $5, 'Available')
       ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, capacity_tons = EXCLUDED.capacity_tons
       RETURNING *`,
      [regNo, companyId, type, capacity, owner || 'Self Owned']
    );

    const { device_key, ...sanitized } = result.rows[0];
    res.status(201).json({ success: true, vehicle: sanitized });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/vehicles/:id/device-key (Admin: Generate or Rotate Vehicle Device API Key)
// Strictly protected via requireRealAuth with NO guest/admin fallback
router.post('/:id/device-key', requireRealAuth('SUPER_ADMIN', 'OWNER'), async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const callerCompanyId = req.user.companyId || 'COMP-001';

    // Verify vehicle exists and belongs to company (unless SUPER_ADMIN)
    let vehRes;
    const isSuperAdmin = req.user.role && req.user.role.toUpperCase() === 'SUPER_ADMIN';
    if (isSuperAdmin) {
      vehRes = await db.query(`SELECT id, company_id FROM vehicles WHERE id = $1`, [vehicleId]);
    } else {
      vehRes = await db.query(
        `SELECT id, company_id FROM vehicles WHERE id = $1 AND (company_id = $2 OR company_id IS NULL)`,
        [vehicleId, callerCompanyId]
      );
    }

    if (vehRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
    }

    const targetVehicle = vehRes.rows[0];

    // Generate cryptographically secure plaintext device key
    const rawKey = `lcos_dev_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    // Store only the SHA-256 hash
    await db.query(`UPDATE vehicles SET device_key = $1, updated_at = NOW() WHERE id = $2`, [keyHash, vehicleId]);

    // Record audit log entry for security traceability
    logAudit(
      targetVehicle.company_id || callerCompanyId,
      req.user.id,
      req.user.role,
      'ROTATE_DEVICE_KEY',
      'vehicles',
      { vehicleId, maskedKey: `${rawKey.slice(0, 12)}...` },
      req.ip
    );

    // Return the plaintext key once only; it will never be returned again
    res.json({
      success: true,
      vehicleId,
      deviceKey: rawKey,
      message: 'Store this device key safely. It is hashed in the database and will NOT be shown again.',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
