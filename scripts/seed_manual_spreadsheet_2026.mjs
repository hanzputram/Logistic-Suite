import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'data', 'ats_logistics.db');
const db = new DatabaseSync(dbPath);

console.log('[Seed] Ensuring index_no column in shipments...');
try {
  db.exec('ALTER TABLE shipments ADD COLUMN index_no INTEGER;');
} catch (e) {
  // Column already exists
}

// Data from user's manual schedule screenshot for JUMAT (02/10/2026)
// Plus realistic coordinates along the Pasuruan / Gempol / Pandaan / Mojokerto corridor
const manualSheetRows = [
  {
    index_no: 7370,
    id: 'shp-man-7370',
    sj_number: 'SJ/ATS/2026/8149',
    po_number: 'SMU4/000015/09/2026/PO',
    so_ref: 'SO/ATS/26-8149',
    customer_name: 'Sari Multi Utama (Pasuruan)',
    destination_address: 'Jl. Randupitu-Gunung Gangsir No.KM 01, Candi, Gn. Gangsir, Kec. Beji, Pasuruan, Jawa Timur 67154',
    destination_lat: -7.58432,
    destination_lng: 112.74811,
    zone_code: 'PSR',
    plan_date: '2026-10-02',
    assigned_driver: 'Munir',
    assigned_vehicle_type: 'TRAGA',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    notes: 'ADA INV LUNAS kirim ke Jl. Randupitu-Gunung Gangsir No.KM 01, Candi, Gn. Gangsir, Kec. Beji, Pasuruan, Jawa Timur 67154',
    items: [
      { item_no: 'LEG-555438', name: 'LEG 555438, P17 TEMPRA PRO PLUG 32A 3P+E 415V IP67', qty: 6, unit: 'PCS', size: 'KECIL' },
      { item_no: 'TB-WAGO-25', name: 'Terminal Block Spring Cage 2.5mm', qty: 40, unit: 'PCS', size: 'KECIL' },
      { item_no: 'MCB-SCH-1P10', name: 'MCB Schneider Domae 1P 10A 4.5kA', qty: 10, unit: 'PCS', size: 'KECIL' }
    ]
  },
  {
    index_no: 7371,
    id: 'shp-man-7371',
    sj_number: 'SJ/ATS/2026/8127',
    po_number: 'SPB/ATI2/26/09/0264',
    so_ref: 'SO/ATS/26-8127',
    customer_name: 'PT. Aneka Tuna Indonesia (Pandaan)',
    destination_address: 'JL. Raya Gunung Gangsir RT. 07 RW. 09 Nogosari, Pandaan, Pasuruan, Jawa Timur',
    destination_lat: -7.63210,
    destination_lng: 112.71450,
    zone_code: 'PSR',
    plan_date: '2026-10-02',
    assigned_driver: 'Munir',
    assigned_vehicle_type: 'TRAGA',
    status: 'ASSIGNED',
    priority: 'HARUS',
    notes: 'KAWASAN BERIKAT, ADA BC WAJIB PAKAI ROMPI SAFETY',
    items: [
      { item_no: 'CTC-LC1D40', name: 'Contactor Schneider TeSys D LC1D40 380V AC3', qty: 4, unit: 'PCS', size: 'SEDANG' },
      { item_no: 'DUCT-WIR-50X50', name: 'Cable Duct Wiring Pipa PVC 50x50x2000 mm', qty: 8, unit: 'BTG', size: 'SEDANG' }
    ]
  },
  {
    index_no: 7372,
    id: 'shp-man-7372',
    sj_number: 'SJ/ATS/2026/8180',
    po_number: 'PO-MYR-260901',
    so_ref: 'SO/ATS/26-8180',
    customer_name: 'PT. Mayora Indah',
    destination_address: 'Jl. Raya Pasuruan - Malang Km 15, Kejayan, Pasuruan',
    destination_lat: -7.68410,
    destination_lng: 112.87120,
    zone_code: 'PSR',
    plan_date: '2026-10-02',
    assigned_driver: 'Munir',
    assigned_vehicle_type: 'TRAGA',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    notes: 'KIRIM KE PLANT MAYORA PASURUAN - KONFIRMASI SECURITY GATE 1',
    items: [
      { item_no: 'INV-ATV630', name: 'Variable Speed Drive Inverter ATV630 15kW 3P', qty: 1, unit: 'UNIT', size: 'BESAR' },
      { item_no: 'SW-SEL-3P', name: 'Selector Switch 3-Position Illuminated 220V', qty: 12, unit: 'PCS', size: 'KECIL' }
    ]
  },
  {
    index_no: 7374,
    id: 'shp-man-7374',
    sj_number: 'SJ/ATS/2026/8155',
    po_number: 'PR003928',
    so_ref: 'SO/ATS/26-8155',
    customer_name: 'Panen Anugerah Nusindo (PSR)',
    destination_address: 'Pojkekik, Baujeng, Kec. Beji, Pasuruan, Jawa Timur 67154',
    destination_lat: -7.59120,
    destination_lng: 112.75340,
    zone_code: 'PSR',
    plan_date: '2026-10-02',
    assigned_driver: 'Munir',
    assigned_vehicle_type: 'TRAGA',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    notes: 'KIRIM KE PLANT : Pojkekik, Baujeng, Kec. Beji, Pasuruan, Jawa Timur 67154 ADA INV LUNAS + FP',
    items: [
      { item_no: 'BB-CU-30X5', name: 'Busbar Tembaga Murni 30x5x4000 mm', qty: 4, unit: 'BTG', size: 'BESAR' },
      { item_no: 'PNL-BOX-6080', name: 'Panel Box Outdoor Plat Besi 2mm 600x800x250', qty: 1, unit: 'UNIT', size: 'BESAR' }
    ]
  },
  {
    index_no: 7375,
    id: 'shp-man-7375',
    sj_number: 'IT.2026.09.00100',
    po_number: 'PO-TAD-09100',
    so_ref: 'SO/ATS/26-TAD10',
    customer_name: 'Taman Dayu',
    destination_address: 'Kawasan Resor Taman Dayu, Pandaan, Pasuruan',
    destination_lat: -7.66850,
    destination_lng: 112.69870,
    zone_code: 'PSR',
    plan_date: '2026-10-02',
    assigned_driver: 'Munir',
    assigned_vehicle_type: 'TRAGA',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    notes: 'DR J40 > TAD',
    items: [
      { item_no: 'KBL-NYY-4X15', name: 'Kabel NYY 4x1.5 mm Supreme (Rol 50m)', qty: 2, unit: 'ROL', size: 'KECIL' },
      { item_no: 'SW-SEL-3P', name: 'Selector Switch 3-Position Illuminated 220V', qty: 5, unit: 'PCS', size: 'KECIL' }
    ]
  },
  {
    index_no: 7376,
    id: 'shp-man-7376',
    sj_number: 'SJ/ATS/2026/8171',
    po_number: 'SPB/ATI/26/09/0708',
    so_ref: 'SO/ATS/26-8171',
    customer_name: 'PT. Aneka Tuna Indonesia (GEMPOL)',
    destination_address: 'Kawasan Gempol Industri, Gempol, Pasuruan',
    destination_lat: -7.56110,
    destination_lng: 112.71120,
    zone_code: 'PSR',
    plan_date: '2026-10-02',
    assigned_driver: 'Munir',
    assigned_vehicle_type: 'TRAGA',
    status: 'ASSIGNED',
    priority: 'HARUS',
    notes: 'KAWASAN BERIKAT, ADA BC WAJIB PAKAI ROMPI SAFETY',
    items: [
      { item_no: 'SENS-PROX-M12', name: 'Sensor Inductive Proximity M12 NPN NO Sn 4mm', qty: 8, unit: 'PCS', size: 'KECIL' },
      { item_no: 'TB-WAGO-25', name: 'Terminal Block Spring Cage 2.5mm', qty: 30, unit: 'PCS', size: 'KECIL' }
    ]
  },
  {
    index_no: 7377,
    id: 'shp-man-7377',
    sj_number: 'SJ/ATS/2026/8177',
    po_number: 'PO-0860',
    so_ref: 'SO/ATS/26-8177',
    customer_name: 'PT. Repal Internasional',
    destination_address: 'Kawasan Industri PIER Blok D-15, Rembang, Pasuruan',
    destination_lat: -7.61890,
    destination_lng: 112.83150,
    zone_code: 'PSR',
    plan_date: '2026-10-02',
    assigned_driver: 'Munir',
    assigned_vehicle_type: 'TRAGA',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    notes: 'Kawasan Industri PIER Rembang Pasuruan - Masuk Gate B',
    items: [
      { item_no: 'PLC-TM221', name: 'PLC Schneider Modicon TM221CE16R 16 I/O Ethernet', qty: 2, unit: 'UNIT', size: 'KECIL' },
      { item_no: 'MCB-SCH-1P10', name: 'MCB Schneider Domae 1P 10A 4.5kA', qty: 15, unit: 'PCS', size: 'KECIL' }
    ]
  },
  {
    index_no: 7378,
    id: 'shp-man-7378',
    sj_number: 'SJ/ATS/2026/8182',
    po_number: '4062601735',
    so_ref: 'SO/ATS/26-8182',
    customer_name: 'PT. Hopax Indonesia',
    destination_address: 'Kawasan Industri PIER Blok B-8, Rembang, Pasuruan',
    destination_lat: -7.62100,
    destination_lng: 112.82900,
    zone_code: 'PSR',
    plan_date: '2026-10-02',
    assigned_driver: 'Munir',
    assigned_vehicle_type: 'TRAGA',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    notes: 'Kawasan PIER Pasuruan - Bawa Surat Jalan 3 Rangkap',
    items: [
      { item_no: 'BOX-ENC-SS', name: 'Box Enclosure Stainless Steel 300x400x150', qty: 2, unit: 'UNIT', size: 'SEDANG' },
      { item_no: 'SW-SEL-3P', name: 'Selector Switch 3-Position Illuminated 220V', qty: 6, unit: 'PCS', size: 'KECIL' }
    ]
  },
  {
    index_no: 7379,
    id: 'shp-man-7379',
    sj_number: 'SJ/ATS/2026/8183',
    po_number: '4060683039',
    so_ref: 'SO/ATS/26-8183',
    customer_name: 'PT. Japfa Comfeed (SENGON)',
    destination_address: 'Jl. Raya Sengon Agung, Purwosari, Pasuruan',
    destination_lat: -7.74100,
    destination_lng: 112.75400,
    zone_code: 'PSR',
    plan_date: '2026-10-02',
    assigned_driver: 'Munir',
    assigned_vehicle_type: 'TRAGA',
    status: 'SCHEDULED',
    priority: 'NORMAL',
    notes: 'TUNGGU KABEL DATANG - Koordinasi Gudang Sengon',
    items: [
      { item_no: 'KBL-NYFGBY-4X25', name: 'Kabel Power NYFGBY 4x25 mm Armored (Rol 100m)', qty: 1, unit: 'ROL', size: 'BESAR' }
    ]
  },
  {
    index_no: 7380,
    id: 'shp-man-7380',
    sj_number: 'SJ/ATS/2026/8036',
    po_number: 'TRASS-260001165',
    so_ref: 'SO/ATS/26-8036',
    customer_name: 'PT. Trass Anugrah Makmur',
    destination_address: 'Jl. Raya Kejapanan No. 88, Gempol, Pasuruan',
    destination_lat: -7.57500,
    destination_lng: 112.69900,
    zone_code: 'PSR',
    plan_date: '2026-10-02',
    assigned_driver: 'Munir',
    assigned_vehicle_type: 'TRAGA',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    notes: 'Kirim Pabrik Gempol Pasuruan - Bongkar jam kerja',
    items: [
      { item_no: 'BOX-ENC-SS', name: 'Box Enclosure Stainless Steel 300x400x150', qty: 1, unit: 'UNIT', size: 'SEDANG' },
      { item_no: 'TB-WAGO-25', name: 'Terminal Block Spring Cage 2.5mm', qty: 25, unit: 'PCS', size: 'KECIL' }
    ]
  },
  {
    index_no: 7381,
    id: 'shp-man-7381',
    sj_number: 'SJ/ATS/2026/8184',
    po_number: '260900500',
    so_ref: 'SO/ATS/26-8184',
    customer_name: 'PT. Kobin Keramik',
    destination_address: 'Jl. Raya Gempol - Bangil Km 3, Beji, Pasuruan',
    destination_lat: -7.58120,
    destination_lng: 112.77500,
    zone_code: 'PSR',
    plan_date: '2026-10-02',
    assigned_driver: 'Munir',
    assigned_vehicle_type: 'TRAGA',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    notes: 'Jl. Raya Gempol - Bangil Km 3, Beji Pasuruan',
    items: [
      { item_no: 'CTC-LC1D40', name: 'Contactor Schneider TeSys D LC1D40 380V AC3', qty: 2, unit: 'PCS', size: 'SEDANG' },
      { item_no: 'MCB-SCH-1P10', name: 'MCB Schneider Domae 1P 10A 4.5kA', qty: 8, unit: 'PCS', size: 'KECIL' }
    ]
  },
  {
    index_no: 7382,
    id: 'shp-man-7382',
    sj_number: 'SJ/ATS/2026/8185',
    po_number: 'PO-SKD-9901',
    so_ref: 'SO/ATS/26-8185',
    customer_name: 'PT. Sinar Karya Duta (Mojokerto)',
    destination_address: 'Kawasan Industri NIP Ngoro Blok F-3, Ngoro, Mojokerto',
    destination_lat: -7.60800,
    destination_lng: 112.62800,
    zone_code: 'NG',
    plan_date: '2026-10-02',
    assigned_driver: 'Munir',
    assigned_vehicle_type: 'TRAGA',
    status: 'ASSIGNED',
    priority: 'NORMAL',
    notes: 'Kawasan Industri NIP Ngoro Mojokerto - Sejalur arah balik Pasuruan Gempol',
    items: [
      { item_no: 'PNL-BOX-6080', name: 'Panel Box Outdoor Plat Besi 2mm 600x800x250', qty: 1, unit: 'UNIT', size: 'BESAR' },
      { item_no: 'LEG-555438', name: 'LEG 555438, P17 TEMPRA PRO PLUG 32A 3P+E 415V IP67', qty: 4, unit: 'PCS', size: 'KECIL' }
    ]
  }
];

const upsertShipment = db.prepare(`
  INSERT INTO shipments (
    id, index_no, type, sj_number, po_number, so_ref, customer_name,
    destination_address, destination_lat, destination_lng, zone_code,
    origin_location_code, fulfillment_type, status, priority,
    total_points, total_weight_kg, required_vehicle_type,
    muat_category, muat_recommendation, tas_size, notes,
    plan_date, assigned_driver, assigned_vehicle_type
  ) VALUES (
    ?, ?, 'SJ', ?, ?, ?, ?,
    ?, ?, ?, ?,
    'J40', 'ARMADA_SENDIRI', ?, ?,
    ?, ?, ?,
    ?, ?, 'BESAR', ?,
    ?, ?, ?
  )
  ON CONFLICT(id) DO UPDATE SET
    index_no = excluded.index_no,
    sj_number = excluded.sj_number,
    po_number = excluded.po_number,
    customer_name = excluded.customer_name,
    destination_address = excluded.destination_address,
    destination_lat = excluded.destination_lat,
    destination_lng = excluded.destination_lng,
    zone_code = excluded.zone_code,
    status = excluded.status,
    priority = excluded.priority,
    notes = excluded.notes,
    plan_date = excluded.plan_date,
    assigned_driver = excluded.assigned_driver,
    assigned_vehicle_type = excluded.assigned_vehicle_type
`);

const insertLineItem = db.prepare(`
  INSERT INTO shipment_items (id, shipment_id, accurate_item_id, item_no, item_name, quantity, unit_name, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const upsertMasterItem = db.prepare(`
  INSERT INTO items (id, accurate_item_id, sku, name, size_class, unit_name, category_notes, load_points, weight_kg)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    sku = excluded.sku,
    name = excluded.name,
    size_class = excluded.size_class
`);

console.log('[Seed] Seeding manual schedule rows from screenshot...');

for (const row of manualSheetRows) {
  // Check if any item is BESAR
  const hasBesar = row.items.some(it => it.size === 'BESAR');
  const hasSedang = row.items.some(it => it.size === 'SEDANG');
  const muatCat = hasBesar ? 'BESAR' : (hasSedang ? 'SEDANG' : 'KECIL');
  const veh = hasBesar ? 'TRAGA' : (hasSedang ? 'CARRY' : 'MOTOR');
  const rec = hasBesar ? 'WAJIB MOBIL' : (hasSedang ? 'SARAN MOBIL' : 'MUAT MOTOR');
  const pts = row.items.reduce((s, it) => s + (it.qty * (it.size === 'BESAR' ? 15 : it.size === 'SEDANG' ? 5 : 2)), 0);
  const wt = row.items.reduce((s, it) => s + (it.qty * (it.size === 'BESAR' ? 12.0 : it.size === 'SEDANG' ? 3.0 : 0.4)), 0);

  upsertShipment.run(
    row.id, row.index_no, row.sj_number, row.po_number, row.so_ref, row.customer_name,
    row.destination_address, row.destination_lat, row.destination_lng, row.zone_code,
    row.status, row.priority, pts, wt, veh,
    muatCat, rec, row.notes,
    row.plan_date, row.assigned_driver, row.assigned_vehicle_type
  );

  // Clear previous line items for this shipment
  db.prepare('DELETE FROM shipment_items WHERE shipment_id = ?').run(row.id);

  let lIdx = 1;
  for (const it of row.items) {
    const masterId = 'item-' + it.item_no.toLowerCase().replace(/[^a-z0-9]/g, '-');
    upsertMasterItem.run(
      masterId, null, it.item_no, it.name, it.size, it.unit,
      it.size === 'BESAR' ? 'Dimensi besar, wajib mobil' : it.size === 'SEDANG' ? 'Ukuran sedang, bisa diakali motor jika sedikit' : 'Aksesoris kecil, aman motor',
      it.size === 'BESAR' ? 25 : it.size === 'SEDANG' ? 6 : 1,
      it.size === 'BESAR' ? 15.0 : it.size === 'SEDANG' ? 2.5 : 0.3
    );

    insertLineItem.run(
      `si-man-${row.index_no}-${lIdx++}`,
      row.id,
      null,
      it.item_no,
      it.name,
      it.qty,
      it.unit,
      it.size === 'BESAR' ? 'Perhatian: Barang dimensi besar' : null
    );
  }
}

// Also update existing seed shipments to have continuous index numbers
const existing = db.prepare('SELECT id FROM shipments WHERE index_no IS NULL ORDER BY created_at ASC').all();
let baseIdx = 7360;
const updateIdx = db.prepare('UPDATE shipments SET index_no = ? WHERE id = ?');
for (const s of existing) {
  updateIdx.run(baseIdx++, s.id);
}

console.log('[Seed] Seeding completed successfully!');
const count = db.prepare('SELECT count(*) as c FROM shipments').get().c;
const itemsCount = db.prepare('SELECT count(*) as c FROM shipment_items').get().c;
console.log(`[Seed] Total Shipments: ${count}, Total Line Items: ${itemsCount}`);
