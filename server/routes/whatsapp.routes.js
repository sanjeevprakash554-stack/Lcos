const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const whatsappService = require('../services/whatsappService');
const stoppageDetector = require('../services/stoppageDetector');
const {
  broadcastAlert,
  broadcastTripUpdate,
  broadcastGpsUpdate,
  broadcastStoppageDriverResponse,
  broadcastStoppageReasonAccepted,
  broadcastStoppageReasonDeclined,
  broadcastAlertResolved,
  getIO
} = require('../services/socketService');

/**
 * Normalizes phone numbers for matching (last 10 digits)
 */
function cleanPhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/[^0-9]/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * 1. META WEBHOOK VERIFICATION (GET /api/whatsapp/webhook)
 * Meta for Developers queries this URL when configuring the WhatsApp Webhook.
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const config = whatsappService.getConfig();

  if (mode && token) {
    if (mode === 'subscribe' && token === config.verifyToken) {
      console.log('✅ [WhatsApp Webhook] Meta Webhook Verified Successfully!');
      return res.status(200).send(challenge);
    } else {
      console.warn('❌ [WhatsApp Webhook Verification Failed]: Token mismatch.');
      return res.sendStatus(403);
    }
  }

  res.sendStatus(400);
});

/**
 * 2. META INCOMING WEBHOOK HANDLER (POST /api/whatsapp/webhook)
 * Receives messages, status updates, and location pins from WhatsApp users.
 */
router.post('/webhook', (req, res) => {
  // 1. Verify Meta Hub Signature if App Secret is configured
  const appSecret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
  const signature = req.headers['x-hub-signature-256'];
  if (appSecret && signature && req.rawBody) {
    try {
      const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
        console.warn('❌ [WhatsApp Webhook] Invalid Meta Hub signature rejected.');
        return res.sendStatus(401);
      }
    } catch (sigErr) {
      console.warn('Signature verification warning:', sigErr.message);
    }
  }

  // 2. Always acknowledge webhook immediately with 200 OK as required by Meta within 15s
  res.status(200).json({ status: 'EVENT_RECEIVED' });

  // 3. Process payload asynchronously in background
  setImmediate(async () => {
    try {
      const body = req.body;
      if (body.object !== 'whatsapp_business_account') return;

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;
          if (!value) continue;

          // Process Incoming Messages
          const messages = value.messages;
          if (messages && messages.length > 0) {
            for (const msg of messages) {
              await handleIncomingMessage(msg, value.contacts?.[0] || null);
            }
          }

          // Process Message Status Receipts (SENT, DELIVERED, READ, FAILED)
          const statuses = value.statuses;
          if (statuses && statuses.length > 0) {
            for (const st of statuses) {
              try {
                await db.query(
                  `UPDATE whatsapp_logs SET status = $1 WHERE meta_message_id = $2`,
                  [st.status.toUpperCase(), st.id]
                );
              } catch (err) {
                // Non-blocking status receipt update
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('❌ [WhatsApp Webhook Processing Error]:', err);
    }
  });
});

/**
 * Central Incoming WhatsApp Message Processor
 */
async function handleIncomingMessage(msg, contact = null) {
  const senderNumber = msg.from; // e.g. "919884012345"
  const senderName = contact?.profile?.name || 'Driver / Contact';
  const msgType = msg.type; // 'text', 'location', 'interactive', 'button'
  const messageId = msg.id;

  let textContent = '';
  let locationData = null;
  let interactiveButtonId = null;

  if (msgType === 'text') {
    textContent = (msg.text?.body || '').trim();
  } else if (msgType === 'interactive') {
    if (msg.interactive?.type === 'button_reply') {
      interactiveButtonId = msg.interactive.button_reply.id;
      textContent = msg.interactive.button_reply.title || '';
    }
  } else if (msgType === 'location') {
    locationData = msg.location;
    textContent = `[Location Pin]: ${locationData.latitude}, ${locationData.longitude}`;
  } else if (msgType === 'button') {
    textContent = msg.button?.text || '';
    interactiveButtonId = msg.button?.payload || '';
  }

  console.log(`📩 [WhatsApp Incoming] From: ${senderNumber} (${senderName}) | Type: ${msgType} | Content: ${textContent}`);

  // Log incoming message to database
  await whatsappService.logMessage({
    direction: 'INBOUND',
    fromNumber: senderNumber,
    toNumber: 'LCOS-SYSTEM',
    messageType: msgType,
    content: textContent,
    status: 'RECEIVED',
    metaMessageId: messageId,
  });

  // Try to find matching driver in the database
  const cleanedSender = cleanPhone(senderNumber);
  const last10 = cleanedSender.slice(-10);
  let driver = null;
  let activeTrip = null;

  try {
    const driverRes = await db.query(
      `SELECT * FROM drivers WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '+', ''), '-', '') LIKE $1 LIMIT 1`,
      [`%${last10}%`]
    );
    if (driverRes.rows.length > 0) {
      driver = driverRes.rows[0];

      // Find active trip for driver
      const tripRes = await db.query(
        `SELECT t.*, c.name as commodity_name, sb.name as source_name, db_br.name as dest_name
         FROM trips t
         LEFT JOIN commodities c ON c.id = t.commodity_id
         LEFT JOIN branches sb ON sb.id = t.source_branch_id
         LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id
         WHERE t.driver_id = $1 AND t.status IN ('CREATED', 'IN_TRANSIT', 'DELAYED')
         ORDER BY t.created_at DESC LIMIT 1`,
        [driver.id]
      );
      if (tripRes.rows.length > 0) {
        activeTrip = tripRes.rows[0];
      }
    }

    // Fallback: If activeTrip is still null, look up by button vehicle ID or active stoppage vehicle
    let buttonVehId = null;
    if (interactiveButtonId) {
      const match = interactiveButtonId.match(/stp_(?:traffic|breakdown|moving)_(.+)/);
      if (match && match[1] !== 'manual') buttonVehId = match[1];
    }
    const targetV = buttonVehId || 'TN-59-EF-9012';
    if (!activeTrip && targetV) {
      const vTripRes = await db.query(
        `SELECT t.*, c.name as commodity_name, sb.name as source_name, db_br.name as dest_name,
                d.name as driver_name, d.phone as driver_phone
         FROM trips t
         LEFT JOIN commodities c ON c.id = t.commodity_id
         LEFT JOIN branches sb ON sb.id = t.source_branch_id
         LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id
         LEFT JOIN drivers d ON d.id = t.driver_id
         WHERE t.vehicle_id = $1 AND t.status IN ('CREATED', 'IN_TRANSIT', 'DELAYED')
         ORDER BY t.created_at DESC LIMIT 1`,
        [targetV]
      );
      if (vTripRes.rows.length > 0) {
        activeTrip = vTripRes.rows[0];
        if (!driver) {
          driver = { id: activeTrip.driver_id, name: activeTrip.driver_name, phone: activeTrip.driver_phone };
        }
      }
    }
  } catch (err) {
    console.error('Error fetching driver context for WhatsApp:', err.message);
  }

  // Handle Location Pins
  if (locationData && locationData.latitude && locationData.longitude) {
    const lat = parseFloat(locationData.latitude);
    const lng = parseFloat(locationData.longitude);

    if (driver) {
      // Update Driver and Vehicle GPS coordinates
      await db.query(
        `UPDATE drivers SET current_lat = $1, current_lng = $2, last_location_update = NOW() WHERE id = $3`,
        [lat, lng, driver.id]
      );

      if (activeTrip && activeTrip.vehicle_id) {
        await db.query(
          `UPDATE vehicles 
           SET current_lat = $1, current_lng = $2, movement_status = 'MOVING', speed_kmh = 45, last_gps_update = NOW()
           WHERE id = $3`,
          [lat, lng, activeTrip.vehicle_id]
        );

        // Broadcast to Leaflet live tracking map
        broadcastGpsUpdate({
          vehicleId: activeTrip.vehicle_id,
          lat,
          lng,
          speed: 45,
          status: 'MOVING',
          driverName: driver.name,
          tripId: activeTrip.id,
        });
      }

      await whatsappService.sendTextMessage(
        senderNumber,
        `📍 *GPS Position Synchronized!*\nCoordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}\nVehicle: ${activeTrip?.vehicle_id || 'Assigned Truck'}\nDriver: ${driver.name}\n\nYour location has been updated on the central Operations Control Map.`
      );
    } else {
      await whatsappService.sendTextMessage(
        senderNumber,
        `📍 *Coordinates Received:* ${lat.toFixed(4)}, ${lng.toFixed(4)}\nThank you for sharing your location with LCOS Logistics.`
      );
    }
    return;
  }

  // Handle Interactive Buttons
  if (interactiveButtonId) {
    if (interactiveButtonId.startsWith('trk_') || interactiveButtonId === 'btn_track_active') {
      const tripId = interactiveButtonId.replace('trk_', '');
      await sendTripStatusReply(senderNumber, tripId === 'btn_track_active' ? null : tripId, driver);
      return;
    }
    if (interactiveButtonId.startsWith('loc_') || interactiveButtonId === 'btn_help_loc') {
      await whatsappService.sendTextMessage(
        senderNumber,
        `📍 *To share your live location:*\nTap the 📎 (Paperclip / +) icon in WhatsApp, choose *Location*, and select *Send Your Current Location* or *Share Live Location*.`
      );
      return;
    }
    let btnVehId = null;
    const match = interactiveButtonId.match(/stp_(?:traffic|breakdown|moving)_(.+)/);
    if (match && match[1] !== 'manual') btnVehId = match[1];
    const resolvedVehId = btnVehId || activeTrip?.vehicle_id || (targetV !== 'manual' ? targetV : null) || 'TN-59-EF-9012';

    if (interactiveButtonId.startsWith('sos_') || interactiveButtonId === 'btn_sos' || interactiveButtonId.startsWith('stp_sos_')) {
      await triggerEmergencyAlert(senderNumber, driver, activeTrip, 'Emergency SOS button pressed on WhatsApp', resolvedVehId);
      return;
    }
    // Logistics Reason Button 1: Traffic / Toll Delay
    if (interactiveButtonId.startsWith('stp_traffic_')) {
      await recordTransitDelay(senderNumber, driver, activeTrip, 'Heavy Traffic / Toll Plaza Congestion', resolvedVehId);
      return;
    }
    // Logistics Reason Button 2: Puncture / Breakdown
    if (interactiveButtonId.startsWith('stp_breakdown_')) {
      await triggerEmergencyAlert(senderNumber, driver, activeTrip, 'Tyre Puncture / Vehicle Mechanical Breakdown', resolvedVehId);
      return;
    }
    // Logistics Reason Button 3: Resuming Movement
    if (interactiveButtonId.startsWith('stp_moving_') || interactiveButtonId === 'btn_resuming') {
      await handleTransitResumed(senderNumber, driver, activeTrip, resolvedVehId);
      return;
    }
    if (interactiveButtonId.startsWith('stp_delay_') || interactiveButtonId === 'btn_delay' || interactiveButtonId === 'btn_report_delay') {
      await recordTransitDelay(senderNumber, driver, activeTrip, 'Transit delay reported via quick button', resolvedVehId);
      return;
    }
  }

  // Process Text Commands
  const upperText = textContent.toUpperCase();

  // Handle Text Button Echoes
  if (upperText.includes('RESUMING') || upperText.includes('RESUME')) {
    await handleTransitResumed(senderNumber, driver, activeTrip, activeTrip?.vehicle_id);
    return;
  }
  if (upperText.includes('TRAFFIC') || upperText.includes('TOLL')) {
    await recordTransitDelay(senderNumber, driver, activeTrip, 'Heavy Traffic / Toll Plaza Congestion');
    return;
  }
  if (upperText.includes('PUNCTURE') || upperText.includes('BREAKDOWN')) {
    await triggerEmergencyAlert(senderNumber, driver, activeTrip, 'Tyre Puncture / Vehicle Mechanical Breakdown');
    return;
  }

  // 1. TRIP STATUS / TRACKING
  if (upperText.startsWith('TRACK') || upperText === 'STATUS' || upperText === 'TRIP') {
    const parts = textContent.split(' ');
    let tripId = parts.length > 1 ? parts[1].trim() : (activeTrip?.id || null);
    await sendTripStatusReply(senderNumber, tripId, driver);
    return;
  }

  // 2. REPORT DELAY / STOPPAGE
  if (upperText.startsWith('DELAY') || upperText.startsWith('STOP')) {
    const reason = textContent.replace(/^(delay|stop)\s*/i, '').trim() || 'Transit halt reported by driver';
    await recordTransitDelay(senderNumber, driver, activeTrip, reason);
    return;
  }

  // 3. EMERGENCY SOS
  if (upperText === 'SOS' || upperText.includes('EMERGENCY')) {
    await triggerEmergencyAlert(senderNumber, driver, activeTrip, textContent);
    return;
  }

  // 4. RESUMING MOVEMENT
  if (upperText === 'MOVING' || upperText.includes('RESUMED')) {
    await handleTransitResumed(senderNumber, driver, activeTrip, activeTrip?.vehicle_id);
    return;
  }

  // 5. DEFAULT / HELP MENU
  const greeting = driver ? `Hello *${driver.name}*!` : `Hello *${senderName}*!`;
  const helpMenu = 
`${greeting}
Welcome to *Logistics Operations Control System (LCOS)* WhatsApp Assistant.

📌 *Available Commands:*
1️⃣ *TRACK* or *TRACK <TripID>* - Check live shipment status
2️⃣ *DELAY <reason>* - Report delays, traffic, or tyre punctures
3️⃣ *MOVING* - Confirm vehicle has resumed movement
4️⃣ *SOS* - Raise emergency alert to Central Control
5️⃣ Send a 📍 *Location Pin* - Instantly update vehicle GPS

Reply to this message with any command anytime.`;

  await whatsappService.sendInteractiveButtons(
    senderNumber,
    '🚚 LCOS Operations Assistant',
    helpMenu,
    [
      { id: 'btn_track_active', title: 'Track Active Trip' },
      { id: 'btn_report_delay', title: 'Report Delay' },
      { id: 'btn_help_loc', title: 'Share Location Pin' },
    ],
    'Logistics Operations Control'
  );
}

/**
 * Helper: Replies with Trip Status details
 */
async function sendTripStatusReply(toNumber, tripId, driver = null) {
  let query = `
    SELECT t.*, 
           c.name AS commodity_name, c.unit AS commodity_unit,
           sb.name AS source_branch_name, db_br.name AS destination_branch_name,
           v.type AS vehicle_type, d.name AS driver_name
    FROM trips t
    LEFT JOIN commodities c ON c.id = t.commodity_id
    LEFT JOIN branches sb ON sb.id = t.source_branch_id
    LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id
    LEFT JOIN vehicles v ON v.id = t.vehicle_id
    LEFT JOIN drivers d ON d.id = t.driver_id
  `;

  let trip = null;
  if (tripId) {
    const res = await db.query(query + ` WHERE t.id ILIKE $1 LIMIT 1`, [`%${tripId}%`]);
    if (res.rows.length > 0) trip = res.rows[0];
  } else if (driver) {
    const res = await db.query(query + ` WHERE t.driver_id = $1 AND t.status IN ('CREATED', 'IN_TRANSIT', 'DELAYED') ORDER BY t.created_at DESC LIMIT 1`, [driver.id]);
    if (res.rows.length > 0) trip = res.rows[0];
  }

  if (!trip) {
    return whatsappService.sendTextMessage(
      toNumber,
      `⚠️ No active trip was found matching your query. Please reply with *TRACK <TripID>*, e.g., *TRACK TRIP-1002*.`
    );
  }

  const eta = trip.expected_delivery_date
    ? new Date(trip.expected_delivery_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
    : 'Pending Dispatch';

  const statusIcons = {
    CREATED: '📝 CREATED',
    IN_TRANSIT: '🚚 IN TRANSIT',
    DELAYED: '⚠️ DELAYED',
    DELIVERED: '✅ DELIVERED',
  };

  const responseText = 
`📦 *SHIPMENT TRACKING: ${trip.id}*
────────────────────────────
📊 *Status:* ${statusIcons[trip.status] || trip.status}
🚛 *Vehicle:* ${trip.vehicle_id} (${trip.vehicle_type || 'Truck'})
📦 *Cargo:* ${trip.commodity_name || 'Commodity'} - ${trip.quantity} ${trip.commodity_unit || 'Units'}
📍 *Route:* ${trip.source_branch_name || 'Origin'} ➔ ${trip.destination_branch_name || 'Destination'}
👤 *Driver:* ${trip.driver_name || 'Assigned'}
⏱️ *Estimated Delivery:* ${eta}
────────────────────────────
Send a 📍 Location pin anytime to update vehicle coordinates.`;

  return whatsappService.sendTextMessage(toNumber, responseText);
}

/**
 * Helper: Handles Transit Resumption (Driver confirmed moving)
 * Restores vehicle movement_status to 'MOVING', clears stoppage timer, resets trips to 'IN_TRANSIT',
 * resolves active stoppage alerts, broadcasts socket updates, and sends notification to Higher Official / Tracking Team.
 */
async function handleTransitResumed(toNumber, driver, trip, explicitVehId = null) {
  const vehicleId = (explicitVehId && explicitVehId !== 'manual') ? explicitVehId : (trip?.vehicle_id || 'TN-59-EF-9012');
  
  // If trip is not provided, try to find an active trip for this vehicle
  let activeTrip = trip;
  if (!activeTrip && vehicleId) {
    try {
      const tRes = await db.query(
        `SELECT t.*, d.name as driver_name, d.phone as driver_phone,
                sb.name as source_branch_name, db_br.name as destination_branch_name,
                dest_b.phone as manager_phone
         FROM trips t
         LEFT JOIN drivers d ON d.id = t.driver_id
         LEFT JOIN branches sb ON sb.id = t.source_branch_id
         LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id
         LEFT JOIN branches dest_b ON dest_b.id = t.destination_branch_id
         WHERE t.vehicle_id = $1 AND t.status IN ('CREATED', 'IN_TRANSIT', 'DELAYED')
         ORDER BY t.created_at DESC LIMIT 1`,
        [vehicleId]
      );
      if (tRes.rows.length > 0) {
        activeTrip = tRes.rows[0];
      }
    } catch (e) {
      console.warn('Could not find active trip for transit resume:', e.message);
    }
  }

  const tripId = activeTrip?.id || 'Active Shipment';
  const driverName = driver?.name || activeTrip?.driver_name || 'Assigned Driver';
  const driverPhone = driver?.phone || activeTrip?.driver_phone || toNumber;
  const routeInfo = (activeTrip?.source_branch_name && activeTrip?.destination_branch_name)
    ? `${activeTrip.source_branch_name} ➔ ${activeTrip.destination_branch_name}`
    : (activeTrip?.source_name && activeTrip?.dest_name)
    ? `${activeTrip.source_name} ➔ ${activeTrip.dest_name}`
    : 'In Transit Route';

  // 1. Update Vehicle: set MOVING, clear stoppage_start_time, update speed and timestamp
  await db.query(
    `UPDATE vehicles 
     SET movement_status = 'MOVING', speed_kmh = 45, stoppage_start_time = NULL, last_ping_at = NOW(), last_gps_update = NOW(), updated_at = NOW() 
     WHERE id = $1`,
    [vehicleId]
  );

  // 2. Revert Trip status from DELAYED to IN_TRANSIT and log transit update
  if (activeTrip) {
    const transitUpdate = {
      type: 'TRANSIT_RESUMED',
      reason: 'Driver confirmed resuming movement',
      timestamp: new Date().toISOString(),
      source: 'WhatsApp',
    };

    let updates = activeTrip.transit_updates || [];
    if (typeof updates === 'string') {
      try { updates = JSON.parse(updates); } catch (e) { updates = []; }
    }
    updates.push(transitUpdate);

    await db.query(
      `UPDATE trips SET status = 'IN_TRANSIT', transit_updates = $1, last_update_timestamp = NOW() WHERE id = $2`,
      [JSON.stringify(updates), activeTrip.id]
    );

    broadcastTripUpdate({ ...activeTrip, status: 'IN_TRANSIT' });
  }

  // 3. Resolve active Stoppage Detected, Driver Delay Report, or Emergency Breakdown alerts
  const resolvedAlerts = await db.query(
    `UPDATE alerts 
     SET status = 'Resolved', resolved_at = NOW() 
     WHERE vehicle_id = $1 
       AND (type = 'Stoppage Detected' OR type = 'Driver Delay Report' OR type = 'Emergency Breakdown' OR type = 'No GPS Signal') 
       AND status IN ('Active', 'Escalated')
     RETURNING *`,
    [vehicleId]
  );

  if (resolvedAlerts && resolvedAlerts.rows) {
    resolvedAlerts.rows.forEach(alt => {
      broadcastAlertResolved(alt.company_id || 'COMP-001', { vehicle_id: vehicleId, id: alt.id });
    });
  }

  // 4. Create system notification for Operations Control / Tracking Team
  const notifyMsg = `Driver ${driverName} confirmed transit resumed for vehicle ${vehicleId}. Stoppage alert resolved.`;
  await db.query(
    `INSERT INTO notifications (company_id, title, message, type)
     VALUES ('COMP-001', $1, $2, 'STATUS')`,
    [`Transit Resumed: ${vehicleId}`, notifyMsg]
  );

  // 5. Broadcast real-time Socket events
  broadcastStoppageDriverResponse(driver?.company_id || 'COMP-001', {
    vehicleId,
    driverName,
    reason: '🟢 Resuming Movement (Transit Resumed)',
    timestamp: new Date().toISOString()
  });

  broadcastStoppageReasonAccepted(driver?.company_id || 'COMP-001', {
    vehicleId,
    status: 'Resolved',
    message: 'Transit Resumed by Driver'
  });

  broadcastGpsUpdate({
    vehicleId,
    speed: 45,
    speedKmh: 45,
    status: 'MOVING',
    movementStatus: 'MOVING',
    driverName,
    tripId: activeTrip?.id || null,
  });

  // 6. Send dedicated notification to Higher Official / Tracking Team (WhatsApp)
  const higherOfficial = process.env.HIGHER_OFFICIAL_PHONE || activeTrip?.manager_phone;
  if (higherOfficial) {
    await whatsappService.sendHigherOfficialTransitResumed({
      tripId,
      vehicleId,
      driverName,
      driverPhone,
      route: routeInfo,
    }, higherOfficial).catch(e => console.warn('Higher official transit resume alert error:', e.message));
  }

  // 7. Send confirmation reply to Driver
  return whatsappService.sendTextMessage(
    toNumber,
    `🟢 *Transit Resumed!* Vehicle *${vehicleId}* marked as MOVING on Central Operations Map. Stoppage alert resolved. Drive safely!`
  );
}

/**
 * Helper: Records Transit Delay reported by driver
 */
async function recordTransitDelay(toNumber, driver, trip, reason, explicitVehId = null) {
  const vehicleId = explicitVehId || trip?.vehicle_id || 'TN-59-EF-9012';
  const tripId = trip?.id || 'Active Shipment';
  const driverName = driver?.name || 'Saravanan K.';

  if (trip) {
    // Append transit update
    const transitUpdate = {
      type: 'DRIVER_DELAY_REPORT',
      reason,
      timestamp: new Date().toISOString(),
      source: 'WhatsApp',
    };

    let updates = trip.transit_updates || [];
    if (typeof updates === 'string') {
      try { updates = JSON.parse(updates); } catch (e) { updates = []; }
    }
    updates.push(transitUpdate);

    await db.query(
      `UPDATE trips SET status = 'DELAYED', transit_updates = $1, last_update_timestamp = NOW() WHERE id = $2`,
      [JSON.stringify(updates), trip.id]
    );
  }

  // Check if an active stoppage or delay alert already exists for this vehicle
  const existingAlert = await db.query(
    `SELECT id FROM alerts 
     WHERE vehicle_id = $1 AND (type = 'Stoppage Detected' OR type = 'Driver Delay Report' OR type = 'Emergency Breakdown') AND status = 'Active' 
     ORDER BY created_at DESC LIMIT 1`,
    [vehicleId]
  );

  const alertMsg = `🚨 Driver ${driverName} reported delay for ${vehicleId}: "${reason}"`;
  let alertRecord = null;

  if (existingAlert.rows.length > 0) {
    const alertId = existingAlert.rows[0].id;
    await db.query(
      `UPDATE alerts SET type = 'Driver Delay Report', message = $1, severity = 'warning', created_at = NOW() WHERE id = $2`,
      [alertMsg, alertId]
    );
    const updated = await db.query(`SELECT * FROM alerts WHERE id = $1`, [alertId]);
    alertRecord = updated.rows[0];
  } else {
    const alertId = 'ALT-WA-' + Math.floor(1000 + Math.random() * 9000);
    const inserted = await db.query(
      `INSERT INTO alerts (id, company_id, trip_id, vehicle_id, driver_id, type, message, severity, status, created_at)
       VALUES ($1, 'COMP-001', $2, $3, $4, 'Driver Delay Report', $5, 'warning', 'Active', NOW())
       RETURNING *`,
      [alertId, trip?.id || null, vehicleId, driver?.id || null, alertMsg]
    );
    alertRecord = inserted.rows[0];
  }

  // Create system notification
  await db.query(
    `INSERT INTO notifications (company_id, title, message, type)
     VALUES ('COMP-001', $1, $2, 'DELAY')`,
    [`Transit Delay: ${vehicleId}`, alertMsg]
  );

  if (alertRecord) broadcastAlert(alertRecord);
  if (trip) broadcastTripUpdate({ ...trip, status: 'DELAYED' });

  broadcastStoppageDriverResponse(driver?.company_id || 'COMP-001', {
    vehicleId,
    driverName,
    reason: '🟡 ' + reason,
    alertId: alertRecord?.id,
    timestamp: new Date().toISOString()
  });

  // Notify Higher Official of the delay report immediately in all cases
  const higherOfficial = process.env.HIGHER_OFFICIAL_PHONE;
  if (higherOfficial) {
    whatsappService.sendTextMessage(
      higherOfficial,
      `🚨 *DRIVER REPORTED TRANSIT DELAY*\n────────────────────────────\n📋 *Trip ID:* ${tripId}\n🚛 *Vehicle:* ${vehicleId}\n👤 *Driver:* ${driverName} (📞 ${toNumber})\n⚠️ *Delay Reason:* "${reason}"\n🕒 *Reported At:* ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}\n────────────────────────────\nOperations Control has registered this delay report.`
    ).catch(e => console.warn('Higher official delay alert error:', e.message));
  }

  return whatsappService.sendTextMessage(
    toNumber,
    `⚠️ *Delay Acknowledged:*\nVehicle: ${vehicleId}\nReason: "${reason}"\n\nCentral Operations Control has been notified. Please drive safely and keep us updated.`
  );
}

/**
 * Helper: Triggers Emergency SOS Alert
 */
async function triggerEmergencyAlert(toNumber, driver, trip, messageText, explicitVehId = null) {
  const vehicleId = explicitVehId || trip?.vehicle_id || 'TN-59-EF-9012';
  const tripId = trip?.id || 'UNASSIGNED';
  const driverName = driver?.name || 'Saravanan K.';

  const alertMsg = `🚨 Driver ${driverName} reported breakdown for ${vehicleId}: "${messageText}"`;

  // Check if active alert already exists
  const existingAlert = await db.query(
    `SELECT id FROM alerts 
     WHERE vehicle_id = $1 AND (type = 'Stoppage Detected' OR type = 'Driver Delay Report' OR type = 'Emergency Breakdown') AND status = 'Active' 
     ORDER BY created_at DESC LIMIT 1`,
    [vehicleId]
  );

  let alertRecord = null;
  if (existingAlert.rows.length > 0) {
    const alertId = existingAlert.rows[0].id;
    await db.query(
      `UPDATE alerts SET type = 'Emergency Breakdown', message = $1, severity = 'critical', created_at = NOW() WHERE id = $2`,
      [alertMsg, alertId]
    );
    const updated = await db.query(`SELECT * FROM alerts WHERE id = $1`, [alertId]);
    alertRecord = updated.rows[0];
  } else {
    const alertId = 'ALT-EMG-' + Math.floor(1000 + Math.random() * 9000);
    const inserted = await db.query(
      `INSERT INTO alerts (id, company_id, trip_id, vehicle_id, driver_id, type, message, severity, status, created_at)
       VALUES ($1, 'COMP-001', $2, $3, $4, 'Emergency Breakdown', $5, 'critical', 'Active', NOW())
       RETURNING *`,
      [alertId, trip?.id || null, vehicleId, driver?.id || null, alertMsg]
    );
    alertRecord = inserted.rows[0];
  }

  await db.query(
    `INSERT INTO notifications (company_id, title, message, type)
     VALUES ('COMP-001', '🚨 CRITICAL BREAKDOWN ALERT', $1, 'EMERGENCY')`,
    [alertMsg]
  );

  if (alertRecord) broadcastAlert(alertRecord);
  broadcastStoppageDriverResponse(driver?.company_id || 'COMP-001', {
    vehicleId,
    driverName,
    reason: '🔴 ' + messageText,
    alertId: alertRecord?.id,
    timestamp: new Date().toISOString()
  });

  // Notify Higher Official of Emergency SOS immediately
  const higherOfficial = process.env.HIGHER_OFFICIAL_PHONE;
  if (higherOfficial) {
    whatsappService.sendTextMessage(
      higherOfficial,
      `🚨 *URGENT SOS EMERGENCY BROADCAST*\n------------------------\n📋 *Trip ID:* ${tripId}\n🚛 *Vehicle:* ${vehicleId}\n👤 *Driver:* ${driverName} (📞 ${toNumber})\n🚨 *Emergency Note:* "${messageText}"\n🕒 *Reported At:* ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}\n------------------------\nImmediate emergency response intervention required!`
    ).catch(e => console.warn('Higher official SOS alert error:', e.message));
  }

  return whatsappService.sendTextMessage(
    toNumber,
    `🚨 *BREAKDOWN ALERT LOGGED!*\nCentral Operations Control and Quick-Response Team received your breakdown alert for ${vehicleId}.\n\n📞 Operations Control Hotline: *+91 94412 00000*\nAssistance is being dispatched to your coordinates.`
  );
}

// ----------------------------------------------------
// MANAGEMENT & TESTING API ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/whatsapp/status
 * Get connection & configuration status
 */
router.get('/status', async (req, res) => {
  try {
    const config = whatsappService.getConfig();
    const countRes = await db.query(`SELECT COUNT(*) as total FROM whatsapp_logs`);
    const totalLogs = parseInt(countRes.rows[0]?.total || 0, 10);

    const protocol = req.protocol;
    const host = req.get('host');
    const publicBase = process.env.RENDER_EXTERNAL_URL || process.env.CLOUDFLARE_URL || `${req.get("x-forwarded-proto") || req.protocol}://${host}`;
    const webhookUrl = `${publicBase}/api/whatsapp/webhook`;

    res.json({
      success: true,
      configured: config.isConfigured,
      phoneNumberId: config.phoneNumberId || '',
      apiVersion: config.apiVersion,
      verifyToken: config.verifyToken,
      businessAccountId: config.businessAccountId || '',
      higherOfficialPhone: process.env.HIGHER_OFFICIAL_PHONE || '',
      webhookUrl,
      totalLogs,
      mode: config.isConfigured ? 'LIVE_META_API' : 'SANDBOX_SIMULATION',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/whatsapp/config
 * Save Meta for Developers WhatsApp Credentials
 */
router.post('/config', async (req, res) => {
  try {
    const { phoneNumberId, accessToken, businessAccountId, verifyToken, apiVersion, higherOfficialPhone } = req.body;

    if (phoneNumberId !== undefined) process.env.WHATSAPP_PHONE_NUMBER_ID = phoneNumberId.trim();
    if (accessToken !== undefined) process.env.WHATSAPP_ACCESS_TOKEN = accessToken.trim();
    if (businessAccountId !== undefined) process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = businessAccountId.trim();
    if (verifyToken !== undefined) process.env.WHATSAPP_VERIFY_TOKEN = verifyToken.trim();
    if (apiVersion !== undefined) process.env.WHATSAPP_API_VERSION = apiVersion.trim();
    if (higherOfficialPhone !== undefined) process.env.HIGHER_OFFICIAL_PHONE = higherOfficialPhone.trim();

    // Persist to .env file if it exists
    const envPath = path.join(__dirname, '../../.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');

      const updates = {
        WHATSAPP_PHONE_NUMBER_ID: phoneNumberId,
        WHATSAPP_ACCESS_TOKEN: accessToken,
        WHATSAPP_BUSINESS_ACCOUNT_ID: businessAccountId,
        WHATSAPP_VERIFY_TOKEN: verifyToken,
        WHATSAPP_API_VERSION: apiVersion || 'v21.0',
        HIGHER_OFFICIAL_PHONE: higherOfficialPhone,
      };

      for (const [k, v] of Object.entries(updates)) {
        if (v !== undefined) {
          const regex = new RegExp(`^${k}=.*$`, 'm');
          if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${k}=${v}`);
          } else {
            envContent += `\n${k}=${v}`;
          }
        }
      }

      fs.writeFileSync(envPath, envContent, 'utf8');
    }

    res.json({
      success: true,
      message: 'WhatsApp Meta credentials updated and saved successfully!',
      status: whatsappService.getConfig(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/whatsapp/send
 * Send a custom WhatsApp message to any driver or client
 */
router.post('/send', async (req, res) => {
  try {
    const { to, type, message, header, buttons } = req.body;

    if (!to) {
      return res.status(400).json({ success: false, message: 'Recipient phone number is required' });
    }

    let result;
    if (type === 'template') {
      result = await whatsappService.sendTemplate(to, req.body.templateName || 'hello_world', req.body.language || 'en_US');
    } else if (type === 'interactive' && Array.isArray(buttons) && buttons.length > 0) {
      result = await whatsappService.sendInteractiveButtons(to, header || 'LCOS Logistics', message || 'Notification', buttons);
    } else {
      result = await whatsappService.sendTextMessage(to, message || 'Hello from LCOS Logistics!');
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/whatsapp/notify-trip
 * Notify assigned driver of a specific trip
 */
router.post('/notify-trip', async (req, res) => {
  try {
    const { tripId } = req.body;
    if (!tripId) return res.status(400).json({ success: false, message: 'tripId is required' });

    const tripRes = await db.query(
      `SELECT t.*, c.name as commodity_name, sb.name as source_branch_name, db_br.name as destination_branch_name, d.phone as driver_phone, d.name as driver_name
       FROM trips t
       LEFT JOIN commodities c ON c.id = t.commodity_id
       LEFT JOIN branches sb ON sb.id = t.source_branch_id
       LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id
       LEFT JOIN drivers d ON d.id = t.driver_id
       WHERE t.id = $1`,
      [tripId]
    );

    if (tripRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    const trip = tripRes.rows[0];
    if (!trip.driver_phone) {
      return res.status(400).json({ success: false, message: `Driver ${trip.driver_name || ''} has no registered phone number.` });
    }

    const result = await whatsappService.sendTripDispatchNotification(trip, trip.driver_phone);
    res.json({ success: true, result, driverPhone: trip.driver_phone });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/whatsapp/simulate-incoming
 * Test helper: Simulates an incoming WhatsApp message (great for local sandbox testing!)
 */
router.post('/simulate-incoming', async (req, res) => {
  try {
    const { from, text, location, buttonId } = req.body;
    const senderNumber = from || '919884012345';

    let msgPayload;
    if (location && location.latitude && location.longitude) {
      msgPayload = {
        from: senderNumber,
        id: 'sim_msg_' + Date.now(),
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'location',
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          name: location.name || 'Simulated Location',
        },
      };
    } else if (buttonId) {
      msgPayload = {
        from: senderNumber,
        id: 'sim_msg_' + Date.now(),
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: { id: buttonId, title: text || buttonId },
        },
      };
    } else {
      msgPayload = {
        from: senderNumber,
        id: 'sim_msg_' + Date.now(),
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'text',
        text: { body: text || 'STATUS' },
      };
    }

    await handleIncomingMessage(msgPayload, { profile: { name: 'Simulated Driver' } });
    res.json({ success: true, message: 'Simulated WhatsApp message processed successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/whatsapp/test-stoppage-alert
 * Test helper: Simulates a vehicle stopped for >20 minutes, creates a system alert,
 * and automatically fires live WhatsApp alerts to both Driver & Higher Official.
 */
router.post('/test-stoppage-alert', async (req, res) => {
  try {
    const { vehicleId, tripId, testPhone, minutes } = req.body || {};
    const stoppageMins = parseInt(minutes, 10) || 25;
    const phoneToUse = testPhone || process.env.HIGHER_OFFICIAL_PHONE || '916382897998';

    let targetVehicle = vehicleId;

    // 1. If tripId was passed, find its vehicle
    if (!targetVehicle && tripId) {
      const tripRes = await db.query(`SELECT vehicle_id FROM trips WHERE id = $1`, [tripId]);
      if (tripRes.rows.length > 0) {
        targetVehicle = tripRes.rows[0].vehicle_id;
      }
    }

    // 2. If testPhone was provided and targetVehicle is not set, find which driver owns this phone
    if (!targetVehicle && phoneToUse) {
      const clean = String(phoneToUse).replace(/[^0-9]/g, '');
      const last10 = clean.slice(-10);
      const drvRes = await db.query(
        `SELECT t.vehicle_id 
         FROM drivers d
         JOIN trips t ON t.driver_id = d.id AND t.status IN ('IN_TRANSIT', 'DELAYED', 'CREATED')
         WHERE REPLACE(REPLACE(REPLACE(d.phone, ' ', ''), '+', ''), '-', '') LIKE '%' || $1
         LIMIT 1`,
        [last10]
      );
      if (drvRes.rows.length > 0 && drvRes.rows[0].vehicle_id) {
        targetVehicle = drvRes.rows[0].vehicle_id;
      }
    }

    // 3. Fallback: pick any active vehicle
    if (!targetVehicle) {
      const activeVehRes = await db.query(
        `SELECT v.id FROM vehicles v 
         JOIN trips t ON t.vehicle_id = v.id AND t.status IN ('IN_TRANSIT', 'DELAYED') 
         LIMIT 1`
      );
      targetVehicle = activeVehRes.rows[0]?.id || 'TN-59-EF-9012';
    }

    // 4. Set vehicle stopped in the past (> 20 mins ago) in UTC
    const isEmbedded = db.isUsingEmbedded && db.isUsingEmbedded();
    if (isEmbedded) {
      await db.query(
        `UPDATE vehicles 
         SET movement_status = 'STOPPED', speed_kmh = 0, 
             stoppage_start_time = datetime('now', '-' || $1 || ' minutes')
         WHERE id = $2`,
        [stoppageMins, targetVehicle]
      );
    } else {
      await db.query(
        `UPDATE vehicles 
         SET movement_status = 'STOPPED', speed_kmh = 0, 
             stoppage_start_time = NOW() - INTERVAL '1 minute' * $1
         WHERE id = $2`,
        [stoppageMins, targetVehicle]
      );
    }

    // 5. Clear previous stoppage alerts for this vehicle to allow new trigger
    await db.query(
      `DELETE FROM alerts WHERE vehicle_id = $1 AND type = 'Stoppage Detected'`,
      [targetVehicle]
    );

    // 6. Run automated stoppage detector
    await stoppageDetector.checkVehicleStoppages();

    // 7. Fetch generated alert
    const alertRes = await db.query(
      `SELECT a.*, d.name AS driver_name, d.phone AS driver_phone,
              sb.name AS source_name, dest_b.name AS dest_name
       FROM alerts a
       LEFT JOIN drivers d ON d.id = a.driver_id
       LEFT JOIN trips t ON t.id = a.trip_id
       LEFT JOIN branches sb ON sb.id = t.source_branch_id
       LEFT JOIN branches dest_b ON dest_b.id = t.destination_branch_id
       WHERE a.vehicle_id = $1 AND a.type = 'Stoppage Detected' 
       ORDER BY a.created_at DESC LIMIT 1`,
      [targetVehicle]
    );

    res.json({
      success: true,
      message: `Automated stoppage detector ran successfully! Vehicle ${targetVehicle} flagged for ${stoppageMins}m halt.`,
      vehicleId: targetVehicle,
      stoppageMinutes: stoppageMins,
      alert: alertRes.rows[0] || null,
      driverPhone: alertRes.rows[0]?.driver_phone || phoneToUse,
      higherOfficialPhone: process.env.HIGHER_OFFICIAL_PHONE,
    });
  } catch (err) {
    console.error('Test stoppage alert error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/whatsapp/accept-reason
 * Allows Higher Official / Operations Manager to accept driver stoppage reason and clear alert
 */
router.post('/accept-reason', async (req, res) => {
  try {
    const { vehicleId, alertId, tripId, reason } = req.body || {};
    const vehId = vehicleId || 'TN-59-EF-9012';

    // 1. Resolve alert
    if (alertId) {
      await db.query(`UPDATE alerts SET status = 'Resolved', resolved_at = NOW() WHERE id = $1`, [alertId]);
    }
    await db.query(
      `UPDATE alerts SET status = 'Resolved', resolved_at = NOW() 
       WHERE vehicle_id = $1 AND (type = 'Stoppage Detected' OR type = 'Driver Delay Report' OR type = 'Emergency Breakdown') AND (status = 'Active' OR status = 'Escalated')`,
      [vehId]
    );

    // 2. Clear vehicle stoppage timer
    await db.query(
      `UPDATE vehicles SET stoppage_start_time = NULL, movement_status = 'MOVING', speed_kmh = 45, updated_at = NOW() WHERE id = $1`,
      [vehId]
    );

    // 2b. Revert Trip status from DELAYED to IN_TRANSIT
    const tripToUpdate = tripId ? { id: tripId } : (await db.query(`SELECT id FROM trips WHERE vehicle_id = $1 AND status = 'DELAYED' LIMIT 1`, [vehId])).rows[0];
    if (tripToUpdate) {
      await db.query(`UPDATE trips SET status = 'IN_TRANSIT', last_update_timestamp = NOW() WHERE id = $1`, [tripToUpdate.id]);
      broadcastTripUpdate({ id: tripToUpdate.id, status: 'IN_TRANSIT' });
    }

    // 3. Send confirmation WhatsApp message to driver & higher official
    let driverPhone = null;
    const vehRes = await db.query(
      `SELECT d.phone, d.name AS driver_name, t.id AS trip_id 
       FROM vehicles v 
       LEFT JOIN trips t ON t.vehicle_id = v.id 
       LEFT JOIN drivers d ON d.id = t.driver_id 
       WHERE v.id = $1 LIMIT 1`,
      [vehId]
    );
    if (vehRes.rows.length > 0 && vehRes.rows[0].phone) {
      driverPhone = vehRes.rows[0].phone;
    }

    const officialPhone = process.env.HIGHER_OFFICIAL_PHONE || '916382897998';
    const targetPhone = driverPhone || officialPhone;

    const acceptMessage = `✅ *DELAY REASON ACCEPTED*\n\nCentral Operations Manager reviewed and approved your delay reason for Vehicle *${vehId}*.\n\nStatus: *APPROVED*. Drive safely and keep tracking active!`;

    whatsappService.sendTextMessage(targetPhone, acceptMessage)
      .catch(e => console.warn('Accept reason WhatsApp notification note:', e.message));

    // 4. Broadcast resolution via socket
    broadcastStoppageReasonAccepted('COMP-001', { vehicleId: vehId, alertId, status: 'Resolved', message: 'Reason accepted by Operations Manager', timestamp: new Date().toISOString() });
    broadcastAlertResolved('COMP-001', { vehicle_id: vehId, id: alertId });

    res.json({
      success: true,
      message: `Delay reason for vehicle ${vehId} accepted and alert cleared successfully!`,
      vehicleId: vehId
    });
  } catch (err) {
    console.error('Accept reason error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/whatsapp/decline-reason
 * Higher Official rejects/declines the driver's reported stoppage reason
 */
router.post('/decline-reason', async (req, res) => {
  try {
    const { vehicleId, alertId, reason } = req.body || {};
    const vehId = vehicleId || 'TN-59-EF-9012';

    // 1. Escalate alert
    if (alertId) {
      await db.query(`UPDATE alerts SET severity = 'critical', status = 'Escalated', escalated = TRUE, escalated_at = NOW() WHERE id = $1`, [alertId]);
    } else {
      await db.query(
        `UPDATE alerts SET severity = 'critical', status = 'Escalated', escalated = TRUE, escalated_at = NOW() 
         WHERE vehicle_id = $1 AND (type = 'Stoppage Detected' OR type = 'Driver Delay Report' OR type = 'Emergency Breakdown') AND status = 'Active'`,
        [vehId]
      );
    }

    // 2. Fetch driver phone
    let driverPhone = null;
    const vehRes = await db.query(
      `SELECT d.phone, d.name AS driver_name FROM vehicles v 
       LEFT JOIN trips t ON t.vehicle_id = v.id 
       LEFT JOIN drivers d ON d.id = t.driver_id 
       WHERE v.id = $1 LIMIT 1`,
      [vehId]
    );
    if (vehRes.rows.length > 0 && vehRes.rows[0].phone) {
      driverPhone = vehRes.rows[0].phone;
    }

    const officialPhone = process.env.HIGHER_OFFICIAL_PHONE || '916382897998';
    const targetPhone = driverPhone || officialPhone;

    const declineMessage = `❌ *DELAY REASON DECLINED*\n\nCentral Operations Manager reviewed and *DECLINED* your reported delay reason for Vehicle *${vehId}*.\n\n⚠️ *Action Required:* Reason rejected. Please resume movement immediately or contact Central Control Room.`;

    whatsappService.sendTextMessage(targetPhone, declineMessage)
      .catch(e => console.warn('Decline reason WhatsApp notification note:', e.message));

    // 3. Broadcast decline via socket
    broadcastStoppageReasonDeclined('COMP-001', { vehicleId: vehId, alertId, status: 'Declined', message: 'Delay reason declined by Operations Manager', timestamp: new Date().toISOString() });

    res.json({
      success: true,
      message: `Delay reason for vehicle ${vehId} was DECLINED. Driver has been alerted on WhatsApp!`,
      vehicleId: vehId
    });
  } catch (err) {
    console.error('Decline reason error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/whatsapp/active-stoppage
 * Fetches current monitored stoppage alert and latest driver reply
 */
router.get('/active-stoppage', async (req, res) => {
  try {
    // 1. Fetch latest stoppage / delay alert
    const alertRes = await db.query(
      `SELECT a.*, v.current_lat, v.current_lng, v.movement_status, v.speed_kmh, d.name AS driver_name, d.phone AS driver_phone
       FROM alerts a
       LEFT JOIN vehicles v ON v.id = a.vehicle_id
       LEFT JOIN drivers d ON d.id = a.driver_id
       WHERE a.type IN ('Stoppage Detected', 'Driver Delay Report', 'Emergency Breakdown')
       ORDER BY a.created_at DESC LIMIT 1`
    );

    // 2. Fetch latest inbound driver reply from logs
    const logRes = await db.query(
      `SELECT * FROM whatsapp_logs 
       WHERE direction = 'INBOUND'
       ORDER BY created_at DESC LIMIT 1`
    );

    res.json({
      success: true,
      alert: alertRes.rows[0] || null,
      latestReply: logRes.rows[0] || null
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/whatsapp/logs
 * Retrieve recent WhatsApp communication logs
 */
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const result = await db.query(
      `SELECT * FROM whatsapp_logs ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ success: true, logs: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
