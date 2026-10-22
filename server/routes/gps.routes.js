const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { broadcastGpsUpdate } = require('../services/socketService');

// POST /api/gps/update (Driver Mobile App or Simulator API)
router.post('/update', async (req, res) => {
  try {
    const { vehicleId, driverId, tripId, latitude, longitude, speed, heading, movementStatus } = req.body;

    if (!vehicleId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'vehicleId, latitude, and longitude are required' });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const speedKmh = speed ? parseFloat(speed) : 0;
    const isMoving = speedKmh > 0 || movementStatus === 'MOVING';
    const statusStr = isMoving ? 'MOVING' : 'STOPPED';

    // 1. Insert into tracking history table
    await db.query(
      `INSERT INTO gps_tracking_records (vehicle_id, driver_id, trip_id, latitude, longitude, speed_kmh, heading, movement_status, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [vehicleId, driverId || null, tripId || null, lat, lng, speedKmh, heading || 0, statusStr]
    );

    // 2. Fetch previous vehicle state to manage stoppage timestamp
    const prevVehRes = await db.query(`SELECT movement_status, stoppage_start_time FROM vehicles WHERE id = $1`, [vehicleId]);
    let stoppageStartTime = null;

    if (prevVehRes.rows.length > 0) {
      const prev = prevVehRes.rows[0];
      if (statusStr === 'STOPPED') {
        stoppageStartTime = prev.stoppage_start_time || new Date();
      } else {
        stoppageStartTime = null; // reset if moving
      }
    }

    // 3. Update vehicle current location & status
    const updatedVeh = await db.query(
      `UPDATE vehicles 
       SET current_lat = $1,
           current_lng = $2,
           speed_kmh = $3,
           heading = $4,
           movement_status = $5,
           stoppage_start_time = $6,
           last_gps_update = NOW(),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [lat, lng, speedKmh, heading || 0, statusStr, stoppageStartTime, vehicleId]
    );

    const vehicleData = updatedVeh.rows[0] || { vehicleId, lat, lng, speedKmh, statusStr };

    // Broadcast real-time location via Socket.IO
    broadcastGpsUpdate(vehicleData);

    res.json({
      success: true,
      message: 'GPS coordinates logged successfully',
      vehicle: vehicleData,
    });
  } catch (err) {
    console.error('GPS Update Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/gps/history/:vehicleId
router.get('/history/:vehicleId', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const result = await db.query(
      `SELECT * FROM gps_tracking_records WHERE vehicle_id = $1 ORDER BY recorded_at DESC LIMIT $2`,
      [req.params.vehicleId, limit]
    );
    res.json({ success: true, history: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
