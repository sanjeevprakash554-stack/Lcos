const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function syncCredentials() {
  console.log('Synchronizing user credentials with bcrypt hashes...');
  const hash = bcrypt.hashSync('password123', 10);
  
  await db.query(`UPDATE users SET password_hash = $1`, [hash]);
  
  const res = await db.query(`SELECT id, username, role, emp_id FROM users ORDER BY id ASC`);
  console.log('\n--- Active Users in System ---');
  res.rows.forEach(u => {
    console.log(`[${u.role}] Username: ${u.username} | Emp ID: ${u.emp_id} | Password: password123`);
  });
  console.log('------------------------------\n');
}

syncCredentials()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error syncing credentials:', err);
    process.exit(1);
  });
