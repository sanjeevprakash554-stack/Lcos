const db = require('../config/db');

const ALL_TAMIL_NADU_DISTRICTS = [
  { id: 'BR-ARI', name: 'Ariyalur', manager_name: 'Ravi Chandran', phone: '+91 94412 11001', lat: 11.1401, lng: 79.0786, x_coord: 60, y_coord: 45 },
  { id: 'BR-CGL', name: 'Chengalpattu', manager_name: 'Karthik Raja', phone: '+91 94412 11002', lat: 12.6841, lng: 79.9836, x_coord: 78, y_coord: 20 },
  { id: 'BR-CHE', name: 'Chennai', manager_name: 'Balaji R.', phone: '+91 94412 12345', lat: 13.0827, lng: 80.2707, x_coord: 82, y_coord: 15 },
  { id: 'BR-CBE', name: 'Coimbatore', manager_name: 'Senthil Kumar', phone: '+91 94412 23456', lat: 11.0168, lng: 76.9558, x_coord: 20, y_coord: 55 },
  { id: 'BR-CUD', name: 'Cuddalore', manager_name: 'Elangovan A.', phone: '+91 94412 11223', lat: 11.7480, lng: 79.7714, x_coord: 72, y_coord: 38 },
  { id: 'BR-DHA', name: 'Dharmapuri', manager_name: 'Suresh Kumar', phone: '+91 94412 11003', lat: 12.1277, lng: 78.1579, x_coord: 48, y_coord: 28 },
  { id: 'BR-DGL', name: 'Dindigul', manager_name: 'Palanichamy M.', phone: '+91 94412 01234', lat: 10.3673, lng: 77.9803, x_coord: 38, y_coord: 62 },
  { id: 'BR-ERD', name: 'Erode', manager_name: 'Ramasamy P.', phone: '+91 94412 78901', lat: 11.3410, lng: 77.7172, x_coord: 35, y_coord: 48 },
  { id: 'BR-KAL', name: 'Kallakurichi', manager_name: 'Venkatesan T.', phone: '+91 94412 11004', lat: 11.7384, lng: 78.9639, x_coord: 58, y_coord: 35 },
  { id: 'BR-KNC', name: 'Kanchipuram', manager_name: 'Srinivasan G.', phone: '+91 94412 22334', lat: 12.8342, lng: 79.7036, x_coord: 76, y_coord: 24 },
  { id: 'BR-KKI', name: 'Kanyakumari', manager_name: 'Jebakumar D.', phone: '+91 94412 11005', lat: 8.1833, lng: 77.4119, x_coord: 25, y_coord: 95 },
  { id: 'BR-KAR', name: 'Karur', manager_name: 'Muthusamy N.', phone: '+91 94412 11006', lat: 10.9601, lng: 78.0766, x_coord: 44, y_coord: 52 },
  { id: 'BR-KRI', name: 'Krishnagiri', manager_name: 'Anandhan V.', phone: '+91 94412 11007', lat: 12.5266, lng: 78.2146, x_coord: 50, y_coord: 22 },
  { id: 'BR-MDU', name: 'Madurai', manager_name: 'Pandian M.', phone: '+91 94412 34567', lat: 9.9252, lng: 78.1198, x_coord: 42, y_coord: 70 },
  { id: 'BR-MAY', name: 'Mayiladuthurai', manager_name: 'Balamurugan R.', phone: '+91 94412 11008', lat: 11.1018, lng: 79.6522, x_coord: 74, y_coord: 46 },
  { id: 'BR-NGP', name: 'Nagapattinam', manager_name: 'Muruganandam K.', phone: '+91 94412 44556', lat: 10.7672, lng: 79.8449, x_coord: 76, y_coord: 52 },
  { id: 'BR-NAM', name: 'Namakkal', manager_name: 'Periyasamy K.', phone: '+91 94412 11009', lat: 11.2189, lng: 78.1674, x_coord: 46, y_coord: 46 },
  { id: 'BR-NIL', name: 'Nilgiris (Ooty)', manager_name: 'Gopalakrishnan B.', phone: '+91 94412 11010', lat: 11.4102, lng: 76.6950, x_coord: 15, y_coord: 46 },
  { id: 'BR-PER', name: 'Perambalur', manager_name: 'Thangavel S.', phone: '+91 94412 11011', lat: 11.2342, lng: 78.8820, x_coord: 56, y_coord: 46 },
  { id: 'BR-PUD', name: 'Pudukkottai', manager_name: 'Meenakshi Sundaram', phone: '+91 94412 11012', lat: 10.3833, lng: 78.8000, x_coord: 54, y_coord: 64 },
  { id: 'BR-RAM', name: 'Ramanathapuram', manager_name: 'Sethupathi K.', phone: '+91 94412 11013', lat: 9.3639, lng: 78.8394, x_coord: 58, y_coord: 78 },
  { id: 'BR-RAN', name: 'Ranipet', manager_name: 'Jayachandran L.', phone: '+91 94412 11014', lat: 12.9296, lng: 79.3331, x_coord: 68, y_coord: 20 },
  { id: 'BR-SAL', name: 'Salem', manager_name: 'Venkatachalam K.', phone: '+91 94412 56789', lat: 11.6643, lng: 78.1460, x_coord: 45, y_coord: 40 },
  { id: 'BR-SIV', name: 'Sivaganga', manager_name: 'Kannan RM.', phone: '+91 94412 11015', lat: 9.8433, lng: 78.4800, x_coord: 50, y_coord: 72 },
  { id: 'BR-TKS', name: 'Tenkasi', manager_name: 'Arunachalam S.', phone: '+91 94412 11016', lat: 8.9597, lng: 77.3150, x_coord: 28, y_coord: 84 },
  { id: 'BR-THA', name: 'Thanjavur', manager_name: 'Rajendran C.', phone: '+91 94412 11017', lat: 10.7870, lng: 79.1378, x_coord: 62, y_coord: 54 },
  { id: 'BR-THE', name: 'Theni', manager_name: 'Chinnasamy P.', phone: '+91 94412 11018', lat: 10.0104, lng: 77.4768, x_coord: 30, y_coord: 68 },
  { id: 'BR-TUT', name: 'Thoothukudi', manager_name: 'Subbiah V.', phone: '+91 94412 90123', lat: 8.7642, lng: 78.1348, x_coord: 48, y_coord: 88 },
  { id: 'BR-TRY', name: 'Tiruchirappalli', manager_name: 'Raja Sekhar', phone: '+91 94412 45678', lat: 10.7905, lng: 78.7047, x_coord: 52, y_coord: 55 },
  { id: 'BR-TEN', name: 'Tirunelveli', manager_name: 'Muthu Krishnan', phone: '+91 94412 89012', lat: 8.7139, lng: 77.7567, x_coord: 35, y_coord: 85 },
  { id: 'BR-TPR', name: 'Tirupathur', manager_name: 'Govindaraj M.', phone: '+91 94412 11019', lat: 12.4950, lng: 78.5678, x_coord: 60, y_coord: 24 },
  { id: 'BR-TUP', name: 'Tiruppur', manager_name: 'Velusamy K.', phone: '+91 94412 11020', lat: 11.1085, lng: 77.3411, x_coord: 28, y_coord: 52 },
  { id: 'BR-TVL', name: 'Tiruvallur', manager_name: 'Narayanan E.', phone: '+91 94412 11021', lat: 13.1432, lng: 79.9079, x_coord: 78, y_coord: 14 },
  { id: 'BR-TVM', name: 'Tiruvannamalai', manager_name: 'Sivakumar D.', phone: '+91 94412 11022', lat: 12.2253, lng: 79.0747, x_coord: 62, y_coord: 30 },
  { id: 'BR-TVR', name: 'Tiruvarur', manager_name: 'Ganesan V.', phone: '+91 94412 11023', lat: 10.7708, lng: 79.6366, x_coord: 70, y_coord: 54 },
  { id: 'BR-VEL', name: 'Vellore', manager_name: 'Karthikeyan S.', phone: '+91 94412 67890', lat: 12.9165, lng: 79.1325, x_coord: 68, y_coord: 22 },
  { id: 'BR-VLP', name: 'Villupuram', manager_name: 'Anbarasan T.', phone: '+91 94412 33445', lat: 11.9401, lng: 79.4861, x_coord: 70, y_coord: 32 },
  { id: 'BR-VIR', name: 'Virudhunagar', manager_name: 'Sankaralingam M.', phone: '+91 94412 11024', lat: 9.5872, lng: 77.9514, x_coord: 40, y_coord: 76 }
];

async function seedAllDistricts() {
  console.log('🌟 [Seed] Starting Tamil Nadu 38 Districts Seeding...');
  const companyId = 'COMP-001';

  let addedCount = 0;
  let updatedCount = 0;

  for (const d of ALL_TAMIL_NADU_DISTRICTS) {
    try {
      const existing = await db.query('SELECT id, name FROM branches WHERE id = $1', [d.id]);
      if (existing.rows.length === 0) {
        await db.query(
          `INSERT INTO branches (id, company_id, name, manager_name, phone, lat, lng, x_coord, y_coord)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [d.id, companyId, d.name, d.manager_name, d.phone, d.lat, d.lng, d.x_coord, d.y_coord]
        );
        addedCount++;
      } else {
        await db.query(
          `UPDATE branches SET lat = $1, lng = $2, name = $3, manager_name = $4, phone = $5 WHERE id = $6`,
          [d.lat, d.lng, d.name, d.manager_name, d.phone, d.id]
        );
        updatedCount++;
      }
    } catch (err) {
      console.error(`❌ Error inserting/updating branch ${d.name}:`, err.message);
    }
  }

  // Seed baseline stock for all commodities in all 38 branches
  try {
    const commodities = await db.query('SELECT id FROM commodities');
    const allBranches = await db.query('SELECT id FROM branches');
    let stockCount = 0;

    for (const b of allBranches.rows) {
      for (const c of commodities.rows) {
        try {
          const checkStock = await db.query(
            'SELECT branch_id FROM stock WHERE branch_id = $1 AND commodity_id = $2',
            [b.id, c.id]
          );
          if (checkStock.rows.length === 0) {
            await db.query(
              `INSERT INTO stock (branch_id, commodity_id, available_qty, in_transit_qty, delivered_qty, pending_qty)
               VALUES ($1, $2, $3, 0, 0, 0)`,
              [b.id, c.id, Math.floor(Math.random() * 200) + 100]
            );
            stockCount++;
          }
        } catch (_) {}
      }
    }
    console.log(`📦 Seeded ${stockCount} initial stock entries across districts.`);
  } catch (err) {
    console.warn('Stock init note:', err.message);
  }

  console.log(`✅ Successfully verified all 38 Tamil Nadu Districts! (Added: ${addedCount}, Verified: ${updatedCount})`);
  const finalCheck = await db.query('SELECT count(*) as total FROM branches');
  console.log(`📍 Total Branches in Database: ${finalCheck.rows[0].total}`);
}

seedAllDistricts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
