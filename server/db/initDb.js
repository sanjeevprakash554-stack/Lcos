const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { runMigrations } = require('./migrations');

async function initDb() {
  try {
    console.log('Reading schema.sql and seed.sql...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');

    console.log('Executing PostgreSQL Schema initialization...');
    await db.query(schemaSql);
    console.log('Schema created successfully.');

    console.log('Executing PostgreSQL Seed data initialization...');
    await db.query(seedSql);
    console.log('Database seeded successfully.');

    console.log('Executing Schema Migrations & Branch Coordinate Backfills...');
    await runMigrations();
    console.log('Migrations completed successfully.');

  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  initDb().then(() => {
    console.log('Database setup complete!');
    process.exit(0);
  });
}

module.exports = initDb;
