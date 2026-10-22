const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const whatsappService = require('../services/whatsappService');
const stoppageDetector = require('../services/stoppageDetector');
const { broadcastAlert, broadcastTripUpdate, broadcastGpsUpdate, getIO } = require('../services/socketService');

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
router.post('/webhook', async (req, res) => {
  // Always acknowledge webhook immediately with 200 OK as required by Meta
  res.status(200).json({ status: 'EVENT_RECEIVED' });

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
  let driver = null;
  let activeTrip = null;

  try {
    const driverRes = await db.query(
      `SELECT * FROM drivers WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '+', ''), '-', '') LIKE $1 LIMIT 1`,
      [`%${cleanedSender}%`]
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
    if (interactiveButtonId.startsWith('sos_') || interactiveButtonId === 'btn_sos' || interactiveButtonId.startsWith('stp_sos_')) {
      await triggerEmergencyAlert(senderNumber, driver, activeTrip, 'Emergency SOS button pressed on WhatsApp');
      return;
    }
    // Logistics Reason Button 1: Traffic / Toll Delay
    if (interactiveButtonId.startsWith('stp_traffic_')) {
      await recordTransitDelay(senderNumber, driver, activeTrip, 'Heavy Traffic / Toll Plaza Congestion');
      return;
    }
    // Logistics Reason Button 2: Puncture / Breakdown
    if (interactiveButtonId.startsWith('stp_breakdown_')) {
      await triggerEmergencyAlert(senderNumber, driver, activeTrip, 'Tyre Puncture / Vehicle Mechanical Breakdown');
      return;
    }
    // Logistics Reason Button 3: Resuming Movement
    if (interactiveButtonId.startsWith('stp_moving_') || interactiveButtonId === 'btn_resuming') {
      const vehId = activeTrip?.vehicle_id || (driver ? 'Assigned Vehicle' : 'Vehicle');
      if (activeTrip && activeTrip.vehicle_id) {
        await db.query(
          `UPDATE vehicles 
           SET movement_status = 'MOVING', speed_kmh = 45, stoppage_start_time = NULL, updated_at = NOW() 
           WHERE id = $1`,
          [activeTrip.vehicle_id]
        );
        await db.query(
          `UPDATE alerts SET status = 'Resolved', resolved_at = NOW() 
           WHERE vehicle_id = $1 AND type = 'Stoppage Detected' AND status = 'Active'`,
          [activeTrip.vehicle_id]
        );
      }
      await whatsappService.sendTextMessage(
        senderNumber,
        `🟢 *Transit Resumed!* Vehicle *${vehId}* marked as MOVING on Central Operations Map. Stoppage alert resolved. Drive safely!`
      );
      const io = getIO();
      if (io) {
        io.emit('stoppage_driver_response', {
          vehicleId: vehId,
          reason: '🟢 Resuming Movement (Transit Resumed)',
          timestamp: new Date().toISOString()
        });
      }
      return;
    }
    if (interactiveButtonId.startsWith('stp_delay_') || interactiveButtonId === 'btn_delay' || interactiveButtonId === 'btn_report_delay') {
      await recordTransitDelay(senderNumber, driver, activeTrip, 'Transit delay reported via quick button');
      return;
    }
  }

  // Process Text Commands
  const upperText = textContent.toUpperCase();

  // Handle Text Button Echoes
  if (upperText.includes('TRAFFIC') || upperText.includes('TOLL')) {
    await recordTransitDelay(senderNumber, driver, activeTrip, 'Heavy Traffic / Toll Plaza Congestion');
    return;
  }
  if (upperText.includes('PUNCTURE') || upperText.includes('BREAKDOWN')) {
    await triggerEmergencyAlert(senderNumber, driver, activeTrip, 'Tyre Puncture / Vehicle Mechanical Breakdown');
    return;
  }
  if (upperText.includes('RESUMING') || upperText.includes('RESUME')) {
    const vehId = activeTrip?.vehicle_id || 'Vehicle';
    if (activeTrip && activeTrip.vehicle_id) {
      await db.query(`UPDATE vehicles SET movement_status = 'MOVING', speed_kmh = 45, stoppage_start_time = NULL, updated_at = NOW() WHERE id = $1`, [activeTrip.vehicle_id]);
      await db.query(`UPDATE alerts SET status = 'Resolved', resolved_at = NOW() WHERE vehicle_id = $1 AND type = 'Stoppage Detected' AND status = 'Active'`, [activeTrip.vehicle_id]);
    }
    await whatsappService.sendTextMessage(senderNumber, `🟢 *Transit Resumed!* Vehicle *${vehId}* marked as MOVING on Central Operations Map. Stoppage alert resolved. Drive safely!`);
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
    if (activeTrip && activeTrip.vehicle_id) {
      await db.query(`UPDATE vehicles SET movement_status = 'MOVING', speed_kmh = 40, updated_at = NOW() WHERE id = $1`, [activeTrip.vehicle_id]);
      await whatsappService.sendTextMessage(senderNumber, `🟢 Status updated: Vehicle *${activeTrip.vehicle_id}* marked as MOVING. Drive safely!`);
    } else {
      await whatsappService.sendTextMessage(senderNumber, `🟢 Transit update noted. Thank you!`);
    }
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
 * Helper: Records Transit Delay reported by driver
 */
async function recordTransitDelay(toNumber, driver, trip, reason) {
  const tripId = trip?.id || 'Active Shipment';
  const vehicleId = trip?.vehicle_id || 'Vehicle';
  const driverName = driver?.name || 'Driver';

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

    // Create system alert
    const alertId = 'ALT-WA-' + Math.floor(1000 + Math.random() * 9000);
    const alertMsg = `WHATSAPP REPORT: Driver ${driverName} reported delay for ${trip.id} (${vehicleId}): "${reason}"`;

    const newAlert = await db.query(
      `INSERT INTO alerts (id, company_id, trip_id, vehicle_id, driver_id, type, message, severity, status, created_at)
       VALUES ($1, 'COMP-001', $2, $3, $4, 'Driver Delay Report', $5, 'warning', 'Active', NOW())
       RETURNING *`,
      [alertId, trip.id, vehicleId, driver?.id || null, alertMsg]
    );

    // Create system notification
    await db.query(
      `INSERT INTO notifications (company_id, title, message, type)
       VALUES ('COMP-001', $1, $2, 'DELAY')`,
      [`Transit Delay: ${trip.id}`, alertMsg]
    );

    broadcastAlert(newAlert.rows[0]);
    broadcastTripUpdate({ ...trip, status: 'DELAYED' });
    const io = getIO();
    if (io) {
      io.emit('stoppage_driver_response', {
        vehicleId,
        driverName,
        reason: `🟡 ${reason}`,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    // Standalone driver report without active trip
    const alertId = 'ALT-WA-' + Math.floor(1000 + Math.random() * 9000);
    const alertMsg = `WHATSAPP REPORT: Driver ${driverName} (📞 ${toNumber}) reported transit delay: "${reason}"`;
    try {
      const newAlert = await db.query(
        `INSERT INTO alerts (id, company_id, trip_id, vehicle_id, driver_id, type, message, severity, status, created_at)
         VALUES ($1, 'COMP-001', NULL, NULL, $2, 'Driver Delay Report', $3, 'warning', 'Active', NOW())
         RETURNING *`,
        [alertId, driver?.id || null, alertMsg]
      );
      await db.query(
        `INSERT INTO notifications (company_id, title, message, type)
         VALUES ('COMP-001', $1, $2, 'DELAY')`,
        [`Transit Delay Report`, alertMsg]
      );
      broadcastAlert(newAlert.rows[0]);
    } catch (e) {
      console.warn('Alert recording note:', e.message);
    }
  }

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
    `⚠️ *Delay Acknowledged:*\nTrip: ${tripId}\nReason: "${reason}"\n\nCentral Operations Control has been notified. Please drive safely and keep us updated.`
  );
}

/**
 * Helper: Triggers Emergency SOS Alert
 */
async function triggerEmergencyAlert(toNumber, driver, trip, messageText) {
  const tripId = trip?.id || 'UNASSIGNED';
  const vehicleId = trip?.vehicle_id || 'UNKNOWN';
  const driverName = driver?.name || 'Driver';

  const alertId = 'ALT-EMG-' + Math.floor(1000 + Math.random() * 9000);
  const alertMsg = `🚨 CRITICAL SOS VIA WHATSAPP: ${driverName} (${toNumber}) on Trip ${tripId} (Vehicle: ${vehicleId}) reported: "${messageText}"`;

  const newAlert = await db.query(
    `INSERT INTO alerts (id, company_id, trip_id, vehicle_id, driver_id, type, message, severity, status, created_at)
     VALUES ($1, 'COMP-001', $2, $3, $4, 'Emergency Breakdown', $5, 'critical', 'Active', NOW())
     RETURNING *`,
    [alertId, trip?.id || null, vehicleId, driver?.id || null, alertMsg]
  );

  await db.query(
    `INSERT INTO notifications (company_id, title, message, type)
     VALUES ('COMP-001', '🚨 CRITICAL SOS ALERT', $1, 'EMERGENCY')`,
    [alertMsg]
  );

  broadcastAlert(newAlert.rows[0]);
  const io = getIO();
  if (io) {
    io.emit('stoppage_driver_response', {
      vehicleId,
      driverName,
      reason: `🔴 ${messageText}`,
      timestamp: new Date().toISOString()
    });
  }

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
    `🚨 *EMERGENCY SOS LOGGED!*\nCentral Operations Control and the Emergency Quick-Response Team have received your alert for ${tripId}.\n\n📞 Operations Control Hotline: *+91 94412 00000*\nAssistance is being dispatched to your coordinates.`
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
    const webhookUrl = `${protocol}://${host}/api/whatsapp/webhook`;

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
    const { vehicleId, testPhone, minutes } = req.body || {};
    const stoppageMins = parseInt(minutes, 10) || 25;
    const phoneToUse = testPhone || process.env.HIGHER_OFFICIAL_PHONE || '916382897998';

    // Pick active vehicle (e.g. TN-59-EF-9012 or specified)
    let targetVehicle = vehicleId;
    if (!targetVehicle) {
      const activeVehRes = await db.query(
        `SELECT v.id FROM vehicles v 
         JOIN trips t ON t.vehicle_id = v.id AND t.status IN ('IN_TRANSIT', 'DELAYED') 
         LIMIT 1`
      );
      targetVehicle = activeVehRes.rows[0]?.id || 'TN-59-EF-9012';
    }

    // 1. Assign verified test phone number to the driver so Meta sandbox delivers successfully
    if (phoneToUse) {
      await db.query(
        `UPDATE drivers SET phone = $1 
         WHERE id IN (SELECT driver_id FROM trips WHERE vehicle_id = $2 LIMIT 1)`,
        [phoneToUse, targetVehicle]
      );
    }

    // 2. Set vehicle stopped in the past (> 20 mins ago)
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

    // 3. Clear previous stoppage alerts for this vehicle to allow new trigger
    await db.query(
      `DELETE FROM alerts WHERE vehicle_id = $1 AND type = 'Stoppage Detected'`,
      [targetVehicle]
    );

    // 4. Run automated stoppage detector
    await stoppageDetector.checkVehicleStoppages();

    // 5. Fetch generated alert
    const alertRes = await db.query(
      `SELECT * FROM alerts WHERE vehicle_id = $1 AND type = 'Stoppage Detected' ORDER BY created_at DESC LIMIT 1`,
      [targetVehicle]
    );

    res.json({
      success: true,
      message: `Automated stoppage detector ran successfully! Vehicle ${targetVehicle} flagged for ${stoppageMins}m halt.`,
      vehicleId: targetVehicle,
      stoppageMinutes: stoppageMins,
      alert: alertRes.rows[0] || null,
      driverPhone: phoneToUse,
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
    } else {
      await db.query(
        `UPDATE alerts SET status = 'Resolved', resolved_at = NOW() 
         WHERE vehicle_id = $1 AND (type = 'Stoppage Detected' OR type = 'Driver Delay Report') AND status = 'Active'`,
        [vehId]
      );
    }

    // 2. Clear vehicle stoppage timer
    await db.query(
      `UPDATE vehicles SET stoppage_start_time = NULL, movement_status = 'MOVING', speed_kmh = 45, updated_at = NOW() WHERE id = $1`,
      [vehId]
    );

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
    const io = getIO();
    if (io) {
      io.emit('stoppage_reason_accepted', {
        vehicleId: vehId,
        alertId,
        status: 'Resolved',
        message: 'Reason accepted by Operations Manager',
        timestamp: new Date().toISOString()
      });
      io.emit('alert_resolved', { vehicle_id: vehId, id: alertId });
    }

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
