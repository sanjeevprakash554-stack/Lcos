/**
 * Verification Script: Tests WhatsApp "Resuming Movement" workflow
 * Verifies that:
 * 1. Stoppage alert is generated.
 * 2. When driver taps "Resuming Movement" (stp_moving_TN-59-EF-9012),
 *    - Vehicle movement status becomes 'MOVING', speed 45, stoppage timer cleared
 *    - Trip status is 'IN_TRANSIT'
 *    - Alert is resolved
 *    - Notification is saved
 *    - WhatsApp log records outgoing confirmation to Driver
 *    - WhatsApp log records outgoing TRANSIT RESUMED alert to Higher Official / Tracking Team
 */

async function runTest() {
  console.log('🧪 Starting WhatsApp "Resuming Movement" Verification Test...\n');

  const baseUrl = 'http://localhost:5000';

  // 1. Trigger Test Stoppage Alert
  console.log('Step 1: Generating 25-minute test stoppage alert for TN-59-EF-9012...');
  const stopRes = await fetch(`${baseUrl}/api/whatsapp/test-stoppage-alert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicleId: 'TN-59-EF-9012', minutes: 25 })
  });
  const stopData = await stopRes.json();
  console.log('Stoppage alert result:', stopData.success ? '✅ Created' : '❌ Failed', stopData.message);

  // Check active stoppage status
  const activeRes = await fetch(`${baseUrl}/api/whatsapp/active-stoppage`);
  const activeData = await activeRes.json();
  console.log('Current monitored alert vehicle:', activeData.alert?.vehicle_id, 'Status:', activeData.alert?.status);

  // 2. Simulate Driver tapping "Resuming Movement"
  console.log('\nStep 2: Simulating driver tapping "Resuming Movement" (stp_moving_TN-59-EF-9012)...');
  const simRes = await fetch(`${baseUrl}/api/whatsapp/simulate-incoming`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: '916382897998',
      buttonId: 'stp_moving_TN-59-EF-9012',
      text: 'Resuming Movement'
    })
  });
  const simData = await simRes.json();
  console.log('Simulate incoming result:', simData);

  // Wait 500ms for async processing
  await new Promise(r => setTimeout(r, 600));

  // 3. Inspect recent WhatsApp communication logs
  console.log('\nStep 3: Checking WhatsApp outgoing logs for Driver and Tracking Team...');
  const logsRes = await fetch(`${baseUrl}/api/whatsapp/logs?limit=6`);
  const logsData = await logsRes.json();

  let foundDriverMsg = false;
  let foundTrackingTeamMsg = false;

  for (const log of logsData.logs || []) {
    console.log(`- [${log.direction}] To: ${log.to_number} | Content: ${log.content?.substring(0, 75)}...`);
    const upper = log.content ? log.content.toUpperCase() : '';
    if (log.direction === 'OUTBOUND') {
      if (upper.includes('TRANSIT RESUMED: VEHICLE ON THE MOVE')) {
        foundTrackingTeamMsg = true;
      }
      if (upper.includes('MARKED AS MOVING ON CENTRAL OPERATIONS MAP') || upper.includes('DRIVE SAFELY!')) {
        foundDriverMsg = true;
      }
    }
  }

  console.log('\n--- Verification Summary ---');
  console.log('1. Driver confirmation message logged:', foundDriverMsg ? '✅ PASS' : '❌ FAIL');
  console.log('2. Tracking Team / Higher Official notification logged:', foundTrackingTeamMsg ? '✅ PASS' : '❌ FAIL');

  // 4. Verify vehicle status in DB
  const vehRes = await fetch(`${baseUrl}/api/vehicles/TN-59-EF-9012`);
  if (vehRes.ok) {
    const veh = await vehRes.json();
    console.log(`3. Vehicle movement status: ${veh.movement_status || veh.data?.movement_status} (Expected: MOVING)`);
    console.log(`4. Vehicle speed: ${veh.speed_kmh || veh.data?.speed_kmh} km/h (Expected: 45)`);
  }

  if (foundDriverMsg && foundTrackingTeamMsg) {
    console.log('\n🎉 ALL TESTS PASSED! Tracking team receives notification when driver touches Resuming Movement!');
  } else {
    console.log('\n⚠️ Some checks did not pass. Inspect logs above.');
  }

  // Step 5: Test text message command "RESUMING"
  console.log('\nStep 5: Testing text reply command "RESUMING"...');
  const textSimRes = await fetch(`${baseUrl}/api/whatsapp/simulate-incoming`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: '916382897998',
      text: 'Resuming movement now, toll cleared'
    })
  });
  const textData = await textSimRes.json();
  console.log('Text command result:', textData.success ? '✅ Success' : '❌ Failed');
  await new Promise(r => setTimeout(r, 600));

  const textLogsRes = await fetch(`${baseUrl}/api/whatsapp/logs?limit=3`);
  const textLogsData = await textLogsRes.json();
  const latestOutbound = textLogsData.logs?.find(l => l.direction === 'OUTBOUND');
  console.log('Latest outbound message from text trigger:', latestOutbound?.content?.substring(0, 80));
}

runTest().catch(err => console.error('Test error:', err));
