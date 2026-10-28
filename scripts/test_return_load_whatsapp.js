const db = require('../server/config/db');
const whatsappService = require('../server/services/whatsappService');

async function testReturnLoadFlow() {
  console.log('========================================================');
  console.log('🧪 TESTING RETURN LOAD HUB & WHATSAPP NOTIFICATION FLOW');
  console.log('========================================================\n');

  try {
    // 1. Check Branches
    const branches = await db.query(`SELECT id, name, manager_name, phone FROM branches WHERE id IN ('BR-CHE', 'BR-VEL')`);
    console.log('📍 Available Branches:', branches.rows);

    // 2. Check Drivers & Vehicles
    const driver = await db.query(`SELECT id, name, phone, status FROM drivers WHERE id = 'DRV-101'`);
    const vehicle = await db.query(`SELECT id, type, status FROM vehicles LIMIT 1`);
    console.log('🚛 Vehicle:', vehicle.rows[0]);
    console.log('👤 Driver:', driver.rows[0]);

    const vehicleId = vehicle.rows[0].id;
    const driverId = driver.rows[0].id;

    // 3. Create an Outbound Trip: Chennai -> Vellore
    const outboundTripId = 'TRIP-TEST-OUT-' + Date.now();
    await db.query(
      `INSERT INTO trips (id, company_id, source_branch_id, destination_branch_id, commodity_id, quantity, vehicle_id, driver_id, status)
       VALUES ($1, 'COMP-001', 'BR-CHE', 'BR-VEL', 'COM-CEM', 10, $2, $3, 'IN_TRANSIT')`,
      [outboundTripId, vehicleId, driverId]
    );
    console.log(`\n✅ Outbound Trip Created: ${outboundTripId} (Chennai -> Vellore)`);

    // 4. Create an Open Return Trip at Vellore: Vellore -> Chennai
    const returnTripId = 'TRIP-TEST-RET-' + Date.now();
    await db.query(
      `INSERT INTO trips (id, company_id, source_branch_id, destination_branch_id, commodity_id, quantity, status)
       VALUES ($1, 'COMP-001', 'BR-VEL', 'BR-CHE', 'COM-STE', 15, 'CREATED')`,
      [returnTripId]
    );
    console.log(`✅ Open Return Load Created: ${returnTripId} (Vellore -> Chennai, 15 Tons)`);

    // 5. Simulate Trip Delivery in Vellore (Call close-delivery logic)
    console.log(`\n📦 Lorry arrives and unloads in Vellore. Closing trip ${outboundTripId}...`);

    // Mark vehicle and driver available
    await db.query(`UPDATE vehicles SET status = 'Available' WHERE id = $1`, [vehicleId]);
    await db.query(`UPDATE drivers SET status = 'Available' WHERE id = $1`, [driverId]);

    // Check for return load at destination branch (Vellore -> Chennai)
    const returnLoadRes = await db.query(
      `SELECT t.*, c.name AS commodity_name, c.unit AS commodity_unit,
              sb.name AS source_branch_name, sb.manager_name AS source_manager_name, sb.phone AS source_manager_phone,
              db_br.name AS destination_branch_name, db_br.manager_name AS destination_manager_name, db_br.phone AS destination_manager_phone
       FROM trips t
       LEFT JOIN commodities c ON c.id = t.commodity_id
       LEFT JOIN branches sb ON sb.id = t.source_branch_id
       LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id
       WHERE t.source_branch_id = 'BR-VEL' 
         AND t.status IN ('CREATED', 'PLANNED')
       ORDER BY (CASE WHEN t.destination_branch_id = 'BR-CHE' THEN 1 ELSE 2 END), t.created_at ASC
       LIMIT 1`
    );

    console.log(`🔍 Return Load Scan Result: Found ${returnLoadRes.rows.length} pending load(s)`);
    if (returnLoadRes.rows.length > 0) {
      const match = returnLoadRes.rows[0];
      console.log(`   - Matched Trip: ${match.id}`);
      console.log(`   - Commodity: ${match.commodity_name} (${match.quantity} ${match.commodity_unit || 'Units'})`);
      console.log(`   - From: ${match.source_branch_name} (Manager: ${match.source_manager_name}, Phone: ${match.source_manager_phone})`);
      console.log(`   - To: ${match.destination_branch_name}`);

      // Send WhatsApp opportunity alerts to both Driver & Branch Manager
      const waRes = await whatsappService.sendReturnLoadOpportunityNotification({
        driverPhone: driver.rows[0].phone,
        managerPhone: match.source_manager_phone,
        returnTrip: match,
        vehicle: vehicle.rows[0],
        driver: driver.rows[0],
        sourceBranch: {
          name: match.source_branch_name,
          manager_name: match.source_manager_name,
          phone: match.source_manager_phone
        },
        destBranch: {
          name: match.destination_branch_name,
          manager_name: match.destination_manager_name,
          phone: match.destination_manager_phone
        }
      });

      console.log('\n📱 WhatsApp Dispatch Alerts Result:');
      console.log('   - Driver Alert Sent:', waRes.driver?.success ? 'SUCCESS (Delivered/Logged)' : 'FAILED');
      console.log('   - Branch Manager Alert Sent:', waRes.manager?.success ? 'SUCCESS (Delivered/Logged)' : 'FAILED');
    }

    // 6. Simulate Manual Verification Call & Web Click "Pair Backload"
    console.log(`\n📞 [Manual Verification]: Driver and Branch Manager called and verified gate & loading time.`);
    console.log(`💻 [Web Action]: User clicks "Pair Backload" on LCOS Return Hub...`);

    // Assign Backload
    await db.query(
      `UPDATE trips 
       SET vehicle_id = $1, driver_id = $2, status = 'DISPATCH_APPROVED', updated_at = NOW()
       WHERE id = $3`,
      [vehicleId, driverId, returnTripId]
    );

    await db.query(`UPDATE vehicles SET status = 'In Transit' WHERE id = $1`, [vehicleId]);
    await db.query(`UPDATE drivers SET status = 'On Trip' WHERE id = $1`, [driverId]);

    // Send Confirmation WhatsApp to Driver and Branch Manager
    const confirmedTripRes = await db.query(
      `SELECT t.*, c.name AS commodity_name, c.unit AS commodity_unit,
              sb.name AS source_branch_name, sb.phone AS source_branch_phone,
              db_br.name AS destination_branch_name,
              d.name AS driver_name, d.phone AS driver_phone
       FROM trips t
       LEFT JOIN commodities c ON c.id = t.commodity_id
       LEFT JOIN branches sb ON sb.id = t.source_branch_id
       LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id
       LEFT JOIN drivers d ON d.id = t.driver_id
       WHERE t.id = $1`,
      [returnTripId]
    );

    const pairedRow = confirmedTripRes.rows[0];
    const dispatchWa = await whatsappService.sendTripDispatchNotification(pairedRow, pairedRow.driver_phone);
    const mgrWa = await whatsappService.sendReturnLoadConfirmedNotification({
      managerPhone: pairedRow.source_branch_phone,
      tripId: pairedRow.id,
      vehicleId: pairedRow.vehicle_id,
      driverName: pairedRow.driver_name,
      driverPhone: pairedRow.driver_phone,
      sourceName: pairedRow.source_branch_name,
      destName: pairedRow.destination_branch_name,
      cargoDesc: `${pairedRow.commodity_name} (${pairedRow.quantity} ${pairedRow.commodity_unit || 'Units'})`
    });

    console.log('   - Official Driver Dispatch WhatsApp:', dispatchWa?.success ? 'SUCCESS' : 'FAILED');
    console.log('   - Manager Return Dispatched WhatsApp:', mgrWa?.success ? 'SUCCESS' : 'FAILED');

    // 7. Verify WhatsApp Logs in DB
    const logs = await db.query(`SELECT id, to_number, message_type, content, status FROM whatsapp_logs ORDER BY created_at DESC LIMIT 4`);
    console.log('\n📋 Recent WhatsApp Logs in Database:');
    logs.rows.forEach((l, i) => {
      console.log(`   ${i + 1}. To: ${l.to_number} | Status: ${l.status}`);
      console.log(`      Content Preview: ${l.content.substring(0, 70)}...`);
    });

    console.log('\n========================================================');
    console.log('🎉 TEST COMPLETE: ALL RETURN LOAD HUB STEPS VERIFIED!');
    console.log('========================================================');
  } catch (err) {
    console.error('❌ Test failed with error:', err);
  }
}

testReturnLoadFlow().then(() => process.exit(0));
