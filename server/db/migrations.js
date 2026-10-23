const db = require('../config/db');

const BRANCH_COORDINATES = [
  { id: 'BR-CHE', lat: 13.0827, lng: 80.2707 },
  { id: 'BR-CBE', lat: 11.0168, lng: 76.9558 },
  { id: 'BR-MDU', lat: 9.9252, lng: 78.1198 },
  { id: 'BR-TRY', lat: 10.7905, lng: 78.7047 },
  { id: 'BR-SAL', lat: 11.6643, lng: 78.1460 },
  { id: 'BR-VEL', lat: 12.9165, lng: 79.1325 },
  { id: 'BR-ERD', lat: 11.3410, lng: 77.7172 },
  { id: 'BR-TEN', lat: 8.7139, lng: 77.7567 },
  { id: 'BR-TNL', lat: 8.7139, lng: 77.7567 },
  { id: 'BR-TUT', lat: 8.7642, lng: 78.1348 },
  { id: 'BR-DIN', lat: 10.3673, lng: 77.9803 },
  { id: 'BR-DGL', lat: 10.3673, lng: 77.9803 },
  { id: 'BR-CUD', lat: 11.7480, lng: 79.7714 },
  { id: 'BR-KAN', lat: 12.8342, lng: 79.7036 },
  { id: 'BR-KNC', lat: 12.8342, lng: 79.7036 },
  { id: 'BR-VLP', lat: 11.9401, lng: 79.4861 },
  { id: 'BR-NAG', lat: 10.7672, lng: 79.8449 },
  { id: 'BR-NGP', lat: 10.7672, lng: 79.8449 },
  { id: 'BR-ARI', lat: 11.1401, lng: 79.0786 },
  { id: 'BR-CGL', lat: 12.6841, lng: 79.9836 },
  { id: 'BR-DHA', lat: 12.1277, lng: 78.1579 },
  { id: 'BR-KAL', lat: 11.7384, lng: 78.9639 },
  { id: 'BR-KKI', lat: 8.1833, lng: 77.4119 },
  { id: 'BR-KAR', lat: 10.9601, lng: 78.0766 },
  { id: 'BR-KRI', lat: 12.5266, lng: 78.2146 },
  { id: 'BR-MAY', lat: 11.1018, lng: 79.6522 },
  { id: 'BR-NAM', lat: 11.2189, lng: 78.1674 },
  { id: 'BR-NIL', lat: 11.4102, lng: 76.6950 },
  { id: 'BR-PER', lat: 11.2342, lng: 78.8820 },
  { id: 'BR-PUD', lat: 10.3833, lng: 78.8000 },
  { id: 'BR-RAM', lat: 9.3639, lng: 78.8394 },
  { id: 'BR-RAN', lat: 12.9296, lng: 79.3331 },
  { id: 'BR-SIV', lat: 9.8433, lng: 78.4800 },
  { id: 'BR-THA', lat: 10.7870, lng: 79.1378 },
  { id: 'BR-THE', lat: 10.0104, lng: 77.4768 },
  { id: 'BR-TPR', lat: 12.4950, lng: 78.5678 },
  { id: 'BR-TUP', lat: 11.1085, lng: 77.3411 },
  { id: 'BR-TVL', lat: 13.1432, lng: 79.9079 },
  { id: 'BR-TVM', lat: 12.2253, lng: 79.0747 },
  { id: 'BR-TVR', lat: 10.7708, lng: 79.6366 },
  { id: 'BR-VIR', lat: 9.5872, lng: 77.9514 }
];

/**
 * Checks if a column exists in a given table, and adds it if missing.
 * Compatible with both SQLite and PostgreSQL.
 */
async function addColumnIfMissing(tableName, columnName, columnDefinition) {
  try {
    const isEmbedded = db.isUsingEmbedded && db.isUsingEmbedded();
    if (isEmbedded) {
      const tableInfo = await db.query(`PRAGMA table_info(${tableName})`);
      const exists = tableInfo.rows.some(col => (col.name || '').toLowerCase() === columnName.toLowerCase());
      if (!exists) {
        // Strip PostgreSQL specific constraints for SQLite alter table
        const sqliteDef = columnDefinition
          .replace(/VARCHAR\(\d+\)/gi, 'TEXT')
          .replace(/TIMESTAMPTZ/gi, 'TEXT')
          .replace(/NUMERIC\([^)]+\)/gi, 'NUMERIC')
          .replace(/BOOLEAN/gi, 'INTEGER')
          .replace(/DEFAULT\s+FALSE/gi, 'DEFAULT 0')
          .replace(/DEFAULT\s+TRUE/gi, 'DEFAULT 1');
        await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqliteDef}`);
        console.log(`[Migration] Added column ${columnName} to ${tableName} (SQLite)`);
      }
    } else {
      // PostgreSQL supports IF NOT EXISTS natively
      await db.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${columnName} ${columnDefinition}`);
      console.log(`[Migration] Verified column ${columnName} on ${tableName} (PostgreSQL)`);
    }
  } catch (err) {
    console.warn(`[Migration Warning] Could not add column ${columnName} to ${tableName}:`, err.message);
  }
}

/**
 * Runs idempotent database migrations across PostgreSQL and SQLite
 */
async function runMigrations() {
  try {
    // 1. vehicles: add device_key for hardware GPS tracker authentication
    await addColumnIfMissing('vehicles', 'device_key', 'VARCHAR(255)');

    // 2. gps_tracking_records: add accuracy column
    await addColumnIfMissing('gps_tracking_records', 'accuracy', 'NUMERIC DEFAULT 0');

    // 3. branches: add lat and lng columns for geofencing and distance calculations
    await addColumnIfMissing('branches', 'lat', 'NUMERIC');
    await addColumnIfMissing('branches', 'lng', 'NUMERIC');

    // 4. trips: add arriving_notified flag for single 500m geofence trigger per trip
    await addColumnIfMissing('trips', 'arriving_notified', 'BOOLEAN DEFAULT FALSE');

    // 5. vehicles: add last_ping_at for GPS watchdog and heartbeat monitoring
    await addColumnIfMissing('vehicles', 'last_ping_at', 'TIMESTAMPTZ');

    // 6. Ensure default system setting for GPS outage watchdog exists
    try {
      await db.query(
        "INSERT INTO system_settings (key, value) SELECT 'gps_no_update_minutes', '10' WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'gps_no_update_minutes')"
      );
    } catch (_) {}

    // 7. Normalize legacy SQLite timestamps in gps_tracking_records to ISO 8601 UTC (idempotent)
    const isEmbedded = db.isUsingEmbedded && db.isUsingEmbedded();
    if (isEmbedded) {
      try {
        await db.query(
          "UPDATE gps_tracking_records SET recorded_at = replace(replace(recorded_at, ' ', 'T'), 'Z', '') || 'Z' WHERE recorded_at IS NOT NULL AND (recorded_at NOT LIKE '%T%Z' OR recorded_at LIKE '% %')"
        );
      } catch (_) {}
    }

    // 8. Ensure tracking history index exists
    try {
      await db.query(`CREATE INDEX IF NOT EXISTS idx_gps_records_vehicle_time ON gps_tracking_records(vehicle_id, recorded_at DESC)`);
    } catch (idxErr) {
      // Index might already exist
    }

    // 9. Ensure default initial test trip TRIP-1001 is IN_TRANSIT for mobile tracking demo
    try {
      await db.query("UPDATE trips SET status = 'IN_TRANSIT' WHERE id = 'TRIP-1001' AND status = 'CREATED'");
    } catch (_) {}

    // 10. Ensure multiple driver accounts exist for concurrent mobile tracking testing
    const extraDrivers = [
      { id: 'USR-DRIVER2', username: 'driver2', empId: 'DRV-102', fullName: 'Kumaravel P.', phone: '+91 98840 23456' },
      { id: 'USR-DRIVER3', username: 'driver3', empId: 'DRV-104', fullName: 'Murugan T.', phone: '+91 98840 45678' },
      { id: 'USR-DRIVER4', username: 'driver4', empId: 'DRV-105', fullName: 'Saravanan K.', phone: '+91 98840 56789' },
      { id: 'USR-DRIVER5', username: 'driver5', empId: 'DRV-112', fullName: 'Sanjeev', phone: '+91 79047 43468' }
    ];

    for (const d of extraDrivers) {
      try {
        await db.query(
          `INSERT INTO users (id, company_id, username, email, password_hash, full_name, phone, role, emp_id, status)
           VALUES ($1, 'COMP-001', $2, $3, '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', $4, $5, 'DRIVER', $6, 'ACTIVE')
           ON CONFLICT (id) DO NOTHING`,
          [d.id, d.username, `${d.username}@lcos.com`, d.fullName, d.phone, d.empId]
        );
        await db.query(`UPDATE drivers SET user_id = $1 WHERE id = $2`, [d.id, d.empId]);
      } catch (_) {}
    }

    try {
      await db.query("UPDATE trips SET status = 'IN_TRANSIT' WHERE id IN ('TRIP-1001', 'TRIP-1002', 'TRIP-1005', 'TRIP-1006', 'TRIP-1012')");
    } catch (_) {}

    // 6. Backfill branch coordinates
    for (const b of BRANCH_COORDINATES) {
      try {
        await db.query(
          `UPDATE branches SET lat = $1, lng = $2 WHERE id = $3 AND (lat IS NULL OR lng IS NULL)`,
          [b.lat, b.lng, b.id]
        );
      } catch (err) {
        // Non-blocking backfill
      }
    }

    console.log('✅ [Migrations] Schema checks and branch coordinate backfills complete.');
  } catch (err) {
    console.error('❌ [Migration Error]:', err.message);
  }
}

module.exports = {
  addColumnIfMissing,
  runMigrations,
  BRANCH_COORDINATES,
};
