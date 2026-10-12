-- ====================================================================
-- ATS Logistics Suite - PostgreSQL + PostGIS Production Schema DDL
-- Versi 1.2 — 30 September 2026
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- PostGIS for geographic distances and routing calculations
-- CREATE EXTENSION IF NOT EXISTS "postgis";

-- --------------------------------------------------------------------
-- ENUM TYPES
-- --------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE driver_type_enum AS ENUM ('PRIMARY', 'BACKUP', 'NONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE trip_type_enum AS ENUM ('REGULAR', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE trip_status_enum AS ENUM (
        'DRAFT', 'PENDING_APPROVAL', 'SCHEDULED', 
        'DISPATCHED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE location_type_enum AS ENUM (
        'OFFICE_PICKUP', 'WAREHOUSE_MAIN', 'WAREHOUSE_BRANCH'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE shipment_type_enum AS ENUM (
        'SJ', 'IT', 'PICKUP', 'EKSPEDISI', 'MA', 'JC', 'SR'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE size_class_enum AS ENUM ('S', 'M', 'L', 'XL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE doc_check_result_enum AS ENUM (
        'PENDING', 'COMPLETE', 'INCOMPLETE', 'LOST', 'RETURNED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --------------------------------------------------------------------
-- 1. USERS & ROLES
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    username VARCHAR(80) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    driver_type driver_type_enum NOT NULL DEFAULT 'NONE',
    is_backup_driver BOOLEAN NOT NULL DEFAULT FALSE,
    license_type VARCHAR(50) DEFAULT 'C', -- 'A,C', 'C', 'A', 'B1/B2'
    license_expiry DATE,
    department VARCHAR(100),              -- 'Gudang', 'Operasional', 'Logistik', 'Finance'
    color_code VARCHAR(30),               -- HEX color code for Dispatch calendar
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- --------------------------------------------------------------------
-- 2. VEHICLES (Armada)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plate VARCHAR(20) UNIQUE NOT NULL,
    type VARCHAR(30) NOT NULL,            -- 'MOTOR', 'MOBIL_CARRY', 'TRAGA', 'TRUK'
    brand_model VARCHAR(100),
    capacity_points INTEGER NOT NULL DEFAULT 15,
    capacity_kg NUMERIC(10,2) NOT NULL DEFAULT 25.00,
    max_length_cm NUMERIC(10,2) DEFAULT 150.00,
    required_license VARCHAR(20) DEFAULT 'C', -- 'C' for motor, 'A' for carry/traga, 'B' for truck
    default_driver_id UUID REFERENCES users(id),
    status VARCHAR(30) DEFAULT 'AVAILABLE',   -- 'AVAILABLE', 'ON_DUTY', 'MAINTENANCE'
    tax_due_date DATE,
    kir_due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 3. ZONES & LOCATIONS (Topologi J23, J40, Jagalan, TAD)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,     -- 'A', 'B', 'C', 'FR', 'NG', 'PSR'
    name VARCHAR(100) NOT NULL,           -- Gresik, Sidoarjo-B, Sidoarjo-C, Surabaya, Ngoro, Pasuruan
    description TEXT
);

CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,     -- 'J23', 'J40', 'JAGALAN', 'TAD'
    name VARCHAR(150) NOT NULL,
    type location_type_enum NOT NULL,     -- 'OFFICE_PICKUP' (J23), 'WAREHOUSE_MAIN' (J40), 'WAREHOUSE_BRANCH' (Jagalan/TAD)
    address TEXT,
    lat NUMERIC(10,7),
    lng NUMERIC(10,7),
    accurate_warehouse_id VARCHAR(50),    -- ID Gudang di Accurate Online
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 4. CUSTOMERS & CUSTOMER LOCATIONS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    accurate_customer_id VARCHAR(50) UNIQUE,
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(100),
    priority VARCHAR(20) DEFAULT 'NORMAL', -- 'NORMAL', 'HARUS', 'VIP'
    customs_flag VARCHAR(30),              -- 'NON_BC', 'BC4.0', 'KAWASAN_BERIKAT'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    label VARCHAR(150),                    -- 'Spindo Unit I', 'Unit III', 'Pabrik Taman Dayu'
    address TEXT NOT NULL,
    zone_id UUID REFERENCES zones(id),
    lat NUMERIC(10,7),
    lng NUMERIC(10,7),
    open_time TIME DEFAULT '08:00:00',
    close_time TIME DEFAULT '17:00:00',
    is_primary BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_billing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    tt_days VARCHAR(100),                  -- e.g. 'Selasa - Jumat'
    tt_hours VARCHAR(100),                 -- e.g. '08:00 - 16:00'
    docs_required TEXT,                    -- 'A1, C2, PO, FP, BAST'
    payment_method VARCHAR(50),            -- 'GIRO', 'CASH', 'TRANSFER'
    up_finance VARCHAR(150),
    notes TEXT
);

-- --------------------------------------------------------------------
-- 5. ITEMS & SKU CAPACITY
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    accurate_item_id VARCHAR(50) UNIQUE,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    size_class size_class_enum NOT NULL DEFAULT 'S',
    load_points INTEGER NOT NULL DEFAULT 1,
    weight_kg NUMERIC(10,3) DEFAULT 0.500,
    length_cm NUMERIC(10,2) DEFAULT 15.00,
    is_long BOOLEAN NOT NULL DEFAULT FALSE,
    is_fragile BOOLEAN NOT NULL DEFAULT FALSE,
    motor_ok BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 6. SHIPMENTS & LINES (SJ, IT, Retur, dll.)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type shipment_type_enum NOT NULL DEFAULT 'SJ',
    sj_number VARCHAR(100) NOT NULL,       -- 'SJ/ATS/2026/xxxx'
    po_number VARCHAR(100),                -- PO Customer
    so_ref VARCHAR(100),                   -- Sales Order Accurate
    customer_id UUID REFERENCES customers(id),
    customer_location_id UUID REFERENCES customer_locations(id),
    origin_location_id UUID REFERENCES locations(id), -- default J40
    fulfillment_type VARCHAR(50) DEFAULT 'ARMADA_SENDIRI', -- 'ARMADA_SENDIRI', 'PICKUP_J23', 'EKSPEDISI'
    status VARCHAR(50) DEFAULT 'UNSCHEDULED',              -- 'UNSCHEDULED', 'SCHEDULED', 'IN_TRANSIT', 'DELIVERED', 'FAILED'
    priority VARCHAR(20) DEFAULT 'NORMAL',                 -- 'NORMAL', 'HARUS', 'URGENT'
    total_points INTEGER NOT NULL DEFAULT 0,
    total_weight_kg NUMERIC(10,2) DEFAULT 0.00,
    required_vehicle_type VARCHAR(30) DEFAULT 'MOTOR',
    tas_size VARCHAR(20) DEFAULT 'KECIL',                  -- 'BESAR', 'KECIL'
    notes TEXT,
    accurate_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shipment_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
    item_id UUID REFERENCES items(id),
    qty NUMERIC(12,2) NOT NULL,
    unit VARCHAR(30) DEFAULT 'PCS',
    unit_price NUMERIC(15,2) DEFAULT 0.00,
    line_points INTEGER NOT NULL DEFAULT 1,
    line_weight_kg NUMERIC(10,2) DEFAULT 0.00
);

-- --------------------------------------------------------------------
-- 7. TRIPS & STOPS (Rute & Penugasan Driver)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_date DATE NOT NULL,
    zone_id UUID REFERENCES zones(id),
    driver_id UUID REFERENCES users(id),
    vehicle_id UUID REFERENCES vehicles(id),
    origin_location_id UUID REFERENCES locations(id), -- Titik awal rute (J40 / TAD)
    trip_type trip_type_enum NOT NULL DEFAULT 'REGULAR',
    is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
    urgent_reason TEXT,
    urgent_requested_by UUID REFERENCES users(id),
    urgent_approved_by UUID REFERENCES users(id),     -- Otorisasi Kepala Operasional
    urgent_approved_at TIMESTAMP WITH TIME ZONE,
    route_mode VARCHAR(30) DEFAULT 'MODE_1_DISTANCE', -- Mode 1 (Terdekat->Terjauh) atau Mode 2 (Nearest Neighbor)
    total_km NUMERIC(10,2) DEFAULT 0.00,
    total_points INTEGER DEFAULT 0,
    status trip_status_enum NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
    shipment_id UUID REFERENCES shipments(id),
    sequence INTEGER NOT NULL,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    eta_minutes INTEGER DEFAULT 0,
    distance_km NUMERIC(10,2) DEFAULT 0.00,
    arrived_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    receiver_name VARCHAR(150),
    receiver_phone VARCHAR(50),
    proof_photo_url TEXT,
    signature_url TEXT,
    delivery_result VARCHAR(50) DEFAULT 'PENDING',    -- 'PENDING', 'SUCCESS', 'FAILED', 'RESCHEDULED'
    fail_reason_code VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 8. CHECKER DOKUMEN BERTINGKAT (4 Checkers)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doc_types (
    code VARCHAR(30) PRIMARY KEY,          -- 'A1', 'C2', 'PO', 'STTB', 'FP', 'BA', 'BC4.0', 'LUNAS'
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,         -- 'SALINAN', 'BUKTI_TERIMA', 'KEPABEANAN', 'KEUANGAN'
    alias_of VARCHAR(30) REFERENCES doc_types(code)
);

CREATE TABLE IF NOT EXISTS doc_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stop_id UUID REFERENCES stops(id) ON DELETE CASCADE,
    -- Level 1: Hana (Pelaksana Operasional)
    level1_checker_id UUID REFERENCES users(id),
    level1_checked_at TIMESTAMP WITH TIME ZONE,
    level1_notes TEXT,
    level1_status VARCHAR(30) DEFAULT 'PENDING',      -- 'PENDING', 'VERIFIED'
    -- Level 2: Yohana (Supervisor / Approval)
    level2_checker_id UUID REFERENCES users(id),
    level2_checked_at TIMESTAMP WITH TIME ZONE,
    level2_notes TEXT,
    level2_status VARCHAR(30) DEFAULT 'PENDING',      -- 'PENDING', 'APPROVED', 'ESCALATED'
    -- Level 3 / Audit: Munir / Dani
    escalation_checker_id UUID REFERENCES users(id),
    escalation_checked_at TIMESTAMP WITH TIME ZONE,
    escalation_reason TEXT,
    -- Status Akhir
    final_result doc_check_result_enum NOT NULL DEFAULT 'PENDING',
    is_complete BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doc_check_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_check_id UUID REFERENCES doc_checks(id) ON DELETE CASCADE,
    doc_code VARCHAR(30) REFERENCES doc_types(code),
    qty_expected INTEGER NOT NULL DEFAULT 1,
    qty_received INTEGER NOT NULL DEFAULT 0,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE
);

-- --------------------------------------------------------------------
-- 9. SYNC & AUDIT LOGS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,      -- 'DELIVERY_ORDER', 'SALES_ORDER', 'CUSTOMER', 'ITEM', 'WAREHOUSE'
    status VARCHAR(30) NOT NULL,          -- 'SUCCESS', 'PARTIAL', 'ERROR'
    records_fetched INTEGER DEFAULT 0,
    records_saved INTEGER DEFAULT 0,
    error_message TEXT,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,         -- 'APPROVE_URGENT_TRIP', 'REORDER_STOPS', 'CHECK_DOC_L1'
    entity_name VARCHAR(100),
    entity_id VARCHAR(100),
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- INDEXES FOR PERFORMANCE
-- --------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_shipments_sj_number ON shipments(sj_number);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_trips_plan_date ON trips(plan_date);
CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_is_urgent ON trips(is_urgent);
CREATE INDEX IF NOT EXISTS idx_stops_trip_id ON stops(trip_id);
CREATE INDEX IF NOT EXISTS idx_doc_checks_stop_id ON doc_checks(stop_id);
