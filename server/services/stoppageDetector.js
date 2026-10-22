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

async function checkVehicleStoppages() {
  try {
    const thresholdMinutes = await getStoppageThresholdMinutes();

    // Query active vehicles in transit or stopped that have passed the stoppage threshold
    const query = `
      SELECT v.id AS vehicle_id, v.company_id, v.current_lat, v.current_lng, v.stoppage_start_time, v.last_gps_update, v.type AS vehicle_type,
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
      // Check if an active stoppage alert already exists for this trip/vehicle
      const alertCheck = await db.query(
        `SELECT id FROM alerts 
         WHERE vehicle_id = $1 AND type = 'Stoppage Detected' AND status = 'Active'`,
        [row.vehicle_id]
      );

      if (alertCheck.rows.length === 0) {
        const alertId = 'ALT-STP-' + Math.floor(1000 + Math.random() * 9000);
        const durationMins = Math.round((new Date() - new Date(row.stoppage_start_time)) / 60000);
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

        // 1. Send automated WhatsApp stoppage alert to Driver
        if (row.driver_phone) {
          whatsappService.sendStoppageAlertNotification(row, { stoppage_duration_minutes: durationMins }, row.driver_phone)
            .catch(err => console.warn('⚠️ Stoppage WhatsApp alert error (Driver):', err.message));
        }

        // 2. Send automated WhatsApp stoppage alert to Higher Official / Operations Manager
        const higherOfficialPhone = process.env.HIGHER_OFFICIAL_PHONE || row.manager_phone;
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

function startStoppageDetectorCron() {
  // Check every minute for 20-minute stoppage rule
  cron.schedule('* * * * *', () => {
    checkVehicleStoppages();
  });
  console.log('[StoppageDetector] Background vehicle monitoring cron initialized.');
}

module.exports = {
  startStoppageDetectorCron,
  checkVehicleStoppages,
  getStoppageThresholdMinutes,
};
