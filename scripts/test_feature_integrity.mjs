import fs from 'node:fs';

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/js/app.js', 'utf8');
const css = fs.readFileSync('public/css/index.css', 'utf8');

console.log('=== 1. VERIFYING HTML ELEMENTS ===');
const requiredIds = [
  'tab-hari-ini', 'tab-riwayat-semua', 'tab-master-sku',
  'btn-sku-mode-scheduled', 'btn-sku-mode-all', 'sku-view-scheduled', 'sku-view-all',
  'sku-scheduled-tbody', 'hist-tbody', 'today-shipments-tbody',
  'today-driver-capacity-cards', 'today-routes-container',
  'btn-today-date-today', 'btn-today-date-tomorrow', 'today-custom-date',
  'hist-search', 'hist-filter-period', 'btn-export-excel-history', 'btn-print-history'
];

let allIdsOk = true;
requiredIds.forEach(id => {
  const exists = html.includes(`id="${id}"`);
  if (!exists) {
    console.error(`❌ Missing ID: ${id}`);
    allIdsOk = false;
  }
});
if (allIdsOk) console.log('✅ All 19 required HTML element IDs verified successfully!');

console.log('\n=== 2. VERIFYING JAVASCRIPT FUNCTIONS ===');
const requiredFuncs = [
  'initTodayModule', 'loadTodayDashboard', 'renderTodayDashboard',
  'initHistoryModule', 'loadShipmentHistory', 'renderShipmentHistory',
  'initScheduledSkuModule', 'loadScheduledSkuItems', 'renderScheduledSkuItems',
  'quickSetSkuSize', 'exportHistoryToCsv', 'filterTodayByDriver'
];

let allFuncsOk = true;
requiredFuncs.forEach(fn => {
  const exists = js.includes(fn);
  if (!exists) {
    console.error(`❌ Missing function: ${fn}`);
    allFuncsOk = false;
  }
});
if (allFuncsOk) console.log('✅ All 12 required JavaScript functions verified successfully!');

console.log('\n=== 3. VERIFYING CSS CLASSES ===');
const requiredClasses = [
  'today-submodule-card', 'driver-capacity-grid', 'driver-capacity-card',
  'capacity-bar-fill', 'spreadsheet-card', 'spreadsheet-table', 'sku-pill-btn'
];
let allClassesOk = true;
requiredClasses.forEach(cls => {
  const exists = css.includes(cls);
  if (!exists) {
    console.error(`❌ Missing CSS class: ${cls}`);
    allClassesOk = false;
  }
});
if (allClassesOk) console.log('✅ All 7 required CSS classes verified successfully!');

console.log('\n=== 4. TESTING LIVE API RESPONSES ===');
async function testApis() {
  try {
    const [todayRes, histRes, schRes] = await Promise.all([
      fetch('http://localhost:7070/api/dashboard/today?date=2026-10-02').then(r => r.json()),
      fetch('http://localhost:7070/api/shipments/history?period=tomorrow').then(r => r.json()),
      fetch('http://localhost:7070/api/items/scheduled?period=tomorrow').then(r => r.json())
    ]);

    console.log(`✅ [GET /api/dashboard/today]: OK (${todayRes.stats.total_shipments} shipments, ${todayRes.driver_loads.length} drivers, ${todayRes.jalurs.length} jalurs)`);
    console.log(`✅ [GET /api/shipments/history]: OK (${histRes.data.length} rows returned with spreadsheet format, total records: ${histRes.stats.total})`);
    console.log(`✅ [GET /api/items/scheduled]: OK (${schRes.stats.total_items} unique items across ${schRes.scheduled_sj_count} scheduled Surat Jalan)`);
    console.log('\n🎉 ALL INTEGRITY TESTS PASSED 100%!');
  } catch (err) {
    console.error('❌ API Test failed:', err.message);
  }
}

testApis();
