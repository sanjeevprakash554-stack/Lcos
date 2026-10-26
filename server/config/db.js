const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const embeddedDb = require('./embeddedDb');

let useEmbedded = process.env.DATABASE_URL ? false : (process.env.USE_EMBEDDED_DB === 'true');
let pgConnected = false;

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || '127.0.0.1',
      database: process.env.DB_NAME || 'postgres',
      password: process.env.DB_PASSWORD || '',
      port: parseInt(process.env.DB_PORT || '5434', 10),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  if (!useEmbedded) {
    console.warn('⚠️ [PostgreSQL idle notice]:', err.message);
  }
});

const db = {
  query: async (text, params) => {
    if (useEmbedded) {
      return embeddedDb.query(text, params);
    }
    try {
      return await pool.query(text, params);
    } catch (err) {
      if (!pgConnected) {
        useEmbedded = true;
        console.warn('⚠️ PostgreSQL query failed. Switching to embedded DB fallback.');
        return embeddedDb.query(text, params);
      }
      throw err;
    }
  },
  withTransaction: async (fn) => {
    if (useEmbedded) {
      return embeddedDb.withTransaction(fn);
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const tx = {
        query: (text, params) => client.query(text, params),
      };
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
  },
  pool,
  isUsingEmbedded: () => useEmbedded
};

// Export early to avoid circular dependency with migrations.js
module.exports = db;

// Auto-seed and initialize tables on PostgreSQL if brand new database
async function autoInitPostgres(client) {
  try {
    const checkRes = await client.query(`
      SELECT to_regclass('public.users') as users_table,
             to_regclass('public.subscription_plans') as plans_table
    `);

    const hasUsers = Boolean(checkRes.rows[0]?.users_table);
    const hasPlans = Boolean(checkRes.rows[0]?.plans_table);

    if (!hasUsers || !hasPlans) {
      console.log('⚡ [PostgreSQL Auto-Init] First-time setup detected. Initializing tables & seed data...');
      const schemaPath = path.join(__dirname, '../db/schema.sql');
      const seedPath = path.join(__dirname, '../db/seed.sql');

      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schemaSql);
        console.log('✅ [PostgreSQL Schema] Successfully created tables and foreign keys.');
      }

      if (fs.existsSync(seedPath)) {
        const seedSql = fs.readFileSync(seedPath, 'utf8');
        await client.query(seedSql);
        console.log('✅ [PostgreSQL Seed] Successfully seeded default company, users, branches, commodities.');
      }

      // Seed 38 Tamil Nadu districts and driver assignments
      try {
        const { seedAllDistricts } = require('../scripts/seed_all_districts');
        if (typeof seedAllDistricts === 'function') await seedAllDistricts();
      } catch (dErr) {
        console.warn('Note on districts seeding:', dErr.message);
      }

      try {
        const { seedAllDriversTrips } = require('../scripts/seed_drivers_trips');
        if (typeof seedAllDriversTrips === 'function') await seedAllDriversTrips();
      } catch (tErr) {
        console.warn('Note on driver trips seeding:', tErr.message);
      }
    }
  } catch (initErr) {
    console.error('⚠️ [PostgreSQL Auto-Init Notice]:', initErr.message);
  }
}

// Auto-detect PostgreSQL availability on boot
(async () => {
  if (useEmbedded) {
    console.log('=======================================================');
    console.log('✅ [Database Ready] Built-in Embedded SQLite Database Active!');
    console.log('📦 Database file: ' + embeddedDb.getDbFilePath());
    console.log('✨ All tables, trips, vehicles, drivers & stock ready!');
    console.log('=======================================================');
    embeddedDb.initEmbeddedDb();
    try {
      const { runMigrations } = require('../db/migrations');
      await runMigrations();
    } catch (mErr) {
      console.warn('⚠️ [Migration Notice]:', mErr.message);
    }
    return;
  }

  try {
    const client = await pool.connect();
    pgConnected = true;
    console.log('✅ [Database] PostgreSQL connected successfully.');

    // Auto-initialize schema & seed data if PostgreSQL database is empty
    await autoInitPostgres(client);

    // Ensure WhatsApp communication logs table exists in PostgreSQL
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_logs (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) REFERENCES companies(id) ON DELETE SET NULL,
        direction VARCHAR(20) NOT NULL,
        from_number VARCHAR(50),
        to_number VARCHAR(50),
        message_type VARCHAR(50) DEFAULT 'text',
        content TEXT,
        status VARCHAR(50) DEFAULT 'SENT',
        meta_message_id VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_time ON whatsapp_logs(created_at DESC);
    `);

    client.release();
  } catch (err) {
    useEmbedded = true;
    console.log('========================================================================');
    console.log('💡 [Database Notice] External PostgreSQL is not running or not found: ' + err.message);
    console.log('⚡ [Auto-Fallback] Activated Built-in Zero-Config Embedded Database!');
    console.log('📦 Embedded SQLite file: ' + embeddedDb.getDbFilePath());
    console.log('✨ All tables, trips, vehicles, drivers & stock are ready with zero setup!');
    console.log('========================================================================');
    embeddedDb.initEmbeddedDb();
  }

  // Run migrations across whichever database is currently active
  try {
    const { runMigrations } = require('../db/migrations');
    await runMigrations();
  } catch (mErr) {
    console.warn('⚠️ [Migration Notice]:', mErr.message);
  }
})();
