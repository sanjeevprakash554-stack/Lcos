const db = require('../config/db');

async function seedSampleBackloads() {
  console.log('Seeding sample Return Load Hub data...');

  // 1. Stationed lorry in Madurai ready for backload
  await db.query(`
    INSERT INTO trips (id, company_id, dispatch_id, commodity_id, quantity, source_branch_id, destination_branch_id, vehicle_id, driver_id, status, checklists, transit_updates, delivery_info, created_at, updated_at)
    VALUES ('TRIP-901', 'COMP-001', 'DISP-801', 'COM-RIC', 200, 'BR-CHE', 'BR-MDU', 'TN-02-GH-3456', 'DRV-102', 'CLOSED', '{}', '[]', '{}', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'CLOSED', destination_branch_id = 'BR-MDU', vehicle_id = 'TN-02-GH-3456', driver_id = 'DRV-102'
  `);

  // 2. Pending return cargo in Madurai destined for Chennai HQ
  await db.query(`
    INSERT INTO trips (id, company_id, dispatch_id, commodity_id, quantity, source_branch_id, destination_branch_id, vehicle_id, driver_id, status, checklists, transit_updates, delivery_info, created_at, updated_at)
    VALUES ('TRIP-902', 'COMP-001', 'DISP-802', 'COM-CEM', 300, 'BR-MDU', 'BR-CHE', NULL, NULL, 'CREATED', '{}', '[]', '{}', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'CREATED', source_branch_id = 'BR-MDU', destination_branch_id = 'BR-CHE', commodity_id = 'COM-CEM', quantity = 300
  `);

  // 3. Stationed lorry in Coimbatore ready for backload
  await db.query(`
    INSERT INTO trips (id, company_id, dispatch_id, commodity_id, quantity, source_branch_id, destination_branch_id, vehicle_id, driver_id, status, checklists, transit_updates, delivery_info, created_at, updated_at)
    VALUES ('TRIP-903', 'COMP-001', 'DISP-803', 'COM-STE', 150, 'BR-CHE', 'BR-CBE', 'TN-59-EF-9012', 'DRV-105', 'CLOSED', '{}', '[]', '{}', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'CLOSED', destination_branch_id = 'BR-CBE', vehicle_id = 'TN-59-EF-9012', driver_id = 'DRV-105'
  `);

  // 4. Pending return cargo in Coimbatore destined for Chennai HQ
  await db.query(`
    INSERT INTO trips (id, company_id, dispatch_id, commodity_id, quantity, source_branch_id, destination_branch_id, vehicle_id, driver_id, status, checklists, transit_updates, delivery_info, created_at, updated_at)
    VALUES ('TRIP-904', 'COMP-001', 'DISP-804', 'COM-SUG', 220, 'BR-CBE', 'BR-CHE', NULL, NULL, 'CREATED', '{}', '[]', '{}', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'CREATED', source_branch_id = 'BR-CBE', destination_branch_id = 'BR-CHE', commodity_id = 'COM-SUG', quantity = 220
  `);

  console.log('✅ Sample backloads seeded:');
  console.log(' - Madurai: Lorry TN-02-GH-3456 (Kumaravel P.) + 300 Bags Cement -> Chennai');
  console.log(' - Coimbatore: Lorry TN-59-EF-9012 (Saravanan K.) + 220 Bags Sugar -> Chennai');
}

seedSampleBackloads()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error seeding backloads:', err);
    process.exit(1);
  });
