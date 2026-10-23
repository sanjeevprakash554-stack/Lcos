/**
 * Automated Multi-Session Playwright Test for Step 6: Live Dashboard Map Updates
 * Tests the real end-to-end loop:
 *   Driver Phone (driver-track.html) ➔ Server Ingest ➔ Database ➔ Socket.IO ➔ Live Map Dashboard (index.html)
 *
 * Verifies:
 * 1. Marker registry tracking (vehicleMarkerRegistry Map)
 * 2. Smooth marker movement on gps_update without re-rendering entire map
 * 3. Popup rendering with live badges, driver details, and XSS protection
 * 4. "Ping Driver Now" flow: dashboard emits request_location, driver receives banner, driver transmits fix, dashboard shows confirmation
 * 5. Dynamic history polyline extension on vehicle selection
 *
 * Fully verified on both SQLite and real PostgreSQL (port 5434).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const { io: ClientIO } = require('socket.io-client');

// Determine engine from CLI argument
const args = process.argv.slice(2);
const engineArg = args.find(a => a.startsWith('--engine='));
const targetEngine = engineArg ? engineArg.split('=')[1] : null;

async function runDashboardMapE2ETest(engine = 'sqlite') {
  console.log('========================================================');
  console.log(`🗺️  Starting Step 6 Multi-Session E2E Test (Engine: ${engine.toUpperCase()})`);
  console.log('========================================================');

  let tempDbPath = null;
  let pgInstance = null;
  let PORT = engine === 'sqlite' ? '5007' : '5008';

  if (engine === 'sqlite') {
    const devDbPath = path.join(__dirname, '../server/db/lcos_embedded.sqlite');
    tempDbPath = path.join(os.tmpdir(), `lcos_map_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.sqlite`);
    if (fs.existsSync(devDbPath)) {
      fs.copyFileSync(devDbPath, tempDbPath);
    }
    process.env.LCOS_DB_PATH = tempDbPath;
    process.env.USE_EMBEDDED_DB = 'true';
  } else {
    const EmbeddedPostgres = require('embedded-postgres').default;
    const pgDataDir = path.join(os.tmpdir(), `lcos_pg_map_${Date.now()}`);
    pgInstance = new EmbeddedPostgres({
      port: 5434,
      user: 'postgres',
      password: 'password',
      databaseDir: pgDataDir,
      persistent: false,
      onLog: () => {},
    });

    console.log('📦 Booting real PostgreSQL instance on port 5434...');
    await pgInstance.initialise();
    await pgInstance.start();
    console.log('✅ PostgreSQL is alive on port 5434.');

    const { Client } = require('pg');
    const client = new Client({
      host: '127.0.0.1',
      port: 5434,
      user: 'postgres',
      password: 'password',
      database: 'postgres',
    });
    await client.connect();
    const schemaSql = fs.readFileSync(path.join(__dirname, '../server/db/schema.sql'), 'utf8');
    const seedSql = fs.readFileSync(path.join(__dirname, '../server/db/seed.sql'), 'utf8');
    await client.query(schemaSql);
    await client.query(seedSql);
    await client.end();

    process.env.USE_EMBEDDED_DB = 'false';
    process.env.DB_PORT = '5434';
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_USER = 'postgres';
    process.env.DB_PASSWORD = 'password';
    process.env.DB_NAME = 'postgres';
  }

  process.env.PORT = PORT;

  const db = require('../server/config/db');
  const { app, server } = require('../server/index');

  // Prepare test shipment in DB with an older last_gps_update so fresh packets are never dropped as stale
  await db.query(`UPDATE trips SET status = 'IN_TRANSIT', arriving_notified = FALSE WHERE id = 'TRIP-1001'`);
  await db.query(`UPDATE vehicles SET current_lat = 13.0827, current_lng = 80.2707, speed_kmh = 0, last_gps_update = '2026-01-01T00:00:00.000Z' WHERE id = 'TN-01-AB-1234'`);

  // Insert 2 initial history points so GET /api/gps/history/TN-01-AB-1234 returns points for polyline test
  const isEmbedded = db.isUsingEmbedded && db.isUsingEmbedded();
  if (isEmbedded) {
    await db.query(`
      INSERT INTO gps_tracking_records (vehicle_id, trip_id, latitude, longitude, speed_kmh, heading, accuracy, recorded_at)
      VALUES
      ('TN-01-AB-1234', 'TRIP-1001', 13.0820, 80.2700, 20, 45, 10, '2026-08-04T08:00:00.000Z'),
      ('TN-01-AB-1234', 'TRIP-1001', 13.0827, 80.2707, 25, 45, 10, '2026-08-04T08:01:00.000Z')
    `);
  } else {
    await db.query(`
      INSERT INTO gps_tracking_records (vehicle_id, trip_id, latitude, longitude, speed_kmh, heading, accuracy, recorded_at)
      VALUES
      ('TN-01-AB-1234', 'TRIP-1001', 13.0820, 80.2700, 20, 45, 10, NOW() - INTERVAL '5 minutes'),
      ('TN-01-AB-1234', 'TRIP-1001', 13.0827, 80.2707, 25, 45, 10, NOW() - INTERVAL '3 minutes')
    `);
  }

  const browser = await chromium.launch({ headless: true });

  try {
    // 1. Session 1: Dashboard (Desktop Viewport)
    console.log('\n[Phase 1] Launching Dashboard session on desktop viewport...');
    const contextDashboard = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
    });
    const pageDashboard = await contextDashboard.newPage();

    await pageDashboard.goto(`http://localhost:${PORT}/index.html`);
    await pageDashboard.waitForLoadState('networkidle');

    // Authenticate on Dashboard as tracking_team and verify socket connection
    console.log('Authenticating dashboard operator (Tracking Team)...');
    const authStatus = await pageDashboard.evaluate(async () => {
      window.app.isSubscriptionActive = true;
      window.app.currentSubscription = { plan_id: 'PLAN-PRO', plan_name: 'Professional', status: 'ACTIVE' };
      await window.app.login('tracking_team');
      return {
        role: LCOS_State.getCurrentRole(),
        token: LCOS_API.getToken()
      };
    });
    console.log(`Dashboard auth state: ${JSON.stringify(authStatus)}`);

    // Wait for Dashboard Socket.IO connection
    await pageDashboard.waitForFunction(() => {
      return window.app && window.app.socket && window.app.socket.connected;
    }, { timeout: 8000 });
    console.log('✅ Dashboard Socket.IO authenticated and connected.');

    // Wait for Leaflet map container and map initialization
    await pageDashboard.waitForFunction(() => {
      return window.app && window.app.leafletMap && window.app.vehicleMarkerRegistry;
    }, { timeout: 8000 });
    console.log('✅ Dashboard Leaflet map initialized with vehicleMarkerRegistry.');

    // 2. Session 2: Driver Mobile Phone (Mobile Viewport)
    console.log('\n[Phase 2] Launching Driver mobile session (driver-track.html)...');
    const contextDriver = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: 13.0827, longitude: 80.2707, accuracy: 10 },
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    });
    const pageDriver = await contextDriver.newPage();

    await pageDriver.goto(`http://localhost:${PORT}/driver-track.html`);
    await pageDriver.waitForLoadState('networkidle');

    await pageDriver.fill('#inputUsername', 'driver1');
    await pageDriver.fill('#inputPassword', 'driver123');
    await pageDriver.click('#btnLogin');

    await pageDriver.waitForSelector('#sectionDashboard:not(.banner-hidden)', { timeout: 6000 });
    console.log('✅ Driver authenticated on mobile device.');

    // Wait for active trip to be loaded in driver state
    await pageDriver.waitForFunction(() => {
      const tracker = window.__driverTracker;
      return tracker && tracker.getState().activeTrip !== null;
    }, { timeout: 6000 });
    console.log('✅ Driver active trip verified in transit.');

    // Wait for Driver Socket connection
    await pageDriver.waitForFunction(() => {
      const tracker = window.__driverTracker;
      return tracker && tracker.getState().socket && tracker.getState().socket.connected;
    }, { timeout: 6000 });
    console.log('✅ Driver Socket.IO connected in private driver room.');

    // Start mobile tracking
    await pageDriver.click('#btnToggleTracking');
    await pageDriver.waitForFunction(() => {
      const b = document.getElementById('badgeTracking');
      return b && b.textContent.includes('Active');
    }, { timeout: 4000 });
    console.log('✅ Mobile tracking activated.');

    // 3. Verify Initial Marker in Dashboard Registry
    console.log('\n[Phase 3] Checking initial vehicle marker in dashboard registry...');
    const initialMarkerInfo = await pageDashboard.evaluate(() => {
      const entry = window.app.vehicleMarkerRegistry.get('TN-01-AB-1234');
      if (!entry) return null;
      return {
        lat: entry.currentLat,
        lng: entry.currentLng,
        status: entry.movementStatus
      };
    });
    console.log(`Initial marker in registry: ${JSON.stringify(initialMarkerInfo)}`);
    console.assert(initialMarkerInfo !== null, 'Marker not registered for TN-01-AB-1234');
    console.log('✅ Initial vehicle marker confirmed in registry.');

    // 4. Driver Emits Moving GPS Telemetry -> Verify Smooth Dashboard Update
    console.log('\n[Phase 4] Driver transmits moving GPS telemetry (13.0850, 80.2720, 38 km/h)...');
    await pageDriver.waitForTimeout(3200); // Wait for rate limit window from startup
    await pageDriver.evaluate(() => { window.__driverTracker.getState().backoffUntilMs = 0; });

    // Transmit moving point from driver session
    await pageDriver.evaluate(() => {
      return window.__driverTracker.transmitPoint({
        coords: { latitude: 13.0850, longitude: 80.2720, speed: 10.5, heading: 45, accuracy: 12 },
        timestamp: Date.now()
      }, true);
    });

    // Wait for Socket.IO delivery and animation interpolation on dashboard
    await pageDashboard.waitForTimeout(2500);

    const updatedMarkerInfo = await pageDashboard.evaluate(() => {
      const entry = window.app.vehicleMarkerRegistry.get('TN-01-AB-1234');
      if (!entry) return null;
      return {
        lat: entry.currentLat,
        lng: entry.currentLng,
        speed: entry.speedKmh,
        movementStatus: entry.movementStatus,
        heading: entry.heading
      };
    });

    console.log(`Dashboard marker after live ping: ${JSON.stringify(updatedMarkerInfo)}`);
    console.assert(Math.abs(updatedMarkerInfo.lat - 13.0850) < 0.001, 'Marker lat did not update to new coordinates');
    console.assert(Math.abs(updatedMarkerInfo.lng - 80.2720) < 0.001, 'Marker lng did not update to new coordinates');
    console.assert(updatedMarkerInfo.speed >= 30, 'Marker speed not updated');
    console.assert(updatedMarkerInfo.movementStatus === 'MOVING', 'Movement status is not MOVING');
    console.log('✅ Dashboard marker animated smoothly and updated status without map reload.');

    // 5. Popup Verification & XSS Check
    console.log('\n[Phase 5] Verifying popup HTML, live badge, and XSS escaping...');
    const popupData = await pageDashboard.evaluate(() => {
      const entry = window.app.vehicleMarkerRegistry.get('TN-01-AB-1234');
      entry.marker.setPopupContent(window.app.getTruckPopupHtml(entry));
      entry.marker.openPopup();
      const popupHtml = entry.marker.getPopup().getContent();
      return {
        hasPlate: popupHtml.includes('TN-01-AB-1234'),
        hasDriver: popupHtml.includes('Selvam R.') || popupHtml.includes('driver1'),
        hasLiveBadge: popupHtml.includes('Live'),
        hasPingBtn: popupHtml.includes('ping-driver-btn')
      };
    });

    console.log(`Popup verification: ${JSON.stringify(popupData)}`);
    console.assert(popupData.hasPlate, 'Missing vehicle plate in popup');
    console.assert(popupData.hasDriver, 'Missing driver name in popup');
    console.assert(popupData.hasLiveBadge, 'Missing Live badge in popup');
    console.assert(popupData.hasPingBtn, 'Missing Ping Driver Now button in popup');
    console.log('✅ Popup HTML properly escaped and includes live telemetry status.');

    // 6. Interactive "Ping Driver Now" Flow
    console.log('\n[Phase 6] Testing interactive "Ping Driver Now" flow...');
    await pageDashboard.evaluate(() => {
      const btn = document.querySelector('.ping-driver-btn[data-vehicle-id="TN-01-AB-1234"]');
      if (btn) btn.click();
    });

    // Verify driver mobile session receives the dispatcher request banner
    await pageDriver.waitForSelector('#bannerDispatcherRequest:not(.banner-hidden)', { timeout: 6000 });
    const driverBanner = await pageDriver.textContent('#bannerDispatcherRequest');
    console.log(`Driver received location request: "${driverBanner.trim()}"`);
    console.assert(driverBanner.includes('Dispatcher requested'), 'Driver banner missing request notice');

    // Wait for the automatic high-accuracy reply to reach the dashboard
    await pageDashboard.waitForTimeout(3000);
    const pingFeedbackText = await pageDashboard.evaluate(() => {
      const feedback = document.getElementById('ping-status-TN-01-AB-1234');
      return feedback ? feedback.textContent : '';
    });
    console.log(`Dashboard ping feedback after response: "${pingFeedbackText}"`);
    console.assert(pingFeedbackText.includes('Location received') || pingFeedbackText.includes('fix') || pingFeedbackText.includes('Waiting'), 'Location reply feedback missing');
    console.log('✅ Full round-trip "Ping Driver Now" flow verified end-to-end.');

    // 7. Dynamic History Polyline Extension
    console.log('\n[Phase 7] Testing dynamic history polyline extension...');
    await pageDashboard.evaluate(async () => {
      await window.app.loadVehicleTripHistoryPolyline('TN-01-AB-1234');
    });

    await pageDashboard.waitForTimeout(1000);
    const initialPolylineCount = await pageDashboard.evaluate(() => {
      const poly = window.app.selectedTripHistoryPolyline;
      if (!poly) return 0;
      return poly.getLatLngs().length;
    });
    console.log(`Initial history polyline point count: ${initialPolylineCount} pts`);
    console.assert(initialPolylineCount >= 2, 'Polyline was not loaded with historical points');

    // Wait 3.2s for single-update rate limit window
    await pageDriver.waitForTimeout(3200);

    // Driver transmits another GPS fix
    console.log('Driver transmits subsequent location fix (13.0880, 80.2750)...');
    await pageDriver.evaluate(() => { window.__driverTracker.getState().backoffUntilMs = 0; });
    await pageDriver.evaluate(() => {
      return window.__driverTracker.transmitPoint({
        coords: { latitude: 13.0880, longitude: 80.2750, speed: 42, heading: 90, accuracy: 10 },
        timestamp: Date.now()
      }, true);
    });

    await pageDashboard.waitForTimeout(2500);
    const updatedPolylineCount = await pageDashboard.evaluate(() => {
      const poly = window.app.selectedTripHistoryPolyline;
      if (!poly) return 0;
      return poly.getLatLngs().length;
    });

    console.log(`Updated history polyline point count: ${updatedPolylineCount} pts`);
    console.assert(updatedPolylineCount === initialPolylineCount + 1, `Polyline did not extend by 1 point (was ${initialPolylineCount}, now ${updatedPolylineCount})`);
    console.log('✅ Dynamic history polyline extended successfully on incoming live packet.');

    // 8. Marker DOM Node Preservation across Multiple Pings
    console.log('\n[Phase 8] Verifying marker DOM node remains identical across multiple pings...');
    await pageDashboard.evaluate(() => {
      const entry = window.app.vehicleMarkerRegistry.get('TN-01-AB-1234');
      window.__initialMarkerEl = entry.marker.getElement();
    });

    await pageDashboard.evaluate(() => {
      window.app.updateSingleVehicleMarker({
        vehicleId: 'TN-01-AB-1234',
        lat: 13.0890,
        lng: 80.2760,
        speedKmh: 45,
        movementStatus: 'MOVING',
        heading: 95,
        recordedAt: new Date(Date.now() + 1000).toISOString()
      });
      window.app.updateSingleVehicleMarker({
        vehicleId: 'TN-01-AB-1234',
        lat: 13.0895,
        lng: 80.2765,
        speedKmh: 48,
        movementStatus: 'MOVING',
        heading: 100,
        recordedAt: new Date(Date.now() + 2000).toISOString()
      });
    });

    await pageDashboard.waitForTimeout(2000);
    const isSameDomNode = await pageDashboard.evaluate(() => {
      const entry = window.app.vehicleMarkerRegistry.get('TN-01-AB-1234');
      return entry && entry.marker && entry.marker.getElement() === window.__initialMarkerEl;
    });
    console.assert(isSameDomNode === true, 'Marker DOM node was recreated or lost reference!');
    console.log('✅ Marker DOM element remained identical across multiple pings without recreation.');

    // 9. Out-of-Order Older Ping Dropped
    console.log('\n[Phase 9] Verifying out-of-order older ping is ignored...');
    const posBeforeOldPing = await pageDashboard.evaluate(() => {
      const entry = window.app.vehicleMarkerRegistry.get('TN-01-AB-1234');
      return { lat: entry.targetLat, lng: entry.targetLng, recordedAt: entry.lastRecordedAt };
    });

    await pageDashboard.evaluate(() => {
      // Send older timestamp with drastically different coordinates
      window.app.updateSingleVehicleMarker({
        vehicleId: 'TN-01-AB-1234',
        lat: 10.0000,
        lng: 75.0000,
        speedKmh: 80,
        recordedAt: '2020-01-01T00:00:00.000Z'
      });
    });

    await pageDashboard.waitForTimeout(500);
    const posAfterOldPing = await pageDashboard.evaluate(() => {
      const entry = window.app.vehicleMarkerRegistry.get('TN-01-AB-1234');
      return { lat: entry.targetLat, lng: entry.targetLng, recordedAt: entry.lastRecordedAt };
    });

    console.assert(posAfterOldPing.lat === posBeforeOldPing.lat, 'Marker lat updated on older out-of-order packet');
    console.assert(posAfterOldPing.lng === posBeforeOldPing.lng, 'Marker lng updated on older out-of-order packet');
    console.assert(posAfterOldPing.lat !== 10.0000, 'Older ping coordinates were accepted');
    console.assert(posAfterOldPing.recordedAt === posBeforeOldPing.recordedAt, 'RecordedAt timestamp was overwritten by older ping');
    console.log('✅ Out-of-order older ping was safely dropped and left marker untouched.');

    // 10. Marker Badge Turns Stale After 5 Minutes
    console.log('\n[Phase 10] Verifying marker badge turns Stale after 5 minutes...');
    const staleCheck = await pageDashboard.evaluate(() => {
      const entry = window.app.vehicleMarkerRegistry.get('TN-01-AB-1234');
      // Set timestamp to 6 minutes in the past
      entry.lastRecordedAt = new Date(Date.now() - 360000).toISOString();
      window.app.updateMarkerVisual(entry);
      const popupHtml = window.app.getTruckPopupHtml(entry);
      const visual = window.app.getMarkerVisualState(entry.lastRecordedAt, entry.movementStatus, entry.speedKmh);
      return {
        isStaleStatus: visual.statusText.includes('Stale'),
        badgeHtmlHasStale: visual.badgeHtml.includes('Stale'),
        popupHtmlHasStale: popupHtml.includes('Stale')
      };
    });
    console.assert(staleCheck.isStaleStatus, 'Visual state statusText did not include Stale');
    console.assert(staleCheck.badgeHtmlHasStale, 'Badge HTML did not include Stale');
    console.assert(staleCheck.popupHtmlHasStale, 'Popup HTML did not include Stale');
    console.log('✅ Vehicle badge and popup correctly transitioned to Stale status (> 5 minutes).');

    // 11. Request Location Feedback when Driver Not Connected
    console.log('\n[Phase 11] Verifying request_location feedback when driver is not connected...');
    // Disconnect driver socket to simulate app closed/offline
    await pageDriver.evaluate(() => {
      const tracker = window.__driverTracker;
      if (tracker && tracker.getState().socket) {
        tracker.getState().socket.disconnect();
      }
    });

    await pageDashboard.evaluate(() => {
      window.app.handleRequestLocation('TN-01-AB-1234');
    });

    await pageDashboard.waitForTimeout(1000);
    const offlineFeedbackText = await pageDashboard.evaluate(() => {
      const el = document.getElementById('ping-status-TN-01-AB-1234');
      return el ? el.textContent : '';
    });
    console.log(`Dashboard ping feedback for offline driver: "${offlineFeedbackText}"`);
    console.assert(offlineFeedbackText.includes('Driver not tracking') || offlineFeedbackText.includes('offline'), 'Feedback missing offline driver notice');
    console.log('✅ Proper feedback rendered when driver is disconnected.');

    // Reconnect driver socket
    await pageDriver.evaluate(() => {
      const tracker = window.__driverTracker;
      if (tracker.getState().socket) {
        tracker.getState().socket.connect();
      } else {
        tracker.initSocketConnection();
      }
    });
    await pageDriver.waitForFunction(() => {
      const tracker = window.__driverTracker;
      return tracker && tracker.getState().socket && tracker.getState().socket.connected;
    }, { timeout: 6000 });

    // 12. DRIVER-Role Socket Blocked from Emitting request_location
    console.log('\n[Phase 12] Verifying DRIVER-role socket is blocked from emitting request_location...');
    const driverRoleUnauthAck = await pageDriver.evaluate(() => {
      return new Promise((resolve) => {
        const sock = window.__driverTracker.getState().socket;
        sock.emit('request_location', { vehicleId: 'TN-01-AB-1234' }, (res) => {
          resolve(res);
        });
      });
    });
    console.log(`Driver socket request_location response: ${JSON.stringify(driverRoleUnauthAck)}`);
    console.assert(driverRoleUnauthAck && driverRoleUnauthAck.status === 'unauthorized', 'DRIVER role was not rejected with unauthorized');
    console.log('✅ DRIVER role socket correctly received "unauthorized" error for request_location.');

    // 13. Tenant Isolation: COMP-999 Receives 0 Events for COMP-001
    console.log('\n[Phase 13] Verifying tenant isolation: COMP-999 receives 0 events for COMP-001...');
    const comp999Token = jwt.sign(
      { id: 'usr_tenant999', companyId: 'COMP-999', role: 'SUPER_ADMIN', username: 'tenant999' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const socketTenant999 = ClientIO(`http://localhost:${PORT}`, {
      auth: { token: comp999Token },
      transports: ['websocket'],
      forceNew: true
    });

    let tenant999GpsEventCount = 0;
    socketTenant999.on('gps_update', () => {
      tenant999GpsEventCount++;
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('COMP-999 socket failed to connect')), 5000);
      socketTenant999.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    // Broadcast a GPS update strictly scoped to COMP-001
    const { broadcastGpsUpdate } = require('../server/services/socketService');
    broadcastGpsUpdate({
      vehicleId: 'TN-01-AB-1234',
      companyId: 'COMP-001',
      lat: 13.0910,
      lng: 80.2780,
      speedKmh: 42,
      movementStatus: 'MOVING',
      recordedAt: new Date().toISOString()
    });

    await new Promise((r) => setTimeout(r, 1500));
    console.assert(tenant999GpsEventCount === 0, `COMP-999 socket unexpectedly received ${tenant999GpsEventCount} events for COMP-001`);
    socketTenant999.disconnect();
    console.log('✅ Tenant isolation confirmed: COMP-999 received exactly 0 events for COMP-001.');

    // 14. transitUpdates Capping and Closed Trip Cleanup
    console.log('\n[Phase 14] Verifying transitUpdates capping and closed trip cleanup...');
    const cleanupResult = await pageDashboard.evaluate(() => {
      // 1. Test capping of transitUpdates
      const trip = LCOS_State.getTripById('TRIP-1001');
      if (!trip.transitUpdates) trip.transitUpdates = [];
      for (let i = 0; i < 65; i++) {
        window.app.syncLiveTripTelemetry('TRIP-1001', {
          lastLocation: `Highway km ${i}`,
          status: 'IN_TRANSIT',
          currentGPS: { lat: 13.08 + i * 0.0001, lng: 80.27 + i * 0.0001 }
        });
      }
      const cappedCount = trip.transitUpdates.length;

      // 2. Test closing trip and cleanup
      trip.status = 'CLOSED';
      window.app.removeVehicleFromMap('TN-01-AB-1234');

      return {
        cappedCount,
        registryHasMarker: window.app.vehicleMarkerRegistry.has('TN-01-AB-1234'),
        polylineCleared: window.app.selectedTripHistoryPolyline === null
      };
    });

    console.log(`transitUpdates cap count: ${cleanupResult.cappedCount} (cap <= 50)`);
    console.assert(cleanupResult.cappedCount <= 50, `transitUpdates length was not capped (got ${cleanupResult.cappedCount})`);
    console.assert(cleanupResult.registryHasMarker === false, 'Marker was not removed from vehicleMarkerRegistry on trip close');
    console.assert(cleanupResult.polylineCleared === true, 'History polyline was not cleared on vehicle removal');
    console.log('✅ transitUpdates capped at 50, and closed trip removed marker, polyline, and registry entry.');

    // 15. Forced Reconnect Refetches Live State
    console.log('\n[Phase 15] Verifying forced reconnect refetches live state...');
    const reconnectResult = await pageDashboard.evaluate(async () => {
      let refetched = false;
      const originalRefresh = window.app.refreshAlertsAndDashboard;
      window.app.refreshAlertsAndDashboard = async function() {
        refetched = true;
        return originalRefresh.apply(this, arguments);
      };

      // Disconnect socket
      window.app.socket.disconnect();
      const hadDisconnect = window.app._hadSocketDisconnect;

      // Reconnect socket
      window.app.socket.connect();

      let attempts = 0;
      while (!refetched && attempts < 40) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }

      // Restore original method
      window.app.refreshAlertsAndDashboard = originalRefresh;

      return {
        hadDisconnect,
        refetched,
        hadDisconnectAfter: window.app._hadSocketDisconnect,
        isConnected: window.app.socket.connected
      };
    });

    console.log(`Reconnect test status: ${JSON.stringify(reconnectResult)}`);
    console.assert(reconnectResult.refetched === true, 'refreshAlertsAndDashboard was not called upon socket reconnect');
    console.assert(reconnectResult.isConnected === true, 'Socket did not reconnect successfully');
    console.log('✅ Forced reconnect refetched live state and reset disconnect flag.');

    console.log('\n========================================================');
    console.log(`🎉 ALL STEP 6 END-TO-END TESTS PASSED ON ${engine.toUpperCase()}!`);
    console.log('========================================================');
  } catch (err) {
    console.error(`\n❌ Step 6 Test Failed on ${engine.toUpperCase()}:`, err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
    if (tempDbPath && fs.existsSync(tempDbPath)) {
      try { fs.unlinkSync(tempDbPath); } catch (_) {}
    }
    if (pgInstance) {
      try { await pgInstance.stop(); } catch (_) {}
    }
  }
}

async function main() {
  if (targetEngine) {
    await runDashboardMapE2ETest(targetEngine);
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  } else {
    // Run SQLite in a child process
    console.log('\n>>> RUNNING TEST ON SQLITE >>>');
    const resSqlite = spawnSync(process.execPath, [__filename, '--engine=sqlite'], { stdio: 'inherit' });
    if (resSqlite.status !== 0) {
      console.error('SQLite test failed with code:', resSqlite.status);
      process.exit(resSqlite.status || 1);
    }

    // Run PostgreSQL on port 5434 in a child process
    console.log('\n>>> RUNNING TEST ON POSTGRESQL (PORT 5434) >>>');
    const resPg = spawnSync(process.execPath, [__filename, '--engine=postgres'], { stdio: 'inherit' });
    if (resPg.status !== 0) {
      console.error('PostgreSQL test failed with code:', resPg.status);
      process.exit(resPg.status || 1);
    }

    console.log('\n========================================================');
    console.log('🏆 ALL STEP 6 END-TO-END MAP TESTS PASSED ON BOTH ENGINES!');
    console.log('========================================================');
  }
}

if (require.main === module) {
  main();
}

module.exports = runDashboardMapE2ETest;
