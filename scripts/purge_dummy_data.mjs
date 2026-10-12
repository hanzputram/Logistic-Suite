import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'data', 'ats_logistics.db');
const db = new DatabaseSync(dbPath);

console.log('=== PURGING ALL DUMMY DATA FROM ATS LOGISTICS DB ===\n');

// 1. Before counts
const beforeShipments = db.prepare('SELECT count(*) as c FROM shipments').get().c;
const beforeRealShipments = db.prepare('SELECT count(*) as c FROM shipments WHERE accurate_id IS NOT NULL').get().c;
const beforeDummyShipments = db.prepare("SELECT count(*) as c FROM shipments WHERE accurate_id IS NULL OR id LIKE 'shp-%'").get().c;
const beforeItems = db.prepare('SELECT count(*) as c FROM items').get().c;
const beforeRealItems = db.prepare('SELECT count(*) as c FROM items WHERE accurate_item_id IS NOT NULL').get().c;
const beforeDummyItems = db.prepare('SELECT count(*) as c FROM items WHERE accurate_item_id IS NULL').get().c;
const beforeLines = db.prepare('SELECT count(*) as c FROM shipment_items').get().c;
const beforeRealLines = db.prepare("SELECT count(*) as c FROM shipment_items WHERE shipment_id LIKE 'acc-do-%'").get().c;

console.log(`BEFORE CLEANUP:`);
console.log(`- Shipments: ${beforeShipments} total (${beforeRealShipments} Real Accurate DOs, ${beforeDummyShipments} Dummy/Manual)`);
console.log(`- Master Items: ${beforeItems} total (${beforeRealItems} Real Accurate Items, ${beforeDummyItems} Dummy)`);
console.log(`- Line Items: ${beforeLines} total (${beforeRealLines} Real Accurate Lines, ${beforeLines - beforeRealLines} Dummy)`);

// 2. Perform deletions
console.log('\nPurging dummy stops...');
db.exec("DELETE FROM stops WHERE shipment_id LIKE 'shp-%' OR shipment_id NOT LIKE 'acc-do-%';");

console.log('Purging empty/dummy trips...');
db.exec("DELETE FROM trips WHERE id NOT IN (SELECT DISTINCT trip_id FROM stops);");

console.log('Purging dummy shipment line items...');
db.exec("DELETE FROM shipment_items WHERE shipment_id LIKE 'shp-%' OR shipment_id NOT LIKE 'acc-do-%';");

console.log('Purging dummy shipments...');
db.exec("DELETE FROM shipments WHERE accurate_id IS NULL OR id LIKE 'shp-%';");

console.log('Purging dummy master items (without accurate_item_id)...');
db.exec("DELETE FROM items WHERE accurate_item_id IS NULL;");

// 3. Recalculate muat for all remaining real shipments
console.log('Recalculating muat recommendations for all real Accurate shipments...');
const remainingShipments = db.prepare('SELECT id FROM shipments').all();

const updateStmt = db.prepare(`
  UPDATE shipments SET
    muat_category = ?,
    required_vehicle_type = CASE WHEN assigned_vehicle_type IS NOT NULL THEN required_vehicle_type ELSE ? END,
    muat_recommendation = ?,
    muat_reason = ?
  WHERE id = ?
`);

for (const s of remainingShipments) {
  const lineItems = db.prepare(`
    SELECT si.*, COALESCE(i.size_class, 'KECIL') as current_size_class, i.name as master_name
    FROM shipment_items si
    LEFT JOIN items i ON si.item_no = i.sku OR (si.accurate_item_id IS NOT NULL AND si.accurate_item_id = i.accurate_item_id)
    WHERE si.shipment_id = ?
  `).all(s.id);

  if (!lineItems || lineItems.length === 0) continue;

  const besarItems = lineItems.filter(it => it.current_size_class === 'BESAR');
  const sedangItems = lineItems.filter(it => it.current_size_class === 'SEDANG');

  let muatCategory = 'KECIL';
  let requiredVehicle = 'MOTOR';
  let recommendation = 'MUAT MOTOR';
  let reason = 'Semua produk berukuran kecil, aman untuk pengiriman motor.';

  if (besarItems.length > 0) {
    muatCategory = 'BESAR';
    const totalQtyBesar = besarItems.reduce((sum, it) => sum + (it.quantity || 1), 0);
    if (totalQtyBesar >= 3 || lineItems.length >= 8) {
      requiredVehicle = 'TRAGA';
    } else {
      requiredVehicle = 'CARRY';
    }
    recommendation = 'WAJIB MOBIL';
    const sampleNames = besarItems.slice(0, 2).map(it => `${it.item_name || it.item_no} (${it.quantity} ${it.unit_name || 'PCS'})`).join(', ');
    reason = `Wajib Mobil — Terdapat barang besar: ${sampleNames}${besarItems.length > 2 ? ' (+ ' + (besarItems.length - 2) + ' lainnya)' : ''}`;
  } else if (sedangItems.length > 0) {
    muatCategory = 'SEDANG';
    const totalQtySedang = sedangItems.reduce((sum, it) => sum + (it.quantity || 1), 0);
    if (totalQtySedang > 4) {
      requiredVehicle = 'CARRY';
      recommendation = 'SARAN MOBIL (QTY SEDANG BANYAK)';
      reason = `Saran Mobil — Produk sedang dengan kuantitas banyak (${totalQtySedang} pcs)`;
    } else {
      requiredVehicle = 'MOTOR';
      recommendation = 'EVALUASI / MOTOR (BISA DIAKALI)';
      const sampleNames = sedangItems.slice(0, 2).map(it => `${it.item_name || it.item_no}`).join(', ');
      reason = `Bisa Diakali Motor jika Qty sedikit — Barang sedang: ${sampleNames}`;
    }
  }

  updateStmt.run(muatCategory, requiredVehicle, recommendation, reason, s.id);
}

// 4. After counts
const afterShipments = db.prepare('SELECT count(*) as c FROM shipments').get().c;
const afterItems = db.prepare('SELECT count(*) as c FROM items').get().c;
const afterLines = db.prepare('SELECT count(*) as c FROM shipment_items').get().c;

console.log(`\nAFTER CLEANUP:`);
console.log(`- Shipments: ${afterShipments} (100% Real Accurate DOs)`);
console.log(`- Master Items: ${afterItems} (100% Real Accurate Items)`);
console.log(`- Line Items: ${afterLines} (100% Real Accurate Line Items)`);

// 5. Verification sample
console.log('\nSample Real Active Shipments in Database:');
const sample = db.prepare(`
  SELECT id, sj_number, customer_name, plan_date, status, muat_category, required_vehicle_type 
  FROM shipments 
  ORDER BY plan_date DESC 
  LIMIT 5
`).all();
console.table(sample);

console.log('\n=== DUMMY DATA PURGED SUCCESSFULLY ===');
