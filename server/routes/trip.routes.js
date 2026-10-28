const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { broadcastTripUpdate } = require('../services/socketService');
const whatsappService = require('../services/whatsappService');

// GET /api/trips
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId || 'COMP-001';
    const statusFilter = req.query.status;
    const searchQuery = req.query.search;

    let query = `
      SELECT t.*, 
             c.name AS commodity_name, c.unit AS commodity_unit,
             sb.name AS source_branch_name, db_br.name AS destination_branch_name,
             v.type AS vehicle_type, d.name AS driver_name, d.phone AS driver_phone,
             h.name AS helper_name,
             v.current_lat, v.current_lng, v.speed_kmh, v.heading, v.movement_status,
             v.last_gps_update, v.last_ping_at
      FROM trips t
      LEFT JOIN commodities c ON c.id = t.commodity_id
      LEFT JOIN branches sb ON sb.id = t.source_branch_id
      LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id
      LEFT JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN drivers d ON d.id = t.driver_id
      LEFT JOIN helpers h ON h.id = t.helper_id
      WHERE t.company_id = $1 OR t.company_id = 'COMP-001' OR t.company_id IS NULL
    `;
    const params = [companyId];

    if (statusFilter) {
      params.push(statusFilter);
      query += ` AND t.status = $${params.length}`;
    }

    if (searchQuery) {
      params.push(`%${searchQuery}%`);
      query += ` AND (t.id ILIKE $${params.length} OR t.vehicle_id ILIKE $${params.length} OR d.name ILIKE $${params.length})`;
    }

    query += ` ORDER BY t.created_at DESC`;

    const result = await db.query(query, params);
    res.json({ success: true, trips: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/trips/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT t.*, 
             c.name AS commodity_name, c.unit AS commodity_unit,
             sb.name AS source_branch_name, db_br.name AS destination_branch_name,
             v.type AS vehicle_type, d.name AS driver_name, d.phone AS driver_phone,
             h.name AS helper_name,
             v.current_lat, v.current_lng, v.speed_kmh, v.heading, v.movement_status,
             v.last_gps_update, v.last_ping_at
      FROM trips t
      LEFT JOIN commodities c ON c.id = t.commodity_id
      LEFT JOIN branches sb ON sb.id = t.source_branch_id
      LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id
      LEFT JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN drivers d ON d.id = t.driver_id
      LEFT JOIN helpers h ON h.id = t.helper_id
      WHERE t.id = $1
    `;
    const result = await db.query(query, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    res.json({ success: true, trip: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/trips (Create & Dispatch Trip)
router.post('/', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER', 'TRACKING_TEAM', 'BRANCH_MANAGER'), async (req, res) => {
  try {
    const { sourceBranchId, destinationBranchId, commodityId, quantity, vehicleId, driverId, helperId, empId, expectedHours } = req.body;
    const companyId = req.user.companyId || 'COMP-001';

    if (!sourceBranchId || !destinationBranchId || !commodityId || !quantity || !vehicleId || !driverId) {
      return res.status(400).json({ success: false, message: 'All required trip dispatch fields must be provided' });
    }

    const tripCountRes = await db.query(`SELECT COUNT(*) AS count FROM trips`);
    const countRow = tripCountRes.rows[0];
    const rawCount = countRow ? (countRow.count ?? countRow['COUNT(*)'] ?? countRow['count(*)'] ?? 0) : 0;
    const count = parseInt(rawCount, 10) || 0;
    const tripId = 'TRIP-' + String(count + 1001);
    const dispatchId = 'DISP-' + String(count + 2001);

    const hours = expectedHours ? parseInt(expectedHours, 10) : 8;
    const expectedDelivery = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    const checklists = {
      dispatch: { loaded: false, verified: false, vehicleReady: false, driverAvailable: false },
      delivery: { quantityMatches: false, damagesChecked: false, missingChecked: false, conditionOk: false }
    };

    const newTrip = await db.query(
      `INSERT INTO trips (id, company_id, dispatch_id, commodity_id, quantity, source_branch_id, destination_branch_id, vehicle_id, driver_id, helper_id, created_by_emp_id, dispatch_date, expected_delivery_date, status, checklists, transit_updates, last_update_timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12, 'CREATED', $13, '[]'::jsonb, NOW())
       RETURNING *`,
      [tripId, companyId, dispatchId, commodityId, quantity, sourceBranchId, destinationBranchId, vehicleId, driverId, helperId || null, empId || req.user.empId, expectedDelivery, JSON.stringify(checklists)]
    );

    // Update destination pending stock
    await db.query(
      `INSERT INTO stock (branch_id, commodity_id, available_qty, in_transit_qty, delivered_qty, pending_qty)
       VALUES ($1, $2, 0, 0, 0, $3)
       ON CONFLICT (branch_id, commodity_id) DO UPDATE
       SET pending_qty = stock.pending_qty + EXCLUDED.pending_qty, updated_at = NOW()`,
      [destinationBranchId, commodityId, quantity]
    );

    // Update status of vehicle and driver
    await db.query(`UPDATE vehicles SET status = 'In Transit', updated_at = NOW() WHERE id = $1`, [vehicleId]);
    await db.query(`UPDATE drivers SET status = 'On Trip', updated_at = NOW() WHERE id = $1`, [driverId]);

    broadcastTripUpdate(newTrip.rows[0]);

    // Asynchronously dispatch WhatsApp trip assignment alert to driver
    (async () => {
      try {
        const driverInfo = await db.query(`SELECT name, phone FROM drivers WHERE id = $1`, [driverId]);
        const commInfo = await db.query(`SELECT name FROM commodities WHERE id = $1`, [commodityId]);
        const srcInfo = await db.query(`SELECT name FROM branches WHERE id = $1`, [sourceBranchId]);
        const dstInfo = await db.query(`SELECT name FROM branches WHERE id = $1`, [destinationBranchId]);
        if (driverInfo.rows[0]?.phone) {
          await whatsappService.sendTripDispatchNotification({
            id: tripId,
            commodity_name: commInfo.rows[0]?.name || commodityId,
            quantity,
            vehicle_id: vehicleId,
            source_branch_name: srcInfo.rows[0]?.name || sourceBranchId,
            destination_branch_name: dstInfo.rows[0]?.name || destinationBranchId,
            expected_delivery_date: expectedDelivery,
          }, driverInfo.rows[0].phone);
        }
      } catch (waErr) {
        console.warn('⚠️ [WhatsApp Auto-Dispatch Alert Error]:', waErr.message);
      }
    })();

    res.status(201).json({ success: true, trip: newTrip.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/trips/:id/status
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status, checklists, transitUpdate } = req.body;
    const tripRes = await db.query(`SELECT * FROM trips WHERE id = $1`, [req.params.id]);

    if (tripRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    const trip = tripRes.rows[0];
    const oldStatus = trip.status;

    // Safely unwrap checklists from SQLite/Postgres
    let baseChecklists = trip.checklists;
    while (typeof baseChecklists === 'string') {
      try { baseChecklists = JSON.parse(baseChecklists); } catch(e) { baseChecklists = {}; break; }
    }
    if (!baseChecklists || typeof baseChecklists !== 'object') baseChecklists = {};

    let inputChecklists = checklists;
    while (typeof inputChecklists === 'string') {
      try { inputChecklists = JSON.parse(inputChecklists); } catch(e) { inputChecklists = {}; break; }
    }
    let updatedChecklists = inputChecklists ? { ...baseChecklists, ...inputChecklists } : baseChecklists;

    // Safely unwrap transitUpdates from SQLite/Postgres
    let baseTransitUpdates = trip.transit_updates;
    while (typeof baseTransitUpdates === 'string') {
      try { baseTransitUpdates = JSON.parse(baseTransitUpdates); } catch(e) { baseTransitUpdates = []; break; }
    }
    if (!Array.isArray(baseTransitUpdates)) baseTransitUpdates = [];

    let updatedTransitUpdates = [...baseTransitUpdates];
    if (transitUpdate) {
      updatedTransitUpdates.push(transitUpdate);
    }

    // Handle Stock Transitions
    if (status === 'IN_TRANSIT' && oldStatus !== 'IN_TRANSIT') {
      // Source available decreases
      await db.query(
        `UPDATE stock SET available_qty = GREATEST(0, available_qty - $1), updated_at = NOW()
         WHERE branch_id = $2 AND commodity_id = $3`,
        [trip.quantity, trip.source_branch_id, trip.commodity_id]
      );
      // Destination in-transit increases, pending decreases
      await db.query(
        `UPDATE stock 
         SET in_transit_qty = in_transit_qty + $1,
             pending_qty = GREATEST(0, pending_qty - $1),
             updated_at = NOW()
         WHERE branch_id = $2 AND commodity_id = $3`,
        [trip.quantity, trip.destination_branch_id, trip.commodity_id]
      );
    }

    const updatedTrip = await db.query(
      `UPDATE trips 
       SET status = COALESCE($1, status),
           checklists = $2,
           transit_updates = $3,
           last_update_timestamp = NOW(),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, JSON.stringify(updatedChecklists), JSON.stringify(updatedTransitUpdates), req.params.id]
    );

    broadcastTripUpdate(updatedTrip.rows[0]);

    // If marked as DELAYED, automatically alert Driver & Higher Official on WhatsApp
    if (status === 'DELAYED') {
      (async () => {
        try {
          const tripInfo = await db.query(
            `SELECT t.*, d.name AS driver_name, d.phone AS driver_phone,
                    v.type AS vehicle_type, sb.name AS source_name, db_br.name AS dest_name,
                    c.name AS commodity_name
             FROM trips t
             LEFT JOIN drivers d ON d.id = t.driver_id
             LEFT JOIN vehicles v ON v.id = t.vehicle_id
             LEFT JOIN branches sb ON sb.id = t.source_branch_id
             LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id
             LEFT JOIN commodities c ON c.id = t.commodity_id
             WHERE t.id = $1`,
            [req.params.id]
          );
          if (tripInfo.rows.length > 0) {
            const t = tripInfo.rows[0];
            const reason = transitUpdate?.reason || 'Shipment marked as DELAYED by Operations';

            // 1. Alert Driver
            if (t.driver_phone) {
              await whatsappService.sendTextMessage(
                t.driver_phone,
                `⚠️ *SHIPMENT DELAY ALERT: ${t.id}*\n------------------------\n🚛 *Vehicle:* ${t.vehicle_id}\n📦 *Cargo:* ${t.commodity_name || 'Goods'}\n📍 *Route:* ${t.source_name} -> ${t.dest_name}\n⚠️ *Delay Reason:* ${reason}\n------------------------\nPlease ensure vehicle safety and keep Operations updated on your estimated arrival.`
              );
            }

            // 2. Alert Higher Official
            const higherOfficial = process.env.HIGHER_OFFICIAL_PHONE || "916382897998";
            if (higherOfficial) {
              await whatsappService.sendTextMessage(
                higherOfficial,
                `🚨 *TRANSIT DELAY NOTICE - LCOS OPERATIONS*\n------------------------\n📋 *Trip ID:* ${t.id}\n🚛 *Vehicle:* ${t.vehicle_id} (${t.vehicle_type || 'Truck'})\n👤 *Driver:* ${t.driver_name || 'Driver'} (📞 ${t.driver_phone || 'N/A'})\n📍 *Route:* ${t.source_name} -> ${t.dest_name}\n⚠️ *Delay Reason:* ${reason}\n------------------------\nShipment has been delayed in transit. Operations monitoring is in progress.`
              );
            }
          }
        } catch (delayErr) {
          console.warn('⚠️ [WhatsApp Delay Alert Error]:', delayErr.message);
        }
      })();
    }

    res.json({ success: true, trip: updatedTrip.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/trips/:id/close-delivery
router.post('/:id/close-delivery', authenticateToken, async (req, res) => {
  try {
    const { receivedQuantity, damagesCount, missingCount, condition, receiverName, receiptNumber } = req.body;
    const tripRes = await db.query(`SELECT * FROM trips WHERE id = $1`, [req.params.id]);

    if (tripRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Trip not found' });
    const trip = tripRes.rows[0];

    const deliveryInfo = {
      receivedQuantity: Number(receivedQuantity),
      damagesCount: Number(damagesCount || 0),
      missingCount: Number(missingCount || 0),
      condition: condition || 'Good',
      receiverName: receiverName,
      receiptNumber: receiptNumber || ('RCPT-' + Math.floor(1000 + Math.random() * 9000)),
      closedTimestamp: new Date().toISOString()
    };

    const qtyDispatched = Number(trip.quantity);
    const qtyReceived = Number(receivedQuantity);

    // Final Stock Update: Destination In-transit decreases, Available & Delivered increase
    await db.query(
      `UPDATE stock
       SET in_transit_qty = GREATEST(0, in_transit_qty - $1),
           available_qty = available_qty + $2,
           delivered_qty = delivered_qty + $2,
           updated_at = NOW()
       WHERE branch_id = $3 AND commodity_id = $4`,
      [qtyDispatched, qtyReceived, trip.destination_branch_id, trip.commodity_id]
    );

    // Deduct score if damages or missing
    if (damagesCount > 0 || missingCount > 0) {
      const penalty = (damagesCount > 0 ? 10 : 0) + (missingCount > 0 ? 5 : 0);
      await db.query(
        `UPDATE drivers SET performance_score = GREATEST(0, performance_score - $1) WHERE id = $2`,
        [penalty, trip.driver_id]
      );
    }

    // Always mark the arriving vehicle and driver as Available (stationed at the destination branch)
    await db.query(`UPDATE vehicles SET status = 'Available', updated_at = NOW() WHERE id = $1`, [trip.vehicle_id]);
    await db.query(`UPDATE drivers SET status = 'Available', updated_at = NOW() WHERE id = $1`, [trip.driver_id]);
    if (trip.helper_id) {
      await db.query(`UPDATE helpers SET status = 'Available', updated_at = NOW() WHERE id = $1`, [trip.helper_id]);
    }

    // Automated Return Load Matching Engine
    // Check if there is an available pending load at the current destination heading back or to a suitable return destination
    const returnLoadRes = await db.query(
      `SELECT t.*, c.name AS commodity_name, c.unit AS commodity_unit,
              sb.name AS source_branch_name, sb.manager_name AS source_manager_name, sb.phone AS source_manager_phone,
              db_br.name AS destination_branch_name, db_br.manager_name AS destination_manager_name, db_br.phone AS destination_manager_phone
       FROM trips t
       LEFT JOIN commodities c ON c.id = t.commodity_id
       LEFT JOIN branches sb ON sb.id = t.source_branch_id
       LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id
       WHERE t.source_branch_id = $1 
         AND t.status IN ('CREATED', 'PLANNED') 
         AND (t.company_id = $2 OR t.company_id = 'COMP-001' OR t.company_id IS NULL)
       ORDER BY (CASE WHEN t.destination_branch_id = $3 THEN 1 ELSE 2 END), t.created_at ASC
       LIMIT 1`,
      [trip.destination_branch_id, req.user.companyId || 'COMP-001', trip.source_branch_id]
    );

    let returnMatchingInfo = {};
    if (returnLoadRes.rows.length > 0) {
      const returnTrip = returnLoadRes.rows[0];

      returnMatchingInfo = {
        hasReturnLoad: true,
        potentialReturnTripId: returnTrip.id,
        returnCommodity: returnTrip.commodity_name || 'Return Cargo',
        returnQuantity: returnTrip.quantity,
        returnSource: trip.destination_branch_id,
        returnDestination: returnTrip.destination_branch_id,
        statusText: 'Opportunity Detected - Call & Verify',
        message: `Return cargo found (${returnTrip.commodity_name}) at ${returnTrip.source_branch_name || trip.destination_branch_id}. WhatsApp sent to Driver & Branch Manager. Call & verify before clicking "Pair Backload".`
      };

      // Asynchronously trigger automated WhatsApp to both Driver and Destination Branch Manager
      (async () => {
        try {
          const driverRes = await db.query(`SELECT name, phone FROM drivers WHERE id = $1`, [trip.driver_id]);
          const vehicleRes = await db.query(`SELECT id, type FROM vehicles WHERE id = $1`, [trip.vehicle_id]);
          const driverInfo = driverRes.rows[0] || {};
          const vehicleInfo = vehicleRes.rows[0] || {};

          await whatsappService.sendReturnLoadOpportunityNotification({
            driverPhone: driverInfo.phone,
            managerPhone: returnTrip.source_manager_phone,
            returnTrip,
            vehicle: vehicleInfo,
            driver: driverInfo,
            sourceBranch: {
              id: trip.destination_branch_id,
              name: returnTrip.source_branch_name,
              manager_name: returnTrip.source_manager_name,
              phone: returnTrip.source_manager_phone,
            },
            destBranch: {
              id: returnTrip.destination_branch_id,
              name: returnTrip.destination_branch_name,
              manager_name: returnTrip.destination_manager_name,
              phone: returnTrip.destination_manager_phone,
            },
          });
        } catch (waErr) {
          console.warn('⚠️ [WhatsApp Return Opportunity Alert Error]:', waErr.message);
        }
      })();
    } else {
      // No return load available -> Flag as Empty Return
      returnMatchingInfo = {
        hasReturnLoad: false,
        returnType: 'Empty Return',
        statusText: 'Empty Return Leg',
        message: `No return load available at destination branch. Lorry ${trip.vehicle_id} marked as Empty Return.`
      };
    }

    deliveryInfo.returnMatchingInfo = returnMatchingInfo;

    const updatedTrip = await db.query(
      `UPDATE trips
       SET status = 'CLOSED', delivery_info = $1, last_update_timestamp = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(deliveryInfo), req.params.id]
    );

    broadcastTripUpdate(updatedTrip.rows[0]);

    // Send WhatsApp delivery notification asynchronously
    (async () => {
      try {
        const driverInfo = await db.query(`SELECT phone FROM drivers WHERE id = $1`, [trip.driver_id]);
        const dstBranch = await db.query(`SELECT phone, name FROM branches WHERE id = $1`, [trip.destination_branch_id]);
        const comm = await db.query(`SELECT name FROM commodities WHERE id = $1`, [trip.commodity_id]);
        const targetPhone = dstBranch.rows[0]?.phone || driverInfo.rows[0]?.phone;
        if (targetPhone) {
          await whatsappService.sendDeliveryConfirmationNotification({
            id: trip.id,
            commodity_name: comm.rows[0]?.name || trip.commodity_id,
            quantity: receivedQuantity || trip.quantity,
            destination_branch_name: dstBranch.rows[0]?.name || trip.destination_branch_id,
          }, targetPhone);
        }
      } catch (waErr) {
        console.warn('⚠️ [WhatsApp Auto-Delivery Alert Error]:', waErr.message);
      }
    })();

    res.json({ success: true, trip: updatedTrip.rows[0], returnMatchingInfo });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/trips/:id/return-arrival
router.post('/:id/return-arrival', authenticateToken, async (req, res) => {
  try {
    const tripRes = await db.query(`SELECT * FROM trips WHERE id = $1`, [req.params.id]);
    if (tripRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Trip not found' });
    const trip = tripRes.rows[0];

    // Release resources
    await db.query(`UPDATE vehicles SET status = 'Available' WHERE id = $1`, [trip.vehicle_id]);
    await db.query(`UPDATE drivers SET status = 'Available' WHERE id = $1`, [trip.driver_id]);

    const updated = await db.query(
      `UPDATE trips SET status = 'COMPLETED_RETURN', last_update_timestamp = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    // Record Call log
    const logId = 'CL-' + Math.floor(1000 + Math.random() * 9000);
    await db.query(
      `INSERT INTO call_logs (id, company_id, trip_id, call_category, caller, recipient, conversation_notes)
       VALUES ($1, $2, $3, 'Arrival Update', 'Driver', 'Admin Office', 'Vehicle returned to Origin Branch base gates. Driver and helper checked in.')`,
      [logId, req.user.companyId || 'COMP-001', trip.id]
    );

    res.json({ success: true, trip: updated.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/trips/backloads/available (Fetch available returning vehicles and pending return cargo)
router.get('/backloads/available', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId || 'COMP-001';

    // 1. Pending trips waiting at any branch for dispatch
    const pendingCargoRes = await db.query(
      `SELECT t.*, 
              c.name AS commodity_name, c.unit AS commodity_unit,
              sb.name AS source_branch_name, db_br.name AS destination_branch_name
       FROM trips t
       LEFT JOIN commodities c ON c.id = t.commodity_id
       LEFT JOIN branches sb ON sb.id = t.source_branch_id
       LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id
       WHERE t.status IN ('CREATED', 'PLANNED') 
         AND (t.company_id = $1 OR t.company_id = 'COMP-001' OR t.company_id IS NULL)
       ORDER BY t.created_at DESC`,
      [companyId]
    );

    // 2. Closed & Paired trips where lorry is at destination branch or returning
    const closedTripsRes = await db.query(
      `SELECT t.*, 
              v.type AS vehicle_type, d.name AS driver_name, d.phone AS driver_phone,
              sb.name AS original_source_branch_name, db_br.name AS current_branch_name
       FROM trips t
       LEFT JOIN vehicles v ON v.id = t.vehicle_id
       LEFT JOIN drivers d ON d.id = t.driver_id
       LEFT JOIN branches sb ON sb.id = t.source_branch_id
       LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id
       WHERE t.status IN ('CLOSED', 'BACKLOAD_PAIRED')
         AND (t.company_id = $1 OR t.company_id = 'COMP-001' OR t.company_id IS NULL)
       ORDER BY t.updated_at DESC
       LIMIT 20`,
      [companyId]
    );

    // 3. Active & Completed Matched Backload Trips
    const matchedTripsRes = await db.query(
      `SELECT t.*, 
              c.name AS commodity_name, c.unit AS commodity_unit,
              sb.name AS source_branch_name, db_br.name AS destination_branch_name,
              v.type AS vehicle_type, d.name AS driver_name, d.phone AS driver_phone
       FROM trips t
       LEFT JOIN commodities c ON c.id = t.commodity_id
       LEFT JOIN branches sb ON sb.id = t.source_branch_id
       LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id
       LEFT JOIN vehicles v ON v.id = t.vehicle_id
       LEFT JOIN drivers d ON d.id = t.driver_id
       WHERE (t.status IN ('DISPATCH_APPROVED', 'IN_TRANSIT', 'DELAYED', 'ARRIVED', 'COMPLETED_RETURN')
              AND (t.delivery_info->>'isBackload' = 'true' OR t.checklists->>'isBackload' = 'true'))
          OR t.status = 'BACKLOAD_PAIRED'
         AND (t.company_id = $1 OR t.company_id = 'COMP-001' OR t.company_id IS NULL)
       ORDER BY t.updated_at DESC`,
      [companyId]
    );

    res.json({
      success: true,
      pendingCargo: pendingCargoRes.rows,
      returningVehicles: closedTripsRes.rows,
      matchedBackloadTrips: matchedTripsRes.rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/trips/assign-backload (Pair an idle returning vehicle with a pending return cargo trip)
router.post('/assign-backload', authenticateToken, authorizeRoles('SUPER_ADMIN', 'OWNER', 'TRACKING_TEAM', 'BRANCH_MANAGER'), async (req, res) => {
  try {
    const { tripId, vehicleId, driverId, helperId } = req.body;

    if (!tripId || !vehicleId || !driverId) {
      return res.status(400).json({ success: false, message: 'tripId, vehicleId, and driverId are required' });
    }

    const tripRes = await db.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
    if (tripRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Return trip not found' });
    }

    const trip = tripRes.rows[0];

    // Safely parse and merge delivery_info and checklists in JavaScript
    let deliveryInfo = {};
    try {
      deliveryInfo = typeof trip.delivery_info === 'string' ? JSON.parse(trip.delivery_info || '{}') : (trip.delivery_info || {});
    } catch (_) {}
    deliveryInfo.isBackload = true;
    deliveryInfo.pairedAt = new Date().toISOString();

    let checklists = {};
    try {
      checklists = typeof trip.checklists === 'string' ? JSON.parse(trip.checklists || '{}') : (trip.checklists || {});
    } catch (_) {}
    checklists.isBackload = true;
    checklists.dispatch = { loaded: true, verified: true };

    const updatedTrip = await db.query(
      `UPDATE trips
       SET vehicle_id = $1, driver_id = $2, helper_id = $3, status = 'DISPATCH_APPROVED', 
           delivery_info = $5,
           checklists = $6,
           updated_at = NOW(), last_update_timestamp = NOW()
       WHERE id = $4
       RETURNING *`,
      [vehicleId, driverId, helperId || null, tripId, JSON.stringify(deliveryInfo), JSON.stringify(checklists)]
    );

    // Update parent closed trip for this vehicle if exists
    const parentClosedRes = await db.query(
      `SELECT id, delivery_info FROM trips WHERE vehicle_id = $1 AND status = 'CLOSED' ORDER BY updated_at DESC LIMIT 1`,
      [vehicleId]
    );

    if (parentClosedRes.rows.length > 0) {
      const parentTrip = parentClosedRes.rows[0];
      let pDeliv = {};
      try {
        pDeliv = typeof parentTrip.delivery_info === 'string' ? JSON.parse(parentTrip.delivery_info || '{}') : (parentTrip.delivery_info || {});
      } catch (_) {}
      pDeliv.returnMatchingInfo = { hasReturnLoad: true, returnTripId: tripId, statusText: 'Paired & Dispatched' };
      
      await db.query(
        `UPDATE trips SET status = 'BACKLOAD_PAIRED', delivery_info = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(pDeliv), parentTrip.id]
      );
    }

    await db.query(`UPDATE vehicles SET status = 'In Transit', updated_at = NOW() WHERE id = $1`, [vehicleId]);
    await db.query(`UPDATE drivers SET status = 'On Trip', updated_at = NOW() WHERE id = $1`, [driverId]);
    if (helperId) {
      await db.query(`UPDATE helpers SET status = 'On Trip', updated_at = NOW() WHERE id = $1`, [helperId]);
    }

    broadcastTripUpdate(updatedTrip.rows[0]);

    // Send automated WhatsApp dispatch alerts asynchronously
    (async () => {
      try {
        const enrichedTripRes = await db.query(
          `SELECT t.*, c.name AS commodity_name, c.unit AS commodity_unit,
                  sb.name AS source_branch_name, sb.phone AS source_branch_phone, sb.manager_name AS source_manager_name,
                  db_br.name AS destination_branch_name, db_br.phone AS destination_branch_phone,
                  d.name AS driver_name, d.phone AS driver_phone
           FROM trips t
           LEFT JOIN commodities c ON c.id = t.commodity_id
           LEFT JOIN branches sb ON sb.id = t.source_branch_id
           LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id
           LEFT JOIN drivers d ON d.id = t.driver_id
           WHERE t.id = $1`,
          [tripId]
        );
        const row = enrichedTripRes.rows[0];
        if (row) {
          // 1. Send Dispatch details & interactive buttons to driver
          if (row.driver_phone) {
            await whatsappService.sendTripDispatchNotification(row, row.driver_phone);
          }
          // 2. Send Pairing confirmation to source branch manager
          if (row.source_branch_phone) {
            await whatsappService.sendReturnLoadConfirmedNotification({
              managerPhone: row.source_branch_phone,
              tripId: row.id,
              vehicleId: row.vehicle_id,
              driverName: row.driver_name,
              driverPhone: row.driver_phone,
              sourceName: row.source_branch_name,
              destName: row.destination_branch_name,
              cargoDesc: `${row.commodity_name || 'Goods'} (${row.quantity} ${row.commodity_unit || 'Units'})`
            });
          }
        }
      } catch (waErr) {
        console.warn('⚠️ [WhatsApp Backload Paired Alert Error]:', waErr.message);
      }
    })();

    res.json({
      success: true,
      message: `Return Load matched successfully! Vehicle ${vehicleId} dispatched on Trip ${tripId}.`,
      trip: updatedTrip.rows[0],
    });
  } catch (err) {
    console.error('Error assigning backload:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

