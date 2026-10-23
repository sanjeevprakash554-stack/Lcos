/**
 * Tunnel Testing Runner for LCOS (Logistics Operations Control System)
 * Starts the application server using an isolated temporary SQLite database and
 * an ephemeral JWT secret, while warning the operator about public exposure of demo accounts.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// 1. Generate an isolated ephemeral database copy so dev data is unaffected
const devDbPath = path.join(__dirname, '../server/db/lcos_embedded.sqlite');
const tempDbPath = path.join(os.tmpdir(), `lcos_tunnel_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.sqlite`);

if (fs.existsSync(devDbPath)) {
  fs.copyFileSync(devDbPath, tempDbPath);
}

// 2. Configure environment
process.env.LCOS_DB_PATH = tempDbPath;
process.env.USE_EMBEDDED_DB = 'true';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
if (!process.env.PORT) {
  process.env.PORT = '5000';
}

console.log('================================================================');
console.log('  ⚠️   LCOS TUNNEL TESTING MODE ACTIVE   ⚠️');
console.log('================================================================');
console.log(' [SECURITY WARNING]:');
console.log(' 1. Exposing this local server via cloudflared / ngrok exposes');
console.log('    the ENTIRE LCOS application, including legacy endpoints.');
console.log(' 2. Demo credentials (e.g. driver1 / driver123 and role cards) are');
console.log('    ACTIVE. They MUST be removed or disabled before real deployment.');
console.log(' 3. Ephemeral random JWT_SECRET generated for this session.');
console.log(` 4. Running isolated database at: ${tempDbPath}`);
console.log('================================================================\n');

// 3. Register cleanup on process exit
function cleanup() {
  try {
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
      console.log(`\n[Tunnel Test] Cleaned up temporary database: ${tempDbPath}`);
    }
  } catch (_) {}
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

// 4. Start the server
require('../server/index');
