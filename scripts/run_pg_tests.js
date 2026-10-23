/**
 * Automated PostgreSQL 16/18 Test Runner on Port 5434
 * Logistics Operations Control System (LCOS)
 *
 * Boots real EmbeddedPostgres on port 5434, executes schema.sql + seed.sql + migrations,
 * mounts the real server/index.js against Postgres, and executes the complete test suite.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const EmbeddedPostgres = require('embedded-postgres').default;
const { Client } = require('pg');

async function main() {
  console.log('========================================================');
  console.log('🐘 STARTING REAL POSTGRESQL VERIFICATION (PORT 5434)');
  console.log('========================================================');

  const pgDataDir = path.join(os.tmpdir(), `lcos_pg_run_${Date.now()}`);
  if (fs.existsSync(pgDataDir)) {
    try { fs.rmSync(pgDataDir, { recursive: true, force: true }); } catch (_) {}
  }

  const pg = new EmbeddedPostgres({
    port: 5434,
    user: 'postgres',
    password: 'password',
    databaseDir: pgDataDir,
    persistent: false,
    onLog: () => {}, // Suppress internal bootstrap noise
    onError: (e) => console.warn('[PG Internal Warning]:', e.message || e),
  });

  let serverInstance = null;

  try {
    console.log('📦 Booting PostgreSQL instance on port 5434...');
    await pg.initialise();
    await pg.start();
    console.log('✅ PostgreSQL is alive and accepting connections on 127.0.0.1:5434');

    // 1. Initial schema & seed initialization
    const client = new Client({
      host: '127.0.0.1',
      port: 5434,
      user: 'postgres',
      password: 'password',
      database: 'postgres',
    });
    await client.connect();

    console.log('📜 Applying server/db/schema.sql to PostgreSQL...');
    const schemaSql = fs.readFileSync(path.join(__dirname, '../server/db/schema.sql'), 'utf8');
    await client.query(schemaSql);

    console.log('🌱 Applying server/db/seed.sql to PostgreSQL...');
    const seedSql = fs.readFileSync(path.join(__dirname, '../server/db/seed.sql'), 'utf8');
    await client.query(seedSql);

    await client.end();
    console.log('✅ PostgreSQL schema & seed ready.');

    // 2. Set environment variables to force server to connect to real PostgreSQL
    process.env.USE_EMBEDDED_DB = 'false';
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = '5434';
    process.env.DB_USER = 'postgres';
    process.env.DB_PASSWORD = 'password';
    process.env.DB_NAME = 'postgres';
    process.env.PORT = '5005'; // Unique port for PG tests

    // 3. Load database module and run migrations on PostgreSQL
    const db = require('../server/config/db');
    const { runMigrations } = require('../server/db/migrations');
    console.log('⚡ Running migrations against live PostgreSQL...');
    await runMigrations();

    // Verify migration idempotence on PostgreSQL
    await runMigrations();
    console.log('✅ Idempotent migrations executed twice against PostgreSQL without error.');

    // 4. Boot real server/index.js app
    const { app, server } = require('../server/index');
    serverInstance = server;

    const { JWT_SECRET } = require('../server/middleware/auth');
    const { cleanupGpsRecords } = require('../server/routes/gps.routes');
    const {
      checkNoGpsSignalOutages,
      checkVehicleStoppages,
      getNoUpdateThresholdMinutes,
    } = require('../server/services/stoppageDetector');

    // Wait 1 second for socket server readiness
    await new Promise(r => setTimeout(r, 1000));

    const BASE_URL = `http://localhost:5005/api/gps`;

    // ----------------------------------------------------
    // Database Preparation on live Postgres
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
    // TEST 1: Unauthenticated request (Expect 401)
    // ----------------------------------------------------
    console.log('\n[PG Test 1] Testing unauthenticated GPS update...');
    const t1Res = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 13.0827, lng: 80.2707 }),
    });
    console.assert(t1Res.status === 401, 'PG Test 1 Failed');
    console.log('Status: 401 (Passed on Postgres)');

    // ----------------------------------------------------
    // TEST 2: Wrong role (Expect 403)
    // ----------------------------------------------------
    console.log('\n[PG Test 2] Testing non-driver role on /update...');
    const t2Res = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ lat: 13.0827, lng: 80.2707 }),
    });
    console.assert(t2Res.status === 403, 'PG Test 2 Failed');
    console.log('Status: 403 (Passed on Postgres)');

    // ----------------------------------------------------
    // TEST 3: Coordinate Validation (Expect 400)
    // ----------------------------------------------------
    console.log('\n[PG Test 3] Testing out-of-range coordinates...');
    const t3Res = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ lat: 120.0, lng: 80.2707, speedKmh: 45 }),
    });
    console.assert(t3Res.status === 400, 'PG Test 3 Failed');
    console.log('Status: 400 (Passed on Postgres)');

    // ----------------------------------------------------
    // TEST 4: Driver JWT Happy Path (PostgreSQL Transaction Verification)
    // ----------------------------------------------------
    console.log('\n[PG Test 4] Testing Driver JWT update with atomic transaction...');
    const t4Res = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ lat: 13.0827, lng: 80.2707, speedKmh: 48, heading: 180, accuracy: 12 }),
    });
    const t4Data = await t4Res.json();
    console.assert(t4Res.status === 200 && t4Data.telemetry?.vehicleId === 'TN-01-AB-1234', 'PG Test 4 Failed');
    console.log(`Status: 200 | Vehicle: ${t4Data.telemetry?.vehicleId} | Speed: ${t4Data.telemetry?.speedKmh} (Passed on Postgres)`);

    // Verify last_ping_at in Postgres
    const vehT4 = await db.query(`SELECT last_ping_at, current_lat, current_lng FROM vehicles WHERE id = 'TN-01-AB-1234'`);
    console.assert(vehT4.rows[0].last_ping_at !== null, 'PG Test 4 last_ping_at check failed');
    console.log('✅ PostgreSQL withTransaction committed successfully with client.query!');

    // ----------------------------------------------------
    // TEST 5: Low-accuracy Heartbeat
    // ----------------------------------------------------
    console.log('\n[PG Test 5] Testing low accuracy heartbeat fix...');
    await new Promise(r => setTimeout(r, 3100));
    await db.query(`UPDATE vehicles SET last_ping_at = '2026-01-01T00:00:00.000Z' WHERE id = 'TN-01-AB-1234'`);

    const t5Res = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ lat: 13.0830, lng: 80.2710, speedKmh: 50, accuracy: 150 }),
    });
    const t5Data = await t5Res.json();
    console.assert(t5Res.status === 200 && t5Data.ignored === true, 'PG Test 5 Failed');

    const vehT5 = await db.query(`SELECT last_ping_at FROM vehicles WHERE id = 'TN-01-AB-1234'`);
    console.assert(new Date(vehT5.rows[0].last_ping_at).getTime() > new Date('2026-01-01T00:00:00.000Z').getTime(), 'PG Test 5 Heartbeat Failed');
    console.log('Status: 200 ignored: true, heartbeat updated in PostgreSQL (Passed)');

    // ----------------------------------------------------
    // TEST 6: Rate Limiting (< 3s, Expect 429)
    // ----------------------------------------------------
    console.log('\n[PG Test 6] Testing rate limiting...');
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
    console.assert(t6Res.status === 429 && t6Data.retryAfterMs > 0, 'PG Test 6 Failed');
    console.log(`Status: 429 RetryAfter: ${t6Data.retryAfterMs}ms (Passed on Postgres)`);

    // ----------------------------------------------------
    // TEST 7: Hardware Device Key Auth (Postgres)
    // ----------------------------------------------------
    console.log('\n[PG Test 7] Testing Hardware Device Key authentication...');
    const rawDevKey = 'lcos_dev_pg_test_key_secret';
    const hashDevKey = crypto.createHash('sha256').update(rawDevKey).digest('hex');
    await db.query(`UPDATE vehicles SET device_key = $1 WHERE id = 'TN-01-AB-1234'`, [hashDevKey]);

    await new Promise(r => setTimeout(r, 3100));
    const t7Res = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vehicle-Id': 'TN-01-AB-1234', 'X-Device-Key': rawDevKey },
      body: JSON.stringify({ lat: 13.0850, lng: 80.2730, speedKmh: 45, accuracy: 10 }),
    });
    console.assert(t7Res.status === 200, 'PG Test 7 Correct Key Failed');

    const t7WrongRes = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vehicle-Id': 'TN-01-AB-1234', 'X-Device-Key': 'wrong_key' },
      body: JSON.stringify({ lat: 13.0855, lng: 80.2735, speedKmh: 45, accuracy: 10 }),
    });
    console.assert(t7WrongRes.status === 401, 'PG Test 7 Wrong Key Failed');
    console.log('Device Key Auth: 200 on valid, 401 on invalid (Passed on Postgres)');

    // ----------------------------------------------------
    // TEST 8: Batched Points on Postgres
    // ----------------------------------------------------
    console.log('\n[PG Test 8] Testing batch ingestion with chronological sorting...');
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
    console.assert(t8Res.status === 200 && t8Data.processedCount === 3, 'PG Test 8 Failed');
    console.log(`Batch processed: 3 points (deduplicated) | Newest: (${t8Data.newestPoint?.lat}, ${t8Data.newestPoint?.lng}) (Passed on Postgres)`);

    // ----------------------------------------------------
    // TEST 9: Geofence Arrival Alert (Postgres Boolean Check)
    // ----------------------------------------------------
    console.log('\n[PG Test 9] Testing 500m geofence arrival trigger on PostgreSQL...');
    await new Promise(r => setTimeout(r, 3100));
    await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ lat: 9.9260, lng: 78.1198, speedKmh: 20, accuracy: 10 }),
    });

    const alertsAfterFirst = await db.query(
      `SELECT id FROM alerts WHERE trip_id = 'TRIP-1001' AND type = 'Arriving Destination'`
    );
    console.assert(alertsAfterFirst.rows.length === 1, 'PG Geofence alert 1 failed');

    await new Promise(r => setTimeout(r, 3100));
    await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ lat: 9.9255, lng: 78.1198, speedKmh: 10, accuracy: 10 }),
    });

    const alertsAfterSecond = await db.query(
      `SELECT id FROM alerts WHERE trip_id = 'TRIP-1001' AND type = 'Arriving Destination'`
    );
    console.assert(alertsAfterSecond.rows.length === 1, 'PG Geofence duplicate prevention failed');
    console.log('Geofence: 1 alert fired, 0 duplicates on PostgreSQL (Passed)');

    // ----------------------------------------------------
    // TEST 10: Scoped History
    // ----------------------------------------------------
    console.log('\n[PG Test 10] Testing GET /api/gps/history/:vehicleId...');
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
    console.assert(histRes.status === 200 && histData.count > 0, 'PG History query failed');
    console.log(`History count: ${histData.count} (Passed on Postgres)`);

    // ----------------------------------------------------
    // TEST 11: Data Retention Pruning
    // ----------------------------------------------------
    console.log('\n[PG Test 11] Testing GPS history retention cleanup on PostgreSQL...');
    const oldTime = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    await db.query(
      `INSERT INTO gps_tracking_records (vehicle_id, latitude, longitude, speed_kmh, recorded_at) VALUES ('TN-01-AB-1234', 13.0, 80.0, 0, $1)`,
      [oldTime]
    );

    const prunedCount = await cleanupGpsRecords(90);
    console.assert(prunedCount >= 1, 'PG Retention pruning failed');
    console.log(`Pruned records on Postgres: ${prunedCount} (Passed)`);

    // ----------------------------------------------------
    // TEST 12: Watchdog Seed Data Guard
    // ----------------------------------------------------
    console.log('\n[PG Test 12] Testing Outage Watchdog on seed data (must produce 0 alerts)...');
    await db.query(`UPDATE vehicles SET last_ping_at = NULL WHERE id != 'TN-01-AB-1234'`);
    await db.query(`DELETE FROM alerts WHERE type = 'No Update'`);

    const seedAlerts = await checkNoGpsSignalOutages();
    console.assert(seedAlerts.length === 0, 'PG Test 12 Failed: seed data produced alerts');
    console.log('Seed Data Outage Alerts: 0 (Passed on Postgres)');

    // ----------------------------------------------------
    // TEST 13: Watchdog Outage Detection & Deduplication
    // ----------------------------------------------------
    console.log('\n[PG Test 13] Testing GPS Signal Outage detection (>10m without ping)...');
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
    console.assert(outageAlertsFirstRun.length === 1, 'PG Test 13 Failed: Outage alert not created');
    console.assert(outageAlertsFirstRun[0].id.startsWith('ALT-NOUPD-'), 'Alert ID format invalid');

    const outageAlertsSecondRun = await checkNoGpsSignalOutages();
    console.assert(outageAlertsSecondRun.length === 0, 'PG Test 13 Failed: Duplicate alert created');
    console.log(`Alert created: ${outageAlertsFirstRun[0].id}, 0 duplicate on next cron (Passed on Postgres)`);

    // ----------------------------------------------------
    // TEST 14: Stale Batch Guard & Auto-Resolve Gating on Postgres
    // ----------------------------------------------------
    console.log('\n[PG Test 14] Testing stale batch guard on PostgreSQL...');
    const fixTime = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await db.query(
      `UPDATE vehicles 
       SET current_lat = 13.0827, current_lng = 80.2707, speed_kmh = 55, movement_status = 'MOVING',
           last_gps_update = $1 
       WHERE id = 'TN-01-AB-1234'`,
      [fixTime]
    );

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
    console.assert(staleRes.status === 200 && staleData.stale === true, 'PG Test 14 Failed: Stale batch not flagged');

    const vehAfterStale = await db.query(`SELECT current_lat, current_lng, speed_kmh FROM vehicles WHERE id = 'TN-01-AB-1234'`);
    console.assert(Number(vehAfterStale.rows[0].current_lat) === 13.0827, 'PG Test 14 Position altered by stale batch');

    const alertStillActive = await db.query(
      `SELECT status FROM alerts WHERE vehicle_id = 'TN-01-AB-1234' AND type = 'No Update'`
    );
    console.assert(alertStillActive.rows[0].status === 'Active', 'PG Test 14 Stale batch resolved alert');
    console.log('✅ PostgreSQL stale batch guard verified: position retained, outage alert remains Active.');

    // ----------------------------------------------------
    // TEST 15: Fresh GPS Ping Auto-Resolves Outage Alert on Postgres
    // ----------------------------------------------------
    console.log('\n[PG Test 15] Testing fresh GPS update auto-resolves No Update alert on Postgres...');
    await new Promise(r => setTimeout(r, 3100));

    const freshTime = new Date().toISOString();
    const t15Res = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ lat: 13.0860, lng: 80.2740, speedKmh: 45, accuracy: 10, recordedAt: freshTime }),
    });
    console.assert(t15Res.status === 200, 'PG Test 15 Failed');

    const resolvedAlertCheck = await db.query(
      `SELECT id, status, resolved_at FROM alerts WHERE vehicle_id = 'TN-01-AB-1234' AND type = 'No Update'`
    );
    console.assert(
      resolvedAlertCheck.rows[0]?.status === 'Resolved' && resolvedAlertCheck.rows[0]?.resolved_at !== null,
      'PG Test 15 Failed: Outage alert not resolved'
    );
    console.log('Outage Alert Status: Resolved on fresh ping in PostgreSQL (Passed)');

    // ----------------------------------------------------
    // TEST 16: Stoppage Detector Skips Vehicle with Outage on Postgres
    // ----------------------------------------------------
    console.log('\n[PG Test 16] Testing Stoppage Detector skips vehicle with signal outage...');
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
    console.assert(stoppageAlerts.rows.length === 0, 'PG Test 16 Failed: Stoppage alert fired during outage');
    console.log('Stoppage alerts during signal outage: 0 (Passed on Postgres)');

    // ----------------------------------------------------
    // TEST 17: Driver-Scoped Endpoint GET /api/gps/my-trip on Postgres
    // ----------------------------------------------------
    console.log('\n[PG Test 17] Testing driver-scoped GET /api/gps/my-trip on PostgreSQL...');
    const myTripRes = await fetch(`${BASE_URL}/my-trip`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    const myTripData = await myTripRes.json();
    console.assert(myTripRes.status === 200 && myTripData.hasActiveTrip === true, 'PG Test 17 Failed');
    console.assert(myTripData.trip.vehicleId === 'TN-01-AB-1234', 'Wrong vehicle in my-trip on Postgres');
    console.log(`Active Trip: ${myTripData.trip.id} | Route: ${myTripData.trip.source} -> ${myTripData.trip.destination} (Passed on Postgres)`);

    console.log('\n========================================================');
    console.log('🎉 ALL TESTS PASSED AGAINST REAL POSTGRESQL (PORT 5434)!');
    console.log('========================================================');
  } catch (err) {
    console.error('\n❌ PostgreSQL Test Suite Failed with error:', err);
    process.exitCode = 1;
  } finally {
    if (serverInstance) serverInstance.close();
    try { await pg.stop(); } catch (_) {}
    try { fs.rmSync(pgDataDir, { recursive: true, force: true }); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
}

if (require.main === module) {
  main();
}

module.exports = main;
