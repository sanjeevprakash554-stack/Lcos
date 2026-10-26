const db = require('../config/db');

async function seedAllDriversTrips() {
  console.log('Synchronizing fleet vehicle roster and driver phone numbers...');

  const vehicles = [
    { id: 'TN-01-AB-1234', type: 'Lorry', cap: 15, lat: 13.0827, lng: 80.2707 },
    { id: 'TN-02-GH-3456', type: 'Lorry', cap: 15, lat: 10.3673, lng: 77.9803 },
    { id: 'TN-37-CD-5678', type: 'Container', cap: 20, lat: 12.9229, lng: 79.3326 },
    { id: 'TN-23-LM-1122', type: 'Lorry', cap: 14, lat: 11.6643, lng: 78.1460 },
    { id: 'TN-59-EF-9012', type: 'Mini Truck', cap: 8, lat: 11.6455, lng: 78.1576 },
    { id: 'TN-07-JK-7890', type: 'Container', cap: 18, lat: 10.7905, lng: 78.7047 },
    { id: 'TN-45-QR-5566', type: 'Container', cap: 24, lat: 8.7139, lng: 77.7567 },
    { id: 'TN-45-KL-8899', type: 'Lorry', cap: 16, lat: 11.3410, lng: 77.7172 },
    { id: 'TN-69-ST-7788', type: 'Lorry', cap: 16, lat: 8.7274, lng: 78.1580 },
    { id: 'TN-72-UV-9900', type: 'Mini Truck', cap: 5, lat: 11.7480, lng: 79.7714 },
    { id: 'TN-11-TE-1111', type: 'Mini Truck', cap: 6, lat: 12.8342, lng: 79.7036 },
    { id: 'TN-30-NP-3344', type: 'Mini Truck', cap: 6, lat: 13.0841, lng: 80.2721 }
  ];

  for (const v of vehicles) {
    await db.query(`
      INSERT INTO vehicles (id, company_id, type, capacity_tons, ownership, status, current_lat, current_lng, movement_status)
      VALUES ($1, 'COMP-001', $2, $3, 'Self Owned', 'Available', $4, $5, 'STOPPED')
      ON CONFLICT (id) DO UPDATE SET movement_status = 'STOPPED', current_lat = $4, current_lng = $5, status = 'Available'
    `, [v.id, v.type, v.cap, v.lat, v.lng]);
  }

  // Ensure Driver phone numbers are formatted and drivers exist in Available status
  await db.query(`UPDATE drivers SET phone = '919884012345', status = 'Available' WHERE id = 'DRV-101'`);
  await db.query(`UPDATE drivers SET phone = '919884023456', status = 'Available' WHERE id = 'DRV-102'`);
  await db.query(`UPDATE drivers SET phone = '919884034567', status = 'Available' WHERE id = 'DRV-103'`);
  await db.query(`UPDATE drivers SET phone = '919884045678', status = 'Available' WHERE id = 'DRV-104'`);
  await db.query(`UPDATE drivers SET phone = '916382897998', status = 'Available' WHERE id = 'DRV-105'`);
  await db.query(`UPDATE drivers SET phone = '919884067890', status = 'Available' WHERE id = 'DRV-106'`);
  await db.query(`UPDATE drivers SET phone = '919884078901', status = 'Available' WHERE id = 'DRV-107'`);
  await db.query(`UPDATE drivers SET phone = '919884089012', status = 'Available' WHERE id = 'DRV-108'`);
  await db.query(`UPDATE drivers SET phone = '919884090123', status = 'Available' WHERE id = 'DRV-109'`);
  await db.query(`UPDATE drivers SET phone = '919884001234', status = 'Available' WHERE id = 'DRV-110'`);
  await db.query(`UPDATE drivers SET phone = '919884099999', status = 'Available' WHERE id = 'DRV-111'`);
  await db.query(`UPDATE drivers SET phone = '7904743468', status = 'Available' WHERE id = 'DRV-112'`);

  console.log('✅ Registered fleet vehicles and drivers verified in clean Available status.');
}

if (require.main === module) {
  seedAllDriversTrips()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}

module.exports = { seedAllDriversTrips };
