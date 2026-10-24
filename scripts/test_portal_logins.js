const http = require('http');

function postJSON(path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 LCOS 3-Portal Login Credentials Verification Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function check(name, testFn) {
    process.stdout.write(`• ${name}... `);
    try {
      await testFn();
      console.log('✅ PASSED');
      passed++;
    } catch (err) {
      console.log(`❌ FAILED: ${err.message}`);
      failed++;
    }
  }

  // Test 1: Tracking Team Portal Login
  await check('Tracking Team Portal (username: tracking, password: password123)', async () => {
    const res = await postJSON('/api/auth/login', {
      username: 'tracking',
      password: 'password123',
      role: 'tracking_team',
    });
    if (res.status !== 200 || !res.data.success || !res.data.token) {
      throw new Error(`Expected 200 with token, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
    if (res.data.user.role !== 'TRACKING_TEAM') {
      throw new Error(`Expected role TRACKING_TEAM, got ${res.data.user.role}`);
    }
  });

  // Test 2: Tracking Team with Employee ID
  await check('Tracking Team Portal with Emp ID (username: EMP-101, password: password123)', async () => {
    const res = await postJSON('/api/auth/login', {
      username: 'EMP-101',
      password: 'password123',
      role: 'tracking_team',
    });
    if (res.status !== 200 || !res.data.success) {
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
  });

  // Test 3: Tracking Team with Wrong Password
  await check('Tracking Team with Invalid Password should be rejected', async () => {
    const res = await postJSON('/api/auth/login', {
      username: 'tracking',
      password: 'wrongpassword',
      role: 'tracking_team',
    });
    if (res.status !== 401 || res.data.success) {
      throw new Error(`Expected 401 unauthorized, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
  });

  // Test 4: Branch Manager Portal Login
  await check('Branch Manager Portal (username: manager, password: password123)', async () => {
    const res = await postJSON('/api/auth/login', {
      username: 'manager',
      password: 'password123',
      role: 'branch_manager',
    });
    if (res.status !== 200 || !res.data.success || !res.data.token) {
      throw new Error(`Expected 200 with token, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
    if (res.data.user.role !== 'BRANCH_MANAGER') {
      throw new Error(`Expected role BRANCH_MANAGER, got ${res.data.user.role}`);
    }
  });

  // Test 5: Branch Manager with Emp ID
  await check('Branch Manager with Emp ID (username: MGR-101, password: password123)', async () => {
    const res = await postJSON('/api/auth/login', {
      username: 'MGR-101',
      password: 'password123',
      role: 'branch_manager',
    });
    if (res.status !== 200 || !res.data.success) {
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
  });

  // Test 6: 2 Owners Executive Portal Login
  await check('2 Owners Executive Portal (username: owner, password: password123)', async () => {
    const res = await postJSON('/api/auth/login', {
      username: 'owner',
      password: 'password123',
      role: 'owner',
    });
    if (res.status !== 200 || !res.data.success || !res.data.token) {
      throw new Error(`Expected 200 with token, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
    if (res.data.user.role !== 'OWNER') {
      throw new Error(`Expected role OWNER, got ${res.data.user.role}`);
    }
  });

  // Test 7: Role Mismatch (Tracking Team user attempting to enter Branch Manager portal)
  await check('Role Mismatch Check (Tracking user entering Manager portal -> 403 Forbidden)', async () => {
    const res = await postJSON('/api/auth/login', {
      username: 'tracking',
      password: 'password123',
      role: 'branch_manager',
    });
    if (res.status !== 403) {
      throw new Error(`Expected 403 Forbidden for role mismatch, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
  });

  // Test 8: Super Admin can access portals
  await check('Super Admin Master Access (username: superadmin, password: password123)', async () => {
    const res = await postJSON('/api/auth/login', {
      username: 'superadmin',
      password: 'password123',
      role: 'owner',
    });
    if (res.status !== 200 || !res.data.success) {
      throw new Error(`Expected 200 for superadmin, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
  });

  // Test 9: Driver Tracking without password remains operational
  await check('Driver Tracking authentication backwards compatibility (DRV-101)', async () => {
    const res = await postJSON('/api/auth/login', {
      driverId: 'DRV-101',
      phone: '919884012345',
      role: 'driver',
    });
    if (res.status !== 200 || !res.data.success || !res.data.user.driverId) {
      throw new Error(`Expected 200 driver token, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
  });

  console.log('\n====================================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error('Test execution error:', e);
  process.exit(1);
});
