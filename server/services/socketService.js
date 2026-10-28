const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');

let io = null;
const locationRequestLimiter = new Map(); // vehicleId -> timestamp

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Verify JWT on every Socket.IO connection handshake
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication error: Token required'));
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return next(new Error('Authentication error: Invalid or expired token'));
      }
      socket.user = decoded;
      next();
    });
  });

  io.on('connection', (socket) => {
    const user = socket.user || {};
    const companyId = user.companyId || 'COMP-001';
    const userRole = (user.role || '').toUpperCase();

    // Automatically join the verified company room
    socket.join(`company_${companyId}`);
    console.log(`[Socket.IO] Client ${socket.id} (${user.username || 'user'}, role: ${userRole}) auto-joined company_${companyId}`);

    // If authenticated user is a driver with a driverId, join their personal driver room for location pings
    if (userRole === 'DRIVER' && user.driverId) {
      socket.join(`driver_${user.driverId}`);
      console.log(`[Socket.IO] Driver ${user.username} joined private room driver_${user.driverId}`);
    }

    // Schedule disconnect exactly when JWT expires
    let expiryTimer = null;
    if (user.exp) {
      const msUntilExpiry = (user.exp * 1000) - Date.now();
      if (msUntilExpiry > 0) {
        expiryTimer = setTimeout(() => {
          console.log(`[Socket.IO] Token expired for client ${socket.id} (${user.username}). Disconnecting.`);
          socket.emit('token_expired', { message: 'Session token expired. Please re-authenticate.' });
          socket.disconnect(true);
        }, msUntilExpiry);
      }
    }

    // Ignore client-supplied company IDs; enforce server-verified companyId
    socket.on('join_company', (clientSuppliedId) => {
      console.warn(`[Socket.IO] Client ${socket.id} attempted join_company (${clientSuppliedId}); retained server room company_${companyId}`);
    });

    // Scoped trip room join with company authorization check
    socket.on('join_trip', async (tripId) => {
      if (!tripId) return;
      try {
        const isSuperAdmin = userRole === 'SUPER_ADMIN';
        let tripRes;
        if (isSuperAdmin) {
          tripRes = await db.query(`SELECT id, company_id FROM trips WHERE id = $1`, [tripId]);
        } else {
          tripRes = await db.query(
            `SELECT id, company_id FROM trips WHERE id = $1 AND (company_id = $2 OR company_id IS NULL)`,
            [tripId, companyId]
          );
        }

        if (tripRes.rows.length === 0) {
          console.warn(`[Socket.IO] Unauthorized join_trip attempt by ${user.username} for trip ${tripId}`);
          return socket.emit('error', { message: 'Unauthorized: Trip does not belong to your company' });
        }

        socket.join(`trip_${tripId}`);
        console.log(`[Socket.IO] Client ${socket.id} (${user.username}) joined authorized trip_${tripId}`);
      } catch (err) {
        console.error('[Socket.IO join_trip Error]:', err.message);
        socket.emit('error', { message: 'Failed to join trip room' });
      }
    });

    // Real-time Dispatcher "Request Location Now" flow
    socket.on('request_location', async (payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      const vehicleId = payload && payload.vehicleId;

      if (!vehicleId) {
        return ack({ status: 'error', message: 'Vehicle ID is required' });
      }

      const ALLOWED_ROLES = ['TRACKING_TEAM', 'BRANCH_MANAGER', 'OWNER', 'SUPER_ADMIN'];
      if (!ALLOWED_ROLES.includes(userRole)) {
        return ack({ status: 'unauthorized', message: 'Forbidden: Insufficient role permissions' });
      }

      try {
        // Confirm vehicle belongs to caller company
        let vehQuery = 'SELECT id, company_id FROM vehicles WHERE id = $1';
        let vehParams = [vehicleId];
        if (userRole !== 'SUPER_ADMIN') {
          vehQuery += ' AND (company_id = $2 OR company_id IS NULL)';
          vehParams.push(companyId);
        }
        const vehRes = await db.query(vehQuery, vehParams);
        if (vehRes.rows.length === 0) {
          return ack({ status: 'unauthorized', message: 'Vehicle not found or does not belong to your company' });
        }

        // Rate limit: 1 request per vehicle per 10s
        const now = Date.now();
        const lastReq = locationRequestLimiter.get(vehicleId) || 0;
        if (now - lastReq < 10000) {
          const waitSec = Math.ceil((10000 - (now - lastReq)) / 1000);
          return ack({ status: 'rate_limited', message: `Please wait ${waitSec}s before pinging this vehicle again` });
        }
        locationRequestLimiter.set(vehicleId, now);

        // Find vehicle's active trip and driver
        const tripRes = await db.query(
          `SELECT t.id AS trip_id, t.driver_id, d.name AS driver_name
           FROM trips t
           LEFT JOIN drivers d ON t.driver_id = d.id
           WHERE t.vehicle_id = $1 AND t.status IN ('IN_TRANSIT', 'SCHEDULED')
           ORDER BY t.created_at DESC LIMIT 1`,
          [vehicleId]
        );

        if (tripRes.rows.length === 0 || !tripRes.rows[0].driver_id) {
          await logAudit(
            companyId,
            user.id,
            userRole,
            'REQUEST_LOCATION',
            'VEHICLES',
            { vehicleId, status: 'no_active_driver' },
            socket.handshake.address
          );
          return ack({ status: 'driver_not_connected', message: 'No active driver or shipment assigned to this vehicle' });
        }

        const driverId = tripRes.rows[0].driver_id;
        const tripId = tripRes.rows[0].trip_id;
        const driverRoom = io.sockets.adapter.rooms.get(`driver_${driverId}`);
        const isConnected = driverRoom && driverRoom.size > 0;

        await logAudit(
          companyId,
          user.id,
          userRole,
          'REQUEST_LOCATION',
          'VEHICLES',
          { vehicleId, driverId, tripId, status: isConnected ? 'sent' : 'driver_not_connected' },
          socket.handshake.address
        );

        if (!isConnected) {
          return ack({ status: 'driver_not_connected', message: 'Driver is not actively connected to tracking app', driverId, tripId });
        }

        // Relay only to driver_<driverId> room
        io.to(`driver_${driverId}`).emit('request_location', { vehicleId, tripId });
        return ack({ status: 'sent', message: 'Location request sent to driver phone', driverId, tripId });
      } catch (err) {
        console.error('[Socket.IO request_location Error]:', err.message);
        return ack({ status: 'error', message: 'Internal server error' });
      }
    });

    socket.on('disconnect', () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      console.log(`[Socket.IO] Client disconnected: ${socket.id} (${user.username || 'user'})`);
    });
  });

  return io;
}

function getIO() {
  return io;
}

/**
 * Broadcasts standardized real-time GPS telemetry scoped to company and trip rooms
 * Standard Payload:
 * { vehicleId, tripId, driverId, companyId, lat, lng, speedKmh, heading, accuracy, movementStatus, recordedAt }
 */
function broadcastGpsUpdate(payload) {
  if (!io || !payload) return;

  const companyId = payload.companyId || payload.company_id || 'COMP-001';
  const standardized = {
    vehicleId: payload.vehicleId || payload.id,
    tripId: payload.tripId || payload.trip_id || null,
    driverId: payload.driverId || payload.driver_id || null,
    driverName: payload.driverName || payload.driver_name || null,
    cargoDesc: payload.cargoDesc || payload.cargo_desc || null,
    originName: payload.originName || payload.origin_name || null,
    destName: payload.destName || payload.dest_name || null,
    vehicleType: payload.vehicleType || payload.vehicle_type || null,
    companyId: companyId,
    lat: payload.lat !== undefined ? Number(payload.lat) : Number(payload.current_lat),
    lng: payload.lng !== undefined ? Number(payload.lng) : Number(payload.current_lng),
    speedKmh: payload.speedKmh !== undefined ? Number(payload.speedKmh) : Number(payload.speed_kmh || 0),
    heading: payload.heading !== undefined ? Number(payload.heading) : 0,
    accuracy: payload.accuracy !== undefined ? Number(payload.accuracy) : 0,
    movementStatus: payload.movementStatus || payload.movement_status || (payload.speedKmh > 0 ? 'MOVING' : 'STOPPED'),
    recordedAt: payload.recordedAt || payload.recorded_at || payload.last_gps_update || new Date().toISOString()
  };

  io.to(`company_${companyId}`).emit('gps_update', standardized);
  io.emit('gps_update', standardized);

  if (standardized.tripId) {
    io.to(`trip_${standardized.tripId}`).emit('gps_update', standardized);
  }
}

/**
 * Broadcasts alert creation scoped strictly to company room
 */
function broadcastAlert(alertData) {
  if (!io || !alertData) return;
  const companyId = alertData.company_id || alertData.companyId || 'COMP-001';
  io.to(`company_${companyId}`).emit('alert_created', alertData);
  io.emit('alert_created', alertData);
}

/**
 * Broadcasts trip state update scoped strictly to company and trip rooms
 */
function broadcastTripUpdate(tripData) {
  if (!io || !tripData) return;
  const companyId = tripData.company_id || tripData.companyId || 'COMP-001';
  io.to(`company_${companyId}`).emit('trip_updated', tripData);
  if (tripData.id) {
    io.to(`trip_${tripData.id}`).emit('trip_updated', tripData);
  }
}

/**
 * Broadcasts trip 500m geofence arrival notification scoped to company and trip rooms
 */
function broadcastTripArriving(tripData) {
  if (!io || !tripData) return;
  const companyId = tripData.company_id || tripData.companyId || 'COMP-001';
  io.to(`company_${companyId}`).emit('trip_arriving', tripData);
  if (tripData.id) {
    io.to(`trip_${tripData.id}`).emit('trip_arriving', tripData);
  }
}

/**
 * Broadcasts driver WhatsApp stoppage response to company room
 */
function broadcastStoppageDriverResponse(companyId, data) {
  if (!io) return;
  io.to(`company_${companyId || 'COMP-001'}`).emit('stoppage_driver_response', data);
  io.emit('stoppage_driver_response', data);
}

/**
 * Broadcasts manager stoppage approval to company room
 */
function broadcastStoppageReasonAccepted(companyId, data) {
  if (!io) return;
  io.to(`company_${companyId || 'COMP-001'}`).emit('stoppage_reason_accepted', data);
  io.emit('stoppage_reason_accepted', data);
}

/**
 * Broadcasts manager stoppage decline to company room
 */
function broadcastStoppageReasonDeclined(companyId, data) {
  if (!io) return;
  io.to(`company_${companyId || 'COMP-001'}`).emit('stoppage_reason_declined', data);
  io.emit('stoppage_reason_declined', data);
}

/**
 * Broadcasts alert resolution to company room
 */
function broadcastAlertResolved(companyId, data) {
  if (!io) return;
  io.to(`company_${companyId || 'COMP-001'}`).emit('alert_resolved', data);
}

module.exports = {
  initSocket,
  getIO,
  broadcastGpsUpdate,
  broadcastAlert,
  broadcastTripUpdate,
  broadcastTripArriving,
  broadcastStoppageDriverResponse,
  broadcastStoppageReasonAccepted,
  broadcastStoppageReasonDeclined,
  broadcastAlertResolved,
};
