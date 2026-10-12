import { db } from '../db/database.js';

db.prepare("UPDATE shipments SET status = ? WHERE fulfillment_type = ? OR type = ? OR notes LIKE ?")
  .run("PICKUP_READY", "PICKUP_J23", "PICKUP", "%DIAMBIL%");

const pickups = db.prepare("SELECT id, sj_number, customer_name, status, fulfillment_type, notes FROM shipments WHERE status = ?")
  .all("PICKUP_READY");

console.log("Updated Pickups Count:", pickups.length);
pickups.forEach(p => {
  console.log(`- ${p.sj_number} | ${p.customer_name} | status: ${p.status} | type: ${p.fulfillment_type}`);
});
