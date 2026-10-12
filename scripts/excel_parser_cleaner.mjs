/**
 * ============================================================================
 * ATS Logistics Suite — Excel 2026 Data Cleaner & Parser Module
 * Mengurai dan membersihkan data dari Jadwal_Pengiriman_dan_Tagihan_2026.xlsx
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';

// Day dictionary to validate date format (dd/mm vs mm/dd)
const INDONESIAN_DAYS = {
  0: 'MINGGU',
  1: 'SENIN',
  2: 'SELASA',
  3: 'RABU',
  4: 'KAMIS',
  5: 'JUMAT',
  6: 'SABTU'
};

/**
 * 1. PARSER TANGGAL AMBIGU (dd/mm vs mm/dd)
 * Menggunakan nama hari dari baris pemisah hari di Excel sebagai validator.
 */
export function resolveAmbiguousDate(dateRaw, expectedDayName = null) {
  if (!dateRaw) return null;

  let d, m, y;
  if (typeof dateRaw === 'string') {
    const parts = dateRaw.trim().split(/[-/]/);
    if (parts.length === 3) {
      const p1 = parseInt(parts[0], 10);
      const p2 = parseInt(parts[1], 10);
      const p3 = parseInt(parts[2], 10);

      // Check if p1 is a 4-digit year (e.g. 2026-05-01)
      if (p1 > 1000) {
        y = p1;
        if (p2 > 12) {
          // Must be yyyy-dd-mm
          d = p2; m = p3;
        } else if (p3 > 12) {
          // Must be yyyy-mm-dd
          m = p2; d = p3;
        } else if (expectedDayName) {
          // Test A: yyyy-mm-dd
          const testA = new Date(p1, p2 - 1, p3);
          const dayA = INDONESIAN_DAYS[testA.getDay()];
          const normExp = expectedDayName.trim().toUpperCase();
          if (dayA === normExp) {
            m = p2; d = p3;
          } else {
            // Test B: yyyy-dd-mm (inverted)
            d = p2; m = p3;
          }
        } else {
          m = p2; d = p3;
        }
      } else if (p1 > 12) {
        // dd/mm/yyyy
        d = p1; m = p2; y = p3;
      } else if (p2 > 12) {
        // mm/dd/yyyy
        m = p1; d = p2; y = p3;
      } else if (expectedDayName) {
        const testDateA = new Date(p3, p2 - 1, p1);
        const dayA = INDONESIAN_DAYS[testDateA.getDay()];
        const normExpected = expectedDayName.trim().toUpperCase();
        if (dayA === normExpected) {
          d = p1; m = p2; y = p3;
        } else {
          m = p1; d = p2; y = p3;
        }
      } else {
        d = p1; m = p2; y = p3;
      }
    }
  } else if (dateRaw instanceof Date) {
    d = dateRaw.getDate();
    m = dateRaw.getMonth() + 1;
    y = dateRaw.getFullYear();
  }

  if (d && m && y) {
    const yStr = y < 100 ? (2000 + y) : y;
    const mStr = String(m).padStart(2, '0');
    const dStr = String(d).padStart(2, '0');
    return `${yStr}-${mStr}-${dStr}`;
  }
  return null;
}

/**
 * 2. NORMALISASI NAMA CUSTOMER
 * Menggabungkan variasi duplikat (misal Retail Cash vs RETAIL CASH)
 */
export function normalizeCustomerName(rawName) {
  if (!rawName) return 'Customer Tidak Teridentifikasi';
  let cleaned = rawName.trim();
  // Standardize PT. / CV. / UD.
  cleaned = cleaned.replace(/^PT\s+/i, 'PT. ');
  cleaned = cleaned.replace(/^CV\s+/i, 'CV. ');
  cleaned = cleaned.replace(/^UD\s+/i, 'UD. ');
  // Compress multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ');
  return cleaned;
}

/**
 * 3. EKSTRAKSI FIELD DARI KOLOM KETERANGAN (KET)
 */
export function extractKetAttributes(ketText = '') {
  const text = (ketText || '').toUpperCase();

  let fulfillment_type = 'ARMADA_SENDIRI';
  let origin_location_code = 'J40';
  let priority = 'NORMAL';
  let customs_flag = 'NON_BC';
  let assigned_driver = null;

  // Metode Serah
  if (text.includes('DIAMBIL DI J23') || text.includes('AMBIL DI J23') || text.includes('DIAMBIL SENDIRI')) {
    fulfillment_type = 'PICKUP_J23';
    origin_location_code = 'J40'; // 20m transfer to J23
  } else if (text.includes('JNT') || text.includes('J&T') || text.includes('BUANA') || text.includes('EKSPEDISI') || text.includes('GOJEK')) {
    fulfillment_type = 'EKSPEDISI';
  }

  // Asal Barang
  if (text.includes('JAGALAN')) {
    origin_location_code = 'JAGALAN';
  } else if (text.includes('TAD') || text.includes('TAMAN DAYU')) {
    origin_location_code = 'TAD';
  }

  // Prioritas
  if (text.includes('(HARUS)') || text.includes('HARUS')) {
    priority = 'HARUS';
  } else if (text.includes('URGENT') || text.includes('SEGERA')) {
    priority = 'URGENT';
  }

  // Kepabeanan
  if (text.includes('BC4.0') || text.includes('BC 4.0')) {
    customs_flag = 'BC4.0';
  } else if (text.includes('KAWASAN BERIKAT')) {
    customs_flag = 'KAWASAN_BERIKAT';
  }

  // Deteksi Penugasan Driver Cadangan Urgent
  if (text.includes('DIKIRIM AGUS') || text.includes('AGUS')) assigned_driver = 'Agus';
  else if (text.includes('MARKUS')) assigned_driver = 'Markus';
  else if (text.includes('ZAHARIL') || text.includes('ZAHRIL')) assigned_driver = 'Zahril';
  else if (text.includes('ALDI')) assigned_driver = 'Aldi';
  else if (text.includes('HENDRIK')) assigned_driver = 'Hendrik';

  return {
    fulfillment_type,
    origin_location_code,
    priority,
    customs_flag,
    assigned_driver,
    notes: ketText
  };
}

/**
 * 4. PARSER KODE DOKUMEN CHECKER BERTINGKAT
 * Memecah string pola: "A1, C2, PO, STTB" menjadi array kode terstruktur.
 */
export function parseCheckerDocs(rawDocString = '') {
  if (!rawDocString) return ['A1', 'C2']; // Default kombinasi terbanyak di Excel (4.200+ baris)

  const tokens = rawDocString.split(/[,+\/\s]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
  const validCodes = new Set(['A1', 'C2', 'C3', 'PO', 'STTB', 'TTB', 'FP', 'BA', 'BAP', 'BC4.0', 'LUNAS', 'RESI', 'STG', 'GR']);
  
  const extracted = [];
  tokens.forEach(tok => {
    if (validCodes.has(tok)) {
      extracted.push(tok);
    }
  });

  return extracted.length > 0 ? extracted : ['A1', 'C2'];
}

/**
 * Demo verifikasi cleaner
 */
export function runDemo() {
  console.log("=== Demo Pembersihan Data Excel 2026 ===");

  const testDate = resolveAmbiguousDate('2026-05-01', 'SENIN');
  console.log("1. Resolusi Tanggal Terbalik (2026-05-01 berhari SENIN):", testDate, "-> Sukses (5 Januari 2026)");

  const testCust = normalizeCustomerName('  pt. central pertiwi bahari   ');
  console.log("2. Normalisasi Customer:", testCust);

  const testKet = extractKetAttributes('DIAMBIL DI J23 - KAWASAN BERIKAT - (HARUS)');
  console.log("3. Ekstraksi Keterangan:", testKet);

  const testDocs = parseCheckerDocs('A1, C2, PO, STTB + FP');
  console.log("4. Ekstraksi Dokumen Checker:", testDocs);
}

// Execute demo if run directly
if (process.argv[1].endsWith('excel_parser_cleaner.mjs')) {
  runDemo();
}
