import { db } from '../db/database.js';

const insertShip = db.prepare(`
  INSERT OR REPLACE INTO shipments (
    id, type, sj_number, po_number, so_ref, customer_name, destination_address,
    destination_lat, destination_lng, zone_code, origin_location_code, fulfillment_type,
    status, priority, total_points, total_weight_kg, required_vehicle_type,
    muat_category, muat_recommendation, tas_size, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

insertShip.run(
  'shp-pickup-8145', 'PICKUP', 'SJ/ATS/2026/8145', 'PO-FILTRA-2026', 'SO/ATS/26-8145',
  'PT. Filtra Mikrosarana', 'Loket Pengambilan Customer Kantor J23',
  -7.301972, 112.7817558, 'FR', 'J40', 'PICKUP_J23',
  'PICKUP_READY', 'NORMAL', 12, 10.0, 'MOTOR',
  'KECIL', 'MOTOR', 'KECIL', 'DIAMBIL DI J23'
);

// Ensure shp-006 is also PICKUP_READY and not in delivery scheduling
db.prepare(`
  UPDATE shipments
  SET status = 'PICKUP_READY', fulfillment_type = 'PICKUP_J23', type = 'PICKUP'
  WHERE id = 'shp-006' OR sj_number = 'SJ/ATS/2026/5196'
`).run();

const pickups = db.prepare(`
  SELECT id, sj_number, customer_name, status, fulfillment_type, type, notes
  FROM shipments
  WHERE fulfillment_type LIKE '%PICKUP%' OR notes LIKE '%DIAMBIL%' OR type = 'PICKUP'
`).all();

console.log('Current Pickup Shipments in SQLite:');
console.log(JSON.stringify(pickups, null, 2));
