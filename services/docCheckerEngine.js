import { db } from '../db/database.js';

export function submitLevel1Check({ stopId, sjNumber, customerName, checkerId = 'usr-chk-hana', checkerName = 'Hana', docs = [], notes = '' }) {
  const checkId = 'chk-' + Date.now();
  const now = new Date().toISOString();

  const existing = db.prepare('SELECT id FROM doc_checks WHERE stop_id = ?').get(stopId);

  if (existing) {
    db.prepare(`
      UPDATE doc_checks SET
        level1_checker_id = ?,
        level1_checker_name = ?,
        level1_checked_at = ?,
        level1_docs = ?,
        level1_notes = ?,
        level1_status = 'VERIFIED_L1'
      WHERE id = ?
    `).run(checkerId, checkerName, now, JSON.stringify(docs), notes, existing.id);
    return { success: true, checkId: existing.id, status: 'VERIFIED_L1' };
  } else {
    db.prepare(`
      INSERT INTO doc_checks (
        id, stop_id, sj_number, customer_name, level1_checker_id, level1_checker_name,
        level1_checked_at, level1_docs, level1_notes, level1_status, level2_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED_L1', 'PENDING')
    `).run(checkId, stopId, sjNumber, customerName, checkerId, checkerName, now, JSON.stringify(docs), notes);
    return { success: true, checkId, status: 'VERIFIED_L1' };
  }
}

export function submitLevel2Approval({ checkId, checkerId = 'usr-chk-yohana', checkerName = 'Yohana', isApproved = true, notes = '' }) {
  const now = new Date().toISOString();

  if (isApproved) {
    db.prepare(`
      UPDATE doc_checks SET
        level2_checker_id = ?,
        level2_checker_name = ?,
        level2_checked_at = ?,
        level2_notes = ?,
        level2_status = 'APPROVED',
        final_result = 'COMPLETE',
        is_complete = 1
      WHERE id = ?
    `).run(checkerId, checkerName, now, notes, checkId);
    return { success: true, status: 'COMPLETE', message: 'Dokumen lengkap dan disetujui untuk penagihan oleh Yohana.' };
  } else {
    // Escalate to Munir / Dani
    db.prepare(`
      UPDATE doc_checks SET
        level2_checker_id = ?,
        level2_checker_name = ?,
        level2_checked_at = ?,
        level2_notes = ?,
        level2_status = 'ESCALATED',
        final_result = 'INCOMPLETE'
      WHERE id = ?
    `).run(checkerId, checkerName, now, notes, checkId);
    return { success: true, status: 'ESCALATED', message: 'Dokumen dieskalasi ke Munir / Dani untuk audit berkas.' };
  }
}

export function submitEscalationAudit({ checkId, auditorId, auditorName, resolution = 'RESOLVED', notes = '' }) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE doc_checks SET
      escalation_checker_id = ?,
      escalation_checker_name = ?,
      escalation_checked_at = ?,
      escalation_reason = ?,
      final_result = ?,
      is_complete = 1
    WHERE id = ?
  `).run(auditorId, auditorName, now, notes, resolution === 'RESOLVED' ? 'COMPLETE' : 'INCOMPLETE', checkId);

  return { success: true, message: `Audit eskalasi selesai oleh ${auditorName}` };
}
