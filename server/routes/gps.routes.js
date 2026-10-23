const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const cron = require('node-cron');
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, requireRealAuth } = require('../middleware/auth');
const { broadcastGpsUpdate, broadcastAlert, broadcastTripArriving, broadcastAlertResolved } = require('../services/socketService');

// Configuration
const GPS_MIN_ACCURACY_M = parseFloat(process.env.GPS_MIN_ACCURACY_M || '100');
const GPS_RATE_LIMIT_MS = parseInt(process.env.GPS_RATE_LIMIT_MS || '3000', 10);
const GPS_BATCH_LIMIT_MS = 10000;
const GPS_RETENTION_DAYS = parseInt(process.env.GPS_RETENTION_DAYS || '90', 10);

// In-Memory Rate Limiting & Movement Hysteresis Tracker
// NOTE: The movement hysteresis counter (slowReadingsCount) and rate-limit tracking live
// in-memory in vehicleTrackerState. This state resets on server restart and only delays
// STOPPED detection by one extra ping (3-5 seconds). For distributed multi-instance clusters,
// use Redis or a similar shared distributed key-value store.
const vehicleTrackerState = new Map();

function getTrackerState(vehicleId) {
  if (!vehicleTrackerState.has(vehicleId)) {
    vehicleTrackerState.set(vehicleId, {
      lastWriteTime: 0,
      lastBatchTime: 0,
      slowReadingsCount: 0,
      lastLat: null,
      lastLng: null,
    });
  }
  return vehicleTrackerState.get(vehicleId);
}

/**
 * Calculates Haversine distance between two coordinates in meters
 */
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Auto-resolves any active 'No Update' alert for a vehicle once live GPS telemetry resumes
 */
async function resolveActiveOutageAlert(vehicleId, companyId) {
  try {
    const resolvedRes = await db.query(
      `UPDATE alerts 
       SET status = 'Resolved', resolved_at = NOW() 
       WHERE vehicle_id = $1 AND type = 'No Update' AND status = 'Active' 
       RETURNING *`,
      [vehicleId]
    );
    if (resolvedRes.rows && resolvedRes.rows.length > 0) {
      for (const rAlert of resolvedRes.rows) {
        broadcastAlertResolved(companyId, rAlert);
        console.log(`[Watchdog] Auto-resolved 'No Update' alert ${rAlert.id} for vehicle ${vehicleId}`);
      }
    }
  } catch (err) {
    console.warn('[Watchdog Auto-Resolve Warning]:', err.message);
  }
}

/**
 * Dedicated Authentication Middleware for GPS Ingestion.
 * Supports:
 * 1. DRIVER JWT: Resolves vehicle and active trip server-side from drivers and trips tables.
 * 2. Device Key: Resolves vehicle by vehicleId and validates SHA-256 hash using crypto.timingSafeEqual.
 * Strictly NO SUPER_ADMIN or guest fallback.
 */
async function authenticateGpsSender(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const deviceKeyHeader = req.headers['x-device-key'] || req.body.deviceKey;
    const vehicleIdHeader = req.headers['x-vehicle-id'] || req.body.vehicleId;

    // --- Path A: DRIVER JWT Authentication ---
    if (token) {
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (jwtErr) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
      }

      const role = (decoded.role || '').toUpperCase();
      if (role !== 'DRIVER') {
        return res.status(403).json({ success: false, message: 'Forbidden: Driver JWT required for mobile tracking' });
      }

      // Resolve driverId
      let driverId = decoded.driverId;
      if (!driverId) {
        const dRes = await db.query(`SELECT id FROM drivers WHERE user_id = $1 OR id = $2 LIMIT 1`, [decoded.id, decoded.empId]);
        if (dRes.rows.length > 0) driverId = dRes.rows[0].id;
      }

      if (!driverId) {
        return res.status(404).json({ success: false, message: 'Driver record not found for user' });
      }

      // Look up driver's active trip (IN_TRANSIT, DELAYED, CREATED, DISPATCH_APPROVED, etc.) server-side
      const tripRes = await db.query(
        `SELECT t.*, v.company_id AS vehicle_company_id 
         FROM trips t
         LEFT JOIN vehicles v ON v.id = t.vehicle_id
         WHERE t.driver_id = $1 AND t.status IN ('IN_TRANSIT', 'DELAYED', 'CREATED', 'DISPATCH_APPROVED', 'JOURNEY_STARTED', 'DRIVER_CONFIRMED')
         ORDER BY t.created_at DESC LIMIT 1`,
        [driverId]
      );

      if (tripRes.rows.length === 0) {
        return res.status(409).json({
          success: false,
          message: 'No active shipment/trip found in transit for this driver',
        });
      }

      const activeTrip = tripRes.rows[0];

      // Auto-transition trip to IN_TRANSIT if tracking commences from CREATED / DISPATCH_APPROVED
      if (['CREATED', 'DISPATCH_APPROVED', 'JOURNEY_STARTED', 'DRIVER_CONFIRMED'].includes(activeTrip.status)) {
        try {
          await db.query(`UPDATE trips SET status = 'IN_TRANSIT' WHERE id = $1`, [activeTrip.id]);
          activeTrip.status = 'IN_TRANSIT';
        } catch (_) {}
      }

      req.gpsAuth = {
        type: 'DRIVER',
        driverId,
        vehicleId: activeTrip.vehicle_id,
        companyId: activeTrip.company_id || decoded.companyId || 'COMP-001',
        activeTrip,
      };

      return next();
    }

    // --- Path B: Hardware Device Key Authentication ---
    if (deviceKeyHeader && vehicleIdHeader) {
      const vehicleId = String(vehicleIdHeader).trim();
      const rawDeviceKey = String(deviceKeyHeader).trim();

      const vehRes = await db.query(`SELECT id, company_id, device_key FROM vehicles WHERE id = $1`, [vehicleId]);
      if (vehRes.rows.length === 0 || !vehRes.rows[0].device_key) {
        return res.status(401).json({ success: false, message: 'Invalid vehicle ID or device key not configured' });
      }

      const storedHash = vehRes.rows[0].device_key;
      const presentedHash = crypto.createHash('sha256').update(rawDeviceKey).digest('hex');

      const bufStored = Buffer.from(storedHash, 'utf8');
      const bufPresented = Buffer.from(presentedHash, 'utf8');

      // Constant-time comparison on equal-length buffers to prevent timing attacks
      if (bufStored.length !== bufPresented.length || !crypto.timingSafeEqual(bufStored, bufPresented)) {
        return res.status(401).json({ success: false, message: 'Invalid device key' });
      }

      // Look up active trip if one exists
      const tripRes = await db.query(
        `SELECT * FROM trips WHERE vehicle_id = $1 AND status IN ('IN_TRANSIT', 'DELAYED', 'CREATED', 'DISPATCH_APPROVED', 'JOURNEY_STARTED', 'DRIVER_CONFIRMED') ORDER BY created_at DESC LIMIT 1`,
        [vehicleId]
      );

      const activeTrip = tripRes.rows.length > 0 ? tripRes.rows[0] : null;

      req.gpsAuth = {
        type: 'DEVICE',
        driverId: activeTrip?.driver_id || null,
        vehicleId,
        companyId: vehRes.rows[0].company_id || 'COMP-001',
        activeTrip,
      };

      return next();
    }

    // Neither JWT nor Device Key provided
    return res.status(401).json({
      success: false,
      message: 'Authentication required: Provide a valid DRIVER Bearer token or X-Device-Key / X-Vehicle-Id headers',
    });
  } catch (err) {
    console.error('GPS Authentication Error:', err);
    res.status(500).json({ success: false, message: 'Internal server authentication error' });
  }
}

/**
 * Validates a single GPS coordinate point.
 * Returns null if valid, or an error string if invalid.
 */
function validateGpsPoint(point) {
  if (point.lat === undefined || point.lng === undefined) {
    return 'lat and lng are required';
  }

  const lat = parseFloat(point.lat);
  const lng = parseFloat(point.lng);

  if (isNaN(lat) || lat < -90 || lat > 90) {
    return 'Latitude must be between -90 and 90';
  }

  if (isNaN(lng) || lng < -180 || lng > 180) {
    return 'Longitude must be between -180 and 180';
  }

  if (point.speedKmh !== undefined && (isNaN(point.speedKmh) || point.speedKmh < 0)) {
    return 'Speed must be non-negative';
  }

  // Reject future timestamps beyond 60 seconds clock skew
  if (point.recordedAt) {
    const recordedTime = new Date(point.recordedAt).getTime();
    if (isNaN(recordedTime)) {
      return 'Invalid recordedAt timestamp format';
    }
    const maxFutureTime = Date.now() + 60000; // 60s tolerance
    if (recordedTime > maxFutureTime) {
      return 'Timestamp cannot be in the future';
    }
  }

  return null;
}

/**
 * Evaluates movement status using 2-step hysteresis and Haversine distance
 */
function evaluateMovementStatus(prevVehicle, trackerState, lat, lng, speedKmh) {
  const prevStatus = prevVehicle?.movement_status || 'STOPPED';
  const hasPrevLocation = trackerState.lastLat !== null && trackerState.lastLng !== null;

  let distanceMeters = 0;
  if (hasPrevLocation) {
    distanceMeters = haversineDistanceMeters(trackerState.lastLat, trackerState.lastLng, lat, lng);
  }

  const isSlow = speedKmh < 3 && (!hasPrevLocation || distanceMeters < 15);

  let newStatus = prevStatus;
  let stoppageStartTime = prevVehicle?.stoppage_start_time || null;

  if (prevStatus === 'MOVING') {
    if (isSlow) {
      trackerState.slowReadingsCount++;
      // Require 2 consecutive slow points to flip from MOVING to STOPPED
      if (trackerState.slowReadingsCount >= 2) {
        newStatus = 'STOPPED';
        stoppageStartTime = new Date().toISOString();
        trackerState.slowReadingsCount = 0;
      }
    } else {
      trackerState.slowReadingsCount = 0;
    }
  } else {
    // Currently STOPPED
    if (!isSlow && distanceMeters >= 15 && speedKmh >= 3) {
      // Clear movement resumption
      newStatus = 'MOVING';
      stoppageStartTime = null;
      trackerState.slowReadingsCount = 0;
    } else {
      // Retain existing stoppage_start_time
      newStatus = 'STOPPED';
      if (!stoppageStartTime) stoppageStartTime = new Date().toISOString();
    }
  }

  // Update tracked last position
  trackerState.lastLat = lat;
  trackerState.lastLng = lng;

  return { newStatus, stoppageStartTime };
}

/**
 * Checks 500m geofence around destination branch and fires alert once per trip
 */
async function checkGeofenceArrival(activeTrip, vehicleId, driverId, companyId, lat, lng) {
  if (!activeTrip || !activeTrip.destination_branch_id) return;

  try {
    const branchRes = await db.query(`SELECT id, name, lat, lng FROM branches WHERE id = $1`, [activeTrip.destination_branch_id]);
    if (branchRes.rows.length === 0 || !branchRes.rows[0].lat || !branchRes.rows[0].lng) return;

    const dest = branchRes.rows[0];
    const distanceMeters = haversineDistanceMeters(lat, lng, Number(dest.lat), Number(dest.lng));

    if (distanceMeters <= 500) {
      // Atomic update ensures this alert fires only once per trip (race-safe)
      const updateRes = await db.query(
        `UPDATE trips 
         SET arriving_notified = TRUE, updated_at = NOW() 
         WHERE id = $1 AND (arriving_notified IS NULL OR arriving_notified = FALSE) 
         RETURNING id`,
        [activeTrip.id]
      );

      if (updateRes.rowCount > 0) {
        const alertId = 'ALT-ARR-' + Math.floor(1000 + Math.random() * 9000);
        const msg = `Shipment approaching destination: Vehicle ${vehicleId} is within ${Math.round(distanceMeters)}m of ${dest.name} branch.`;

        const alertRes = await db.query(
          `INSERT INTO alerts (id, company_id, trip_id, vehicle_id, driver_id, type, message, severity, status, created_at)
           VALUES ($1, $2, $3, $4, $5, 'Arriving Destination', $6, 'info', 'Active', NOW())
           RETURNING *`,
          [alertId, companyId, activeTrip.id, vehicleId, driverId || null, msg]
        );

        broadcastAlert(alertRes.rows[0]);
        broadcastTripArriving({
          id: activeTrip.id,
          companyId,
          vehicleId,
          destinationBranchName: dest.name,
          distanceMeters: Math.round(distanceMeters),
        });

        console.log(`[Geofence] Triggered 500m arrival alert ${alertId} for Trip ${activeTrip.id}`);
      }
    }
  } catch (err) {
    console.warn('[Geofence Check Warning]:', err.message);
  }
}

// ==========================================
// API ROUTES
// ==========================================

// POST /api/gps/update (Single Point Ingestion)
router.post('/update', authenticateGpsSender, async (req, res) => {
  try {
    const { vehicleId, driverId, companyId, activeTrip } = req.gpsAuth;
    const { latitude, longitude, speed, heading, accuracy, recordedAt } = req.body;

    const lat = req.body.lat !== undefined ? parseFloat(req.body.lat) : parseFloat(latitude);
    const lng = req.body.lng !== undefined ? parseFloat(req.body.lng) : parseFloat(longitude);
    const speedKmh = req.body.speedKmh !== undefined ? parseFloat(req.body.speedKmh) : (speed ? parseFloat(speed) : 0);
    const headingDeg = heading !== undefined ? parseFloat(heading) : 0;
    const accuracyM = accuracy !== undefined ? parseFloat(accuracy) : 0;
    const recordTimestamp = recordedAt ? new Date(recordedAt).toISOString() : new Date().toISOString();

    // 1. Point Validation
    const validationError = validateGpsPoint({ lat, lng, speedKmh, recordedAt: recordTimestamp });
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError, serverTime: new Date().toISOString() });
    }

    // 2. Accuracy Filter: Ignore noisy points worse than threshold, but record heartbeat
    if (accuracyM > GPS_MIN_ACCURACY_M) {
      await db.query(`UPDATE vehicles SET last_ping_at = NOW() WHERE id = $1`, [vehicleId]);
      return res.json({
        success: true,
        ignored: true,
        heartbeat: true,
        reason: `Accuracy (${accuracyM}m) worse than threshold (${GPS_MIN_ACCURACY_M}m); point filtered out but heartbeat logged.`,
      });
    }

    // 3. In-Memory Rate Limiting (per vehicle)
    const trackerState = getTrackerState(vehicleId);
    const now = Date.now();
    const elapsed = now - trackerState.lastWriteTime;

    if (elapsed < GPS_RATE_LIMIT_MS) {
      await db.query(`UPDATE vehicles SET last_ping_at = NOW() WHERE id = $1`, [vehicleId]);
      const retryAfterMs = GPS_RATE_LIMIT_MS - elapsed;
      res.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded: Please wait before sending next GPS update',
        retryAfterMs,
      });
    }
    trackerState.lastWriteTime = now;

    // 4. Fetch previous vehicle state for movement hysteresis & stale fix check
    const prevVehRes = await db.query(`SELECT movement_status, stoppage_start_time, last_gps_update FROM vehicles WHERE id = $1`, [vehicleId]);
    const prevVehicle = prevVehRes.rows[0] || null;

    const prevLastGpsUpdate = prevVehicle?.last_gps_update ? new Date(prevVehicle.last_gps_update).getTime() : 0;
    const currentPointTime = new Date(recordTimestamp).getTime();
    const isNewer = currentPointTime > prevLastGpsUpdate;

    const { newStatus, stoppageStartTime } = evaluateMovementStatus(prevVehicle, trackerState, lat, lng, speedKmh);

    // 5. Atomic Transaction: Record History + Update Vehicle + Update Driver
    await db.withTransaction(async (tx) => {
      // Always insert history record
      await tx.query(
        `INSERT INTO gps_tracking_records (vehicle_id, driver_id, trip_id, latitude, longitude, speed_kmh, heading, accuracy, movement_status, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [vehicleId, driverId, activeTrip?.id || null, lat, lng, speedKmh, headingDeg, accuracyM, newStatus, recordTimestamp]
      );

      // Heartbeat: Server heard from device NOW()
      await tx.query(`UPDATE vehicles SET last_ping_at = NOW(), updated_at = NOW() WHERE id = $1`, [vehicleId]);

      // Only update current location, movement status, and last_gps_update if this point is newer than stored fix
      if (isNewer) {
        await tx.query(
          `UPDATE vehicles 
           SET current_lat = $1, current_lng = $2, speed_kmh = $3, heading = $4,
               movement_status = $5, stoppage_start_time = $6, last_gps_update = $7,
               updated_at = NOW()
           WHERE id = $8`,
          [lat, lng, speedKmh, headingDeg, newStatus, stoppageStartTime, recordTimestamp, vehicleId]
        );

        if (driverId) {
          await tx.query(
            `UPDATE drivers 
             SET current_lat = $1, current_lng = $2, last_location_update = NOW(), updated_at = NOW()
             WHERE id = $3`,
            [lat, lng, driverId]
          );
        }
      }
    });

    if (isNewer) {
      // Auto-resolve of 'No Update' alert requires fresh recordedAt (within last 2 minutes)
      const isFresh = Math.abs(Date.now() - currentPointTime) <= 2 * 60 * 1000;
      if (isFresh) {
        await resolveActiveOutageAlert(vehicleId, companyId);
      }

      // Check destination geofence (500m)
      await checkGeofenceArrival(activeTrip, vehicleId, driverId, companyId, lat, lng);

      // Broadcast standardized payload to scoped company socket room
      const telemetryPayload = {
        vehicleId,
        tripId: activeTrip?.id || null,
        driverId,
        companyId,
        lat,
        lng,
        speedKmh,
        heading: headingDeg,
        accuracy: accuracyM,
        movementStatus: newStatus,
        recordedAt: recordTimestamp,
      };

      broadcastGpsUpdate(telemetryPayload);

      return res.json({
        success: true,
        message: 'GPS coordinates logged successfully',
        telemetry: telemetryPayload,
      });
    } else {
      return res.json({
        success: true,
        stale: true,
        message: 'GPS coordinate logged to history; current vehicle position retained because point is older than latest fix',
      });
    }
  } catch (err) {
    console.error('GPS Update Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/gps/batch (Batched Offline Points Ingestion)
router.post('/batch', authenticateGpsSender, async (req, res) => {
  try {
    const { vehicleId, driverId, companyId, activeTrip } = req.gpsAuth;
    const points = Array.isArray(req.body) ? req.body : (req.body.points || []);

    if (!Array.isArray(points) || points.length === 0) {
      return res.status(400).json({ success: false, message: 'Array of points is required' });
    }

    if (points.length > 500) {
      return res.status(400).json({ success: false, message: 'Batch size capped at 500 points per request' });
    }

    // Batch Rate Limit (1 batch per 10s per vehicle)
    const trackerState = getTrackerState(vehicleId);
    const now = Date.now();
    const elapsed = now - trackerState.lastBatchTime;

    if (elapsed < GPS_BATCH_LIMIT_MS) {
      const retryAfterMs = GPS_BATCH_LIMIT_MS - elapsed;
      res.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      return res.status(429).json({
        success: false,
        message: 'Batch rate limit exceeded: Max 1 batch per 10 seconds per vehicle',
        retryAfterMs,
      });
    }
    trackerState.lastBatchTime = now;

    // Filter retention window cutoff
    const retentionCutoff = new Date(Date.now() - GPS_RETENTION_DAYS * 24 * 60 * 60 * 1000).getTime();
    const maxFutureTime = Date.now() + 60000;

    // Validate, filter, and normalize points
    const validPoints = [];
    const seenTimestamps = new Set();

    for (const raw of points) {
      const lat = raw.lat !== undefined ? parseFloat(raw.lat) : parseFloat(raw.latitude);
      const lng = raw.lng !== undefined ? parseFloat(raw.lng) : parseFloat(raw.longitude);
      const speedKmh = raw.speedKmh !== undefined ? parseFloat(raw.speedKmh) : (raw.speed ? parseFloat(raw.speed) : 0);
      const headingDeg = raw.heading !== undefined ? parseFloat(raw.heading) : 0;
      const accuracyM = raw.accuracy !== undefined ? parseFloat(raw.accuracy) : 0;
      const recordedTime = raw.recordedAt ? new Date(raw.recordedAt).getTime() : now;

      // Drop points older than retention window or in the future
      if (isNaN(recordedTime) || recordedTime < retentionCutoff || recordedTime > maxFutureTime) {
        continue;
      }

      // Accuracy filter
      if (accuracyM > GPS_MIN_ACCURACY_M) {
        continue;
      }

      // Coordinate boundary check
      if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
        continue;
      }

      // Deduplicate points with identical timestamp
      const timeIso = new Date(recordedTime).toISOString();
      if (seenTimestamps.has(timeIso)) {
        continue;
      }
      seenTimestamps.add(timeIso);

      validPoints.push({
        lat,
        lng,
        speedKmh,
        heading: headingDeg,
        accuracy: accuracyM,
        recordedAt: timeIso,
        timestampMs: recordedTime,
        movementStatus: speedKmh >= 3 ? 'MOVING' : 'STOPPED',
      });
    }

    if (validPoints.length === 0) {
      return res.json({ success: true, processedCount: 0, message: 'All points in batch filtered out or duplicates' });
    }

    // Sort chronologically ascending
    validPoints.sort((a, b) => a.timestampMs - b.timestampMs);

    // Atomic Transaction: Insert all points to history, update vehicle with the newest point only if not stale
    const newestPoint = validPoints[validPoints.length - 1];
    let isBatchNewer = false;
    let evaluatedStatus = 'STOPPED';

    await db.withTransaction(async (tx) => {
      // 1. All valid batch points are recorded in history
      for (const p of validPoints) {
        await tx.query(
          `INSERT INTO gps_tracking_records (vehicle_id, driver_id, trip_id, latitude, longitude, speed_kmh, heading, accuracy, movement_status, recorded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [vehicleId, driverId, activeTrip?.id || null, p.lat, p.lng, p.speedKmh, p.heading, p.accuracy, p.movementStatus, p.recordedAt]
        );
      }

      // 2. Heartbeat: Server heard from device NOW()
      await tx.query(`UPDATE vehicles SET last_ping_at = NOW(), updated_at = NOW() WHERE id = $1`, [vehicleId]);

      // 3. Stale batch guard: compare newest point to stored last_gps_update
      const prevVehRes = await tx.query(`SELECT movement_status, stoppage_start_time, last_gps_update FROM vehicles WHERE id = $1`, [vehicleId]);
      const prevVehicle = prevVehRes.rows[0] || null;

      const prevLastGpsUpdate = prevVehicle?.last_gps_update ? new Date(prevVehicle.last_gps_update).getTime() : 0;
      isBatchNewer = newestPoint.timestampMs > prevLastGpsUpdate;

      if (isBatchNewer) {
        const { newStatus, stoppageStartTime } = evaluateMovementStatus(
          prevVehicle,
          trackerState,
          newestPoint.lat,
          newestPoint.lng,
          newestPoint.speedKmh
        );
        evaluatedStatus = newStatus;

        await tx.query(
          `UPDATE vehicles 
           SET current_lat = $1, current_lng = $2, speed_kmh = $3, heading = $4,
               movement_status = $5, stoppage_start_time = $6, last_gps_update = $7,
               updated_at = NOW()
           WHERE id = $8`,
          [newestPoint.lat, newestPoint.lng, newestPoint.speedKmh, newestPoint.heading, newStatus, stoppageStartTime, newestPoint.recordedAt, vehicleId]
        );

        if (driverId) {
          await tx.query(
            `UPDATE drivers 
             SET current_lat = $1, current_lng = $2, last_location_update = NOW(), updated_at = NOW()
             WHERE id = $3`,
            [newestPoint.lat, newestPoint.lng, driverId]
          );
        }
      }
    });

    if (isBatchNewer) {
      // Auto-resolve of 'No Update' alert requires fresh recordedAt (within last 2 minutes)
      const isFresh = Math.abs(Date.now() - newestPoint.timestampMs) <= 2 * 60 * 1000;
      if (isFresh) {
        await resolveActiveOutageAlert(vehicleId, companyId);
      }

      // Check geofence with newest point
      await checkGeofenceArrival(activeTrip, vehicleId, driverId, companyId, newestPoint.lat, newestPoint.lng);

      // Broadcast newest point over socket
      const telemetryPayload = {
        vehicleId,
        tripId: activeTrip?.id || null,
        driverId,
        companyId,
        lat: newestPoint.lat,
        lng: newestPoint.lng,
        speedKmh: newestPoint.speedKmh,
        heading: newestPoint.heading,
        accuracy: newestPoint.accuracy,
        movementStatus: evaluatedStatus,
        recordedAt: newestPoint.recordedAt,
      };

      broadcastGpsUpdate(telemetryPayload);

      return res.json({
        success: true,
        processedCount: validPoints.length,
        newestPoint: telemetryPayload,
      });
    } else {
      return res.json({
        success: true,
        processedCount: validPoints.length,
        stale: true,
        message: 'All points added to history; vehicle current position unchanged because batch is older than latest vehicle fix',
      });
    }
  } catch (err) {
    console.error('GPS Batch Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/gps/my-trip (Driver-Scoped Active Trip Endpoint, Strict Driver Auth Only)
router.get('/my-trip', requireRealAuth('DRIVER'), async (req, res) => {
  try {
    let driverId = req.user.driverId;
    if (!driverId) {
      const dRes = await db.query(`SELECT id FROM drivers WHERE user_id = $1 OR id = $2 LIMIT 1`, [req.user.id, req.user.empId]);
      if (dRes.rows.length > 0) driverId = dRes.rows[0].id;
    }

    if (!driverId) {
      return res.status(404).json({ success: false, message: 'Driver profile not found' });
    }

    const tripRes = await db.query(
      `SELECT t.id, t.company_id, t.status, t.vehicle_id, t.dispatch_date,
              c.name AS commodity_name,
              sb.name AS source_branch_name, sb.lat AS source_lat, sb.lng AS source_lng,
              dest_b.name AS destination_branch_name, dest_b.lat AS destination_lat, dest_b.lng AS destination_lng,
              v.type AS vehicle_type, v.current_lat AS vehicle_lat, v.current_lng AS vehicle_lng,
              v.movement_status, v.speed_kmh, v.heading,
              d.name AS driver_name
       FROM trips t
       JOIN branches sb ON sb.id = t.source_branch_id
       JOIN branches dest_b ON dest_b.id = t.destination_branch_id
       JOIN commodities c ON c.id = t.commodity_id
       LEFT JOIN vehicles v ON v.id = t.vehicle_id
       LEFT JOIN drivers d ON d.id = t.driver_id
       WHERE t.driver_id = $1 AND t.status IN ('IN_TRANSIT', 'DELAYED', 'CREATED', 'DISPATCH_APPROVED')
       ORDER BY t.created_at DESC
       LIMIT 1`,
      [driverId]
    );

    if (tripRes.rows.length === 0) {
      return res.json({
        success: true,
        hasActiveTrip: false,
        message: 'No active shipment assigned',
      });
    }

    const trip = tripRes.rows[0];
    res.json({
      success: true,
      hasActiveTrip: true,
      trip: {
        id: trip.id,
        vehicleId: trip.vehicle_id,
        vehicleType: trip.vehicle_type,
        status: trip.status,
        commodity: trip.commodity_name,
        source: trip.source_branch_name,
        destination: trip.destination_branch_name,
        destinationLat: Number(trip.destination_lat),
        destinationLng: Number(trip.destination_lng),
        driverName: trip.driver_name,
      },
    });
  } catch (err) {
    console.error('my-trip error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/gps/history/:vehicleId (Scoped to company with ?from=&to=&limit=)
router.get('/history/:vehicleId', requireRealAuth(), async (req, res) => {
  try {
    const vehicleId = req.params.vehicleId;
    const companyId = req.user.companyId || 'COMP-001';
    const isSuperAdmin = (req.user.role || '').toUpperCase() === 'SUPER_ADMIN';

    // Verify vehicle belongs to user's company
    let vehCheck;
    if (isSuperAdmin) {
      vehCheck = await db.query(`SELECT id FROM vehicles WHERE id = $1`, [vehicleId]);
    } else {
      vehCheck = await db.query(
        `SELECT id FROM vehicles WHERE id = $1 AND (company_id = $2 OR company_id IS NULL)`,
        [vehicleId, companyId]
      );
    }

    if (vehCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
    }

    const { from, to, limit } = req.query;
    const maxLimit = Math.min(parseInt(limit || '500', 10), 1000);

    let queryText = `SELECT * FROM gps_tracking_records WHERE vehicle_id = $1`;
    const params = [vehicleId];

    if (from) {
      params.push(new Date(from).toISOString());
      queryText += ` AND recorded_at >= $${params.length}`;
    }

    if (to) {
      params.push(new Date(to).toISOString());
      queryText += ` AND recorded_at <= $${params.length}`;
    }

    params.push(maxLimit);
    queryText += ` ORDER BY recorded_at DESC LIMIT $${params.length}`;

    const result = await db.query(queryText, params);
    const records = result.rows.map(r => ({
      ...r,
      lat: r.lat !== undefined ? r.lat : r.latitude,
      lng: r.lng !== undefined ? r.lng : r.longitude,
    }));

    res.json({
      success: true,
      vehicleId,
      count: records.length,
      records,
      history: records,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// RETENTION CRON JOB
// ==========================================

/**
 * Prunes GPS tracking history older than the configured retention window
 */
async function cleanupGpsRecords(days) {
  try {
    const retentionDays = parseInt(days || GPS_RETENTION_DAYS || '90', 10);
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    const result = await db.query(`DELETE FROM gps_tracking_records WHERE recorded_at < $1`, [cutoffDate]);
    const prunedCount = result.rowCount || (result.rows ? result.rows.length : 0);

    console.log(`[GPS Retention] Pruned ${prunedCount} records older than ${retentionDays} days (cutoff: ${cutoffDate})`);
    return prunedCount;
  } catch (err) {
    console.error('[GPS Retention Error]:', err.message);
    return 0;
  }
}

// Scheduled daily at 03:00 AM
cron.schedule('0 3 * * *', () => {
  cleanupGpsRecords();
});

module.exports = router;
module.exports.cleanupGpsRecords = cleanupGpsRecords;
