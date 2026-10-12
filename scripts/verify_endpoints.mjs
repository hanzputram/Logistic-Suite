async function verify() {
  const tests = [
    { name: 'App HTML', url: 'http://localhost:7070/' },
    { name: 'Shipments List', url: 'http://localhost:7070/api/shipments?limit=5' },
    { name: 'Shipment History', url: 'http://localhost:7070/api/shipments/history?limit=5' },
    { name: 'Dashboard Today', url: 'http://localhost:7070/api/dashboard/today?date=2026-10-01' },
    { name: 'Master SKU Items', url: 'http://localhost:7070/api/items?limit=5' },
    { name: 'Zones', url: 'http://localhost:7070/api/zones' },
    { name: 'Vehicles', url: 'http://localhost:7070/api/vehicles' },
    { name: 'KPI', url: 'http://localhost:7070/api/kpi' }
  ];

  for (const t of tests) {
    try {
      const res = await fetch(t.url);
      console.log(`[PASS] ${t.name} -> HTTP ${res.status}`);
    } catch (e) {
      console.error(`[FAIL] ${t.name} -> ${e.message}`);
    }
  }
}
verify();
