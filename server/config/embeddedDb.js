const fs = require('fs');
const path = require('path');

let sqlite = null;
function getDbFilePath() {
  return process.env.LCOS_DB_PATH || path.join(__dirname, '../db/lcos_embedded.sqlite');
}

function closeEmbeddedDb() {
  if (sqlite) {
    try { sqlite.close(); } catch (_) {}
    sqlite = null;
  }
}

function initEmbeddedDb() {
  if (sqlite) return sqlite;

  try {
    const { DatabaseSync } = require('node:sqlite');
    const dbFilePath = getDbFilePath();
    const isNew = !fs.existsSync(dbFilePath);

    sqlite = new DatabaseSync(dbFilePath);
    sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");

    // Register PostgreSQL compatibility functions
    sqlite.function('now', () => new Date().toISOString());
    sqlite.function('greatest', (a, b) => Math.max(Number(a), Number(b)));
    sqlite.function('least', (a, b) => Math.min(Number(a), Number(b)));
    sqlite.function('coalesce', (...args) => {
      for (const arg of args) {
        if (arg !== null && arg !== undefined) return arg;
      }
      return null;
    });

    if (isNew) {
      console.log('📦 [Embedded DB] Creating schema and seeding initial logistics data...');

      const schemaPath = path.join(__dirname, '../db/schema.sql');
      const seedPath = path.join(__dirname, '../db/seed.sql');

      if (fs.existsSync(schemaPath)) {
        let schema = fs.readFileSync(schemaPath, 'utf8')
          .replace(/::[a-zA-Z0-9_]+/gi, '')
          .replace(/TIMESTAMPTZ\s+DEFAULT\s+NOW\(\)/gi, "TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
          .replace(/TIMESTAMPTZ/gi, 'TEXT')
          .replace(/JSONB/gi, 'TEXT')
          .replace(/ALTER\s+TABLE\s+[\s\S]*?;/gi, '')
          .replace(/BOOLEAN\s+DEFAULT\s+FALSE/gi, 'INTEGER DEFAULT 0')
          .replace(/BOOLEAN\s+DEFAULT\s+TRUE/gi, 'INTEGER DEFAULT 1')
          .replace(/BOOLEAN/gi, 'INTEGER')
          .replace(/(BIGSERIAL|SERIAL)\s+PRIMARY\s+KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');

        sqlite.exec(schema);
      }

      if (fs.existsSync(seedPath)) {
        let seed = fs.readFileSync(seedPath, 'utf8')
          .replace(/::[a-zA-Z0-9_]+/gi, '')
          .replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s*hours?'/gi, "datetime('now', '-$1 hours')")
          .replace(/NOW\(\)\s*\+\s*INTERVAL\s*'(\d+)\s*hours?'/gi, "datetime('now', '+$1 hours')")
          .replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s*days?'/gi, "datetime('now', '-$1 days')")
          .replace(/NOW\(\)\s*\+\s*INTERVAL\s*'(\d+)\s*days?'/gi, "datetime('now', '+$1 days')")
          .replace(/NOW\(\)\s*\+\s*INTERVAL\s*'(\d+)\s*years?'/gi, "datetime('now', '+$1 years')")
          .replace(/NOW\(\)/gi, "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
          .replace(/\btrue\b/g, '1')
          .replace(/\bfalse\b/g, '0');

        sqlite.exec(seed);
      }

      console.log('✅ [Embedded DB] Logistics database seeded successfully in server/db/lcos_embedded.sqlite!');
    }

    // Ensure WhatsApp communication logs table exists in embedded SQLite
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_logs (
        id TEXT PRIMARY KEY,
        company_id TEXT DEFAULT 'COMP-001',
        direction TEXT NOT NULL,
        from_number TEXT,
        to_number TEXT,
        message_type TEXT DEFAULT 'text',
        content TEXT,
        status TEXT DEFAULT 'SENT',
        meta_message_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_time ON whatsapp_logs(created_at DESC);
    `);

    return sqlite;
  } catch (err) {
    console.error('⚠️ [Embedded DB Error]:', err.message);
    throw err;
  }
}

async function query(sqlText, params = []) {
  const db = initEmbeddedDb();

  let sql = sqlText
    .replace(/::[a-zA-Z0-9_]+/gi, '')
    .replace(/\$(\d+)/g, '?$1')
    .replace(/(?:NOW\(\)|datetime\('now'\))\s*-\s*INTERVAL\s*'(\d+)\s*hours?'/gi, "datetime('now', '-$1 hours')")
    .replace(/(?:NOW\(\)|datetime\('now'\))\s*\+\s*INTERVAL\s*'(\d+)\s*hours?'/gi, "datetime('now', '+$1 hours')")
    .replace(/(?:NOW\(\)|datetime\('now'\))\s*-\s*INTERVAL\s*'(\d+)\s*days?'/gi, "datetime('now', '-$1 days')")
    .replace(/(?:NOW\(\)|datetime\('now'\))\s*\+\s*INTERVAL\s*'(\d+)\s*days?'/gi, "datetime('now', '+$1 days')")
    .replace(/(?:NOW\(\)|datetime\('now'\))\s*-\s*INTERVAL\s*'(\d+)\s*months?'/gi, "datetime('now', '-$1 months')")
    .replace(/(?:NOW\(\)|datetime\('now'\))\s*\+\s*INTERVAL\s*'(\d+)\s*months?'/gi, "datetime('now', '+$1 months')")
    .replace(/(?:NOW\(\)|datetime\('now'\))\s*-\s*INTERVAL\s*'(\d+)\s*years?'/gi, "datetime('now', '-$1 years')")
    .replace(/(?:NOW\(\)|datetime\('now'\))\s*\+\s*INTERVAL\s*'(\d+)\s*years?'/gi, "datetime('now', '+$1 years')")
    .replace(/(?:NOW\(\)|datetime\('now'\))\s*\+\s*INTERVAL\s*'1\s*months?'\s*\*\s*\??(\d+)/gi, "datetime('now', '+' || ?$1 || ' months')")
    .replace(/(?:NOW\(\)|datetime\('now'\))\s*-\s*v\.stoppage_start_time\s*>=\s*INTERVAL\s*'1 minute'\s*\*\s*\?(\d+)/gi, "(strftime('%s', 'now') - strftime('%s', v.stoppage_start_time)) >= (?$1 * 60)")
    .replace(/\bNOW\(\)/gi, "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
    .replace(/\btrue\b/gi, '1')
    .replace(/\bfalse\b/gi, '0')
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/ORDER BY \(CASE WHEN u\.company_id = 'COMP-001' THEN 1 ELSE 2 END\)/gi, "ORDER BY (CASE WHEN u.company_id = 'COMP-001' THEN 1 ELSE 2 END)")
    .trim()
    .replace(/;+$/, '');

  const isSelect = /^\s*(SELECT|WITH|PRAGMA)/i.test(sql) || /RETURNING/i.test(sql);

  const sanitizedParams = (params || []).map(p => {
    if (p instanceof Date) return p.toISOString();
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p === undefined) return null;
    return p;
  });

  try {
    const stmt = db.prepare(sql);
    if (isSelect) {
      const rawRows = stmt.all(...sanitizedParams);
      const rows = rawRows.map(r => {
        const row = { ...r };
        for (const k of Object.keys(row)) {
          if (/^count\(\*\)$/i.test(k) && row.count === undefined) {
            row.count = row[k];
          }
        }
        return row;
      });
      return { rows, rowCount: rows.length };
    } else {
      const info = stmt.run(...sanitizedParams);
      return { rows: [], rowCount: info.changes };
    }
  } catch (err) {
    console.error('⚠️ [Embedded DB Query Error]:', err.message, '\nSQL:', sql);
    throw err;
  }
}


async function withTransaction(fn) {
  const db = initEmbeddedDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const tx = {
      query: (sql, params) => query(sql, params),
    };
    const result = await fn(tx);
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch (_) {}
    throw err;
  }
}

module.exports = {
  initEmbeddedDb,
  query,
  withTransaction,
  getDbFilePath,
  closeEmbeddedDb,
};

