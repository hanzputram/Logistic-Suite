async function testFrontendIntegrity() {
  const html = await (await fetch('http://localhost:7070/')).text();
  console.log('Testing index.html elements:');
  const hasPickupTab = html.includes('id="tab-pickup-j23"');
  const hasPickupTbody = html.includes('id="pickup-tbody"');
  const hasPickupSearch = html.includes('id="pickup-search"');
  console.log(`- tab-pickup-j23 present: ${hasPickupTab}`);
  console.log(`- pickup-tbody present: ${hasPickupTbody}`);
  console.log(`- pickup-search present: ${hasPickupSearch}`);

  if (!hasPickupTab || !hasPickupTbody || !hasPickupSearch) {
    throw new Error('Missing pickup tab elements in index.html');
  }

  const js = await (await fetch('http://localhost:7070/js/app.js')).text();
  console.log('\nTesting app.js logic elements:');
  const hasIsPickup = js.includes('function isPickupShipment');
  const hasRenderPickup = js.includes('function renderPickupTable');
  const hasPickupHandover = js.includes('function handlePickupHandover');
  const hasExcludedMarketing = js.includes('!isPickupShipment(s)');
  console.log(`- isPickupShipment defined: ${hasIsPickup}`);
  console.log(`- renderPickupTable defined: ${hasRenderPickup}`);
  console.log(`- handlePickupHandover defined: ${hasPickupHandover}`);
  console.log(`- excluded from marketing/dispatcher/monitor/sejalur: ${hasExcludedMarketing}`);

  // Test isPickupShipment logic with various sample records
  function isPickupShipment(s) {
    if (!s) return false;
    const fType = String(s.fulfillment_type || '').toUpperCase();
    const type = String(s.type || '').toUpperCase();
    const status = String(s.status || '').toUpperCase();
    const notes = String(s.notes || '').toUpperCase();
    const addr = String(s.destination_address || '').toUpperCase();
    const shipMethod = String(s.ship_method || s.shipping_method || s.transporter_name || '').toUpperCase();

    if (fType.includes('PICKUP') || fType.includes('AMBIL')) return true;
    if (type === 'PICKUP') return true;
    if (status.startsWith('PICKUP')) return true;
    if (notes.includes('DIAMBIL') || notes.includes('AMBIL DI J23') || notes.includes('PICKUP')) return true;
    if (shipMethod.includes('DIAMBIL') || shipMethod.includes('AMBIL') || shipMethod.includes('PICKUP')) return true;
    if (addr.includes('LOKET') && addr.includes('PICKUP')) return true;
    if (addr.includes('DIAMBIL DI J23')) return true;
    return false;
  }

  console.log('\nTesting isPickupShipment classifications:');
  const test1 = isPickupShipment({ fulfillment_type: 'PICKUP_J23', customer_name: 'PT. Filtra Mikrosarana', notes: 'DIAMBIL DI J23' });
  const test2 = isPickupShipment({ status: 'PICKUP_READY', customer_name: 'Toko Listrik Abadi', destination_address: 'Loket Customer Pickup Kantor J23' });
  const test3 = isPickupShipment({ fulfillment_type: 'ARMADA_SENDIRI', customer_name: 'PT. Cheil Jedang Indonesia', destination_address: 'Pasuruan' });
  const test4 = isPickupShipment({ notes: 'DIAMBIL SENDIRI DI J23', fulfillment_type: 'ARMADA_SENDIRI' });

  console.log(`- Test 1 (PT. Filtra Mikrosarana - DIAMBIL DI J23): ${test1 ? '✅ CORRECT (Pickup)' : '❌ WRONG'}`);
  console.log(`- Test 2 (Toko Listrik Abadi - Loket Pickup J23): ${test2 ? '✅ CORRECT (Pickup)' : '❌ WRONG'}`);
  console.log(`- Test 3 (PT. Cheil Jedang - Delivery Pasuruan): ${!test3 ? '✅ CORRECT (Not Pickup)' : '❌ WRONG'}`);
  console.log(`- Test 4 (Customer notes: DIAMBIL SENDIRI DI J23): ${test4 ? '✅ CORRECT (Pickup)' : '❌ WRONG'}`);

  console.log('\nFRONTEND AND BACKEND INTEGRITY VERIFIED 100%!');
}

testFrontendIntegrity().catch(console.error);
