const db = require('../server/config/db');

async function test() {
  console.log('1. Triggering Stoppage Alert...');
  const res1 = await fetch('http://localhost:5000/api/whatsapp/test-stoppage-alert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicleId: 'TN-59-EF-9012', minutes: 25 })
  });
  const d1 = await res1.json();
  console.log('Alert created:', d1.success, d1.alert?.id, d1.alert?.type);

  console.log('2. Simulating incoming Meta webhook with button text Traffic / Toll Delay...');
  const res2 = await fetch('http://localhost:5000/api/whatsapp/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: 'WABA',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            messages: [{
              from: '916382897998',
              id: 'msg_meta_button_' + Date.now(),
              type: 'button',
              button: { text: 'Traffic / Toll Delay', payload: 'Traffic / Toll Delay' }
            }]
          },
          field: 'messages'
        }]
      }]
    })
  });
  console.log('Webhook status:', res2.status);

  console.log('3. Checking DB alert status...');
  const check = await db.query("SELECT id, type, message, status FROM alerts WHERE vehicle_id = 'TN-59-EF-9012' AND status = 'Active'");
  console.log('Updated alert in DB:', check.rows[0]);
  process.exit(0);
}

test().catch(e => {
  console.error(e);
  process.exit(1);
});
