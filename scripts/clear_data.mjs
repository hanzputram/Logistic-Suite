import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('./data/ats_logistics.db');

console.log('Menghapus data transaksi pengiriman...');

db.exec(`
  PRAGMA foreign_keys = OFF;
  DELETE FROM stops;
  DELETE FROM trips;
  DELETE FROM shipment_items;
  DELETE FROM shipments;
  DELETE FROM zone_locks;
  DELETE FROM doc_checks;
  DELETE FROM sync_logs;
  PRAGMA foreign_keys = ON;
`);

const shipCount = db.prepare('SELECT COUNT(*) as c FROM shipments').get().c;
const itemsCount = db.prepare('SELECT COUNT(*) as c FROM shipment_items').get().c;
const tripCount = db.prepare('SELECT COUNT(*) as c FROM trips').get().c;
const stopCount = db.prepare('SELECT COUNT(*) as c FROM stops').get().c;
const lockCount = db.prepare('SELECT COUNT(*) as c FROM zone_locks').get().c;

console.log(`Pembersihan data selesai!`);
console.log(`- Shipments: ${shipCount}`);
console.log(`- Shipment Items: ${itemsCount}`);
console.log(`- Trips: ${tripCount}`);
console.log(`- Stops: ${stopCount}`);
console.log(`- Zone Locks: ${lockCount}`);
