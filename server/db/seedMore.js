const fs = require('fs');
const path = require('path');
const db = require('../config/db');

async function seedMore() {
  try {
    console.log('Reading seed_extended.sql...');
    const seedSql = fs.readFileSync(path.join(__dirname, 'seed_extended.sql'), 'utf8');

    console.log('Executing Extended PostgreSQL Seed Data Insertion...');
    await db.query(seedSql);
    console.log('Extended dummy data inserted successfully!');
  } catch (err) {
    console.error('Error inserting extended dummy data:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  seedMore().then(() => {
    console.log('Extended database seeding completed!');
    process.exit(0);
  });
}

module.exports = seedMore;
