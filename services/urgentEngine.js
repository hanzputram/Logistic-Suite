import { db } from '../db/database.js';

export function getEligibleDrivers(vehicleType = 'MOTOR', isUrgent = false) {
  const users = db.prepare('SELECT * FROM users WHERE is_active = 1').all();

  return users.map(user => {
    let isEligible = true;
    let reason = 'Memenuhi kualifikasi armada';

    const licenses = (user.license_type || '').split(',').map(s => s.trim().toUpperCase());

    if (vehicleType === 'MOTOR') {
      if (!licenses.includes('C')) {
        isEligible = false;
        reason = 'Tidak memiliki SIM C';
      }
    } else if (vehicleType === 'MOBIL_CARRY' || vehicleType === 'TRAGA') {
      if (!licenses.includes('A') && !licenses.includes('B1') && !licenses.includes('B2')) {
        isEligible = false;
        reason = `Membutuhkan minimal SIM A. Driver hanya memiliki SIM ${user.license_type}`;
      }
    } else if (vehicleType === 'TRUK') {
      if (!licenses.includes('B1') && !licenses.includes('B2')) {
        isEligible = false;
        reason = `Membutuhkan SIM B1/B2 untuk Truk. Driver hanya memiliki SIM ${user.license_type}`;
      }
    }

    return {
      ...user,
      is_eligible: isEligible,
      ineligibility_reason: isEligible ? null : reason,
      badge: user.is_backup_driver ? 'BACKUP_URGENT' : user.driver_type === 'PRIMARY' ? 'DRIVER_UTAMA' : user.role
    };
  });
}

export function requestUrgentTrip({ planDate, zoneCode, originLocationCode = 'J40', urgentReason, requestedBy }) {
  const tripId = 'trip-urg-' + Date.now();
  
  db.prepare(`
    INSERT INTO trips (
      id, plan_date, zone_code, origin_location_code, trip_type, is_urgent,
      urgent_reason, urgent_requested_by, status
    ) VALUES (?, ?, ?, ?, 'URGENT', 1, ?, ?, 'PENDING_APPROVAL')
  `).run(tripId, planDate, zoneCode, originLocationCode, urgentReason, requestedBy);

  // Log to audit
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, user_name, action, entity_name, entity_id, details)
    VALUES (?, ?, ?, 'REQUEST_URGENT_TRIP', 'trips', ?, ?)
  `).run('aud-' + Date.now(), requestedBy, requestedBy, tripId, JSON.stringify({ reason: urgentReason }));

  return {
    success: true,
    tripId,
    status: 'PENDING_APPROVAL',
    message: 'Permohonan Trip Urgent telah diajukan ke Kepala Operasional'
  };
}

export function approveUrgentTrip({ tripId, approvedBy = 'usr-kepala-ops', driverId, vehicleId }) {
  // Validate driver and vehicle license match
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);
  const driver = db.prepare('SELECT * FROM users WHERE id = ?').get(driverId);

  if (!vehicle || !driver) {
    throw new Error('Kendaraan atau driver tidak ditemukan');
  }

  const licenses = (driver.license_type || '').split(',').map(s => s.trim().toUpperCase());
  if ((vehicle.type === 'MOBIL_CARRY' || vehicle.type === 'TRAGA') && !licenses.includes('A') && !licenses.includes('B1')) {
    throw new Error(`Validasi Gagal: ${driver.name} hanya memiliki SIM ${driver.license_type} dan tidak diizinkan membawa ${vehicle.brand_model}`);
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE trips SET
      status = 'SCHEDULED',
      urgent_approved_by = ?,
      urgent_approved_at = ?,
      driver_id = ?,
      driver_name = ?,
      vehicle_id = ?,
      vehicle_plate = ?,
      vehicle_type = ?
    WHERE id = ?
  `).run(approvedBy, now, driver.id, driver.name, vehicle.id, vehicle.plate, vehicle.type, tripId);

  db.prepare(`
    INSERT INTO audit_logs (id, user_id, user_name, action, entity_name, entity_id, details)
    VALUES (?, ?, 'Kepala Operasional', 'APPROVE_URGENT_TRIP', 'trips', ?, ?)
  `).run('aud-' + Date.now(), approvedBy, tripId, JSON.stringify({ driver: driver.name, vehicle: vehicle.plate }));

  return {
    success: true,
    tripId,
    status: 'SCHEDULED',
    message: `Trip Urgent telah disetujui oleh Kepala Operasional. Driver ${driver.name} siap berangkat.`
  };
}
