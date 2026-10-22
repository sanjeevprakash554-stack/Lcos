const fs = require('fs');
const path = require('path');
const db = require('../config/db');

async function seedAllProcesses() {
  try {
    console.log('Reading seed_all_processes.sql...');
    const seedSql = fs.readFileSync(path.join(__dirname, 'seed_all_processes.sql'), 'utf8');

    console.log('Executing Complete Process & Workflow Dummy Data Insertion...');
    await db.query(seedSql);
    console.log('Dummy data for ALL processes & workflows inserted successfully!');
  } catch (err) {
    console.error('Error inserting dummy data for processes:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  seedAllProcesses().then(() => {
    console.log('Complete database seeding finished!');
    process.exit(0);
  });
}

module.exports = seedAllProcesses;
