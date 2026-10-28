const crypto = require('crypto');
const cron = require('node-cron');
const db = require('../config/db');
const { broadcastAlert } = require('./socketService');
const whatsappService = require('./whatsappService');

async function getStoppageThresholdMinutes() {
  try {
    const res = await db.query("SELECT value FROM system_settings WHERE key = 'stoppage_threshold_minutes'");
    if (res.rows.length > 0 && res.rows[0].value) {
      return parseInt(res.rows[0].value, 10) || 20;
    }
  } catch (err) {
    console.error('Error fetching stoppage threshold setting:', err.message);
  }
  return 20; // Default 20 minutes
}

async function getNoUpdateThresholdMinutes() {
  try {
    const res = await db.query("SELECT value FROM system_settings WHERE key = 'gps_no_update_minutes'");
    if (res.rows.length > 0 && res.rows[0].value) {
      return parseInt(res.rows[0].value, 10) || 10;
    }
  } catch (err) {
    console.error('Error fetching GPS no-update threshold setting:', err.message);
  }
  return 10; // Default 10 minutes
}

async function checkVehicleStoppages() {
  try {
    const thresholdMinutes = await getStoppageThresholdMinutes();
    const noUpdateThresholdMinutes = await getNoUpdateThresholdMinutes();
    const noUpdateCutoffMs = Date.now() - (noUpdateThresholdMinutes * 60 * 1000);

    // Query active vehicles in transit or stopped that have passed the stoppage threshold
    const query = `
      SELECT v.id AS vehicle_id, v.company_id, v.current_lat, v.current_lng, v.stoppage_start_time,
             v.last_gps_update, v.last_ping_at, v.type AS vehicle_type,
             t.id AS trip_id, t.driver_id, d.name AS driver_name, d.phone AS driver_phone,
             sb.name AS source_name, dest_b.name AS dest_name, dest_b.phone AS manager_phone, dest_b.manager_name
      FROM vehicles v
      JOIN trips t ON t.vehicle_id = v.id AND t.status IN ('IN_TRANSIT', 'DELAYED')
      LEFT JOIN drivers d ON d.id = t.driver_id
      LEFT JOIN branches sb ON sb.id = t.source_branch_id
      LEFT JOIN branches dest_b ON dest_b.id = t.destination_branch_id
      WHERE (v.movement_status = 'STOPPED' OR v.speed_kmh = 0)
        AND v.stoppage_start_time IS NOT NULL
        AND NOW() - v.stoppage_start_time >= INTERVAL '1 minute' * $1
    `;

    const res = await db.query(query, [thresholdMinutes]);

    for (const row of res.rows) {
      // Skip vehicles that have experienced a GPS signal outage (> noUpdateThresholdMinutes without pings)
      // to avoid firing duplicate Stoppage Detected and No Update alerts simultaneously
      if (row.last_ping_at) {
        const lastPingMs = new Date(row.last_ping_at).getTime();
        if (!isNaN(lastPingMs) && lastPingMs < noUpdateCutoffMs) {
          continue;
        }
      }

      // Check if an active stoppage alert or driver delay response already exists for this vehicle
      const alertCheck = await db.query(
        `SELECT id FROM alerts 
         WHERE vehicle_id = $1 
           AND type IN ('Stoppage Detected', 'Driver Delay Report', 'Emergency Breakdown') 
           AND status IN ('Active', 'Escalated', 'Pending_Approval')`,
        [row.vehicle_id]
      );

      if (alertCheck.rows.length === 0) {
        const alertId = 'ALT-STP-' + Math.floor(1000 + Math.random() * 9000);
        const parseUtc = (s) => {
          if (!s) return new Date();
          if (s instanceof Date) return s;
          const str = String(s).trim();
          if (str.endsWith('Z') || str.includes('+')) return new Date(str);
          return new Date(str.replace(' ', 'T') + 'Z');
        };
        const durationMins = Math.max(thresholdMinutes, Math.round((new Date() - parseUtc(row.stoppage_start_time)) / 60000));
        const msg = `AUTOMATIC DETECTED: Vehicle ${row.vehicle_id} (${row.driver_name || 'Driver'}) stopped at location (${row.current_lat}, ${row.current_lng}) for over ${durationMins} minutes! (Threshold: ${thresholdMinutes} mins)`;

        const newAlert = await db.query(
          `INSERT INTO alerts (id, company_id, trip_id, vehicle_id, driver_id, type, message, severity, status, stoppage_duration_minutes, created_at)
           VALUES ($1, $2, $3, $4, $5, 'Stoppage Detected', $6, 'warning', 'Active', $7, NOW())
           RETURNING *`,
          [alertId, row.company_id, row.trip_id, row.vehicle_id, row.driver_id, msg, durationMins]
        );

        // Also create a notification for tracking team
        await db.query(
          `INSERT INTO notifications (company_id, title, message, type)
           VALUES ($1, $2, $3, 'STOPPAGE')`,
          [row.company_id, `Vehicle Stoppage Alert (${row.vehicle_id})`, msg]
        );

        console.log(`[StoppageDetector] Created Alert ${alertId} for Vehicle ${row.vehicle_id}`);
        broadcastAlert(newAlert.rows[0]);

        const higherOfficialPhone = process.env.HIGHER_OFFICIAL_PHONE || row.manager_phone || '916382897998';
        const cleanDriverPhone = (row.driver_phone || '').replace(/[^0-9]/g, '');
        const cleanOfficialPhone = (higherOfficialPhone || '').replace(/[^0-9]/g, '');

        // 1. Send automated WhatsApp stoppage alert to Driver ONLY (3 interactive buttons)
        if (row.driver_phone && cleanDriverPhone !== cleanOfficialPhone) {
          whatsappService.sendStoppageAlertNotification(row, { stoppage_duration_minutes: durationMins }, row.driver_phone)
            .catch(err => console.warn('⚠️ Stoppage WhatsApp alert error (Driver):', err.message));
        }

        // 2. Send automated WhatsApp stoppage alert to Higher Official ONLY (text alert without interactive buttons)
        if (higherOfficialPhone) {
          whatsappService.sendHigherOfficialStoppageAlert(row, { stoppage_duration_minutes: durationMins }, higherOfficialPhone)
            .catch(err => console.warn('⚠️ Stoppage WhatsApp alert error (Higher Official):', err.message));
        }
      }
    }
  } catch (err) {
    console.error('[StoppageDetector] Error monitoring vehicle stoppages:', err);
  }
}

/**
 * Monitors active in-transit shipments for GPS signal outages (no telemetry/heartbeat received).
 * Strict Rules:
 * 1. Only monitors vehicles on IN_TRANSIT trips that have sent AT LEAST ONE real GPS ping during the current trip:
 *    (last_ping_at > t.dispatch_date OR EXISTS in gps_tracking_records for that trip).
 *    Seed data vehicles have no live pings, so seed data produces ZERO alerts.
 * 2. Fires alert once per outage (checks if active 'No Update' alert already exists for vehicle).
 * 3. Unique ID format: ALT-NOUPD-${Date.now()}-${hex}
 * 4. WhatsApp notification sent only if process.env.GPS_NO_UPDATE_WHATSAPP === 'true'.
 */
async function checkNoGpsSignalOutages() {
  try {
    const thresholdMinutes = await getNoUpdateThresholdMinutes();
    const cutoffDate = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();

    const query = `
      SELECT v.id AS vehicle_id, v.company_id, v.current_lat, v.current_lng, v.last_ping_at, v.last_gps_update,
             t.id AS trip_id, t.driver_id, t.dispatch_date,
             d.name AS driver_name, d.phone AS driver_phone,
             dest_b.name AS dest_name, dest_b.phone AS manager_phone
      FROM vehicles v
      JOIN trips t ON t.vehicle_id = v.id AND t.status = 'IN_TRANSIT'
      LEFT JOIN drivers d ON d.id = t.driver_id
      LEFT JOIN branches dest_b ON dest_b.id = t.destination_branch_id
      WHERE v.last_ping_at IS NOT NULL
        AND v.last_ping_at <= $1
        AND (
          v.last_ping_at > t.dispatch_date
          OR EXISTS (SELECT 1 FROM gps_tracking_records gtr WHERE gtr.trip_id = t.id)
        )
    `;

    const res = await db.query(query, [cutoffDate]);
    const generatedAlerts = [];

    for (const row of res.rows) {
      // Check if an active 'No Update' alert already exists for this vehicle
      const alertCheck = await db.query(
        `SELECT id FROM alerts 
         WHERE vehicle_id = $1 AND type = 'No Update' AND status = 'Active'`,
        [row.vehicle_id]
      );

      if (alertCheck.rows.length === 0) {
        const hex = crypto.randomBytes(3).toString('hex');
        const alertId = `ALT-NOUPD-${Date.now()}-${hex}`;
        const parseUtc = (s) => {
          if (!s) return new Date();
          if (s instanceof Date) return s;
          const str = String(s).trim();
          if (str.endsWith('Z') || str.includes('+')) return new Date(str);
          return new Date(str.replace(' ', 'T') + 'Z');
        };
        const elapsedMins = Math.max(thresholdMinutes, Math.round((Date.now() - parseUtc(row.last_ping_at).getTime()) / 60000));
        const msg = `GPS SIGNAL LOST: Vehicle ${row.vehicle_id} (${row.driver_name || 'Driver'}) has not reported location or heartbeat for over ${elapsedMins} minutes! (Threshold: ${thresholdMinutes} mins)`;

        const newAlert = await db.query(
          `INSERT INTO alerts (id, company_id, trip_id, vehicle_id, driver_id, type, message, severity, status, created_at)
           VALUES ($1, $2, $3, $4, $5, 'No Update', $6, 'danger', 'Active', NOW())
           RETURNING *`,
          [alertId, row.company_id, row.trip_id, row.vehicle_id, row.driver_id, msg]
        );

        await db.query(
          `INSERT INTO notifications (company_id, title, message, type)
           VALUES ($1, $2, $3, 'NO_GPS')`,
          [row.company_id, `GPS Signal Outage (${row.vehicle_id})`, msg]
        );

        console.log(`[Watchdog] Created 'No Update' Alert ${alertId} for Vehicle ${row.vehicle_id} (${elapsedMins}m outage)`);
        broadcastAlert(newAlert.rows[0]);
        generatedAlerts.push(newAlert.rows[0]);

        // WhatsApp notification sent ONLY if explicitly enabled
        if (process.env.GPS_NO_UPDATE_WHATSAPP === 'true') {
          if (row.driver_phone) {
            whatsappService.sendTextMessage(
              row.driver_phone,
              `⚠️ *GPS Signal Outage Warning*\nVehicle *${row.vehicle_id}* has stopped transmitting GPS data for ${elapsedMins} minutes.\nPlease ensure your mobile tracker is online and GPS is enabled.`
            ).catch(err => console.warn('⚠️ No Update WhatsApp alert error (Driver):', err.message));
          }
          const higherOfficialPhone = process.env.HIGHER_OFFICIAL_PHONE || row.manager_phone || '916382897998';
          if (higherOfficialPhone) {
            whatsappService.sendTextMessage(
              higherOfficialPhone,
              `🚨 *LCOS Critical Alert: GPS Lost*\nVehicle: *${row.vehicle_id}*\nDriver: ${row.driver_name || 'Assigned Driver'}\nTrip: ${row.trip_id}\nOutage Duration: ${elapsedMins} mins`
            ).catch(err => console.warn('⚠️ No Update WhatsApp alert error (Official):', err.message));
          }
        }
      }
    }

    return generatedAlerts;
  } catch (err) {
    console.error('[Watchdog] Error monitoring GPS signal outages:', err);
    return [];
  }
}

function startStoppageDetectorCron() {
  cron.schedule('* * * * *', async () => {
    await checkVehicleStoppages();
    await checkNoGpsSignalOutages();
  });
  console.log('[StoppageDetector] Background vehicle stoppage & GPS outage watchdog cron initialized.');
}

module.exports = {
  startStoppageDetectorCron,
  checkVehicleStoppages,
  checkNoGpsSignalOutages,
  getStoppageThresholdMinutes,
  getNoUpdateThresholdMinutes,
};
