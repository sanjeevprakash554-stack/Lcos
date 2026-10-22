const { Pool } = require('pg');
const embeddedDb = require('./embeddedDb');

let useEmbedded = process.env.USE_EMBEDDED_DB === 'true';
let pgConnected = false;

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT || '5434', 10),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  if (!useEmbedded) {
    console.warn('⚠️ [PostgreSQL idle notice]:', err.message);
  }
});

// Auto-detect PostgreSQL availability on boot
(async () => {
  if (useEmbedded) {
    console.log('=======================================================');
    console.log('✅ [Database Ready] Built-in Embedded SQLite Database Active!');
    console.log('📦 Database file: server/db/lcos_embedded.sqlite');
    console.log('✨ All tables, trips, vehicles, drivers & stock ready!');
    console.log('=======================================================');
    embeddedDb.initEmbeddedDb();
    return;
  }

  try {
    const client = await pool.connect();
    client.release();
    pgConnected = true;
    console.log('✅ [Database] PostgreSQL connected successfully on port ' + (process.env.DB_PORT || 5434));

    // Ensure WhatsApp communication logs table exists in PostgreSQL
    await pool.query(`
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
  } catch (err) {
    useEmbedded = true;
    console.log('========================================================================');
    console.log('💡 [Database Notice] External PostgreSQL is not running or not found.');
    console.log('⚡ [Auto-Fallback] Activated Built-in Zero-Config Embedded Database!');
    console.log('📦 Embedded SQLite file: server/db/lcos_embedded.sqlite');
    console.log('✨ All tables, trips, vehicles, drivers & stock are ready with zero setup!');
    console.log('========================================================================');
    embeddedDb.initEmbeddedDb();
  }
})();

module.exports = {
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
  pool,
  isUsingEmbedded: () => useEmbedded
};
