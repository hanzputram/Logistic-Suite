import { db } from '../db/database.js';

try {
  db.exec('ALTER TABLE shipments ADD COLUMN assigned_driver TEXT;');
} catch (e) {
  // column might already exist
}

const updates = [
  { id: 'shp-001', driver: 'Dani', status: 'SCHEDULED' },
  { id: 'shp-002', driver: 'Pak Adi', status: 'SCHEDULED' },
  { id: 'shp-003', driver: 'Pak Cahyo', status: 'SCHEDULED' },
  { id: 'shp-004', driver: 'Munir', status: 'SCHEDULED' },
  { id: 'shp-005', driver: 'Angga', status: 'SCHEDULED' },
  { id: 'shp-006', driver: 'Agus', status: 'SCHEDULED' }
];

const stmt = db.prepare('UPDATE shipments SET assigned_driver = ?, status = ? WHERE id = ?');
for (const u of updates) {
  stmt.run(u.driver, u.status, u.id);
}

console.log('Seeded shipments assigned to drivers successfully!');
