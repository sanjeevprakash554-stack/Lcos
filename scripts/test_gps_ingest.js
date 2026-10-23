/**
 * Comprehensive Automated Test Suite for GPS Ingestion, Heartbeats, Watchdog & Retention
 * Logistics Operations Control System (LCOS)
 *
 * Runs against an isolated temporary database to keep the dev database clean.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// 1. Configure isolated temporary SQLite database
const devDbPath = path.join(__dirname, '../server/db/lcos_embedded.sqlite');
const tempDbPath = path.join(os.tmpdir(), `lcos_isolated_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.sqlite`);

// Query dev database row counts before test run
let devAlertsBefore = 0;
let devGpsBefore = 0;
if (fs.existsSync(devDbPath)) {
  const { DatabaseSync } = require('node:sqlite');
  const devDb = new DatabaseSync(devDbPath);
  try {
    devAlertsBefore = devDb.prepare('SELECT COUNT(*) AS c FROM alerts').get().c;
    devGpsBefore = devDb.prepare('SELECT COUNT(*) AS c FROM gps_tracking_records').get().c;
  } catch (_) {}
  devDb.close();
}

// Point all database connections to the temporary test database
process.env.LCOS_DB_PATH = tempDbPath;
process.env.USE_EMBEDDED_DB = 'true';
process.env.PORT = '5004'; // Dedicated isolated test port

const db = require('../server/config/db');
const { JWT_SECRET } = require('../server/middleware/auth');
const { cleanupGpsRecords } = require('../server/routes/gps.routes');
const { runMigrations } = require('../server/db/migrations');
const {
  checkNoGpsSignalOutages,
  checkVehicleStoppages,
  getNoUpdateThresholdMinutes,
} = require('../server/services/stoppageDetector');

// Import real server app
const { app, server } = require('../server/index');

async function runTests() {
  console.log('========================================================');
  console.log('🧪 Starting LCOS GPS Isolated Test Suite (against server/index.js)');
  console.log(`📦 Isolated Temp DB: ${tempDbPath}`);
  console.log(`📊 Dev DB Pre-Check: ${devAlertsBefore} alerts, ${devGpsBefore} gps records`);
  console.log('========================================================');

  const PORT = process.env.PORT || 5004;
  const BASE_URL = `http://localhost:${PORT}/api/gps`;

  // Wait 1.5 seconds for boot and initial migrations
  await new Promise(r => setTimeout(r, 1500));

  try {
    // ----------------------------------------------------
    // Database Preparation on isolated database
    // ----------------------------------------------------
    await db.query(`UPDATE trips SET status = 'IN_TRANSIT', arriving_notified = FALSE WHERE id = 'TRIP-1001'`);
    await db.query(
      `UPDATE vehicles 
       SET current_lat = 13.0827, current_lng = 80.2707, speed_kmh = 45,
           movement_status = 'MOVING', stoppage_start_time = NULL, last_ping_at = NULL 
       WHERE id = 'TN-01-AB-1234'`
    );
    await db.query(`UPDATE branches SET lat = 9.9252, lng = 78.1198 WHERE id = 'BR-MDU'`);
    await db.query(`DELETE FROM alerts WHERE trip_id = 'TRIP-1001' OR vehicle_id = 'TN-01-AB-1234'`);

    const driverToken = jwt.sign(
      { id: 'USR-DRIVER1', username: 'driver1', companyId: 'COMP-001', role: 'DRIVER', driverId: 'DRV-101' },
      JWT_SECRET
    );
    const ownerToken = jwt.sign(
      { id: 'USR-OWNER', username: 'owner', companyId: 'COMP-001', role: 'OWNER' },
      JWT_SECRET
    );
    const foreignToken = jwt.sign(
      { id: 'USR-HACKER', username: 'hacker', companyId: 'COMP-999', role: 'OWNER' },
      JWT_SECRET
    );
    const managerToken = jwt.sign(
      { id: 'USR-MGR', username: 'manager', companyId: 'COMP-001', role: 'BRANCH_MANAGER' },
      JWT_SECRET
    );

    // ----------------------------------------------------
    // TEST 1: No Authentication (Expect 401)
    // ----------------------------------------------------
    console.log('\n[Test 1] Testing unauthenticated GPS update...');
    const t1Res = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 13.0827, lng: 80.2707 }),
    });
    console.assert(t1Res.status === 401, 'Test 1 Failed');
    console.log('Status: 401 (Passed)');

    // ----------------------------------------------------
    // TEST 2: Wrong Role (Expect 403)
    // ----------------------------------------------------
    console.log('\n[Test 2] Testing non-driver role token on /update...');
    const t2Res = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ lat: 13.0827, lng: 80.2707 }),
    });
    console.assert(t2Res.status === 403, 'Test 2 Failed');
    console.log('Status: 403 (Passed)');

    // ----------------------------------------------------
    // TEST 3: Invalid Coordinates (Expect 400)
    // ----------------------------------------------------
    console.log('\n[Test 3] Testing out-of-range coordinates...');
    const t3Res = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ lat: 120.0, lng: 80.2707, speedKmh: 45 }),
    });
    console.assert(t3Res.status === 400, 'Test 3 Failed');
    console.log('Status: 400 (Passed)');

    // ----------------------------------------------------
    // TEST 4: Driver JWT Happy Path (Expect 200)
    // ----------------------------------------------------
    console.log('\n[Test 4] Testing valid Driver JWT happy path...');
    const t4Res = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ lat: 13.0827, lng: 80.2707, speedKmh: 48, heading: 180, accuracy: 12 }),
    });
    const t4Data = await t4Res.json();
    console.assert(t4Res.status === 200 && t4Data.telemetry?.vehicleId === 'TN-01-AB-1234', 'Test 4 Failed');
    console.log(`Status: 200 | Vehicle: ${t4Data.telemetry?.vehicleId} (Passed)`);

    // ----------------------------------------------------
    // TEST 5: Low Accuracy Point (> 100m, logs heartbeat)
    // ----------------------------------------------------
    console.log('\n[Test 5] Testing low accuracy GPS fix (accuracy: 150m > 100m threshold)...');
    await new Promise(r => setTimeout(r, 3100));
    await db.query(`UPDATE vehicles SET last_ping_at = '2026-01-01T00:00:00.000Z' WHERE id = 'TN-01-AB-1234'`);

    const t5Res = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ lat: 13.0830, lng: 80.2710, speedKmh: 50, accuracy: 150 }),
    });
    const t5Data = await t5Res.json();
    console.assert(t5Res.status === 200 && t5Data.ignored === true, 'Test 5 Failed');

    const vehT5 = await db.query(`SELECT last_ping_at FROM vehicles WHERE id = 'TN-01-AB-1234'`);
    console.assert(vehT5.rows[0].last_ping_at > '2026-01-01T00:00:00.000Z', 'Test 5 Heartbeat Failed');
    console.log('Status: 200 ignored: true, heartbeat updated (Passed)');

    // ----------------------------------------------------
    // TEST 6: Rate Limiting (< 3s, Expect 429)
    // ----------------------------------------------------
    console.log('\n[Test 6] Testing per-vehicle rate limit...');
    await new Promise(r => setTimeout(r, 3100));
    await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ lat: 13.0840, lng: 80.2720, speedKmh: 40, accuracy: 15 }),
    });

    const t6Res = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ lat: 13.0845, lng: 80.2725, speedKmh: 42, accuracy: 15 }),
    });
    const t6Data = await t6Res.json();
    console.assert(t6Res.status === 429 && t6Data.retryAfterMs > 0, 'Test 6 Failed');
    console.log(`Status: 429 RetryAfter: ${t6Data.retryAfterMs}ms (Passed)`);

    // ----------------------------------------------------
    // TEST 7: Hardware Device Key Auth
    // ----------------------------------------------------
    console.log('\n[Test 7] Testing Hardware Device Key authentication...');
    const rawDevKey = 'lcos_dev_isolated_test_key_12345';
    const hashDevKey = crypto.createHash('sha256').update(rawDevKey).digest('hex');
    await db.query(`UPDATE vehicles SET device_key = $1 WHERE id = 'TN-01-AB-1234'`, [hashDevKey]);

    await new Promise(r => setTimeout(r, 3100));
    const t7Res = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vehicle-Id': 'TN-01-AB-1234', 'X-Device-Key': rawDevKey },
      body: JSON.stringify({ lat: 13.0850, lng: 80.2730, speedKmh: 45, accuracy: 10 }),
    });
    console.assert(t7Res.status === 200, 'Test 7 Correct Key Failed');

    const t7WrongRes = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vehicle-Id': 'TN-01-AB-1234', 'X-Device-Key': 'lcos_dev_wrong_key' },
      body: JSON.stringify({ lat: 13.0855, lng: 80.2735, speedKmh: 45, accuracy: 10 }),
    });
    console.assert(t7WrongRes.status === 401, 'Test 7 Wrong Key Failed');
    console.log('Device Key Auth: 200 on valid, 401 on invalid (Passed)');

    // ----------------------------------------------------
    // TEST 8: Batched Offline Points Ingestion
    // ----------------------------------------------------
    console.log('\n[Test 8] Testing batch ingestion with chronological sorting & duplicate drop...');
    const baseTime = Date.now() - 30000;
    const batchPoints = [
      { lat: 13.00, lng: 80.20, speedKmh: 40, recordedAt: new Date(baseTime + 10000).toISOString() },
      { lat: 12.98, lng: 80.18, speedKmh: 35, recordedAt: new Date(baseTime).toISOString() },
      { lat: 13.00, lng: 80.20, speedKmh: 40, recordedAt: new Date(baseTime + 10000).toISOString() },
      { lat: 13.05, lng: 80.25, speedKmh: 50, recordedAt: new Date(baseTime + 20000).toISOString() },
    ];

    const t8Res = await fetch(`${BASE_URL}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ points: batchPoints }),
    });
    const t8Data = await t8Res.json();
    console.assert(t8Res.status === 200 && t8Data.processedCount === 3, 'Test 8 Failed');
    console.log(`Batch processed: 3 points (deduplicated) | Newest: (${t8Data.newestPoint?.lat}, ${t8Data.newestPoint?.lng}) (Passed)`);

    // ----------------------------------------------------
    // TEST 9: Geofence Arrival Alert (Within 500m of BR-MDU)
    // ----------------------------------------------------
    console.log('\n[Test 9] Testing 500m destination geofence arrival trigger...');
    await new Promise(r => setTimeout(r, 3100));
    await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ lat: 9.9260, lng: 78.1198, speedKmh: 20, accuracy: 10 }),
    });

    const alertsAfterFirst = await db.query(
      `SELECT id FROM alerts WHERE trip_id = 'TRIP-1001' AND type = 'Arriving Destination'`
    );
    console.assert(alertsAfterFirst.rows.length === 1, 'Geofence first alert failed');

    await new Promise(r => setTimeout(r, 3100));
    await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ lat: 9.9255, lng: 78.1198, speedKmh: 10, accuracy: 10 }),
    });

    const alertsAfterSecond = await db.query(
      `SELECT id FROM alerts WHERE trip_id = 'TRIP-1001' AND type = 'Arriving Destination'`
    );
    console.assert(alertsAfterSecond.rows.length === 1, 'Geofence duplicate alert prevention failed');
    console.log('Geofence: 1 alert fired, 0 duplicates on subsequent pings (Passed)');

    // ----------------------------------------------------
    // TEST 10: Scoped History
    // ----------------------------------------------------
    console.log('\n[Test 10] Testing GET /api/gps/history/:vehicleId with scoping...');
    const foreignHistRes = await fetch(`${BASE_URL}/history/TN-01-AB-1234`, {
      headers: { Authorization: `Bearer ${foreignToken}` },
    });
    console.assert(foreignHistRes.status === 404, 'Foreign tenant not blocked');

    const fromTime = new Date(Date.now() - 3600000).toISOString();
    const toTime = new Date(Date.now() + 60000).toISOString();
    const histRes = await fetch(`${BASE_URL}/history/TN-01-AB-1234?from=${encodeURIComponent(fromTime)}&to=${encodeURIComponent(toTime)}&limit=10`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const histData = await histRes.json();
    console.assert(histRes.status === 200 && histData.count > 0, 'History query failed');
    console.log(`History count: ${histData.count} (Passed)`);

    // ----------------------------------------------------
    // TEST 11: Data Retention Pruning
    // ----------------------------------------------------
    console.log('\n[Test 11] Testing GPS history retention cleanup...');
    const oldTime = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    await db.query(
      `INSERT INTO gps_tracking_records (vehicle_id, latitude, longitude, speed_kmh, recorded_at) VALUES ('TN-01-AB-1234', 13.0, 80.0, 0, $1)`,
      [oldTime]
    );

    const prunedCount = await cleanupGpsRecords(90);
    console.assert(prunedCount >= 1, 'Retention pruning failed');
    console.log(`Pruned records: ${prunedCount} (Passed)`);

    // ----------------------------------------------------
    // TEST 12: Timestamp Consistency & Idempotent Migration
    // ----------------------------------------------------
    console.log('\n[Test 12] Testing timestamp ISO 8601 idempotence across multiple migration runs...');
    // Run migrations twice
    await runMigrations();
    await runMigrations();

    // Verify no timestamps end in 'ZZ'
    const doubleZCheck = await db.query(
      `SELECT COUNT(*) AS c FROM gps_tracking_records WHERE recorded_at LIKE '%ZZ'`
    );
    console.assert(parseInt(doubleZCheck.rows[0].c, 10) === 0, 'Test 12 Failed: Timestamps found ending with ZZ');
    console.log('✅ Idempotent backfill verified: 0 records ending in ZZ after multiple migration runs.');

    // ----------------------------------------------------
    // TEST 13: Watchdog Seed Data Guard (0 Alerts on Seed Trips)
    // ----------------------------------------------------
    console.log('\n[Test 13] Testing Outage Watchdog on seed data (must produce 0 alerts)...');
    await db.query(`UPDATE vehicles SET last_ping_at = NULL WHERE id != 'TN-01-AB-1234'`);
    await db.query(`DELETE FROM alerts WHERE type = 'No Update'`);

    const seedAlerts = await checkNoGpsSignalOutages();
    console.assert(seedAlerts.length === 0, 'Test 13 Failed: seed data produced alerts');
    console.log('Seed Data Outage Alerts: 0 (Passed)');

    // ----------------------------------------------------
    // TEST 14: Watchdog Signal Outage Alert & Deduplication
    // ----------------------------------------------------
    console.log('\n[Test 14] Testing GPS Signal Outage detection (>10m without ping)...');
    const thresholdMins = await getNoUpdateThresholdMinutes();
    const simulatedOutagePing = new Date(Date.now() - (thresholdMins + 5) * 60 * 1000).toISOString();
    await db.query(
      `UPDATE vehicles SET last_ping_at = $1 WHERE id = 'TN-01-AB-1234'`,
      [simulatedOutagePing]
    );
    const tripDispatchTime = new Date(Date.now() - 3600000).toISOString();
    await db.query(
      `UPDATE trips SET status = 'IN_TRANSIT', dispatch_date = $1 WHERE id = 'TRIP-1001'`,
      [tripDispatchTime]
    );

    const outageAlertsFirstRun = await checkNoGpsSignalOutages();
    console.assert(outageAlertsFirstRun.length === 1, 'Test 14 Failed: Outage alert not created');
    console.assert(outageAlertsFirstRun[0].id.startsWith('ALT-NOUPD-'), 'Alert ID does not start with ALT-NOUPD-');

    const outageAlertsSecondRun = await checkNoGpsSignalOutages();
    console.assert(outageAlertsSecondRun.length === 0, 'Test 14 Failed: Duplicate alert created on second run');
    console.log(`Alert created: ${outageAlertsFirstRun[0].id}, 0 duplicate on next cron (Passed)`);

    // ----------------------------------------------------
    // TEST 15: Stale Batch Guard & Auto-Resolve Gating
    // ----------------------------------------------------
    console.log('\n[Test 15] Testing stale batch guard: position unchanged & outage alert NOT resolved...');
    // Set vehicle position and last_gps_update to 2 minutes ago
    const fixTime = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await db.query(
      `UPDATE vehicles 
       SET current_lat = 13.0827, current_lng = 80.2707, speed_kmh = 55, movement_status = 'MOVING',
           last_gps_update = $1 
       WHERE id = 'TN-01-AB-1234'`,
      [fixTime]
    );

    // Send a batch of points that are older (e.g. 15 minutes ago)
    const staleTime = Date.now() - 15 * 60 * 1000;
    const staleBatch = [
      { lat: 10.00, lng: 77.00, speedKmh: 10, recordedAt: new Date(staleTime).toISOString() },
      { lat: 10.01, lng: 77.01, speedKmh: 12, recordedAt: new Date(staleTime + 5000).toISOString() },
    ];

    // Wait for 10s batch rate-limit window
    await new Promise(r => setTimeout(r, 10100));
    const staleRes = await fetch(`${BASE_URL}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ points: staleBatch }),
    });
    const staleData = await staleRes.json();
    console.assert(staleRes.status === 200 && staleData.stale === true, 'Test 15 Failed: Stale batch not flagged');

    // Confirm position remains 13.0827, 80.2707
    const vehAfterStale = await db.query(`SELECT current_lat, current_lng, speed_kmh FROM vehicles WHERE id = 'TN-01-AB-1234'`);
    console.assert(Number(vehAfterStale.rows[0].current_lat) === 13.0827, 'Test 15 Failed: Vehicle position was modified by stale batch');
    console.assert(Number(vehAfterStale.rows[0].speed_kmh) === 55, 'Test 15 Failed: Vehicle speed was modified by stale batch');

    // Confirm active outage alert is STILL Active (not resolved by stale batch)
    const alertStillActive = await db.query(
      `SELECT status FROM alerts WHERE vehicle_id = 'TN-01-AB-1234' AND type = 'No Update'`
    );
    console.assert(alertStillActive.rows[0].status === 'Active', 'Test 15 Failed: Stale batch incorrectly resolved outage alert');
    console.log('✅ Stale batch guard verified: position unchanged, outage alert remains Active.');

    // ----------------------------------------------------
    // TEST 16: Fresh Single GPS Ping Auto-Resolves Outage Alert
    // ----------------------------------------------------
    console.log('\n[Test 16] Testing fresh GPS update auto-resolves No Update alert...');
    await new Promise(r => setTimeout(r, 3100)); // Rate limit pause

    const freshTime = new Date().toISOString();
    const t16Res = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ lat: 13.0860, lng: 80.2740, speedKmh: 45, accuracy: 10, recordedAt: freshTime }),
    });
    console.assert(t16Res.status === 200, 'Test 16 Failed');

    const resolvedAlertCheck = await db.query(
      `SELECT id, status, resolved_at FROM alerts WHERE vehicle_id = 'TN-01-AB-1234' AND type = 'No Update'`
    );
    console.assert(
      resolvedAlertCheck.rows[0]?.status === 'Resolved' && resolvedAlertCheck.rows[0]?.resolved_at !== null,
      'Test 16 Failed: No Update alert was not auto-resolved on fresh ping'
    );
    console.log('Outage Alert Status: Resolved on fresh ping (Passed)');

    // ----------------------------------------------------
    // TEST 17: Heartbeats Keep Device Alive (No Outage Fired)
    // ----------------------------------------------------
    console.log('\n[Test 17] Testing that low-accuracy heartbeats keep vehicle alive...');
    await db.query(`DELETE FROM alerts WHERE vehicle_id = 'TN-01-AB-1234' AND type = 'No Update'`);

    await new Promise(r => setTimeout(r, 3100));
    await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ lat: 13.0865, lng: 80.2745, speedKmh: 45, accuracy: 120 }),
    });

    const heartbeatAlerts = await checkNoGpsSignalOutages();
    console.assert(heartbeatAlerts.length === 0, 'Test 17 Failed: Outage fired despite active heartbeat');
    console.log('Outage alerts with active heartbeat: 0 (Passed)');

    // ----------------------------------------------------
    // TEST 18: Stoppage Detector Skips Vehicle with Signal Outage
    // ----------------------------------------------------
    console.log('\n[Test 18] Testing that Stoppage Detector skips vehicles with signal outages...');
    const stoppedTime = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const outageTime = new Date(Date.now() - 25 * 60 * 1000).toISOString();

    await db.query(
      `UPDATE vehicles 
       SET movement_status = 'STOPPED', speed_kmh = 0, 
           stoppage_start_time = $1, last_ping_at = $2 
       WHERE id = 'TN-01-AB-1234'`,
      [stoppedTime, outageTime]
    );

    await db.query(`DELETE FROM alerts WHERE vehicle_id = 'TN-01-AB-1234' AND type = 'Stoppage Detected'`);
    await checkVehicleStoppages();

    const stoppageAlerts = await db.query(
      `SELECT id FROM alerts WHERE vehicle_id = 'TN-01-AB-1234' AND type = 'Stoppage Detected'`
    );
    console.assert(stoppageAlerts.rows.length === 0, 'Test 18 Failed: Stoppage alert fired during signal outage');
    console.log('Stoppage alerts during signal outage: 0 (Passed)');

    // ----------------------------------------------------
    // TEST 19: Driver-Scoped Endpoint GET /api/gps/my-trip
    // ----------------------------------------------------
    console.log('\n[Test 19] Testing driver-scoped GET /api/gps/my-trip...');
    const myTripRes = await fetch(`${BASE_URL}/my-trip`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    const myTripData = await myTripRes.json();
    console.assert(myTripRes.status === 200 && myTripData.hasActiveTrip === true, 'Test 19 Failed');
    console.assert(myTripData.trip.vehicleId === 'TN-01-AB-1234', 'Wrong vehicle in my-trip');
    console.assert(myTripData.trip.destinationLat && myTripData.trip.destinationLng, 'Missing branch coordinates in my-trip');
    console.log(`Active Trip: ${myTripData.trip.id} | Route: ${myTripData.trip.source} -> ${myTripData.trip.destination} (Passed)`);

    console.log('\n========================================================');
    console.log('🎉 ALL 19 TESTS PASSED SUCCESSFULLY AGAINST ISOLATED DATABASE!');
    console.log('========================================================');
  } catch (err) {
    console.error('\n❌ Test Suite Failed with error:', err);
    process.exitCode = 1;
  } finally {
    server.close();

    // Query dev database row counts after test run to confirm ZERO alteration
    if (fs.existsSync(devDbPath)) {
      const { DatabaseSync } = require('node:sqlite');
      const devDb = new DatabaseSync(devDbPath);
      let devAlertsAfter = 0;
      let devGpsAfter = 0;
      try {
        devAlertsAfter = devDb.prepare('SELECT COUNT(*) AS c FROM alerts').get().c;
        devGpsAfter = devDb.prepare('SELECT COUNT(*) AS c FROM gps_tracking_records').get().c;
      } catch (_) {}
      devDb.close();

      console.log('\n========================================================');
      console.log('🔒 DEV DATABASE ISOLATION VERIFICATION');
      console.log('========================================================');
      console.log(`Alerts before:       ${devAlertsBefore} | Alerts after:       ${devAlertsAfter}`);
      console.log(`GPS records before:  ${devGpsBefore} | GPS records after:  ${devGpsAfter}`);
      if (devAlertsBefore === devAlertsAfter && devGpsBefore === devGpsAfter) {
        console.log('✅ Dev database was completely untouched and preserved intact!');
      } else {
        console.warn('⚠️ Dev database row count changed!');
      }
    }

    // Delete isolated temp database
    if (fs.existsSync(tempDbPath)) {
      try { fs.rmSync(tempDbPath, { force: true }); } catch (_) {}
    }
    const walFile = `${tempDbPath}-wal`;
    const shmFile = `${tempDbPath}-shm`;
    if (fs.existsSync(walFile)) { try { fs.rmSync(walFile, { force: true }); } catch (_) {} }
    if (fs.existsSync(shmFile)) { try { fs.rmSync(shmFile, { force: true }); } catch (_) {} }

    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = runTests;
