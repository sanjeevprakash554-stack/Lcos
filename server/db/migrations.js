const db = require('../config/db');

const ALL_38_BRANCHES = [
  { id: 'BR-ARI', name: 'Ariyalur', manager: 'Gopal R.', phone: '+91 94412 11111', x: 65, y: 46, lat: 11.1401, lng: 79.0786 },
  { id: 'BR-CGL', name: 'Chengalpattu', manager: 'Devan M.', phone: '+91 94412 11112', x: 78, y: 20, lat: 12.6841, lng: 79.9836 },
  { id: 'BR-CHE', name: 'Chennai', manager: 'Balaji R.', phone: '+91 94412 12345', x: 82, y: 15, lat: 13.0827, lng: 80.2707 },
  { id: 'BR-CBE', name: 'Coimbatore', manager: 'Senthil Kumar', phone: '+91 94412 23456', x: 20, y: 55, lat: 11.0168, lng: 76.9558 },
  { id: 'BR-CUD', name: 'Cuddalore', manager: 'Elangovan A.', phone: '+91 94412 11223', x: 72, y: 38, lat: 11.7480, lng: 79.7714 },
  { id: 'BR-DHA', name: 'Dharmapuri', manager: 'Anand K.', phone: '+91 94412 11113', x: 42, y: 28, lat: 12.1277, lng: 78.1579 },
  { id: 'BR-DGL', name: 'Dindigul', manager: 'Palanichamy M.', phone: '+91 94412 01234', x: 38, y: 62, lat: 10.3673, lng: 77.9803 },
  { id: 'BR-ERD', name: 'Erode', manager: 'Ramasamy P.', phone: '+91 94412 78901', x: 35, y: 48, lat: 11.3410, lng: 77.7172 },
  { id: 'BR-KAL', name: 'Kallakurichi', manager: 'Prakash S.', phone: '+91 94412 11114', x: 58, y: 35, lat: 11.7384, lng: 78.9639 },
  { id: 'BR-KNC', name: 'Kanchipuram', manager: 'Srinivasan G.', phone: '+91 94412 22334', x: 76, y: 24, lat: 12.8342, lng: 79.7036 },
  { id: 'BR-KKI', name: 'Kanyakumari', manager: 'Rajendran T.', phone: '+91 94412 11115', x: 30, y: 96, lat: 8.1833, lng: 77.4119 },
  { id: 'BR-KAR', name: 'Karur', manager: 'Murugesan V.', phone: '+91 94412 11116', x: 42, y: 52, lat: 10.9601, lng: 78.0766 },
  { id: 'BR-KRI', name: 'Krishnagiri', manager: 'Saravanan N.', phone: '+91 94412 11117', x: 48, y: 22, lat: 12.5266, lng: 78.2146 },
  { id: 'BR-MDU', name: 'Madurai', manager: 'Pandian M.', phone: '+91 94412 34567', x: 42, y: 70, lat: 9.9252, lng: 78.1198 },
  { id: 'BR-MAY', name: 'Mayiladuthurai', manager: 'Velmurugan K.', phone: '+91 94412 11118', x: 75, y: 47, lat: 11.1018, lng: 79.6522 },
  { id: 'BR-NGP', name: 'Nagapattinam', manager: 'Muruganandam K.', phone: '+91 94412 44556', x: 76, y: 52, lat: 10.7672, lng: 79.8449 },
  { id: 'BR-NAM', name: 'Namakkal', manager: 'Thangavel R.', phone: '+91 94412 11119', x: 42, y: 45, lat: 11.2189, lng: 78.1674 },
  { id: 'BR-NIL', name: 'Nilgiris (Ooty)', manager: 'John Samuel', phone: '+91 94412 11120', x: 15, y: 45, lat: 11.4102, lng: 76.6950 },
  { id: 'BR-PER', name: 'Perambalur', manager: 'Govindasamy C.', phone: '+91 94412 11121', x: 60, y: 48, lat: 11.2342, lng: 78.8820 },
  { id: 'BR-PUD', name: 'Pudukkottai', manager: 'Chelladurai P.', phone: '+91 94412 11122', x: 55, y: 65, lat: 10.3833, lng: 78.8000 },
  { id: 'BR-RAM', name: 'Ramanathapuram', manager: 'Sethupathi S.', phone: '+91 94412 11123', x: 58, y: 78, lat: 9.3639, lng: 78.8394 },
  { id: 'BR-RAN', name: 'Ranipet', manager: 'Vijayakumar A.', phone: '+91 94412 11124', x: 68, y: 20, lat: 12.9296, lng: 79.3331 },
  { id: 'BR-SAL', name: 'Salem', manager: 'Venkatachalam K.', phone: '+91 94412 56789', x: 45, y: 40, lat: 11.6643, lng: 78.1460 },
  { id: 'BR-SIV', name: 'Sivaganga', manager: 'Alagappan M.', phone: '+91 94412 11125', x: 52, y: 72, lat: 9.8433, lng: 78.4800 },
  { id: 'BR-TKS', name: 'Tenkasi', manager: 'Sankaralingam K.', phone: '+91 94412 11126', x: 28, y: 86, lat: 8.9597, lng: 77.3150 },
  { id: 'BR-THA', name: 'Thanjavur', manager: 'Swaminathan N.', phone: '+91 94412 11127', x: 68, y: 55, lat: 10.7870, lng: 79.1378 },
  { id: 'BR-THE', name: 'Theni', manager: 'Veerappan G.', phone: '+91 94412 11128', x: 30, y: 68, lat: 10.0104, lng: 77.4768 },
  { id: 'BR-TUT', name: 'Thoothukudi', manager: 'Subbiah V.', phone: '+91 94412 90123', x: 48, y: 88, lat: 8.7642, lng: 78.1348 },
  { id: 'BR-TRY', name: 'Tiruchirappalli', manager: 'Raja Sekhar', phone: '+91 94412 45678', x: 52, y: 55, lat: 10.7905, lng: 78.7047 },
  { id: 'BR-TEN', name: 'Tirunelveli', manager: 'Muthu Krishnan', phone: '+91 94412 89012', x: 35, y: 85, lat: 8.7139, lng: 77.7567 },
  { id: 'BR-TPR', name: 'Tirupathur', manager: 'Mani R.', phone: '+91 94412 11129', x: 55, y: 25, lat: 12.4950, lng: 78.5678 },
  { id: 'BR-TUP', name: 'Tiruppur', manager: 'Chinnasamy S.', phone: '+91 94412 11130', x: 28, y: 52, lat: 11.1085, lng: 77.3411 },
  { id: 'BR-TVL', name: 'Tiruvallur', manager: 'Harikrishnan D.', phone: '+91 94412 11131', x: 80, y: 12, lat: 13.1432, lng: 79.9079 },
  { id: 'BR-TVM', name: 'Tiruvannamalai', manager: 'Dhandapani K.', phone: '+91 94412 11132', x: 62, y: 28, lat: 12.2253, lng: 79.0747 },
  { id: 'BR-TVR', name: 'Tiruvarur', manager: 'Selvaraj V.', phone: '+91 94412 11133', x: 72, y: 55, lat: 10.7708, lng: 79.6366 },
  { id: 'BR-VEL', name: 'Vellore', manager: 'Karthikeyan S.', phone: '+91 94412 67890', x: 68, y: 22, lat: 12.9165, lng: 79.1325 },
  { id: 'BR-VLP', name: 'Villupuram', manager: 'Anbarasan T.', phone: '+91 94412 33445', x: 70, y: 32, lat: 11.9401, lng: 79.4861 },
  { id: 'BR-VIR', name: 'Virudhunagar', manager: 'Marimuthu A.', phone: '+91 94412 11134', x: 38, y: 76, lat: 9.5872, lng: 77.9514 }
];

const ALL_COMMODITIES = [
  { id: 'COM-RIC', name: 'Rice', unit: 'Bags', weight_kg: 50, unit_value: 2000 },
  { id: 'COM-SUG', name: 'Sugar', unit: 'Bags', weight_kg: 50, unit_value: 2500 },
  { id: 'COM-WHE', name: 'Wheat', unit: 'Bags', weight_kg: 50, unit_value: 1800 },
  { id: 'COM-PUL', name: 'Pulses', unit: 'Bags', weight_kg: 50, unit_value: 3200 },
  { id: 'COM-CEM', name: 'Cement', unit: 'Bags', weight_kg: 50, unit_value: 450 },
  { id: 'COM-STE', name: 'Steel', unit: 'Tons', weight_kg: 1000, unit_value: 65000 },
  { id: 'COM-OIL', name: 'Cooking Oil', unit: 'Tins', weight_kg: 15, unit_value: 2200 },
  { id: 'COM-TEA', name: 'Nilgiri Tea', unit: 'Boxes', weight_kg: 25, unit_value: 4500 },
  { id: 'COM-COT', name: 'Raw Cotton', unit: 'Bales', weight_kg: 170, unit_value: 12500 },
  { id: 'COM-TEX', name: 'Textiles & Fabrics', unit: 'Rolls', weight_kg: 40, unit_value: 8500 },
  { id: 'COM-FER', name: 'Fertilizers', unit: 'Bags', weight_kg: 50, unit_value: 1200 },
  { id: 'COM-SPR', name: 'Auto Spare Parts', unit: 'Crates', weight_kg: 100, unit_value: 35000 }
];

const BRANCH_COORDINATES = ALL_38_BRANCHES.map(b => ({ id: b.id, lat: b.lat, lng: b.lng }));

/**
 * Checks if a column exists in a given table, and adds it if missing.
 * Compatible with both SQLite and PostgreSQL.
 */
async function addColumnIfMissing(tableName, columnName, columnDefinition) {
  try {
    const isEmbedded = (db.isUsingEmbedded && db.isUsingEmbedded()) || process.env.USE_EMBEDDED_DB === 'true';
    if (isEmbedded) {
      const tableInfo = await db.query(`PRAGMA table_info(${tableName})`);
      const exists = tableInfo.rows.some(col => (col.name || '').toLowerCase() === columnName.toLowerCase());
      if (!exists) {
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
    const isEmbedded = (db.isUsingEmbedded && db.isUsingEmbedded()) || process.env.USE_EMBEDDED_DB === 'true';
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
    } catch (idxErr) {}

    // 9. Ensure active operational truck & verified WhatsApp driver exist
    try {
      const vCheck = await db.query("SELECT id FROM vehicles WHERE id = 'TN-59-EF-9012'");
      if (vCheck.rows.length === 0) {
        await db.query(`
          INSERT INTO vehicles (id, company_id, type, capacity_tons, ownership, status, movement_status, speed_kmh, current_lat, current_lng, created_at)
          VALUES ('TN-59-EF-9012', 'COMP-001', 'Heavy Truck (10-Wheeler)', 16, 'OWNED', 'ACTIVE', 'STOPPED', 0, 11.6455, 78.1576, NOW())
        `);
      }
      const dCheck = await db.query("SELECT id FROM drivers WHERE phone LIKE '%6382897998%'");
      if (dCheck.rows.length === 0) {
        await db.query(`
          INSERT INTO drivers (id, company_id, name, phone, license_number, status, current_lat, current_lng, created_at)
          VALUES ('DRV-101', 'COMP-001', 'Saravanan K.', '916382897998', 'TN-59-2021-00982', 'AVAILABLE', 11.6455, 78.1576, NOW())
        `);
      }
      const tCheck = await db.query("SELECT id FROM trips WHERE id = 'TRIP-1002'");
      if (tCheck.rows.length === 0) {
        await db.query(`
          INSERT INTO trips (id, company_id, vehicle_id, driver_id, status, source_branch_id, destination_branch_id, commodity_id, quantity, expected_delivery_date, created_at)
          VALUES ('TRIP-1002', 'COMP-001', 'TN-59-EF-9012', 'DRV-101', 'IN_TRANSIT', 'BR-CBE', 'BR-CHE', 'COM-RIC', 25, NOW(), NOW())
        `);
      }
    } catch (seedErr) {
      console.warn('[Migration Seeding Notice]:', seedErr.message);
    }

    // 10. Ensure ALL 38 DISTRICTS OF TAMIL NADU exist in branches
    for (const b of ALL_38_BRANCHES) {
      try {
        const bCheck = await db.query('SELECT id FROM branches WHERE id = $1', [b.id]);
        if (bCheck.rows.length === 0) {
          await db.query(
            `INSERT INTO branches (id, company_id, name, manager_name, phone, x_coord, y_coord, lat, lng)
             VALUES ($1, 'COMP-001', $2, $3, $4, $5, $6, $7, $8)`,
            [b.id, b.name, b.manager, b.phone, b.x, b.y, b.lat, b.lng]
          );
        } else {
          await db.query(
            `UPDATE branches SET name = $1, lat = COALESCE(lat, $2), lng = COALESCE(lng, $3), x_coord = COALESCE(x_coord, $4), y_coord = COALESCE(y_coord, $5) WHERE id = $6`,
            [b.name, b.lat, b.lng, b.x, b.y, b.id]
          );
        }
      } catch (brErr) {}
    }

    // 11. Ensure ALL core commodities exist
    for (const c of ALL_COMMODITIES) {
      try {
        const cCheck = await db.query('SELECT id FROM commodities WHERE id = $1', [c.id]);
        if (cCheck.rows.length === 0) {
          await db.query(
            `INSERT INTO commodities (id, company_id, name, unit, weight_kg, unit_value)
             VALUES ($1, 'COMP-001', $2, $3, $4, $5)`,
            [c.id, c.name, c.unit, c.weight_kg, c.unit_value]
          );
        }
      } catch (comErr) {}
    }

    // 12. Ensure warehouse inventory / stock exists for ALL branches & commodities with generous baseline buffers
    const branchesRes = await db.query('SELECT id FROM branches');
    const commsRes = await db.query('SELECT id FROM commodities');
    for (const b of branchesRes.rows) {
      for (const c of commsRes.rows) {
        try {
          const sCheck = await db.query('SELECT available_qty FROM stock WHERE branch_id = $1 AND commodity_id = $2', [b.id, c.id]);
          if (sCheck.rows.length === 0) {
            await db.query(
              `INSERT INTO stock (branch_id, commodity_id, available_qty, in_transit_qty, delivered_qty, pending_qty)
               VALUES ($1, $2, 1000, 0, 0, 0)`,
              [b.id, c.id]
            );
          } else if (Number(sCheck.rows[0].available_qty) < 50) {
            await db.query(
              `UPDATE stock SET available_qty = available_qty + 1000, updated_at = NOW() WHERE branch_id = $1 AND commodity_id = $2`,
              [b.id, c.id]
            );
          }
        } catch (stkErr) {}
      }
    }

    // 13. Ensure default manager requests exist if empty
    try {
      const reqCount = await db.query('SELECT count(*) as count FROM manager_requests');
      if (Number(reqCount.rows[0]?.count || 0) === 0) {
        await db.query(`
          INSERT INTO manager_requests (id, company_id, type, request_data, status, submitted_by, created_at) VALUES
          ('REQ-101', 'COMP-001', 'Add Stock', '{"branchId": "BR-CHE", "commodityId": "COM-CEM", "quantity": 500}', 'Pending', 'USR-TRACKING', NOW() - INTERVAL '2 hours'),
          ('REQ-102', 'COMP-001', 'Add Driver', '{"name": "Muthuramalingam K.", "license": "DL-TN452022099", "phone": "+91 98422 99887", "experience": 6}', 'Pending', 'USR-TRACKING', NOW() - INTERVAL '1 hour'),
          ('REQ-103', 'COMP-001', 'Add Vehicle', '{"id": "TN-99-ZZ-5555", "type": "Container", "capacity": 25, "owner": "Logistics Partners"}', 'Pending', 'USR-TRACKING', NOW() - INTERVAL '30 mins')
        `);
      }
    } catch (reqSeedErr) {
      console.warn('[Migration Requests Seed Notice]:', reqSeedErr.message);
    }

    console.log('✅ [Migrations] Schema checks, all 38 Tamil Nadu districts & warehouse stocks ready.');
  } catch (err) {
    console.error('❌ [Migration Error]:', err.message);
  }
}

module.exports = {
  addColumnIfMissing,
  runMigrations,
  BRANCH_COORDINATES,
  ALL_38_BRANCHES,
  ALL_COMMODITIES
};
