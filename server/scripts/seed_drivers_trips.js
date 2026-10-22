const db = require('../config/db');

async function seedAll() {
  console.log('Seeding trips and vehicle assignments for all registered drivers...');

  const vehicles = [
    { id: 'TN-30-NP-3344', type: 'Mini Truck', cap: 6, lat: 11.3410, lng: 77.7172 },
    { id: 'TN-69-ST-7788', type: 'Lorry', cap: 16, lat: 8.7274, lng: 78.1580 },
    { id: 'TN-02-GH-3456', type: 'Lorry', cap: 15, lat: 10.3673, lng: 77.9803 },
    { id: 'TN-23-LM-1122', type: 'Lorry', cap: 14, lat: 11.6643, lng: 78.1460 },
    { id: 'TN-45-QR-5566', type: 'Container', cap: 24, lat: 8.7139, lng: 77.7567 },
    { id: 'TN-72-UV-9900', type: 'Mini Truck', cap: 5, lat: 11.7480, lng: 79.7714 }
  ];

  for (const v of vehicles) {
    await db.query(`
      INSERT INTO vehicles (id, company_id, type, capacity_tons, ownership, status, current_lat, current_lng, movement_status)
      VALUES ($1, 'COMP-001', $2, $3, 'Self Owned', 'In Transit', $4, $5, 'MOVING')
      ON CONFLICT (id) DO UPDATE SET movement_status = 'MOVING', current_lat = $4, current_lng = $5, status = 'In Transit'
    `, [v.id, v.type, v.cap, v.lat, v.lng]);
  }

  // Ensure Driver phone numbers are formatted and drivers exist
  await db.query(`UPDATE drivers SET phone = '7904743468' WHERE id = 'DRV-112'`);
  await db.query(`UPDATE drivers SET phone = '919884090123' WHERE id = 'DRV-109'`);
  await db.query(`UPDATE drivers SET phone = '919884012345' WHERE id = 'DRV-101'`);
  await db.query(`UPDATE drivers SET phone = '919884023456' WHERE id = 'DRV-102'`);
  await db.query(`UPDATE drivers SET phone = '919884034567' WHERE id = 'DRV-103'`);
  await db.query(`UPDATE drivers SET phone = '919884045678' WHERE id = 'DRV-104'`);
  await db.query(`UPDATE drivers SET phone = '916382897998' WHERE id = 'DRV-105'`);
  await db.query(`UPDATE drivers SET phone = '919884067890' WHERE id = 'DRV-106'`);
  await db.query(`UPDATE drivers SET phone = '919884078901' WHERE id = 'DRV-107'`);
  await db.query(`UPDATE drivers SET phone = '919884089012' WHERE id = 'DRV-108'`);
  await db.query(`UPDATE drivers SET phone = '919884001234' WHERE id = 'DRV-110'`);
  await db.query(`UPDATE drivers SET phone = '916382897998' WHERE id = 'DRV-111'`);

  const trips = [
    { id: 'TRIP-1005', disp: 'DISP-2005', com: 'COM-RIC', qty: 250, src: 'BR-MDU', dest: 'BR-DGL', veh: 'TN-02-GH-3456', drv: 'DRV-102' },
    { id: 'TRIP-1006', disp: 'DISP-2006', com: 'COM-CEM', qty: 200, src: 'BR-SAL', dest: 'BR-TRY', veh: 'TN-23-LM-1122', drv: 'DRV-104' },
    { id: 'TRIP-1007', disp: 'DISP-2007', com: 'COM-STE', qty: 15, src: 'BR-TEN', dest: 'BR-MDU', veh: 'TN-45-QR-5566', drv: 'DRV-107' },
    { id: 'TRIP-1009', disp: 'DISP-2009', com: 'COM-SUG', qty: 350, src: 'BR-TUT', dest: 'BR-TEN', veh: 'TN-69-ST-7788', drv: 'DRV-109' },
    { id: 'TRIP-1010', disp: 'DISP-2010', com: 'COM-SUG', qty: 120, src: 'BR-CUD', dest: 'BR-VLP', veh: 'TN-72-UV-9900', drv: 'DRV-110' },
    { id: 'TRIP-1012', disp: 'DISP-2012', com: 'COM-PUL', qty: 150, src: 'BR-ERD', dest: 'BR-CBE', veh: 'TN-30-NP-3344', drv: 'DRV-112' }
  ];

  for (const t of trips) {
    await db.query(`
      INSERT INTO trips (id, company_id, dispatch_id, commodity_id, quantity, source_branch_id, destination_branch_id, vehicle_id, driver_id, status, checklists, transit_updates, created_at, updated_at)
      VALUES ($1, 'COMP-001', $2, $3, $4, $5, $6, $7, $8, 'IN_TRANSIT', '{}', '[]', datetime('now'), datetime('now'))
      ON CONFLICT (id) DO UPDATE SET vehicle_id = EXCLUDED.vehicle_id, driver_id = EXCLUDED.driver_id, status = 'IN_TRANSIT', source_branch_id = EXCLUDED.source_branch_id, destination_branch_id = EXCLUDED.destination_branch_id
    `, [t.id, t.disp, t.com, t.qty, t.src, t.dest, t.veh, t.drv]);
  }

  console.log('✅ Successfully assigned all drivers to their distinct vehicles, trips, and routes!');
  process.exit(0);
}

seedAll().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
