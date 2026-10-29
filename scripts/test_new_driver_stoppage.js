const db = require('../server/config/db');

async function testNewDriverStoppage() {
  console.log('--- TEST: New Driver Stoppage Flow ---');
  
  // Simulated request
  const testPhone = '8428618564';
  const driverName = 'simbu vijay';
  
  // Import the route logic or test via direct simulated DB/stoppage check
  const stoppageDetector = require('../server/services/stoppageDetector');
  const whatsappService = require('../server/services/whatsappService');

  // Query driver check
  const cleanPh = String(testPhone).replace(/[^0-9]/g, '');
  const last10Ph = cleanPh.slice(-10);

  let dCheck = await db.query(
    `SELECT id, name FROM drivers WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '+', ''), '-', '') LIKE '%' || $1 LIMIT 1`,
    [last10Ph]
  );
  console.log('Driver check before test:', dCheck.rows);

  // Now simulate what POST /api/whatsapp/test-stoppage-alert does
  let targetVehicle = 'TN-59-EF-9012';
  let driverId = 'DRV-102';
  let verifiedTripId = 'TRIP-1002';

  if (dCheck.rows.length > 0) {
    driverId = dCheck.rows[0].id;
  } else {
    const maxRes = await db.query(`SELECT id FROM drivers WHERE id LIKE 'DRV-%'`);
    const nums = maxRes.rows.map(r => parseInt(String(r.id).replace('DRV-', ''), 10)).filter(n => !isNaN(n));
    const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 102;
    driverId = 'DRV-' + nextNum;
    await db.query(`
      INSERT INTO drivers (id, company_id, name, phone, license_number, status, current_lat, current_lng, created_at)
      VALUES ($1, 'COMP-001', $2, $3, $4, 'AVAILABLE', 11.6455, 78.1576, NOW())
    `, [driverId, driverName, testPhone, 'TN-59-2024-' + nextNum]);
    console.log(`Inserted driver: ${driverId} (${driverName}) with phone ${testPhone}`);
  }

  // Update trip to assign this driver
  await db.query(`UPDATE trips SET driver_id = $1, status = 'IN_TRANSIT' WHERE id = $2`, [driverId, verifiedTripId]);
  console.log(`Updated trip ${verifiedTripId} driver_id to ${driverId}`);

  // Query trip check
  const tCheck = await db.query(`SELECT id, vehicle_id, driver_id FROM trips WHERE id = $1`, [verifiedTripId]);
  console.log('Trip check:', tCheck.rows[0]);

  // Set vehicle stopped
  const isEmbedded = db.isUsingEmbedded && db.isUsingEmbedded();
  if (isEmbedded) {
    await db.query(
      `UPDATE vehicles 
       SET movement_status = 'STOPPED', speed_kmh = 0, 
           stoppage_start_time = datetime('now', '-25 minutes'),
           last_ping_at = datetime('now'),
           last_gps_update = datetime('now')
       WHERE id = $1`,
      [targetVehicle]
    );
  } else {
    await db.query(
      `UPDATE vehicles 
       SET movement_status = 'STOPPED', speed_kmh = 0, 
           stoppage_start_time = NOW() - INTERVAL '25 minutes',
           last_ping_at = NOW(),
           last_gps_update = NOW()
       WHERE id = $1`,
      [targetVehicle]
    );
  }

  // Clear alerts
  await db.query(
    `DELETE FROM alerts WHERE vehicle_id = $1 AND type IN ('Stoppage Detected', 'Driver Delay Report', 'Emergency Breakdown', 'No Update')`,
    [targetVehicle]
  );

  // Run stoppage detector
  await stoppageDetector.checkVehicleStoppages();

  // Check generated alert
  const alertRes = await db.query(
    `SELECT a.*, d.name AS driver_name, d.phone AS driver_phone
     FROM alerts a
     LEFT JOIN drivers d ON d.id = a.driver_id
     WHERE a.vehicle_id = $1 AND a.type = 'Stoppage Detected' AND a.status = 'Active'
     ORDER BY a.created_at DESC LIMIT 1`,
    [targetVehicle]
  );

  console.log('Generated Alert:');
  if (alertRes.rows.length > 0) {
    const a = alertRes.rows[0];
    console.log(`- Alert ID: ${a.id}`);
    console.log(`- Vehicle: ${a.vehicle_id}`);
    console.log(`- Driver ID: ${a.driver_id}`);
    console.log(`- Driver Name: ${a.driver_name}`);
    console.log(`- Driver Phone: ${a.driver_phone}`);
    console.log(`- Message: ${a.message}`);
  } else {
    console.error('No alert generated!');
  }

  // Check latest whatsapp logs
  const logsRes = await db.query(
    `SELECT * FROM whatsapp_logs ORDER BY created_at DESC LIMIT 3`
  );
  console.log('\nLatest WhatsApp Logs:');
  for (const log of logsRes.rows) {
    console.log(`- Direction: ${log.direction} | To: ${log.to_number} | Status: ${log.status} | Content: ${log.content.substring(0, 70)}...`);
  }

  console.log('\n--- TEST COMPLETE ---');
  process.exit(0);
}

testNewDriverStoppage().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
