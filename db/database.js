import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'ats_logistics.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode & foreign keys for performance
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

export function initDatabase() {
  db.exec(`
    -- ================================================================
    -- USERS & PERMISSIONS
    -- ================================================================
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'DRIVER',
      driver_type TEXT NOT NULL DEFAULT 'NONE',
      is_backup_driver INTEGER NOT NULL DEFAULT 0,
      license_type TEXT DEFAULT 'C',
      license_expiry TEXT,
      department TEXT,
      color_code TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, permission)
    );

    -- ================================================================
    -- VEHICLES
    -- ================================================================
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      plate TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      brand_model TEXT,
      capacity_points INTEGER NOT NULL DEFAULT 15,
      capacity_kg REAL NOT NULL DEFAULT 25.0,
      max_length_cm REAL DEFAULT 150.0,
      required_license TEXT DEFAULT 'C',
      default_driver_id TEXT REFERENCES users(id),
      status TEXT DEFAULT 'AVAILABLE',
      tax_due_date TEXT,
      kir_due_date TEXT
    );

    -- ================================================================
    -- ZONES & LOCATIONS
    -- ================================================================
    CREATE TABLE IF NOT EXISTS zones (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      address TEXT,
      lat REAL,
      lng REAL,
      accurate_warehouse_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- ================================================================
    -- ITEMS (SKU) — with 3-tier size: KECIL, SEDANG, BESAR
    -- ================================================================
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      accurate_item_id TEXT UNIQUE,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      size_class TEXT NOT NULL DEFAULT 'KECIL',
      load_points INTEGER NOT NULL DEFAULT 1,
      weight_kg REAL DEFAULT 0.5,
      length_cm REAL DEFAULT 15.0,
      is_long INTEGER NOT NULL DEFAULT 0,
      is_fragile INTEGER NOT NULL DEFAULT 0,
      motor_ok INTEGER NOT NULL DEFAULT 1
    );

    -- ================================================================
    -- CUSTOMERS
    -- ================================================================
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      accurate_customer_id TEXT UNIQUE,
      name TEXT NOT NULL,
      phone TEXT,
      priority TEXT DEFAULT 'NORMAL',
      customs_flag TEXT DEFAULT 'NON_BC'
    );

    CREATE TABLE IF NOT EXISTS customer_locations (
      id TEXT PRIMARY KEY,
      customer_id TEXT REFERENCES customers(id),
      label TEXT,
      address TEXT NOT NULL,
      zone_id TEXT REFERENCES zones(id),
      lat REAL,
      lng REAL,
      open_time TEXT DEFAULT '08:00',
      close_time TEXT DEFAULT '17:00'
    );

    -- ================================================================
    -- SHIPMENTS
    -- Status flow: DRAFT → SCHEDULED (by Marketing) → ASSIGNED (by Dispatcher) → IN_TRANSIT → DELIVERED / FAILED
    -- ================================================================
    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'SJ',
      sj_number TEXT NOT NULL,
      po_number TEXT,
      so_ref TEXT,
      customer_name TEXT,
      destination_address TEXT,
      destination_lat REAL,
      destination_lng REAL,
      zone_code TEXT,
      origin_location_code TEXT DEFAULT 'J40',
      fulfillment_type TEXT DEFAULT 'ARMADA_SENDIRI',

      -- TAHAP 1: Marketing jadwalkan tanggal kirim
      plan_date TEXT,
      scheduled_by TEXT,
      scheduled_at TEXT,

      -- TAHAP 2: Dispatcher tugaskan driver + armada
      assigned_driver TEXT,
      assigned_vehicle_type TEXT,
      assigned_by TEXT,
      assigned_at TEXT,

      -- SKU muat assessment
      muat_category TEXT DEFAULT 'KECIL',
      muat_override TEXT,
      muat_recommendation TEXT DEFAULT 'MOTOR',

      status TEXT DEFAULT 'DRAFT',
      priority TEXT DEFAULT 'NORMAL',
      total_points INTEGER NOT NULL DEFAULT 0,
      total_weight_kg REAL DEFAULT 0.0,
      required_vehicle_type TEXT DEFAULT 'MOTOR',
      tas_size TEXT DEFAULT 'KECIL',
      notes TEXT,
      received_by TEXT,
      received_at TEXT,
      accurate_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ================================================================
    -- SHIPMENT ITEMS (Line items per Surat Jalan)
    -- ================================================================
    CREATE TABLE IF NOT EXISTS shipment_items (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      accurate_item_id TEXT,
      item_no TEXT NOT NULL,
      item_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_name TEXT DEFAULT 'PCS',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment_id ON shipment_items(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_shipment_items_item_no ON shipment_items(item_no);

    -- ================================================================
    -- TRIPS & STOPS
    -- ================================================================
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      plan_date TEXT NOT NULL,
      zone_code TEXT NOT NULL,
      driver_id TEXT REFERENCES users(id),
      driver_name TEXT,
      vehicle_id TEXT REFERENCES vehicles(id),
      vehicle_plate TEXT,
      vehicle_type TEXT,
      origin_location_code TEXT DEFAULT 'J40',
      trip_type TEXT DEFAULT 'REGULAR',
      is_urgent INTEGER NOT NULL DEFAULT 0,
      urgent_reason TEXT,
      urgent_requested_by TEXT,
      urgent_approved_by TEXT,
      urgent_approved_at TEXT,
      route_mode TEXT DEFAULT 'MODE_1_DISTANCE',
      total_km REAL DEFAULT 0.0,
      total_points INTEGER DEFAULT 0,
      status TEXT DEFAULT 'DRAFT',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stops (
      id TEXT PRIMARY KEY,
      trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE,
      shipment_id TEXT REFERENCES shipments(id),
      sequence INTEGER NOT NULL,
      is_locked INTEGER NOT NULL DEFAULT 0,
      customer_name TEXT,
      address TEXT,
      lat REAL,
      lng REAL,
      distance_from_origin_km REAL DEFAULT 0.0,
      eta_minutes INTEGER DEFAULT 0,
      arrived_at TEXT,
      delivered_at TEXT,
      receiver_name TEXT,
      receiver_phone TEXT,
      proof_photo_url TEXT,
      signature_url TEXT,
      delivery_result TEXT DEFAULT 'PENDING',
      fail_reason_code TEXT,
      notes TEXT
    );

    -- ================================================================
    -- ZONE LOCK (1 mobil = 1 zona per hari)
    -- ================================================================
    CREATE TABLE IF NOT EXISTS zone_locks (
      id TEXT PRIMARY KEY,
      plan_date TEXT NOT NULL,
      zone_code TEXT NOT NULL,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      vehicle_type TEXT NOT NULL,
      driver_id TEXT REFERENCES users(id),
      locked_by TEXT,
      locked_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(plan_date, zone_code, vehicle_type)
    );

    -- ================================================================
    -- DOC CHECKS
    -- ================================================================
    CREATE TABLE IF NOT EXISTS doc_checks (
      id TEXT PRIMARY KEY,
      stop_id TEXT REFERENCES stops(id) ON DELETE CASCADE,
      sj_number TEXT NOT NULL,
      customer_name TEXT,
      level1_checker_id TEXT REFERENCES users(id),
      level1_checker_name TEXT,
      level1_checked_at TEXT,
      level1_docs TEXT,
      level1_notes TEXT,
      level1_status TEXT DEFAULT 'PENDING',
      level2_checker_id TEXT REFERENCES users(id),
      level2_checker_name TEXT,
      level2_checked_at TEXT,
      level2_notes TEXT,
      level2_status TEXT DEFAULT 'PENDING',
      escalation_checker_id TEXT REFERENCES users(id),
      escalation_checker_name TEXT,
      escalation_checked_at TEXT,
      escalation_reason TEXT,
      final_result TEXT DEFAULT 'PENDING',
      is_complete INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ================================================================
    -- SYNC & AUDIT
    -- ================================================================
    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      status TEXT NOT NULL,
      records_fetched INTEGER DEFAULT 0,
      records_saved INTEGER DEFAULT 0,
      error_message TEXT,
      executed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT,
      action TEXT NOT NULL,
      entity_name TEXT,
      entity_id TEXT,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ================================================================
    -- APP SETTINGS (cut-off, etc.)
    -- ================================================================
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- ================================================================
    -- MASTER ROUTES (Rute A, Rute B, Rute C, Rute D, Rute E, dst.)
    -- ================================================================
    CREATE TABLE IF NOT EXISTS master_routes (
      id TEXT PRIMARY KEY,
      route_code TEXT UNIQUE NOT NULL,
      route_name TEXT NOT NULL,
      title TEXT NOT NULL,
      destination_area TEXT NOT NULL,
      keywords TEXT NOT NULL,
      zone_code TEXT,
      color TEXT DEFAULT '#2563eb',
      sequence INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ensure all columns exist on shipments
  const addCol = (table, col, def) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`); } catch (e) {}
  };
  addCol('shipments', 'plan_date', 'TEXT');
  addCol('shipments', 'scheduled_by', 'TEXT');
  addCol('shipments', 'scheduled_at', 'TEXT');
  addCol('shipments', 'assigned_driver', 'TEXT');
  addCol('shipments', 'assigned_vehicle_type', 'TEXT');
  addCol('shipments', 'assigned_by', 'TEXT');
  addCol('shipments', 'assigned_at', 'TEXT');
  addCol('shipments', 'muat_category', "TEXT DEFAULT 'KECIL'");
  addCol('shipments', 'muat_override', 'TEXT');
  addCol('shipments', 'muat_recommendation', "TEXT DEFAULT 'MOTOR'");
  addCol('shipments', 'muat_reason', 'TEXT');
  addCol('shipments', 'tas_size', "TEXT DEFAULT 'KECIL'");
  addCol('shipments', 'so_ref', 'TEXT');
  addCol('shipments', 'accurate_id', 'TEXT');
  addCol('shipments', 'received_by', 'TEXT');
  addCol('shipments', 'received_at', 'TEXT');
  addCol('shipments', 'assigned_route', 'TEXT');
  addCol('shipments', 'index_no', 'INTEGER');
  addCol('shipments', 'rejection_reason', 'TEXT');
  addCol('shipments', 'delivery_result', 'TEXT');
  addCol('shipments', 'proof_photo_url', 'TEXT');
  addCol('shipments', 'signature_url', 'TEXT');
  addCol('shipments', 'delivery_lat', 'REAL');
  addCol('shipments', 'delivery_lng', 'REAL');

  addCol('items', 'unit_name', "TEXT DEFAULT 'PCS'");
  addCol('items', 'category_notes', 'TEXT');
  addCol('items', 'updated_by', 'TEXT');
  addCol('items', 'updated_at', 'TEXT');

  addCol('trips', 'jalur_name', "TEXT DEFAULT 'Jalur A'");

  seedMasterRoutes();
  seedData();
}

// ==============================================================
// SEED MASTER ROUTES (Default A - F)
// ==============================================================
export function seedMasterRoutes() {
  const count = db.prepare('SELECT COUNT(*) as count FROM master_routes').get()?.count || 0;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO master_routes (id, route_code, route_name, title, destination_area, keywords, zone_code, color, sequence, description, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const defaults = [
    {
      id: 'route-A',
      code: 'A',
      name: 'Rute A',
      title: 'Koridor Gresik, Margomulyo & Surabaya Barat',
      area: 'Gresik, Manyar, Margomulyo, Tandes, Romokalisari, Benowo',
      keywords: 'GRESIK, MANYAR, KEBOMAS, MARGOMULYO, TANDES, ROMOKALISARI, BENOWO, DRIYOREJO, A',
      zone: 'A',
      color: '#2563eb',
      seq: 1,
      desc: 'Pengiriman arah barat Surabaya, Margomulyo & kawasan industri Gresik.'
    },
    {
      id: 'route-B',
      code: 'B',
      name: 'Rute B',
      title: 'Koridor Sidoarjo & Waru',
      area: 'Waru, Berbek, Sepanjang, Krian, Taman',
      keywords: 'WARU, BERBEK, SEPANJANG, KRIAN, TAMAN, MASTRIP, GWALK, B',
      zone: 'B',
      color: '#059669',
      seq: 2,
      desc: 'Pengiriman koridor Sidoarjo Utara, kawasan Berbek Industri & Waru/Krian.'
    },
    {
      id: 'route-C',
      code: 'C',
      name: 'Rute C',
      title: 'Koridor Sidoarjo Kota, Buduran & Gedangan',
      area: 'Sidoarjo Kota, Buduran, Gedangan, Candi, Porong',
      keywords: 'BUDURAN, GEDANGAN, CANDI, PORONG, SIDOARJO KOTA, SUKODONO, TANGGULANGIN, C',
      zone: 'C',
      color: '#d97706',
      seq: 3,
      desc: 'Pengiriman Sidoarjo Kota dan koridor industri Buduran / Gedangan / Candi.'
    },
    {
      id: 'route-D',
      code: 'D',
      name: 'Rute D',
      title: 'Koridor Pasuruan, Gempol & Pandaan',
      area: 'Pasuruan, Gempol, Pandaan, PIER, Bangil',
      keywords: 'PASURUAN, PANDAAN, GEMPOL, PIER, BEJI, BANGIL, KRATON, REMBANG, D, PSR',
      zone: 'PSR',
      color: '#9333ea',
      seq: 4,
      desc: 'Pengiriman jarak jauh arah Pasuruan, kawasan industri PIER & Pandaan.'
    },
    {
      id: 'route-E',
      code: 'E',
      name: 'Rute E',
      title: 'Koridor Mojokerto & Ngoro',
      area: 'Mojokerto, Ngoro Industrial Park (NIP), Bringinbendo',
      keywords: 'NGORO, MOJOKERTO, NIP, BRINGINBENDO, MOJOSARI, PURI, PRAJURIT KULON, E, NG',
      zone: 'NG',
      color: '#dc2626',
      seq: 5,
      desc: 'Pengiriman arah Mojokerto & kawasan Ngoro Industrial Park.'
    },
    {
      id: 'route-F',
      code: 'F',
      name: 'Rute F',
      title: 'Koridor Surabaya Timur, Rungkut & SIER',
      area: 'Surabaya Timur, Rungkut, SIER, Sukolilo, Kenjeran, Pusat',
      keywords: 'RUNGKUT, SIER, SUKOLILO, KLAMPIS, GUNUNG ANYAR, SEMOLOWARU, KENJERAN, WONOCOLO, SURABAYA, F, FR',
      zone: 'FR',
      color: '#0891b2',
      seq: 6,
      desc: 'Pengiriman perkotaan Surabaya, kawasan industri SIER & Surabaya Timur.'
    }
  ];

  for (const r of defaults) {
    insert.run(r.id, r.code, r.name, r.title, r.area, r.keywords, r.zone, r.color, r.seq, r.desc);
  }
}

// ==============================================================
// ALL AVAILABLE PERMISSIONS
// ==============================================================
const ALL_PERMISSIONS = [
  'tab.jadwal_marketing',    // Tab: Jadwalkan Tanggal Kirim (Marketing)
  'tab.penugasan_driver',    // Tab: Penugasan Driver & Cek Muat (Dispatcher)
  'tab.master_sku',          // Tab: Master Kategori SKU (Besar/Sedang/Kecil)
  'tab.otomasi_rute',        // Tab: Otomasi Jalur Rute (Susunan SJ 1, 2, dst.)
  'tab.master_rute',         // Tab: Master Rute (Edit Arah & Area Rute A, B, C...)
  'tab.jadwal_harian',       // Tab: Jadwal Harian (Monitor)
  'tab.checker',             // Tab: Checker Dokumen
  'tab.urgent',              // Tab: Persetujuan Urgent
  'tab.admin_users',         // Tab: Kelola User & Permission

  'action.schedule_date',    // Bisa jadwalkan tanggal kirim
  'action.assign_driver',    // Bisa tugaskan driver + armada
  'action.categorize_sku',   // Bisa atur kategori SKU
  'action.optimize_routes',  // Bisa susun rute otomatis
  'action.manage_routes',    // Bisa kelola master rute
  'action.check_docs',       // Bisa cek dokumen
  'action.approve_urgent',   // Bisa approve trip urgent
  'action.pull_accurate',    // Bisa tarik data dari Accurate
  'action.manage_users',     // CRUD user + permission
  'action.manage_settings',  // Atur cut-off, dll
  'action.view_all',         // Lihat semua data tanpa batasan
];

export { ALL_PERMISSIONS };

function ensureRolePermissions() {
  const ensurePerm = (userId, perm) => {
    const exists = db.prepare('SELECT 1 FROM permissions WHERE user_id = ? AND permission = ?').get(userId, perm);
    if (!exists) {
      db.prepare('INSERT OR IGNORE INTO permissions (id, user_id, permission) VALUES (?, ?, ?)').run('perm-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6), userId, perm);
    }
  };

  ALL_PERMISSIONS.forEach(p => ensurePerm('usr-superadmin', p));
  ['tab.master_sku', 'tab.otomasi_rute', 'tab.master_rute', 'action.categorize_sku', 'action.optimize_routes', 'action.manage_routes'].forEach(p => {
    ensurePerm('usr-disp-1', p);
    ensurePerm('usr-kepala-ops', p);
  });
  ['tab.master_sku', 'tab.master_rute'].forEach(p => ensurePerm('usr-mkt-1', p));
}

function seedData() {
  const hasAdmin = db.prepare("SELECT 1 FROM users WHERE username = 'admin'").get();
  if (hasAdmin) {
    ensureRolePermissions();
    return;
  }

  console.log("Seeding verified core users, locations, zones & vehicles into SQLite database...");
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DELETE FROM permissions;
    DELETE FROM users;
    PRAGMA foreign_keys = ON;
  `);



  // ────────────────────────────────────────────
  // 1. SEED USERS
  // ────────────────────────────────────────────
  const insertUser = db.prepare(`
    INSERT OR REPLACE INTO users (id, name, username, password_hash, phone, role, driver_type, is_backup_driver, license_type, department, color_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPerm = db.prepare(`
    INSERT OR REPLACE INTO permissions (id, user_id, permission) VALUES (?, ?, ?)
  `);

  // Superadmin
  insertUser.run('usr-superadmin', 'Administrator', 'admin', 'hash_pass', '081200000000', 'SUPERADMIN', 'NONE', 0, 'A,C', 'Sistem Administrator', '#1e293b');

  // Kepala Operasional
  insertUser.run('usr-kepala-ops', 'Bapak Handoko', 'kepala.ops', 'hash_pass', '081234567890', 'KEPALA_OPERASIONAL', 'NONE', 0, 'A,C', 'Manajemen Operasional', '#8b5cf6');

  // Marketing
  insertUser.run('usr-mkt-1', 'Rina Marketing', 'rina', 'hash_pass', '081234567892', 'MARKETING', 'NONE', 0, '', 'Sales & Marketing', '#ec4899');

  // Dispatcher Logistik
  insertUser.run('usr-disp-1', 'Budi Santoso', 'dispatcher', 'hash_pass', '081234567891', 'DISPATCHER', 'NONE', 0, 'A,C', 'Logistik & Dispatch', '#06b6d4');

  // Driver Reguler
  insertUser.run('usr-drv-munir', 'Munir', 'munir', 'hash_pass', '081234567801', 'DRIVER', 'PRIMARY', 0, 'A,C', 'Armada Reguler — Traga', '#eab308');
  insertUser.run('usr-drv-cahyono', 'Cahyono', 'cahyono', 'hash_pass', '081234567802', 'DRIVER', 'PRIMARY', 0, 'A,B1', 'Armada Reguler', '#06b6d4');
  insertUser.run('usr-drv-adi', 'Pak Adi', 'adi', 'hash_pass', '081234567803', 'DRIVER', 'PRIMARY', 0, 'A', 'Armada Reguler', '#22c55e');
  insertUser.run('usr-drv-angga', 'Angga', 'angga', 'hash_pass', '081234567804', 'DRIVER', 'PRIMARY', 0, 'C', 'Armada Reguler — Motor', '#ef4444');
  insertUser.run('usr-drv-dani', 'Dani', 'dani', 'hash_pass', '081234567805', 'DRIVER', 'PRIMARY', 0, 'A,C', 'Armada Reguler — Carry', '#f97316');

  // Driver Backup
  insertUser.run('usr-bck-agus', 'Agus', 'agus', 'hash_pass', '081234567811', 'BACKUP_DRIVER', 'BACKUP', 1, 'A,C', 'Backup — Gran Max / Avanza', '#ec4899');
  insertUser.run('usr-bck-arifin', 'Arifin', 'arifin', 'hash_pass', '081234567816', 'BACKUP_DRIVER', 'BACKUP', 1, 'A,C', 'Backup — Gran Max / Avanza', '#f59e0b');
  insertUser.run('usr-bck-markus', 'Markus', 'markus', 'hash_pass', '081234567812', 'BACKUP_DRIVER', 'BACKUP', 1, 'C', 'Backup — Motor', '#a855f7');
  insertUser.run('usr-bck-zahril', 'Zahril', 'zahril', 'hash_pass', '081234567813', 'BACKUP_DRIVER', 'BACKUP', 1, 'C', 'Backup — Motor', '#6366f1');
  insertUser.run('usr-bck-aldi', 'Aldi', 'aldi', 'hash_pass', '081234567814', 'BACKUP_DRIVER', 'BACKUP', 1, 'C', 'Backup — Motor', '#14b8a6');
  insertUser.run('usr-bck-hendrik', 'Hendrik', 'hendrik', 'hash_pass', '081234567815', 'BACKUP_DRIVER', 'BACKUP', 1, 'C', 'Backup — Motor', '#3b82f6');

  // Checker
  insertUser.run('usr-chk-hana', 'Hana', 'hana', 'hash_pass', '081234567821', 'CHECKER_L1', 'NONE', 0, 'C', 'Checker Dokumen L1', '#f43f5e');
  insertUser.run('usr-chk-yohana', 'Yohana', 'yohana', 'hash_pass', '081234567822', 'CHECKER_L2', 'NONE', 0, 'C', 'Supervisor Checker L2', '#10b981');

  // ────────────────────────────────────────────
  // 2. SEED PERMISSIONS
  // ────────────────────────────────────────────
  let permIdx = 0;
  function addPerm(userId, perm) {
    permIdx++;
    insertPerm.run('perm-' + permIdx, userId, perm);
  }

  // Superadmin: semua permission
  ALL_PERMISSIONS.forEach(p => addPerm('usr-superadmin', p));

  // Kepala Ops: urgent + view all + jadwal harian
  ['tab.urgent', 'tab.jadwal_harian', 'action.approve_urgent', 'action.view_all'].forEach(p => addPerm('usr-kepala-ops', p));

  // Marketing: jadwalkan tanggal
  ['tab.jadwal_marketing', 'action.schedule_date'].forEach(p => addPerm('usr-mkt-1', p));

  // Dispatcher: penugasan + jadwal harian + tarik Accurate
  ['tab.penugasan_driver', 'tab.jadwal_harian', 'action.assign_driver', 'action.pull_accurate', 'action.view_all'].forEach(p => addPerm('usr-disp-1', p));

  // Checker L1: Hana
  ['tab.checker', 'action.check_docs'].forEach(p => addPerm('usr-chk-hana', p));

  // Checker L2: Yohana
  ['tab.checker', 'action.check_docs', 'action.view_all'].forEach(p => addPerm('usr-chk-yohana', p));

  // ────────────────────────────────────────────
  // 3. SEED LOCATIONS
  // ────────────────────────────────────────────
  const insertLoc = db.prepare(`
    INSERT OR IGNORE INTO locations (id, code, name, type, address, lat, lng, accurate_warehouse_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertLoc.run('loc-j23', 'J23', 'Kantor Operasional J23 (Pickup Point)', 'OFFICE_PICKUP', 'Ruko Galaxi Bumi Permai J1 / 23, Surabaya', -7.301972, 112.7817558, '50');
  insertLoc.run('loc-j40', 'J40', 'Gudang Utama J40 (Muat Armada)', 'WAREHOUSE_MAIN', 'Ruko Galaxi Bumi Permai J1 / 40, Surabaya', -7.302110, 112.7819000, '250');
  insertLoc.run('loc-jagalan', 'JAGALAN', 'Gudang Cabang Jagalan', 'WAREHOUSE_BRANCH', 'Jl. Jagalan No. 38, Surabaya', -7.25145, 112.74821, '300');
  insertLoc.run('loc-tad', 'TAD', 'Gudang Cabang Taman Dayu', 'WAREHOUSE_BRANCH', 'Kawasan Industri Taman Dayu, Pasuruan', -7.72140, 112.69850, '450');


  // ────────────────────────────────────────────
  // 4. SEED ZONES
  // ────────────────────────────────────────────
  const insertZone = db.prepare(`INSERT OR IGNORE INTO zones (id, code, name, description) VALUES (?, ?, ?, ?)`);
  insertZone.run('zone-a', 'A', 'Gresik (Manyar / Kebomas)', 'Kawasan Industri Gresik & Manyar');
  insertZone.run('zone-b', 'B', 'Sidoarjo Taman / Sepanjang', 'Kawasan Industri Krian, Taman, Sepanjang, Waru');
  insertZone.run('zone-c', 'C', 'Sidoarjo Kota / Buduran', 'Sidoarjo Kota, Candi, Gedangan, Buduran');
  insertZone.run('zone-fr', 'FR', 'Surabaya', 'Surabaya Timur, Rungkut Industri SIER, Margomulyo');
  insertZone.run('zone-ng', 'NG', 'Ngoro Industrial Park', 'Kawasan Industri Ngoro Mojokerto');
  insertZone.run('zone-psr', 'PSR', 'Pasuruan Industri', 'Kawasan PIER Pasuruan, Kraton, Beji');

  // ────────────────────────────────────────────
  // 5. SEED VEHICLES
  // ────────────────────────────────────────────
  const insertVeh = db.prepare(`
    INSERT OR IGNORE INTO vehicles (id, plate, type, brand_model, capacity_points, capacity_kg, max_length_cm, required_license, default_driver_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertVeh.run('veh-mtr-1', 'L 3120 AA', 'MOTOR', 'Honda Vario 125', 15, 25.0, 100.0, 'C', 'usr-drv-angga', 'AVAILABLE');
  insertVeh.run('veh-mtr-2', 'L 4567 BB', 'MOTOR', 'Yamaha NMAX 155', 15, 25.0, 100.0, 'C', null, 'AVAILABLE');
  insertVeh.run('veh-carry-1', 'W 8901 CD', 'CARRY', 'Suzuki New Carry Box', 120, 600.0, 240.0, 'A', 'usr-drv-dani', 'AVAILABLE');
  insertVeh.run('veh-traga-1', 'W 2345 EF', 'TRAGA', 'Isuzu Traga Box Extra', 200, 800.0, 310.0, 'A', 'usr-drv-munir', 'AVAILABLE');
  insertVeh.run('veh-granmax-1', 'W 5678 GH', 'GRANMAX', 'Daihatsu Gran Max Box', 100, 500.0, 220.0, 'A', 'usr-bck-agus', 'AVAILABLE');
  insertVeh.run('veh-avanza-1', 'L 9012 IJ', 'AVANZA', 'Toyota Avanza', 60, 300.0, 180.0, 'A', 'usr-bck-arifin', 'AVAILABLE');
  insertVeh.run('veh-trk-1', 'L 9876 KL', 'TRUK', 'Mitsubishi Canter Colt Diesel', 600, 3000.0, 420.0, 'B1', 'usr-drv-cahyono', 'AVAILABLE');

  // ────────────────────────────────────────────
  // 6. DEFAULT SETTINGS
  // ────────────────────────────────────────────
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`);
  insertSetting.run('cutoff_enabled', 'false');
  insertSetting.run('cutoff_time', '15:00');

  console.log("Database initialized successfully with real operational data!");
  ensureRolePermissions();
  seedMasterItemsAndLineItems();
}

function seedMasterItemsAndLineItems() {
  // Real items and delivery orders are loaded dynamically from Accurate Online.
  recalculateAllShipmentsMuat();
}

export function recalculateShipmentMuat(shipmentId) {
  const lineItems = db.prepare(`
    SELECT si.*, COALESCE(i.size_class, 'KECIL') as current_size_class, i.name as master_name
    FROM shipment_items si
    LEFT JOIN items i ON si.item_no = i.sku OR (si.accurate_item_id IS NOT NULL AND si.accurate_item_id = i.accurate_item_id)
    WHERE si.shipment_id = ?
  `).all(shipmentId);

  if (!lineItems || lineItems.length === 0) {
    return null;
  }

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

  db.prepare(`
    UPDATE shipments SET
      muat_category = ?,
      required_vehicle_type = CASE WHEN assigned_vehicle_type IS NOT NULL THEN required_vehicle_type ELSE ? END,
      muat_recommendation = ?,
      muat_reason = ?
    WHERE id = ?
  `).run(muatCategory, requiredVehicle, recommendation, reason, shipmentId);

  return { muatCategory, requiredVehicle, recommendation, reason };
}

export function recalculateAllShipmentsMuat() {
  const shipments = db.prepare('SELECT id FROM shipments').all();
  for (const s of shipments) {
    recalculateShipmentMuat(s.id);
  }
}

export { db, seedMasterItemsAndLineItems };
