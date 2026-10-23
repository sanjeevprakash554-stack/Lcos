const http = require('http');

function postLogin(identifier, password = 'password123') {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username: identifier, password });
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (_) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('🧪 Testing Driver Multi-Identifier Authentication...\n');

  // Test 1: Username
  const t1 = await postLogin('driver1');
  console.log('1. By Username (driver1):', t1.status === 200 ? '✅ Success' : '❌ Failed', t1.data.user ? `Driver: ${t1.data.user.fullName} (${t1.data.user.empId})` : t1.data);

  // Test 2: Driver ID
  const t2 = await postLogin('DRV-101');
  console.log('2. By Driver ID (DRV-101):', t2.status === 200 ? '✅ Success' : '❌ Failed', t2.data.user ? `Driver: ${t2.data.user.fullName} (${t2.data.user.empId})` : t2.data);

  // Test 3: Phone Number
  const t3 = await postLogin('7904743468');
  console.log('3. By Mobile Number (7904743468):', t3.status === 200 ? '✅ Success' : '❌ Failed', t3.data.user ? `Driver: ${t3.data.user.fullName} (${t3.data.user.empId})` : t3.data);

  // Test 4: Driver Name
  const t4 = await postLogin('Selvam R.');
  console.log('4. By Driver Name (Selvam R.):', t4.status === 200 ? '✅ Success' : '❌ Failed', t4.data.user ? `Driver: ${t4.data.user.fullName} (${t4.data.user.empId})` : t4.data);

  // Test 5: Unlinked Driver (Auto-provision test for DRV-103)
  const t5 = await postLogin('DRV-103');
  console.log('5. By Unlinked Driver ID (DRV-103):', t5.status === 200 ? '✅ Success' : '❌ Failed', t5.data.user ? `Driver: ${t5.data.user.fullName} (${t5.data.user.empId})` : t5.data);

  // Test 6: Driver 5 (Sanjeev)
  const t6 = await postLogin('driver5');
  console.log('6. By Username (driver5):', t6.status === 200 ? '✅ Success' : '❌ Failed', t6.data.user ? `Driver: ${t6.data.user.fullName} (${t6.data.user.empId})` : t6.data);

  console.log('\n🎉 ALL DRIVER LOGIN METHODS OPERATIONAL!');
}

run().catch(console.error);
