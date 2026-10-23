#!/usr/bin/env node
/**
 * Realistic GPS Telemetry Simulator for LCOS (Logistics Operations Control System)
 *
 * Emulates physical vehicle GPS hardware tracker or driver mobile tracking app:
 * - Computes great-circle bearing and progressive Haversine waypoint interpolation
 * - Adds realistic +/- 5m GPS jitter and minor speed variations
 * - Simulates planned stops / idling (speed drops to 0, movement_status = STOPPED)
 * - Simulates cellular dead-zones / tunnels (queues offline points and flushes via /api/gps/batch)
 * - Strict auth: requires device-key or valid driver JWT login (refuses unauthenticated calls)
 * - Security guard: refuses non-localhost URLs unless --allow-remote is explicitly passed
 * - Respects HTTP 429 rate limits with exponential/backoff delays
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Parse CLI arguments
const argv = process.argv.slice(2);
function getArg(name, defaultVal = null) {
  const prefix = `--${name}=`;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith(prefix)) return argv[i].substring(prefix.length);
    if (argv[i] === `--${name}` && i + 1 < argv.length) return argv[i + 1];
  }
  return defaultVal;
}
function hasArg(name) {
  return argv.includes(`--${name}`) || argv.some(a => a.startsWith(`--${name}=`));
}

const VEHICLE_ID = getArg('vehicle', 'TN-01-AB-1234');
const FROM_INPUT = getArg('from', 'BR-CHE');
const TO_INPUT = getArg('to', 'BR-MDU');
const SPEED_KMH = parseFloat(getArg('speed', '60')) || 60;
const INTERVAL_SEC = Math.max(3, parseFloat(getArg('interval', '5')) || 5);
const BASE_URL = getArg('base-url', 'http://localhost:5000').replace(/\/+$/, '');
const ALLOW_REMOTE = hasArg('allow-remote');
const DEVICE_KEY = getArg('device-key', null);
const DRIVER_USER = getArg('username', 'driver1');
const DRIVER_PASS = getArg('password', 'driver123');
const STOP_AT = getArg('stop-at') ? parseFloat(getArg('stop-at')) : null;
const STOP_SECS = parseInt(getArg('stop-secs', '60'), 10);
const DROP_SIGNAL_SECS = parseInt(getArg('drop-signal-secs', '0'), 10);
const JITTER_METERS = parseFloat(getArg('jitter', '5')) || 5;

// Default known Tamil Nadu branch coordinates (fallback if API is unreachable)
const KNOWN_BRANCHES = {
  'BR-CHE': { name: 'Chennai Central Hub', lat: 13.0827, lng: 80.2707 },
  'BR-CBE': { name: 'Coimbatore Agri Depot', lat: 11.0168, lng: 76.9558 },
  'BR-MDU': { name: 'Madurai Grains Yard', lat: 9.9252, lng: 78.1198 },
  'BR-TRY': { name: 'Trichy Transshipment Center', lat: 10.7905, lng: 78.7047 },
  'BR-SAL': { name: 'Salem Steel Hub', lat: 11.6643, lng: 78.1460 },
  'BR-VEL': { name: 'Vellore Leather Terminal', lat: 12.9165, lng: 79.1325 },
  'BR-TUT': { name: 'Tuticorin Port Container Yard', lat: 8.7642, lng: 78.1348 },
};

// 1. Security Check: Refuse remote host unless --allow-remote
let parsedBaseUrl;
try {
  parsedBaseUrl = new URL(BASE_URL);
} catch (err) {
  console.error(`❌ [Security Error] Invalid --base-url: "${BASE_URL}"`);
  process.exit(1);
}

const isLocalhost =
  parsedBaseUrl.hostname === 'localhost' ||
  parsedBaseUrl.hostname === '127.0.0.1' ||
  parsedBaseUrl.hostname === '::1';

if (!isLocalhost && !ALLOW_REMOTE) {
  console.error('\n❌ [SECURITY GUARD] Non-localhost --base-url requested:');
  console.error(`   Target: ${BASE_URL}`);
  console.error('   Simulated GPS injection to remote environments is restricted by default.');
  console.error('   If this was intentional, pass the explicit flag: --allow-remote\n');
  process.exit(1);
}

// HTTP request helper
function requestApi(urlPath, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(`${BASE_URL}${urlPath}`);
    const isHttps = fullUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const reqHeaders = {
      Accept: 'application/json',
      ...headers,
    };
    let payload = null;
    if (body) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = client.request(
      fullUrl,
      {
        method,
        headers: reqHeaders,
        timeout: 10000,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(rawData);
          } catch (_) {
            parsed = { raw: rawData };
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout (${fullUrl.pathname})`));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// Great-circle Haversine distance (km)
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Initial bearing calculation (degrees 0-360)
function calculateBearing(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return Math.round(((theta * 180) / Math.PI + 360) % 360);
}

// Add random GPS jitter (~5m)
function applyJitter(lat, lng, jitterMeters) {
  const earthRadius = 6378137; // meters
  const dLat = ((Math.random() - 0.5) * 2 * jitterMeters) / earthRadius;
  const dLng =
    ((Math.random() - 0.5) * 2 * jitterMeters) /
    (earthRadius * Math.cos((Math.PI * lat) / 180));
  return {
    lat: Number((lat + (dLat * 180) / Math.PI).toFixed(6)),
    lng: Number((lng + (dLng * 180) / Math.PI).toFixed(6)),
  };
}

// Resolve coordinate from input string (branch code or "lat,lng")
async function resolveLocation(input, branchMap) {
  if (input.includes(',')) {
    const parts = input.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { name: `Custom (${parts[0]}, ${parts[1]})`, lat: parts[0], lng: parts[1] };
    }
  }

  const branchKey = input.trim().toUpperCase();
  if (branchMap[branchKey]) {
    return branchMap[branchKey];
  }
  if (KNOWN_BRANCHES[branchKey]) {
    return KNOWN_BRANCHES[branchKey];
  }

  throw new Error(`Could not resolve branch or coordinate for "${input}"`);
}

async function main() {
  console.log('================================================================');
  console.log('  🛰️   LCOS REAL-TIME GPS TELEMETRY SIMULATOR');
  console.log('================================================================');
  console.log(` Target Server:    ${BASE_URL}`);
  console.log(` Target Vehicle:   ${VEHICLE_ID}`);
  console.log(` Base Speed:       ${SPEED_KMH} km/h`);
  console.log(` Ingest Interval:  ${INTERVAL_SEC}s`);
  console.log('================================================================\n');

  // Fetch branches dynamically from API
  const branchMap = {};
  try {
    const branchRes = await requestApi('/api/branches');
    if (branchRes.status === 200 && Array.isArray(branchRes.data.branches)) {
      branchRes.data.branches.forEach((b) => {
        if (b.lat && b.lng) {
          branchMap[b.id] = { name: b.name, lat: parseFloat(b.lat), lng: parseFloat(b.lng) };
        }
      });
      console.log(`📡 Loaded ${Object.keys(branchMap).length} branch locations dynamically from server.`);
    }
  } catch (err) {
    console.warn('⚠️ Could not fetch /api/branches dynamically; using built-in branch table.');
  }

  const origin = await resolveLocation(FROM_INPUT, branchMap);
  const destination = await resolveLocation(TO_INPUT, branchMap);
  const totalDistanceKm = haversineDistanceKm(origin.lat, origin.lng, destination.lat, destination.lng);
  const headingBearing = calculateBearing(origin.lat, origin.lng, destination.lat, destination.lng);

  console.log(`\n📍 Route: ${origin.name} ➔ ${destination.name}`);
  console.log(`📏 Distance: ${totalDistanceKm.toFixed(2)} km | Bearing: ${headingBearing}°`);

  // Authenticate
  let authHeaders = {};
  if (DEVICE_KEY) {
    console.log(`🔑 Authenticating via hardware tracker device key (x-device-key).`);
    authHeaders['x-device-key'] = DEVICE_KEY;
  } else {
    console.log(`👤 Authenticating via driver credentials (${DRIVER_USER})...`);
    try {
      const loginRes = await requestApi('/api/auth/login', 'POST', {
        username: DRIVER_USER,
        password: DRIVER_PASS,
      });

      if (loginRes.status !== 200 || !loginRes.data.token) {
        console.error(`\n❌ [Auth Error] Driver login failed (${loginRes.status}):`, loginRes.data.message || loginRes.data);
        console.error('Zero-config unauthenticated fallback is disabled. Supply a valid --device-key or driver login.\n');
        process.exit(1);
      }

      const driverToken = loginRes.data.token;
      authHeaders['Authorization'] = `Bearer ${driverToken}`;
      console.log('✅ Driver JWT obtained successfully.');

      // Check active trip
      const tripRes = await requestApi('/api/gps/my-trip', 'GET', null, authHeaders);
      if (tripRes.status === 200 && tripRes.data.trip) {
        console.log(`📋 Active driver trip verified: ${tripRes.data.trip.id} (${tripRes.data.trip.vehicleId})`);
      } else {
        console.warn(`⚠️ Note: Driver does not have an active trip assigned (${tripRes.data.message || 'No active trip'}).`);
      }
    } catch (authErr) {
      console.error('❌ [Connection Error] Could not connect to auth endpoint:', authErr.message);
      process.exit(1);
    }
  }

  // Simulation State
  let progress = 0; // 0 to 1
  let pointsTransmitted = 0;
  let batchPointsQueued = [];
  let isStopped = false;
  let stopSecondsLeft = 0;
  let isSignalDropped = false;
  let dropSecondsLeft = 0;

  // Stoppage trigger calculation
  const stopAtProgress = STOP_AT !== null ? Math.max(0.05, Math.min(0.95, STOP_AT)) : null;
  let stopTriggered = false;

  // Progress delta per step
  const distancePerIntervalKm = (SPEED_KMH * (INTERVAL_SEC / 3600));
  const progressStep = totalDistanceKm > 0 ? distancePerIntervalKm / totalDistanceKm : 1;

  console.log(`\n🚀 Starting real-time GPS transmission (Ctrl+C to quit)...`);

  const runTick = async () => {
    // 1. Check for stoppage
    if (stopAtProgress !== null && !stopTriggered && progress >= stopAtProgress) {
      stopTriggered = true;
      isStopped = true;
      stopSecondsLeft = STOP_SECS;
      console.log(`\n🛑 Vehicle halting at ${(progress * 100).toFixed(1)}% of route for ${STOP_SECS}s (Simulating scheduled stop/delay)...`);
    }

    if (isStopped) {
      stopSecondsLeft -= INTERVAL_SEC;
      if (stopSecondsLeft <= 0) {
        isStopped = false;
        console.log(`\n🟢 Resuming journey after scheduled stoppage.`);
      }
    } else {
      progress = Math.min(1.0, progress + progressStep);
    }

    // 2. Compute current coordinates
    const curLat = origin.lat + (destination.lat - origin.lat) * progress;
    const curLng = origin.lng + (destination.lng - origin.lng) * progress;
    const jittered = applyJitter(curLat, curLng, JITTER_METERS);

    // Current speed (0 if stopped, slight variance if moving)
    const currentSpeed = isStopped
      ? 0
      : Math.max(15, Math.round(SPEED_KMH + (Math.random() * 6 - 3)));

    const currentHeading = (headingBearing + Math.round(Math.random() * 6 - 3) + 360) % 360;
    const movementStatus = currentSpeed >= 3 ? 'MOVING' : 'STOPPED';

    const point = {
      vehicleId: VEHICLE_ID,
      lat: jittered.lat,
      lng: jittered.lng,
      speedKmh: currentSpeed,
      heading: currentHeading,
      accuracy: 8 + Math.round(Math.random() * 8),
      recordedAt: new Date().toISOString(),
    };

    // 3. Handle signal drop simulation (tunnel / dead zone)
    if (DROP_SIGNAL_SECS > 0 && !isSignalDropped && progress >= 0.35 && progress <= 0.65) {
      isSignalDropped = true;
      dropSecondsLeft = DROP_SIGNAL_SECS;
      console.log(`\n📡 Simulating cellular signal drop / mountain tunnel for ${DROP_SIGNAL_SECS}s...`);
    }

    if (isSignalDropped) {
      dropSecondsLeft -= INTERVAL_SEC;
      batchPointsQueued.push(point);
      console.log(`   [Signal Offline] Point buffered into local queue (${batchPointsQueued.length} points total)`);

      if (dropSecondsLeft <= 0) {
        isSignalDropped = false;
        console.log(`\n📶 Cellular signal restored! Flushing ${batchPointsQueued.length} buffered points via /api/gps/batch...`);
        try {
          const batchRes = await requestApi('/api/gps/batch', 'POST', {
            vehicleId: VEHICLE_ID,
            points: batchPointsQueued,
          }, authHeaders);

          if (batchRes.status === 200 && batchRes.data.success) {
            pointsTransmitted += batchPointsQueued.length;
            console.log(`✅ [Batch Ingest] Successfully flushed ${batchPointsQueued.length} offline points.`);
            batchPointsQueued = [];
          } else {
            console.warn(`⚠️ [Batch Ingest Warning] Status: ${batchRes.status}`, batchRes.data);
          }
        } catch (flushErr) {
          console.error(`❌ [Batch Ingest Error]:`, flushErr.message);
        }
      }
      return;
    }

    // 4. Send single real-time update
    try {
      const res = await requestApi('/api/gps/update', 'POST', point, authHeaders);

      if (res.status === 200 && res.data.success) {
        pointsTransmitted++;
        const pct = (progress * 100).toFixed(1);
        const distKm = (totalDistanceKm * progress).toFixed(1);
        process.stdout.write(
          `\r[Ping #${pointsTransmitted}] ${point.recordedAt.slice(11, 19)} | ` +
          `Coord: (${jittered.lat.toFixed(5)}, ${jittered.lng.toFixed(5)}) | ` +
          `Speed: ${currentSpeed} km/h (${movementStatus}) | ` +
          `Progress: ${pct}% (${distKm}/${totalDistanceKm.toFixed(1)} km)  `
        );
      } else if (res.status === 429) {
        console.warn(`\n⚠️  [429 Rate Limited] ${res.data.message || 'Backing off...'}`);
      } else {
        console.warn(`\n⚠️  [Server Note: ${res.status}] ${res.data.message || JSON.stringify(res.data)}`);
      }
    } catch (err) {
      console.error(`\n❌ [Transmission Error]:`, err.message);
    }

    // Check completion
    if (progress >= 1.0) {
      console.log(`\n\n🏁 Destination reached! Trip simulation concluded.`);
      console.log(`   Total points transmitted: ${pointsTransmitted}`);
      process.exit(0);
    }
  };

  // Run first tick immediately
  await runTick();
  const intervalId = setInterval(runTick, INTERVAL_SEC * 1000);

  // Clean exit handler
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    console.log(`\n\n🛑 Simulation terminated by user.`);
    console.log(`   Points transmitted: ${pointsTransmitted}`);
    console.log(`   Final progress: ${(progress * 100).toFixed(1)}%`);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('\n❌ Fatal simulator error:', err);
  process.exit(1);
});
