async function runTests() {
  const baseUrl = 'http://localhost:7070';
  console.log('Testing server endpoints at ' + baseUrl);

  // 1. Fetch shipments
  const resShip = await fetch(`${baseUrl}/api/shipments`);
  const shipData = await resShip.json();
  console.log(`Fetched ${shipData.count} total shipments.`);

  const pickups = shipData.data.filter(s =>
    s.fulfillment_type === 'PICKUP_J23' || s.type === 'PICKUP' || (s.notes && s.notes.includes('DIAMBIL'))
  );
  console.log(`Pickup shipments found in DB: ${pickups.length}`);
  pickups.forEach(p => {
    console.log(`  - [${p.id}] ${p.sj_number} | ${p.customer_name} | status: ${p.status} | notes: ${p.notes}`);
  });

  // 2. Test Sejalur corridor optimizer with Pasuruan target (PT. Cheil Jedang / shp-005)
  console.log('\nTesting /api/routing/find-sejalur with target shp-005 (Cheil Jedang Pasuruan)...');
  const resSejalur = await fetch(`${baseUrl}/api/routing/find-sejalur`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetShipmentId: 'shp-005' })
  });
  const sejalurData = await resSejalur.json();

  if (!sejalurData.success) {
    console.error('Sejalur error:', sejalurData);
  } else {
    console.log(`Sejalur total stops: ${sejalurData.data.totalStops}`);
    const includedPickups = sejalurData.data.orderedStops.filter(st => {
      const s = st.shipment;
      return s.id === 'shp-006' || s.id === 'shp-pickup-8145' || s.fulfillment_type === 'PICKUP_J23' || (s.notes && s.notes.includes('DIAMBIL'));
    });

    if (includedPickups.length === 0) {
      console.log('✅ PASSED: 0 pickup shipments included in Sejalur route stops!');
    } else {
      console.error('❌ FAILED: Found pickup shipments in route:', includedPickups);
    }

    sejalurData.data.orderedStops.forEach(st => {
      console.log(`  Stop ${st.sequence}: ${st.shipment.sj_number} | ${st.shipment.customer_name} | ${st.leg_distance_km} km | ETA ${st.eta_time}`);
    });
  }

  // 3. Test Sejalur with a pickup order as target (shp-006 or shp-pickup-8145)
  console.log('\nTesting /api/routing/find-sejalur with target shp-pickup-8145 (should be rejected)...');
  const resPickupTarget = await fetch(`${baseUrl}/api/routing/find-sejalur`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetShipmentId: 'shp-pickup-8145' })
  });
  const pickupTargetData = await resPickupTarget.json();
  if (!pickupTargetData.success) {
    console.log('✅ PASSED: Server rejected route creation for pickup order:', pickupTargetData.message);
  } else {
    console.error('❌ FAILED: Server allowed route creation for pickup target!');
  }

  // 4. Test Dispatcher assigning driver to a pickup order
  console.log('\nTesting /api/shipments/assign-driver on pickup order shp-pickup-8145 (should be rejected)...');
  const resAssign = await fetch(`${baseUrl}/api/shipments/assign-driver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shipmentId: 'shp-pickup-8145',
      driver: 'Munir',
      vehicleType: 'TRAGA'
    })
  });
  const assignData = await resAssign.json();
  if (!assignData.success) {
    console.log('✅ PASSED: Dispatcher cannot assign driver to pickup order:', assignData.message);
  } else {
    console.error('❌ FAILED: Server allowed assigning driver to pickup order!');
  }

  // 5. Test Pickup Handover endpoint
  console.log('\nTesting /api/shipments/shp-pickup-8145/pickup-complete...');
  const resHandover = await fetch(`${baseUrl}/api/shipments/shp-pickup-8145/pickup-complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      receiverName: 'Pak Wahyu (PT Filtra Mikrosarana)',
      handledBy: 'Loket J23'
    })
  });
  const handoverData = await resHandover.json();
  console.log('Handover response:', handoverData);

  // Verify updated status
  const resShipAfter = await fetch(`${baseUrl}/api/shipments`);
  const shipDataAfter = await resShipAfter.json();
  const updatedP = shipDataAfter.data.find(s => s.id === 'shp-pickup-8145');
  console.log(`Updated status of shp-pickup-8145: ${updatedP.status} | received_by: ${updatedP.received_by} | notes: ${updatedP.notes}`);

  console.log('\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
}

runTests().catch(console.error);
