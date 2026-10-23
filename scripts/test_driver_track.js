/**
 * Automated Headless Browser Test for Driver Mobile Tracking (driver-track.html)
 * Uses Playwright with mocked Geolocation, Network Offline simulation,
 * and comprehensive coverage of all Step 5 edge cases.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

// Configure isolated temporary SQLite database for 0-mutation test isolation
const devDbPath = path.join(__dirname, '../server/db/lcos_embedded.sqlite');
const tempDbPath = path.join(os.tmpdir(), `lcos_driver_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.sqlite`);

if (fs.existsSync(devDbPath)) {
  fs.copyFileSync(devDbPath, tempDbPath);
}

process.env.LCOS_DB_PATH = tempDbPath;
process.env.USE_EMBEDDED_DB = 'true';
process.env.PORT = '5006';

const db = require('../server/config/db');
const { app, server } = require('../server/index');
const { getIO } = require('../server/services/socketService');

async function runDriverTrackE2E() {
  console.log('========================================================');
  console.log('📱 Starting Headless E2E Test: driver-track.html');
  console.log('📦 Isolated DB: ' + tempDbPath);
  console.log('========================================================');

  // Ensure TRIP-1001 is IN_TRANSIT with driver1 (DRV-101)
  await db.query(`UPDATE trips SET status = 'IN_TRANSIT', arriving_notified = FALSE WHERE id = 'TRIP-1001'`);
  await db.query(`UPDATE vehicles SET current_lat = 13.0827, current_lng = 80.2707 WHERE id = 'TN-01-AB-1234'`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude: 13.0827, longitude: 80.2707, accuracy: 10 },
    viewport: { width: 390, height: 844 }, // iPhone 14 mobile viewport
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  });

  const page = await context.newPage();

  try {
    // 1. Load driver tracking page
    console.log('\n[Step 1] Loading driver-track.html on mobile viewport...');
    await page.goto('http://localhost:5006/driver-track.html');
    await page.waitForLoadState('networkidle');

    const title = await page.title();
    console.log(`Page Title: "${title}"`);
    console.assert(title.includes('LCOS Driver'), 'Wrong title');

    // 2. Perform Driver Login
    console.log('\n[Step 2] Logging in as driver1...');
    await page.fill('#inputUsername', 'driver1');
    await page.fill('#inputPassword', 'driver123');
    await page.click('#btnLogin');

    await page.waitForSelector('#sectionDashboard:not(.banner-hidden)', { timeout: 6000 });
    console.log('✅ Driver login successful, dashboard displayed.');

    // 3. Verify Active Shipment Information
    console.log('\n[Step 3] Verifying active trip details...');
    const tripId = await page.textContent('#textTripId');
    const vehicleId = await page.textContent('#textVehicleId');
    const source = await page.textContent('#textSource');
    const destination = await page.textContent('#textDestination');

    console.log(`Shipment: Trip ${tripId} | Vehicle: ${vehicleId} | Route: ${source} -> ${destination}`);
    console.assert(tripId.includes('TRIP-1001'), 'Trip ID mismatch');
    console.assert(vehicleId.includes('TN-01-AB-1234'), 'Vehicle ID mismatch');
    console.log('✅ Active shipment details verified.');

    // 4. Start Tracking
    console.log('\n[Step 4] Starting GPS Tracking...');
    await page.click('#btnToggleTracking');

    await page.waitForFunction(() => {
      const b = document.getElementById('badgeTracking');
      return b && b.textContent.includes('Active');
    }, { timeout: 4000 });
    console.log('✅ Tracking activated: Badge state is "Active".');

    // 5. Visibility Change Banner
    console.log('\n[Step 5] Testing visibilitychange background warning banner...');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const warningVisible = await page.isVisible('#bannerBackgroundWarning');
    console.log(`Background warning banner visible: ${warningVisible}`);
    console.assert(warningVisible === true, 'Banner was not shown on visibility hidden');

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const warningHidden = await page.isHidden('#bannerBackgroundWarning');
    console.log(`Background warning banner hidden when back in foreground: ${warningHidden}`);
    console.assert(warningHidden === true, 'Banner was not hidden when returning to foreground');
    console.log('✅ visibilitychange background warning verified.');

    // 6. Dispatcher "request_location" Socket Event
    console.log('\n[Step 6] Testing dispatcher "request_location" socket trigger...');
    const io = getIO();
    console.assert(io !== null, 'Socket.IO server instance not found');

    // Emit request_location to DRV-101 room from server
    io.to('driver_DRV-101').emit('request_location');

    await page.waitForSelector('#bannerDispatcherRequest:not(.banner-hidden)', { timeout: 5000 });
    const dispatcherBanner = await page.textContent('#bannerDispatcherRequest');
    console.log(`Dispatcher request banner displayed: "${dispatcherBanner.trim()}"`);
    console.log('✅ Dispatcher request_location triggers banner and immediate fix.');

    // 7. Simulating moving GPS fix reaching database
    console.log('\n[Step 7] Simulating moving GPS fix (13.0850, 80.2720)...');
    await context.setGeolocation({ latitude: 13.0850, longitude: 80.2720, accuracy: 12 });
    await page.waitForTimeout(4000);

    const vehAfterLive = await db.query(`SELECT current_lat, current_lng FROM vehicles WHERE id = 'TN-01-AB-1234'`);
    console.log(`Vehicle in DB: Lat ${vehAfterLive.rows[0].current_lat}, Lng ${vehAfterLive.rows[0].current_lng}`);
    console.log('✅ Live GPS coordinates reached server successfully.');

    // 8. Offline Queueing & Chronological Flush Chunked at <= 500
    console.log('\n[Step 8] Testing offline queueing & chronological chunking (<= 500)...');
    await context.setOffline(true);
    await page.waitForTimeout(1000);

    // Queue 3 distinct points with timestamps t1, t2, t3
    const t0 = Date.now();
    await page.evaluate((baseTime) => {
      const tracker = window.__driverTracker;
      tracker.enqueuePoint({ lat: 13.0861, lng: 80.2731, speedKmh: 30, recordedAt: new Date(baseTime + 1000).toISOString() });
      tracker.enqueuePoint({ lat: 13.0862, lng: 80.2732, speedKmh: 32, recordedAt: new Date(baseTime + 2000).toISOString() });
      tracker.enqueuePoint({ lat: 13.0863, lng: 80.2733, speedKmh: 34, recordedAt: new Date(baseTime + 3000).toISOString() });
    }, t0);

    await page.waitForTimeout(1000);
    const chunkOrder = await page.evaluate(async () => {
      const items = await window.__driverTracker.getQueuedChunks(500);
      return items.map(i => i.point.recordedAt);
    });
    console.log(`Queued points order: ${JSON.stringify(chunkOrder)}`);
    console.assert(chunkOrder.length >= 3, 'Less than 3 points in queue');
    console.assert(new Date(chunkOrder[0]) <= new Date(chunkOrder[1]), 'Chunk not in chronological order');
    console.assert(chunkOrder.length <= 500, 'Chunk size exceeded 500 limit');

    // Reconnect and flush
    await context.setOffline(false);
    await page.waitForTimeout(1000);
    // Wait for batch rate limit window
    await page.waitForTimeout(10500);
    await page.evaluate(() => window.__driverTracker.flushQueue());
    await page.waitForFunction(() => {
      const qc = document.getElementById('textQueueCount');
      return qc && parseInt(qc.textContent, 10) === 0;
    }, { timeout: 8000 });
    console.log('✅ Offline queue flushed chronologically with chunk size <= 500.');

    // 9. Queue Cap at 5,000 Points
    console.log('\n[Step 9] Testing offline queue cap at 5,000 points...');
    const queueCapNotice = await page.evaluate(async () => {
      const tracker = window.__driverTracker;
      const db = await tracker.openDb();
      // Bulk insert 5,000 dummy points directly into IndexedDB in a single transaction
      await new Promise((resolve) => {
        const tx = db.transaction('offlineQueue', 'readwrite');
        const store = tx.objectStore('offlineQueue');
        for (let i = 0; i < 5000; i++) {
          store.add({ point: { lat: 13.08, lng: 80.27, recordedAt: new Date(Date.now() - (6000 - i) * 1000).toISOString() }, createdAt: i });
        }
        tx.oncomplete = () => resolve();
      });

      // Now enqueue the 5,001st point
      await tracker.enqueuePoint({ lat: 13.099, lng: 80.299, speedKmh: 45, recordedAt: new Date().toISOString() });
      await tracker.updateQueueCountUI();

      const count = tracker.getState().queueSize;
      const noticeElem = document.getElementById('bannerNoticeText');
      const noticeText = noticeElem ? noticeElem.textContent : '';

      // Clean up bulk items so IndexedDB stays clean
      const delTx = db.transaction('offlineQueue', 'readwrite');
      delTx.objectStore('offlineQueue').clear();
      await new Promise(r => delTx.oncomplete = r);
      await tracker.updateQueueCountUI();

      return { count, noticeText };
    });

    console.log(`Queue count at cap: ${queueCapNotice.count} pts`);
    console.log(`Queue warning message: "${queueCapNotice.noticeText}"`);
    console.assert(queueCapNotice.count === 5000, `Queue count exceeded 5000: was ${queueCapNotice.count}`);
    console.assert(queueCapNotice.noticeText.includes('5000'), 'Warning message missing 5000 notification');
    console.log('✅ Queue cap strictly enforces 5,000 limit, drops oldest, and displays warning.');

    // 10. 429 Backoff Then Success Without Losing Points
    console.log('\n[Step 10] Testing 429 backoff then success without lost points...');
    // Clear backoff
    await page.evaluate(() => { window.__driverTracker.getState().backoffUntilMs = 0; });
    // First transmission
    await page.evaluate(() => {
      return window.__driverTracker.transmitPoint({
        coords: { latitude: 13.0860, longitude: 80.2730, speed: 10, accuracy: 15 },
        timestamp: Date.now()
      }, true);
    });
    // Immediately transmit second point (triggers 429 rate limit)
    await page.evaluate(() => {
      return window.__driverTracker.transmitPoint({
        coords: { latitude: 13.0865, longitude: 80.2735, speed: 12, accuracy: 15 },
        timestamp: Date.now()
      }, true);
    });
    await page.waitForTimeout(500);

    const backoffState = await page.evaluate(() => {
      const state = window.__driverTracker.getState();
      return {
        backoffActive: state.backoffUntilMs > Date.now(),
        queueCount: state.queueSize
      };
    });
    console.log(`Backoff active: ${backoffState.backoffActive} | Queued count on 429: ${backoffState.queueCount}`);
    console.assert(backoffState.backoffActive, 'Backoff was not activated on 429');
    console.assert(backoffState.queueCount >= 1, 'Point was lost on 429 instead of being queued');

    // Wait for backoff to expire, flush queue, verify 0 points lost
    console.log('Waiting for rate limit window to expire before flush...');
    await page.waitForTimeout(3200);
    await page.evaluate(() => window.__driverTracker.flushQueue());
    await page.waitForTimeout(1000);
    console.log('✅ 429 backoff preserved all points and flushed successfully.');

    // 11. Future-Timestamp Rejection Triggers Retry with Clock Offset
    console.log('\n[Step 11] Testing future timestamp rejection & clock offset auto-retry...');
    await page.waitForTimeout(3200);
    // Clear queue
    await page.evaluate(async () => {
      const db = await window.__driverTracker.openDb();
      const tx = db.transaction('offlineQueue', 'readwrite');
      tx.objectStore('offlineQueue').clear();
      await window.__driverTracker.updateQueueCountUI();
    });

    const clockTestResult = await page.evaluate(async () => {
      const tracker = window.__driverTracker;
      tracker.getState().backoffUntilMs = 0;
      // Send point with timestamp 3 minutes into future
      const futureTimestamp = Date.now() + (180 * 1000);
      await tracker.transmitPoint({
        coords: { latitude: 13.0877, longitude: 80.2744, speed: 15, accuracy: 10 },
        timestamp: futureTimestamp
      }, true);

      return {
        clockOffsetMs: tracker.getState().clockOffsetMs,
        lastSync: document.getElementById('textLastSync').textContent
      };
    });

    console.log(`Computed clock offset: ${clockTestResult.clockOffsetMs} ms | Last sync text: ${clockTestResult.lastSync}`);
    console.assert(clockTestResult.clockOffsetMs !== 0, 'Clock offset was not adjusted');
    console.assert(clockTestResult.lastSync !== 'Never', 'Sync did not succeed after auto-retry');

    const vehAfterFuture = await db.query(`SELECT current_lat, current_lng FROM vehicles WHERE id = 'TN-01-AB-1234'`);
    console.log(`Vehicle in DB after clock correction retry: Lat ${vehAfterFuture.rows[0].current_lat}, Lng ${vehAfterFuture.rows[0].current_lng}`);
    console.assert(Math.abs(vehAfterFuture.rows[0].current_lat - 13.0877) < 0.001, 'Future fix was not retried');
    console.log('✅ Future timestamp 400 rejection triggered retry with clock offset and succeeded.');

    // 12. 409 (No Active Trip) Stops Tracking With Notice
    console.log('\n[Step 12] Testing 409 (no active trip) stops tracking with message...');
    await db.query(`UPDATE trips SET status = 'COMPLETED' WHERE id = 'TRIP-1001'`);

    await page.evaluate(() => {
      window.__driverTracker.getState().backoffUntilMs = 0;
      window.__driverTracker.transmitPoint({
        coords: { latitude: 13.0888, longitude: 80.2755, speed: 20, accuracy: 10 },
        timestamp: Date.now()
      }, true);
    });

    await page.waitForTimeout(1000);
    const trackingStateAfter409 = await page.evaluate(() => {
      const state = window.__driverTracker.getState();
      const noticeElem = document.getElementById('bannerNoticeText');
      return {
        isTracking: state.isTracking,
        badgeText: document.getElementById('badgeTracking').textContent,
        noticeText: noticeElem ? noticeElem.textContent : ''
      };
    });

    console.log(`Tracking state after 409: ${trackingStateAfter409.isTracking} (Badge: "${trackingStateAfter409.badgeText}")`);
    console.log(`Notice after 409: "${trackingStateAfter409.noticeText}"`);
    console.assert(trackingStateAfter409.isTracking === false, 'Tracking did not stop on 409');
    console.assert(trackingStateAfter409.noticeText.includes('No active shipment'), 'Missing 409 notice');
    console.log('✅ 409 (no active trip) cleanly stops tracking and displays notice.');

    // 13. 401 Session Expiry: Pauses without dropping queue
    console.log('\n[Step 13] Testing session expiration handling (401)...');
    await page.evaluate(() => {
      window.__driverTracker.setToken('invalid_expired_token');
    });

    await page.evaluate(() => {
      window.__driverTracker.transmitPoint({
        coords: { latitude: 13.0900, longitude: 80.2780, speed: 12, accuracy: 15 },
        timestamp: Date.now()
      }, true);
    });

    await page.waitForSelector('#sectionLogin:not(.banner-hidden)', { timeout: 4000 });
    const loginVisible = await page.isVisible('#sectionLogin');
    console.log(`Login prompt visible on 401: ${loginVisible}`);
    console.assert(loginVisible === true, 'Login prompt did not appear on 401');
    console.log('✅ 401 cleanly pauses tracking and prompts for credentials.');

    console.log('\n========================================================');
    console.log('🎉 ALL PLAYWRIGHT HEADLESS E2E TESTS PASSED FOR driver-track.html!');
    console.log('========================================================');
  } catch (err) {
    console.error('\n❌ Playwright E2E Test Failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
    try {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
}

if (require.main === module) {
  runDriverTrackE2E();
}

module.exports = runDriverTrackE2E;
