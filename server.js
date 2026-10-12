import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initDatabase, ALL_PERMISSIONS, recalculateShipmentMuat, recalculateAllShipmentsMuat, seedMasterRoutes } from './db/database.js';
import {
  checkAccurateStatus,
  syncLiveAccurateDeliveryOrders,
  callAccurate,
  syncAccurateItems,
  syncSingleShipmentItemsFromAccurate,
  syncAllExistingDoItems,
  searchLiveAccurateDeliveryOrders,
  getAccurateDeliveryOrderDetail,
  scheduleSingleDeliveryOrder
} from './services/accurateService.js';
import { sortMode1TerdekatTerjauh, sortMode2NearestNeighbor, findCorridorShipments, generateMultiStopGoogleMapsUrl, isPickupShipment, optimizeJalurRoute, buildCategorizedRoutes } from './services/routingEngine.js';
import { getEligibleDrivers, requestUrgentTrip, approveUrgentTrip } from './services/urgentEngine.js';
import { submitLevel1Check, submitLevel2Approval, submitEscalationAudit } from './services/docCheckerEngine.js';
import { lookupGoogleMapsCoordinates } from './services/playwrightMapsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch (_) {}

const PORT = process.env.PORT || 7070;

initDatabase();

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// Get user from token
function getUserFromToken(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token && token.startsWith('session-')) {
    const parts = token.split('-');
    // Token format: session-{userId}-{timestamp}
    // userId can contain hyphens, timestamp is last part
    const userId = parts.slice(1, -1).join('-');
    return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  }
  return null;
}

// Get permissions for user
function getUserPermissions(userId) {
  const perms = db.prepare('SELECT permission FROM permissions WHERE user_id = ?').all(userId);
  return perms.map(p => p.permission);
}

function hasPermission(userId, perm) {
  const p = db.prepare('SELECT 1 FROM permissions WHERE user_id = ? AND permission = ?').get(userId, perm);
  return !!p;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (pathname.startsWith('/api/')) {

      // ─────────────────────────────────────
      // AUTH: Login / Logout / Me
      // ─────────────────────────────────────
      if (pathname === '/api/auth/login' && req.method === 'POST') {
        const body = await parseBody(req);
        const { username, password } = body;
        if (!username) return sendJson(res, 400, { success: false, message: 'Username wajib diisi' });

        const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username.trim());
        if (!user) return sendJson(res, 401, { success: false, message: 'Username tidak ditemukan' });
        if (!user.is_active) return sendJson(res, 401, { success: false, message: 'Akun ini sudah dinonaktifkan' });

        const permissions = getUserPermissions(user.id);
        const token = 'session-' + user.id + '-' + Date.now();

        return sendJson(res, 200, {
          success: true, token,
          user: {
            id: user.id, name: user.name, username: user.username,
            role: user.role, department: user.department,
            license_type: user.license_type, color_code: user.color_code,
            is_backup_driver: user.is_backup_driver
          },
          permissions,
          message: `Selamat datang, ${user.name}!`
        });
      }

      if (pathname === '/api/auth/logout' && req.method === 'POST') {
        return sendJson(res, 200, { success: true, message: 'Berhasil keluar (logout)' });
      }

      if (pathname === '/api/auth/me' && req.method === 'GET') {
        const user = getUserFromToken(req);
        if (user) {
          const permissions = getUserPermissions(user.id);
          return sendJson(res, 200, { success: true, user, permissions });
        }
        return sendJson(res, 401, { success: false, message: 'Belum login' });
      }

      // ─────────────────────────────────────
      // ADMIN: Users CRUD (Superadmin only)
      // ─────────────────────────────────────
      if (pathname === '/api/admin/users' && req.method === 'GET') {
        const users = db.prepare('SELECT * FROM users ORDER BY role, name').all();
        const result = users.map(u => {
          const perms = getUserPermissions(u.id);
          return { ...u, permissions: perms, password_hash: undefined };
        });
        return sendJson(res, 200, { success: true, data: result });
      }

      if (pathname === '/api/admin/users' && req.method === 'POST') {
        const body = await parseBody(req);
        const { name, username, role, department, phone, license_type, color_code, is_backup_driver, permissions = [] } = body;
        if (!name || !username) return sendJson(res, 400, { success: false, message: 'Nama dan username wajib' });

        const existing = db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(username);
        if (existing) return sendJson(res, 400, { success: false, message: 'Username sudah dipakai' });

        const userId = 'usr-' + Date.now();
        db.prepare(`INSERT INTO users (id, name, username, password_hash, phone, role, driver_type, is_backup_driver, license_type, department, color_code)
          VALUES (?, ?, ?, 'hash_pass', ?, ?, 'NONE', ?, ?, ?, ?)`)
          .run(userId, name, username, phone || '', role || 'DRIVER', is_backup_driver ? 1 : 0, license_type || '', department || '', color_code || '#64748b');

        // Set permissions
        const insertPerm = db.prepare('INSERT INTO permissions (id, user_id, permission) VALUES (?, ?, ?)');
        permissions.forEach((p, idx) => {
          insertPerm.run('perm-new-' + Date.now() + '-' + idx, userId, p);
        });

        return sendJson(res, 201, { success: true, userId, message: `User ${name} berhasil dibuat` });
      }

      if (pathname.match(/^\/api\/admin\/users\/[^/]+$/) && req.method === 'PATCH') {
        const userId = pathname.split('/')[4];
        const body = await parseBody(req);
        const { name, role, department, phone, license_type, color_code, is_active, permissions } = body;

        if (name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, userId);
        if (role !== undefined) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
        if (department !== undefined) db.prepare('UPDATE users SET department = ? WHERE id = ?').run(department, userId);
        if (phone !== undefined) db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(phone, userId);
        if (license_type !== undefined) db.prepare('UPDATE users SET license_type = ? WHERE id = ?').run(license_type, userId);
        if (color_code !== undefined) db.prepare('UPDATE users SET color_code = ? WHERE id = ?').run(color_code, userId);
        if (is_active !== undefined) db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, userId);

        // Replace permissions
        if (permissions !== undefined) {
          db.prepare('DELETE FROM permissions WHERE user_id = ?').run(userId);
          const insertPerm = db.prepare('INSERT INTO permissions (id, user_id, permission) VALUES (?, ?, ?)');
          permissions.forEach((p, idx) => {
            insertPerm.run('perm-upd-' + Date.now() + '-' + idx, userId, p);
          });
        }

        return sendJson(res, 200, { success: true, message: 'User berhasil diperbarui' });
      }

      if (pathname.match(/^\/api\/admin\/users\/[^/]+$/) && req.method === 'DELETE') {
        const userId = pathname.split('/')[4];
        db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(userId);
        return sendJson(res, 200, { success: true, message: 'User dinonaktifkan' });
      }

      // Available permissions list
      if (pathname === '/api/admin/permissions' && req.method === 'GET') {
        return sendJson(res, 200, { success: true, data: ALL_PERMISSIONS });
      }

      // ─────────────────────────────────────
      // ADMIN: App Settings
      // ─────────────────────────────────────
      if (pathname === '/api/admin/settings' && req.method === 'GET') {
        const settings = db.prepare('SELECT * FROM app_settings').all();
        const obj = {};
        settings.forEach(s => { obj[s.key] = s.value; });
        return sendJson(res, 200, { success: true, data: obj });
      }

      if (pathname === '/api/admin/settings' && req.method === 'PATCH') {
        const body = await parseBody(req);
        const upsert = db.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');
        for (const [k, v] of Object.entries(body)) {
          upsert.run(k, String(v));
        }
        return sendJson(res, 200, { success: true, message: 'Pengaturan disimpan' });
      }

      // ─────────────────────────────────────
      // STATUS
      // ─────────────────────────────────────
      if (pathname === '/api/status' && req.method === 'GET') {
        const accurate = await checkAccurateStatus();
        return sendJson(res, 200, {
          app: 'ATS Logistics Suite v2.0', db: 'SQLite active',
          accurate, timestamp: new Date().toISOString()
        });
      }

      // ─────────────────────────────────────
      // MASTER DATA
      // ─────────────────────────────────────
      if (pathname === '/api/users' && req.method === 'GET') {
        const users = db.prepare('SELECT id, name, username, role, driver_type, is_backup_driver, license_type, department, color_code, is_active FROM users WHERE is_active = 1 ORDER BY is_backup_driver ASC, name ASC').all();
        return sendJson(res, 200, { success: true, data: users });
      }

      if (pathname === '/api/vehicles' && req.method === 'GET') {
        const vehicles = db.prepare('SELECT * FROM vehicles').all();
        return sendJson(res, 200, { success: true, data: vehicles });
      }

      if (pathname === '/api/locations' && req.method === 'GET') {
        const locations = db.prepare('SELECT * FROM locations').all();
        return sendJson(res, 200, { success: true, data: locations });
      }

      if (pathname === '/api/zones' && req.method === 'GET') {
        const zones = db.prepare('SELECT * FROM zones').all();
        return sendJson(res, 200, { success: true, data: zones });
      }

      // ─────────────────────────────────────
      // MASTER SKU & PENGKATEGORIAN BARANG (BESAR / SEDANG / KECIL)
      // ─────────────────────────────────────
      if (pathname === '/api/items' && req.method === 'GET') {
        const search = (url.searchParams.get('search') || '').trim();
        const sizeClass = url.searchParams.get('size_class') || '';
        const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
        const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit')) || 50));
        const offset = (page - 1) * limit;

        let whereClauses = [];
        let params = [];

        if (search) {
          whereClauses.push('(sku LIKE ? OR name LIKE ? OR category_notes LIKE ?)');
          params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (sizeClass) {
          whereClauses.push('size_class = ?');
          params.push(sizeClass.toUpperCase());
        }

        const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

        const totalRow = db.prepare(`SELECT COUNT(*) as c FROM items ${whereSql}`).get(...params);
        const total = totalRow ? totalRow.c : 0;

        const items = db.prepare(`SELECT * FROM items ${whereSql} ORDER BY updated_at DESC, sku ASC LIMIT ? OFFSET ?`).all(...params, limit, offset);

        const stats = {
          total: db.prepare('SELECT COUNT(*) as c FROM items').get().c,
          besar: db.prepare("SELECT COUNT(*) as c FROM items WHERE size_class = 'BESAR'").get().c,
          sedang: db.prepare("SELECT COUNT(*) as c FROM items WHERE size_class = 'SEDANG'").get().c,
          kecil: db.prepare("SELECT COUNT(*) as c FROM items WHERE size_class = 'KECIL'").get().c
        };

        return sendJson(res, 200, {
          success: true,
          data: items,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          },
          stats
        });
      }

      if (pathname.match(/^\/api\/items\/[^/]+$/) && req.method === 'PATCH') {
        const itemId = decodeURIComponent(pathname.split('/')[3]);
        const body = await parseBody(req);
        const { size_class, category_notes, unit_name, updated_by, sku, name } = body;

        let current = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
        if (!current && sku) {
          current = db.prepare('SELECT * FROM items WHERE sku = ?').get(sku);
        }

        const newSize = size_class ? size_class.toUpperCase() : (current?.size_class || 'KECIL');
        const newNotes = category_notes !== undefined ? category_notes : (current?.category_notes || '');
        const newUnit = unit_name !== undefined ? unit_name : (current?.unit_name || 'PCS');
        const userStr = updated_by || 'Tim Gudang';

        if (!current) {
          const itemSku = sku || itemId.replace(/^item-/, '');
          const itemName = name || itemSku;
          db.prepare(`
            INSERT INTO items (id, sku, name, size_class, category_notes, unit_name, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `).run(itemId, itemSku, itemName, newSize, newNotes, newUnit, userStr);
        } else {
          db.prepare(`UPDATE items SET size_class = ?, category_notes = ?, unit_name = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
            .run(newSize, newNotes, newUnit, userStr, current.id);
        }

        // Auto-recalculate all shipments so that muat recommendations update immediately
        recalculateAllShipmentsMuat();

        const updated = db.prepare('SELECT * FROM items WHERE id = ? OR sku = ?').get(itemId, sku || '');
        return sendJson(res, 200, {
          success: true,
          message: `SKU ${updated?.sku || sku || itemId} berhasil diubah ke kategori ${newSize}`,
          item: updated
        });
      }

      if (pathname === '/api/items/bulk-categorize' && req.method === 'POST') {
        const body = await parseBody(req);
        const { itemIds = [], sizeClass, notes, updatedBy } = body;

        if (!Array.isArray(itemIds) || itemIds.length === 0 || !sizeClass) {
          return sendJson(res, 400, { success: false, message: 'Pilih minimal 1 item dan tentukan ukuran kategori (BESAR/SEDANG/KECIL)' });
        }

        const validSize = sizeClass.toUpperCase();
        const userStr = updatedBy || 'Tim ATS';

        const updateStmt = db.prepare(`
          UPDATE items SET
            size_class = ?,
            category_notes = COALESCE(?, category_notes),
            updated_by = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `);

        for (const id of itemIds) {
          updateStmt.run(validSize, notes || null, userStr, id);
        }

        recalculateAllShipmentsMuat();

        return sendJson(res, 200, {
          success: true,
          message: `${itemIds.length} SKU berhasil diperbarui menjadi ${validSize}!`,
          count: itemIds.length
        });
      }

      if (pathname === '/api/accurate/sync-items' && req.method === 'POST') {
        const body = await parseBody(req);
        const result = await syncAccurateItems(body);
        return sendJson(res, 200, result);
      }

      // ─────────────────────────────────────
      // SHIPMENT DETAIL & LINE ITEMS
      // ─────────────────────────────────────
      if (pathname.match(/^\/api\/shipments\/[^/]+\/detail$/) && req.method === 'GET') {
        const shipmentId = pathname.split('/')[3];
        let shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);
        if (!shipment) return sendJson(res, 404, { success: false, message: 'Surat Jalan tidak ditemukan' });

        let items = db.prepare(`
          SELECT si.*, COALESCE(i.size_class, 'KECIL') as size_class, i.category_notes as master_notes, i.name as master_name, i.id as master_item_id
          FROM shipment_items si
          LEFT JOIN items i ON si.item_no = i.sku OR (si.accurate_item_id IS NOT NULL AND si.accurate_item_id = i.accurate_item_id)
          WHERE si.shipment_id = ?
          ORDER BY si.created_at ASC, si.id ASC
        `).all(shipmentId);

        // Jika rincian item di database masih kosong dan ini dari Accurate, tarik otomatis on-demand!
        if (items.length === 0 && shipment.accurate_id) {
          try {
            await syncSingleShipmentItemsFromAccurate(shipmentId, shipment.accurate_id);
            items = db.prepare(`
              SELECT si.*, COALESCE(i.size_class, 'KECIL') as size_class, i.category_notes as master_notes, i.name as master_name, i.id as master_item_id
              FROM shipment_items si
              LEFT JOIN items i ON si.item_no = i.sku OR (si.accurate_item_id IS NOT NULL AND si.accurate_item_id = i.accurate_item_id)
              WHERE si.shipment_id = ?
              ORDER BY si.created_at ASC, si.id ASC
            `).all(shipmentId);
            shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);
          } catch (err) {
            console.error('[On-demand Item Sync Error]:', err.message);
          }
        }

        return sendJson(res, 200, {
          success: true,
          data: {
            shipment,
            items,
            itemCount: items.length,
            besarCount: items.filter(it => it.size_class === 'BESAR').length,
            sedangCount: items.filter(it => it.size_class === 'SEDANG').length,
            kecilCount: items.filter(it => it.size_class === 'KECIL').length
          }
        });
      }

      // Endpoint manual untuk tarik ulang detail produk Surat Jalan tertentu dari Accurate
      if (pathname.match(/^\/api\/shipments\/[^/]+\/sync-items$/) && req.method === 'POST') {
        const shipmentId = pathname.split('/')[3];
        const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);
        if (!shipment) return sendJson(res, 404, { success: false, message: 'Surat Jalan tidak ditemukan' });
        if (!shipment.accurate_id) return sendJson(res, 400, { success: false, message: 'Bukan Surat Jalan dari Accurate' });

        const syncResult = await syncSingleShipmentItemsFromAccurate(shipmentId, shipment.accurate_id);
        const updatedItems = db.prepare(`
          SELECT si.*, COALESCE(i.size_class, 'KECIL') as size_class, i.category_notes as master_notes, i.name as master_name, i.id as master_item_id
          FROM shipment_items si
          LEFT JOIN items i ON si.item_no = i.sku OR (si.accurate_item_id IS NOT NULL AND si.accurate_item_id = i.accurate_item_id)
          WHERE si.shipment_id = ?
          ORDER BY si.created_at ASC, si.id ASC
        `).all(shipmentId);
        const updatedShipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);

        return sendJson(res, 200, {
          success: true,
          message: `Berhasil sinkronisasi ${updatedItems.length} produk untuk ${shipment.sj_number}`,
          data: { shipment: updatedShipment, items: updatedItems }
        });
      }

      // Endpoint untuk sinkronisasi seluruh item DO yang sudah ada di database
      if (pathname === '/api/accurate/sync-all-do-items' && req.method === 'POST') {
        const results = await syncAllExistingDoItems();
        return sendJson(res, 200, { success: true, count: results.length, data: results });
      }

      // ─────────────────────────────────────
      // ACCURATE ONLINE: LIVE DELIVERY ORDER (DO) SEARCH & PREVIEW
      // ─────────────────────────────────────
      if (pathname === '/api/accurate/delivery-orders/search' && req.method === 'GET') {
        const q = url.searchParams.get('q') || '';
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const result = await searchLiveAccurateDeliveryOrders(q, limit);
        return sendJson(res, 200, result);
      }

      if (pathname.match(/^\/api\/accurate\/delivery-orders\/[^/]+\/preview$/) && req.method === 'GET') {
        const accId = pathname.split('/')[4];
        const docType = url.searchParams.get('type') || '';
        const docNumber = url.searchParams.get('number') || '';
        const result = await getAccurateDeliveryOrderDetail(accId, docType, docNumber);
        return sendJson(res, 200, result);
      }

      if (pathname === '/api/accurate/delivery-orders/schedule' && req.method === 'POST') {
        const body = await parseBody(req);
        const user = getUserFromToken(req);
        if (!body.scheduledBy && user) {
          body.scheduledBy = user.name || user.username;
        }
        const result = await scheduleSingleDeliveryOrder(body);
        return sendJson(res, result.success ? 200 : 400, result);
      }

      if (pathname.match(/^\/api\/shipments\/[^/]+\/unschedule$/) && req.method === 'POST') {
        const shipmentId = pathname.split('/')[3];
        db.prepare("UPDATE shipments SET status = 'DRAFT', plan_date = NULL, assigned_driver = NULL, assigned_vehicle_type = NULL WHERE id = ?").run(shipmentId);
        return sendJson(res, 200, { success: true, message: 'Jadwal berhasil dibatalkan dan status kembali menjadi DRAFT' });
      }

      if (pathname.match(/^\/api\/shipments\/[^/]+$/) && req.method === 'DELETE') {
        const shipmentId = pathname.split('/')[3];
        const ship = db.prepare('SELECT sj_number FROM shipments WHERE id = ?').get(shipmentId);
        db.prepare('DELETE FROM shipment_items WHERE shipment_id = ?').run(shipmentId);
        db.prepare('DELETE FROM stops WHERE shipment_id = ?').run(shipmentId);
        db.prepare('DELETE FROM shipments WHERE id = ?').run(shipmentId);
        return sendJson(res, 200, { success: true, message: `Surat Jalan ${ship?.sj_number || shipmentId} berhasil dihapus dari sistem` });
      }

      // ─────────────────────────────────────
      // EDIT ALAMAT & TITIK KOORDINAT PENGIRIMAN (Marketing / Dispatcher)
      // ─────────────────────────────────────
      if (pathname.match(/^\/api\/shipments\/[^/]+\/address$/) && (req.method === 'PATCH' || req.method === 'PUT')) {
        const shipmentId = pathname.split('/')[3];
        const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);
        if (!shipment) return sendJson(res, 404, { success: false, message: 'Surat Jalan tidak ditemukan' });

        const body = await parseBody(req);
        let { destination_address, destination_lat, destination_lng, zone_code, notes } = body;

        // Auto-extract lat/lng if user pasted a coordinate string
        if (typeof destination_lat === 'string' && destination_lat.includes(',')) {
          const parts = destination_lat.split(',');
          destination_lat = parseFloat(parts[0].trim());
          destination_lng = parseFloat(parts[1].trim());
        }

        const latVal = (destination_lat !== undefined && destination_lat !== null && destination_lat !== '') ? parseFloat(destination_lat) : (destination_lat === null ? null : shipment.destination_lat);
        const lngVal = (destination_lng !== undefined && destination_lng !== null && destination_lng !== '') ? parseFloat(destination_lng) : (destination_lng === null ? null : shipment.destination_lng);
        const addrVal = destination_address !== undefined ? String(destination_address).trim() : shipment.destination_address;
        const zoneVal = zone_code !== undefined ? String(zone_code).trim().toUpperCase() : shipment.zone_code;
        const notesVal = notes !== undefined ? String(notes).trim() : shipment.notes;

        db.prepare(`
          UPDATE shipments
          SET destination_address = ?, destination_lat = ?, destination_lng = ?, zone_code = ?, notes = ?
          WHERE id = ?
        `).run(addrVal, latVal, lngVal, zoneVal, notesVal, shipmentId);

        const updated = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);
        return sendJson(res, 200, {
          success: true,
          message: `Alamat & koordinat untuk ${shipment.sj_number} berhasil disimpan`,
          data: updated
        });
      }

      // ─────────────────────────────────────
      // GEOCODING: Cari Alamat / Tempat ke Titik Koordinat via Google Maps (Headless Playwright)
      // Playwright berjalan di latar belakang secara senyap tanpa user tahu
      // ─────────────────────────────────────
      if (pathname === '/api/geocode' && req.method === 'GET') {
        const rawQ = (url.searchParams.get('q') || '').trim();
        if (!rawQ) return sendJson(res, 200, { success: true, results: [] });

        const cleanQ = rawQ
          .replace(/^(alamat|kirim ke|tujuan|customer):\s*/i, '')
          .replace(/telp[\s\d\-+()]+/i, '')
          .trim();

        let results = [];

        // 1. Ambil koordinat Google Maps via Background Headless Playwright
        try {
          const gmapsCoord = await lookupGoogleMapsCoordinates(cleanQ);
          if (gmapsCoord) {
            results.push({
              display_name: gmapsCoord.display_name,
              lat: gmapsCoord.lat,
              lng: gmapsCoord.lng,
              zoneCode: gmapsCoord.zoneCode,
              zoneName: gmapsCoord.zoneName,
              source: 'google_maps'
            });
          }
        } catch (err) {
          console.error('[Background Playwright Maps Geocode Error]:', err.message);
        }

        // 2. Local known landmarks for instant zero-latency match (if not already matched)
        const LOCAL_LANDMARKS = [
          { pattern: /rungkut\s*industri|sier/i, lat: -7.3325, lng: 112.7681, name: 'Kawasan Industri SIER / Rungkut Industri, Surabaya' },
          { pattern: /berbek\s*industri/i, lat: -7.3524, lng: 112.7491, name: 'Berbek Industri, Waru, Sidoarjo' },
          { pattern: /margomulyo|tandes/i, lat: -7.2415, lng: 112.6842, name: 'Margomulyo / Pergudangan Suri Mulia, Surabaya Barat' },
          { pattern: /ecco\s*(indonesia)?/i, lat: -7.4733, lng: 112.7136, name: 'PT. ECCO Indonesia, Jl. Raya Candi, Sidoarjo' },
          { pattern: /buduran/i, lat: -7.4128, lng: 112.7215, name: 'Kawasan Industri Buduran, Sidoarjo' },
          { pattern: /gedangan/i, lat: -7.3820, lng: 112.7280, name: 'Gedangan, Sidoarjo' },
          { pattern: /candi\s*(sidoarjo)?/i, lat: -7.4720, lng: 112.7140, name: 'Kawasan Candi, Sidoarjo' },
          { pattern: /pier|rembang\s*pasuruan/i, lat: -7.6124, lng: 112.8211, name: 'Kawasan Industri PIER Rembang, Pasuruan' },
          { pattern: /ngoro|nip\s*mojokerto/i, lat: -7.5800, lng: 112.6200, name: 'Ngoro Industrial Park (NIP), Mojokerto' },
          { pattern: /manyar|jiipe|kim\s*gresik/i, lat: -7.1350, lng: 112.6100, name: 'Kawasan Industri Manyar / JIIPE / KIM Gresik' },
          { pattern: /driyorejo/i, lat: -7.3400, lng: 112.6200, name: 'Driyorejo, Gresik Selatan' },
          { pattern: /krian|trosobo/i, lat: -7.3850, lng: 112.6100, name: 'Krian / Trosobo, Sidoarjo Barat' },
          { pattern: /waru/i, lat: -7.3520, lng: 112.7280, name: 'Waru, Sidoarjo' },
          { pattern: /tanjung\s*perak/i, lat: -7.2050, lng: 112.7350, name: 'Pelabuhan Tanjung Perak, Surabaya' },
          { pattern: /gudang\s*j40|rungkut\s*megah/i, lat: -7.3021, lng: 112.7819, name: 'Gudang Pusat J40 ATS Logistics, Rungkut' }
        ];

        for (const lm of LOCAL_LANDMARKS) {
          if (lm.pattern.test(cleanQ)) {
            // Only add if not duplicate
            if (!results.some(r => Math.abs(r.lat - lm.lat) < 0.005 && Math.abs(r.lng - lm.lng) < 0.005)) {
              results.push({
                display_name: lm.name,
                lat: lm.lat,
                lng: lm.lng,
                source: 'local'
              });
            }
            break;
          }
        }

        // 3. Fallback / Alternative suggestions via Nominatim OpenStreetMap (if results < 2)
        if (results.length < 2) {
          try {
            const nominatimQuery = encodeURIComponent(cleanQ + (cleanQ.toLowerCase().includes('jawa timur') || cleanQ.toLowerCase().includes('surabaya') || cleanQ.toLowerCase().includes('sidoarjo') || cleanQ.toLowerCase().includes('gresik') ? '' : ', Jawa Timur, Indonesia'));
            const urlStr = `https://nominatim.openstreetmap.org/search?format=json&q=${nominatimQuery}&countrycodes=id&limit=3`;
            
            const nomRes = await new Promise((resolve) => {
              const req = https.get(urlStr, {
                headers: { 'User-Agent': 'ATS-Logistics/2.0 (operations@atslogistics.local)' },
                timeout: 3000
              }, res => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => {
                  try { resolve(JSON.parse(d)); } catch(e) { resolve([]); }
                });
              });
              req.on('error', () => resolve([]));
              req.on('timeout', () => { req.destroy(); resolve([]); });
            });

            if (Array.isArray(nomRes)) {
              for (const item of nomRes) {
                const itemLat = parseFloat(item.lat);
                const itemLng = parseFloat(item.lon);
                if (!isNaN(itemLat) && !isNaN(itemLng)) {
                  if (!results.some(r => Math.abs(r.lat - itemLat) < 0.005 && Math.abs(r.lng - itemLng) < 0.005)) {
                    results.push({
                      display_name: item.display_name,
                      lat: itemLat,
                      lng: itemLng,
                      source: 'nominatim'
                    });
                  }
                }
              }
            }
          } catch (e) {
            // Ignore external geocoding errors, Google Maps & local results suffice
          }
        }

        // Attach zone detection to all results
        const enriched = results.map(r => {
          let zoneCode = r.zoneCode;
          let zoneName = r.zoneName;
          const lat = r.lat;
          const lng = r.lng;

          if (!zoneCode) {
            zoneCode = 'FR';
            zoneName = 'Zona FR (Surabaya)';
            if (lat > -7.22 && lng < 112.65) { zoneCode = 'A'; zoneName = 'Zona A (Gresik / Manyar / KIM)'; }
            else if (lat > -7.27 && lng < 112.70) { zoneCode = 'A'; zoneName = 'Zona A (Margomulyo / Tandes)'; }
            else if (lat < -7.52 && lng < 112.65) { zoneCode = 'NG'; zoneName = 'Zona NG (Mojokerto / Ngoro NIP)'; }
            else if (lat < -7.50 && lng > 112.75) { zoneCode = 'PSR'; zoneName = 'Zona PSR (Pasuruan / PIER Rembang)'; }
            else if (lat < -7.42) { zoneCode = 'C'; zoneName = 'Zona C (Sidoarjo Kota / Buduran / Candi)'; }
            else if (lat < -7.33) { zoneCode = 'B'; zoneName = 'Zona B (Sidoarjo Utara / Waru / Berbek)'; }
          }

          return {
            display_name: r.display_name,
            lat: r.lat,
            lng: r.lng,
            zoneCode,
            zoneName
          };
        });

        return sendJson(res, 200, { success: true, query: rawQ, results: enriched });
      }

      // Endpoint khusus: Pick Titik Koordinat dari Alamat via Playwright Background Google Maps
      if (pathname === '/api/geocode/pick-coordinates' && req.method === 'POST') {
        const body = await parseBody(req);
        const address = (body.address || body.query || '').trim();
        if (!address) return sendJson(res, 400, { success: false, message: 'Alamat tujuan wajib diisi' });

        try {
          const coord = await lookupGoogleMapsCoordinates(address);
          if (coord) {
            return sendJson(res, 200, {
              success: true,
              data: coord,
              message: `Titik koordinat berhasil diambil (${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)})`
            });
          } else {
            return sendJson(res, 404, {
              success: false,
              message: 'Koordinat alamat tidak ditemukan di Google Maps'
            });
          }
        } catch (err) {
          console.error('[Pick Coordinates Error]:', err);
          return sendJson(res, 500, { success: false, message: 'Gagal mengambil koordinat: ' + err.message });
        }
      }

      // ─────────────────────────────────────
      // SHIPMENTS
      // ─────────────────────────────────────
      if (pathname === '/api/shipments' && req.method === 'GET') {
        const status = url.searchParams.get('status');
        let query = 'SELECT * FROM shipments';
        const params = [];
        if (status) { query += ' WHERE status = ?'; params.push(status); }
        query += ' ORDER BY priority DESC, created_at DESC';
        const shipments = db.prepare(query).all(...params);
        return sendJson(res, 200, { success: true, count: shipments.length, data: shipments });
      }

      // ─────────────────────────────────────
      // DASHBOARD KHUSUS HARI INI (Command Center Seluruh Modul)
      // Menampilkan ringkasan seluruh pengiriman hari ini, muatan driver (target 8-10 SJ), rute jalur, & status
      // ─────────────────────────────────────
      if (pathname === '/api/dashboard/today' && req.method === 'GET') {
        let reqDate = url.searchParams.get('date');
        if (!reqDate) {
          // Default to latest active delivery date (e.g. 2026-10-02 from manual spreadsheet) or current date
          const sample = db.prepare("SELECT plan_date FROM shipments WHERE plan_date IS NOT NULL ORDER BY plan_date DESC LIMIT 1").get();
          reqDate = sample ? sample.plan_date : '2026-10-02';
        }

        const shipments = db.prepare(`
          SELECT * FROM shipments
          WHERE plan_date = ?
          ORDER BY COALESCE(index_no, 9999) ASC, priority DESC, created_at DESC
        `).all(reqDate);

        // Calculate Stats
        const total = shipments.length;
        const scheduledCount = shipments.filter(s => s.status === 'SCHEDULED').length;
        const assignedCount = shipments.filter(s => s.status === 'ASSIGNED').length;
        const inTransitCount = shipments.filter(s => s.status === 'IN_TRANSIT').length;
        const deliveredCount = shipments.filter(s => s.status === 'DELIVERED').length;
        const pickupCount = shipments.filter(s => isPickupShipment(s)).length;
        const mobilCount = shipments.filter(s => !isPickupShipment(s) && ['TRAGA', 'CARRY', 'GRANMAX', 'AVANZA', 'MOBIL'].includes(s.assigned_vehicle_type || s.required_vehicle_type)).length;
        const motorCount = shipments.filter(s => !isPickupShipment(s) && (s.assigned_vehicle_type === 'MOTOR' || s.required_vehicle_type === 'MOTOR')).length;

        // Group by Driver with 8-10 SJ Capacity Tracking
        const driverMap = {};
        for (const s of shipments) {
          if (isPickupShipment(s)) continue;
          const drv = s.assigned_driver || 'Belum Ditugaskan';
          if (!driverMap[drv]) {
            driverMap[drv] = {
              driver_name: drv,
              vehicle_type: s.assigned_vehicle_type || s.required_vehicle_type || 'MOTOR',
              shipments: [],
              total_points: 0,
              total_weight_kg: 0,
              zones: new Set()
            };
          }
          driverMap[drv].shipments.push(s);
          driverMap[drv].total_points += (s.total_points || 0);
          driverMap[drv].total_weight_kg += (s.total_weight_kg || 0);
          if (s.zone_code) driverMap[drv].zones.add(s.zone_code);
        }

        const driverLoads = Object.values(driverMap).map(d => {
          const sjCount = d.shipments.length;
          // Target kapasitas per orang adalah 8 - 10 SJ sejalur
          let capacityStatus = 'under';
          let capacityLabel = `${sjCount}/10 SJ (Muatan Ringan)`;
          if (sjCount >= 8 && sjCount <= 10) {
            capacityStatus = 'ideal';
            capacityLabel = `${sjCount}/10 SJ (Kapasitas Ideal)`;
          } else if (sjCount > 10) {
            capacityStatus = 'over';
            capacityLabel = `${sjCount}/10 SJ (Overload > 10 SJ)`;
          }

          let corridor = Array.from(d.zones).join(', ') || 'Umum';
          if (corridor.includes('PSR') || corridor.includes('NG')) corridor = 'Koridor Pasuruan, Gempol & Pandaan';
          else if (corridor.includes('B') || corridor.includes('C')) corridor = 'Koridor Sidoarjo & Buduran';
          else if (corridor.includes('A')) corridor = 'Koridor Gresik';
          else if (corridor.includes('FR')) corridor = 'Koridor Surabaya';

          return {
            driver_name: d.driver_name,
            vehicle_type: d.vehicle_type,
            sj_count: sjCount,
            target_capacity: 10,
            capacity_status: capacityStatus,
            capacity_label: capacityLabel,
            capacity_percentage: Math.min(100, Math.round((sjCount / 10) * 100)),
            corridor,
            total_weight_kg: Math.round(d.total_weight_kg * 10) / 10,
            total_points: d.total_points,
            shipments: d.shipments
          };
        });

        // Generate Jalur Routes for Today using automated corridor clustering
        const origin = db.prepare("SELECT * FROM locations WHERE code = 'J40'").get() || { lat: -7.30211, lng: 112.7819, code: 'J40', name: 'Gudang Utama J40' };
        const categorizedRoutes = buildCategorizedRoutes(origin, shipments);
        const jalurs = categorizedRoutes.map(r => ({
          id: r.routeId,
          name: r.routeName,
          driver_name: r.assignedDriver || 'Menunggu Penugasan Tim Ops',
          vehicle_type: r.assignedVehicle || r.suggestedVehicle,
          sj_count: r.shipmentCount,
          total_km: r.totalKm,
          est_hours: r.totalDurationFormatted,
          google_maps_url: r.googleMapsUrl,
          muat_recommendation: r.muatRecommendation,
          is_assigned: r.isAssigned,
          stops: r.stops.map(st => ({
            seq: st.sequence,
            sj_number: st.sj_number,
            customer_name: st.customer_name,
            address: st.destination_address,
            notes: st.notes,
            lat: st.lat,
            lng: st.lng,
            muat_category: st.muat_category,
            leg_distance_km: st.leg_distance_km,
            leg_minutes: st.leg_minutes,
            eta_time: st.eta_time
          }))
        }));

        return sendJson(res, 200, {
          success: true,
          date: reqDate,
          stats: {
            total_shipments: total,
            scheduled_count: scheduledCount,
            assigned_count: assignedCount,
            in_transit_count: inTransitCount,
            delivered_count: deliveredCount,
            pickup_count: pickupCount,
            mobil_count: mobilCount,
            motor_count: motorCount,
            active_drivers_count: driverLoads.filter(d => d.driver_name !== 'Belum Ditugaskan').length,
            avg_load: driverLoads.length > 0 ? (Math.round((total / Math.max(1, driverLoads.length)) * 10) / 10) : 0
          },
          driver_loads: driverLoads,
          jalurs,
          shipments
        });
      }

      // ─────────────────────────────────────
      // RIWAYAT SEMUA PENGIRIMAN (Format Ekspedisi Spreadsheet Manual)
      // ─────────────────────────────────────
      if (pathname === '/api/shipments/history' && req.method === 'GET') {
        const search = (url.searchParams.get('search') || '').trim();
        const period = url.searchParams.get('period') || 'all';
        const startDate = url.searchParams.get('startDate');
        const endDate = url.searchParams.get('endDate');
        const vehicle = url.searchParams.get('vehicle') || 'all';
        const driver = url.searchParams.get('driver') || 'all';
        const status = url.searchParams.get('status') || 'all';
        const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
        const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit')) || 100));
        const offset = (page - 1) * limit;

        let whereClauses = [];
        let params = [];

        if (search) {
          whereClauses.push('(sj_number LIKE ? OR po_number LIKE ? OR customer_name LIKE ? OR destination_address LIKE ? OR notes LIKE ?)');
          params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (period === 'today') {
          whereClauses.push("(plan_date = '2026-10-01' OR plan_date = DATE('now'))");
        } else if (period === 'tomorrow') {
          whereClauses.push("(plan_date = '2026-10-02' OR plan_date = DATE('now', '+1 day'))");
        } else if (period === 'this_week') {
          whereClauses.push("plan_date BETWEEN '2026-09-28' AND '2026-10-04'");
        } else if (period === 'custom' && startDate && endDate) {
          whereClauses.push('plan_date BETWEEN ? AND ?');
          params.push(startDate, endDate);
        }

        if (vehicle !== 'all') {
          if (vehicle === 'MOBIL') {
            whereClauses.push("(assigned_vehicle_type IN ('TRAGA', 'CARRY', 'GRANMAX', 'AVANZA', 'MOBIL') OR required_vehicle_type IN ('TRAGA', 'CARRY', 'GRANMAX', 'AVANZA', 'MOBIL')) AND (fulfillment_type != 'PICKUP_J23' AND type != 'PICKUP')");
          } else if (vehicle === 'MOTOR') {
            whereClauses.push("(assigned_vehicle_type = 'MOTOR' OR (assigned_vehicle_type IS NULL AND required_vehicle_type = 'MOTOR')) AND (fulfillment_type != 'PICKUP_J23' AND type != 'PICKUP')");
          } else if (vehicle === 'PICKUP') {
            whereClauses.push("(fulfillment_type = 'PICKUP_J23' OR type = 'PICKUP')");
          }
        }

        if (driver !== 'all') {
          whereClauses.push('assigned_driver = ?');
          params.push(driver);
        }

        if (status !== 'all') {
          whereClauses.push('status = ?');
          params.push(status);
        }

        const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
        const totalRow = db.prepare(`SELECT COUNT(*) as c FROM shipments ${whereSql}`).get(...params);
        const total = totalRow ? totalRow.c : 0;

        const rows = db.prepare(`
          SELECT * FROM shipments
          ${whereSql}
          ORDER BY COALESCE(index_no, 99999) ASC, plan_date DESC, created_at DESC
          LIMIT ? OFFSET ?
        `).all(...params, limit, offset);

        const daysMap = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
        const formatted = rows.map((r, idx) => {
          let dayName = '-';
          let dateFormatted = '-';
          if (r.plan_date) {
            const parts = r.plan_date.split('-');
            if (parts.length === 3) {
              dateFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
              const dObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
              dayName = daysMap[dObj.getDay()] || '-';
            }
          }

          let vehDisplay = 'MOTOR';
          if (isPickupShipment(r)) {
            vehDisplay = 'PICKUP J23';
          } else if (r.assigned_vehicle_type) {
            vehDisplay = ['TRAGA', 'CARRY', 'GRANMAX', 'AVANZA', 'TRUK'].includes(r.assigned_vehicle_type) ? 'MOBIL' : r.assigned_vehicle_type;
          } else if (['TRAGA', 'CARRY', 'GRANMAX', 'AVANZA', 'TRUK'].includes(r.required_vehicle_type)) {
            vehDisplay = 'MOBIL';
          }

          return {
            ...r,
            index_no: r.index_no || (7360 + idx),
            day_name: dayName,
            plan_date_formatted: dateFormatted,
            vehicle_display: vehDisplay
          };
        });

        // Global stats for filter pills
        const globalStats = {
          total: db.prepare('SELECT COUNT(*) as c FROM shipments').get().c,
          mobil: db.prepare("SELECT COUNT(*) as c FROM shipments WHERE (assigned_vehicle_type IN ('TRAGA', 'CARRY', 'GRANMAX', 'AVANZA') OR required_vehicle_type IN ('TRAGA', 'CARRY', 'GRANMAX', 'AVANZA')) AND fulfillment_type != 'PICKUP_J23'").get().c,
          motor: db.prepare("SELECT COUNT(*) as c FROM shipments WHERE (assigned_vehicle_type = 'MOTOR' OR required_vehicle_type = 'MOTOR') AND fulfillment_type != 'PICKUP_J23'").get().c,
          pickup: db.prepare("SELECT COUNT(*) as c FROM shipments WHERE fulfillment_type = 'PICKUP_J23' OR type = 'PICKUP'").get().c,
          delivered: db.prepare("SELECT COUNT(*) as c FROM shipments WHERE status = 'DELIVERED'").get().c
        };

        return sendJson(res, 200, {
          success: true,
          data: formatted,
          pagination: {
            page, limit, total,
            totalPages: Math.ceil(total / limit)
          },
          stats: globalStats
        });
      }

      // ─────────────────────────────────────
      // ITEM DI SURAT JALAN TERJADWAL KIRIM (Besok & Hari Ini)
      // Fokus kategori tim: Hanya SKU yang ada di jadwal kirim aktif
      // ─────────────────────────────────────
      if (pathname === '/api/items/scheduled' && req.method === 'GET') {
        let reqDate = url.searchParams.get('date');
        const period = url.searchParams.get('period') || 'upcoming';

        let dateFilter = "s.plan_date IS NOT NULL AND s.plan_date != ''";
        let dateParams = [];

        if (reqDate) {
          dateFilter = "s.plan_date = ?";
          dateParams = [reqDate];
        } else if (period === 'today') {
          const today = new Date().toISOString().split('T')[0];
          dateFilter = "s.plan_date = ? OR s.plan_date = '2026-10-01'";
          dateParams = [today];
        } else if (period === 'tomorrow') {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          const tomorrow = d.toISOString().split('T')[0];
          dateFilter = "s.plan_date = ? OR s.plan_date = '2026-10-02'";
          dateParams = [tomorrow];
        } else {
          // 'upcoming' / 'all' - Show all items from all scheduled Delivery Orders
          dateFilter = "s.plan_date IS NOT NULL AND s.plan_date != ''";
          dateParams = [];
        }

        const scheduledLines = db.prepare(`
          SELECT 
            si.item_no,
            si.item_name,
            si.quantity,
            si.unit_name,
            si.shipment_id,
            s.sj_number,
            s.customer_name,
            s.plan_date,
            s.required_vehicle_type,
            COALESCE(i.id, 'item-' || lower(replace(si.item_no, ' ', '-'))) as master_id,
            COALESCE(i.size_class, 'KECIL') as size_class,
            i.category_notes,
            i.updated_at,
            i.updated_by
          FROM shipment_items si
          JOIN shipments s ON si.shipment_id = s.id
          LEFT JOIN items i ON si.item_no = i.sku OR (si.accurate_item_id IS NOT NULL AND si.accurate_item_id = i.accurate_item_id)
          WHERE s.status IN ('SCHEDULED', 'ASSIGNED', 'IN_TRANSIT', 'DRAFT')
            AND ${dateFilter}
          ORDER BY s.plan_date ASC, s.sj_number ASC
        `).all(...dateParams);

        // Group by item_no
        const itemMap = {};
        for (const line of scheduledLines) {
          const key = line.item_no;
          if (!itemMap[key]) {
            itemMap[key] = {
              master_id: line.master_id,
              sku: line.item_no,
              name: line.item_name,
              size_class: line.size_class || 'KECIL',
              unit_name: line.unit_name || 'PCS',
              category_notes: line.category_notes || '',
              updated_at: line.updated_at,
              updated_by: line.updated_by,
              total_qty: 0,
              sjs: [],
              customers: new Set()
            };
          }
          itemMap[key].total_qty += Number(line.quantity || 1);
          itemMap[key].sjs.push({
            shipment_id: line.shipment_id,
            sj_number: line.sj_number,
            customer_name: line.customer_name,
            quantity: line.quantity,
            unit_name: line.unit_name
          });
          itemMap[key].customers.add(line.customer_name);
        }

        const itemsList = Object.values(itemMap).map(it => ({
          ...it,
          sj_count: it.sjs.length,
          customer_names: Array.from(it.customers).slice(0, 3).join(', ') + (it.customers.size > 3 ? ` (+${it.customers.size - 3})` : ''),
          is_categorized: Boolean(it.updated_at || it.size_class !== 'KECIL' || (it.category_notes && it.category_notes.length > 0))
        }));

        // Sort: uncategorized first, then BESAR, then SEDANG, then KECIL
        itemsList.sort((a, b) => {
          if (!a.is_categorized && b.is_categorized) return -1;
          if (a.is_categorized && !b.is_categorized) return 1;
          const order = { 'BESAR': 3, 'SEDANG': 2, 'KECIL': 1 };
          return (order[b.size_class] || 0) - (order[a.size_class] || 0);
        });

        const totalItems = itemsList.length;
        const besarCount = itemsList.filter(it => it.size_class === 'BESAR').length;
        const sedangCount = itemsList.filter(it => it.size_class === 'SEDANG').length;
        const kecilCount = itemsList.filter(it => it.size_class === 'KECIL').length;
        const categorizedCount = itemsList.filter(it => it.is_categorized).length;

        const scheduledSjs = db.prepare(`
          SELECT COUNT(DISTINCT s.id) as c FROM shipments s
          WHERE s.status IN ('SCHEDULED', 'ASSIGNED', 'IN_TRANSIT') AND ${dateFilter}
        `).get(...dateParams).c;

        return sendJson(res, 200, {
          success: true,
          date: reqDate,
          period,
          scheduled_sj_count: scheduledSjs,
          stats: {
            total_items: totalItems,
            categorized_count: categorizedCount,
            uncategorized_count: totalItems - categorizedCount,
            besar_count: besarCount,
            sedang_count: sedangCount,
            kecil_count: kecilCount,
            percentage: totalItems > 0 ? Math.round((categorizedCount / totalItems) * 100) : 100
          },
          items: itemsList
        });
      }

      // TAHAP 1: Marketing — Jadwalkan tanggal kirim
      if (pathname === '/api/shipments/schedule-date' && req.method === 'POST') {
        const body = await parseBody(req);
        const { shipmentIds = [], planDate, scheduledBy } = body;
        if (!planDate) return sendJson(res, 400, { success: false, message: 'Tanggal kirim wajib diisi' });

        const now = new Date().toISOString();
        const update = db.prepare(`UPDATE shipments SET status = 'SCHEDULED', plan_date = ?, scheduled_by = ?, scheduled_at = ? WHERE id = ?`);
        let count = 0;
        let skippedPickup = 0;
        for (const id of shipmentIds) {
          const s = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
          if (s && isPickupShipment(s)) {
            skippedPickup++;
            continue; // Pesanan pickup tidak dijadwalkan untuk pengiriman armada
          }
          update.run(planDate, scheduledBy || 'Marketing', now, id);
          count++;
        }
        let msg = `${count} SJ berhasil dijadwalkan ke tanggal ${planDate}`;
        if (skippedPickup > 0) {
          msg += ` (${skippedPickup} SJ Pickup J23 diabaikan dari jadwal kirim armada)`;
        }
        return sendJson(res, 200, { success: true, message: msg, count });
      }

      // TAHAP 2: Dispatcher — Tugaskan driver & armada
      if (pathname === '/api/shipments/assign-driver' && req.method === 'POST') {
        const body = await parseBody(req);
        const { shipmentId, driver, vehicleType, tasBingkisan, muatOverride, assignedBy, notes } = body;
        if (!shipmentId || !driver || !vehicleType) {
          return sendJson(res, 400, { success: false, message: 'SJ, driver, dan armada wajib diisi' });
        }

        const s = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);
        if (s && isPickupShipment(s)) {
          return sendJson(res, 400, {
            success: false,
            message: 'Surat Jalan ini berstatus DIAMBIL DI J23 (Pickup), tidak memerlukan penugasan armada driver.'
          });
        }

        const now = new Date().toISOString();
        db.prepare(`UPDATE shipments SET
          status = 'ASSIGNED', assigned_driver = ?, assigned_vehicle_type = ?,
          required_vehicle_type = ?, assigned_by = ?, assigned_at = ?,
          tas_size = ?, muat_override = ?, notes = COALESCE(?, notes)
          WHERE id = ?`)
          .run(driver, vehicleType, vehicleType, assignedBy || 'Dispatcher', now,
               tasBingkisan || 'KECIL', muatOverride || null, notes || null, shipmentId);

        return sendJson(res, 200, { success: true, message: `SJ ditugaskan ke ${driver} (${vehicleType})` });
      }

      // ─────────────────────────────────────
      // ZONE LOCKS (1 mobil = 1 zona per hari)
      // ─────────────────────────────────────
      if (pathname === '/api/zone-locks' && req.method === 'GET') {
        const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
        const locks = db.prepare('SELECT zl.*, u.name as driver_name FROM zone_locks zl LEFT JOIN users u ON zl.driver_id = u.id WHERE zl.plan_date = ?').all(date);
        return sendJson(res, 200, { success: true, data: locks });
      }

      if (pathname === '/api/zone-locks/check' && req.method === 'GET') {
        const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
        const zone = url.searchParams.get('zone');
        const vehicleType = url.searchParams.get('vehicleType');

        // Motor is always free, only check for cars
        if (vehicleType === 'MOTOR') {
          return sendJson(res, 200, { success: true, available: true, message: 'Motor bebas zona' });
        }

        const existingLock = db.prepare(
          `SELECT zl.*, u.name as driver_name FROM zone_locks zl
           LEFT JOIN users u ON zl.driver_id = u.id
           WHERE zl.plan_date = ? AND zl.zone_code = ? AND zl.vehicle_id != ?`
        ).all(date, zone, vehicleType);

        // Check if another car already locked this zone
        const otherCarsInZone = db.prepare(
          `SELECT zl.*, u.name as driver_name FROM zone_locks zl
           LEFT JOIN users u ON zl.driver_id = u.id
           WHERE zl.plan_date = ? AND zl.zone_code = ?`
        ).all(date, zone);

        if (otherCarsInZone.length > 0) {
          const locked = otherCarsInZone[0];
          return sendJson(res, 200, {
            success: true, available: false,
            message: `Zona ${zone} sudah diambil oleh ${locked.vehicle_type} (${locked.driver_name || 'driver'}) pada ${date}`,
            lockedBy: locked
          });
        }

        return sendJson(res, 200, { success: true, available: true });
      }

      if (pathname === '/api/zone-locks' && req.method === 'POST') {
        const body = await parseBody(req);
        const { planDate, zoneCode, vehicleId, vehicleType, driverId, lockedBy } = body;

        // Check if already locked by different vehicle
        const existing = db.prepare('SELECT * FROM zone_locks WHERE plan_date = ? AND zone_code = ?').get(planDate, zoneCode);
        if (existing && existing.vehicle_id !== vehicleId) {
          return sendJson(res, 409, { success: false, message: `Zona ${zoneCode} sudah dikunci oleh kendaraan lain pada ${planDate}` });
        }

        if (!existing) {
          db.prepare(`INSERT INTO zone_locks (id, plan_date, zone_code, vehicle_id, vehicle_type, driver_id, locked_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run('zlock-' + Date.now(), planDate, zoneCode, vehicleId, vehicleType, driverId, lockedBy);
        }

        return sendJson(res, 200, { success: true, message: `Zona ${zoneCode} dikunci untuk ${vehicleType}` });
      }

      // ─────────────────────────────────────
      // TRIPS
      // ─────────────────────────────────────
      if (pathname === '/api/trips' && req.method === 'GET') {
        const trips = db.prepare('SELECT * FROM trips ORDER BY plan_date DESC, is_urgent DESC, created_at DESC').all();
        const tripsWithStops = trips.map(t => {
          const stops = db.prepare('SELECT * FROM stops WHERE trip_id = ? ORDER BY sequence ASC').all(t.id);
          return { ...t, stops };
        });
        return sendJson(res, 200, { success: true, data: tripsWithStops });
      }

      if (pathname === '/api/trips' && req.method === 'POST') {
        const body = await parseBody(req);
        const { planDate, zoneCode, driverId, vehicleId, shipmentIds = [], routeMode = 'MODE_1_DISTANCE', isUrgent = false } = body;

        const driver = db.prepare('SELECT * FROM users WHERE id = ?').get(driverId);
        const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);
        const origin = db.prepare("SELECT * FROM locations WHERE code = 'J40'").get();

        if (!driver || !vehicle) {
          return sendJson(res, 400, { success: false, message: 'Driver dan Kendaraan wajib dipilih' });
        }

        const tripId = 'trip-' + Date.now();
        const rawStops = [];
        for (const sId of shipmentIds) {
          const s = db.prepare('SELECT * FROM shipments WHERE id = ?').get(sId);
          if (s && !isPickupShipment(s)) {
            rawStops.push({
              shipment_id: s.id, customer_name: s.customer_name,
              address: s.destination_address,
              lat: s.destination_lat || -7.38, lng: s.destination_lng || 112.72,
              priority: s.priority, points: s.total_points,
              is_locked: s.priority === 'HARUS' ? 1 : 0
            });
          }
        }

        const orderedStops = routeMode === 'MODE_2_NEAREST_NEIGHBOR'
          ? sortMode2NearestNeighbor(origin, rawStops)
          : sortMode1TerdekatTerjauh(origin, rawStops);

        const totalKm = orderedStops.length > 0 ? orderedStops[orderedStops.length - 1].cumulative_km || 15.0 : 0;
        const totalPoints = rawStops.reduce((sum, s) => sum + (s.points || 0), 0);

        db.prepare(`INSERT INTO trips (id, plan_date, zone_code, driver_id, driver_name, vehicle_id, vehicle_plate, vehicle_type, origin_location_code, trip_type, is_urgent, route_mode, total_km, total_points, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'J40', ?, ?, ?, ?, ?, 'SCHEDULED')`)
          .run(tripId, planDate, zoneCode, driver.id, driver.name, vehicle.id, vehicle.plate, vehicle.type,
               isUrgent ? 'URGENT' : 'REGULAR', isUrgent ? 1 : 0, routeMode, totalKm, totalPoints);

        const insertStop = db.prepare(`INSERT INTO stops (id, trip_id, shipment_id, sequence, is_locked, customer_name, address, lat, lng, distance_from_origin_km, eta_minutes, delivery_result)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`);

        for (const st of orderedStops) {
          const stopId = 'stp-' + Math.random().toString(36).substr(2, 9);
          insertStop.run(stopId, tripId, st.shipment_id, st.sequence, st.is_locked || 0,
            st.customer_name, st.address, st.lat, st.lng, st.distance_from_origin_km || 0, st.eta_minutes || 0);
          db.prepare("UPDATE shipments SET status = 'ASSIGNED' WHERE id = ?").run(st.shipment_id);
        }

        return sendJson(res, 201, { success: true, tripId, totalStops: orderedStops.length, totalKm, totalPoints });
      }

      // Reorder Stops
      if (pathname.match(/^\/api\/trips\/[^/]+\/stops\/reorder$/) && req.method === 'PATCH') {
        const body = await parseBody(req);
        const { stopIds = [] } = body;
        const updateSeq = db.prepare('UPDATE stops SET sequence = ? WHERE id = ?');
        stopIds.forEach((id, idx) => { updateSeq.run(idx + 1, id); });
        return sendJson(res, 200, { success: true, message: 'Urutan diperbarui' });
      }

      // ─────────────────────────────────────
      // FITUR SEJALUR: Corridor Optimizer (J40/J23 -> Tujuan Akhir)
      // ─────────────────────────────────────
      if (pathname === '/api/routing/find-sejalur' && req.method === 'POST') {
        const body = await parseBody(req);
        const { targetShipmentId, maxCrossTrackKm = 12, maxDetourRatio = 1.35 } = body;
        const origin = db.prepare("SELECT * FROM locations WHERE code = 'J40'").get();
        if (!origin) return sendJson(res, 500, { success: false, message: 'Lokasi gudang J40 tidak ditemukan' });

        const targetShipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(targetShipmentId);
        if (!targetShipment) return sendJson(res, 404, { success: false, message: 'Surat Jalan target tidak ditemukan' });

        if (isPickupShipment(targetShipment)) {
          return sendJson(res, 400, {
            success: false,
            message: 'Surat Jalan ini berstatus DIAMBIL DI J23 (Pickup), tidak dimasukkan ke dalam rute armada.'
          });
        }

        // Get candidate delivery shipments (strictly excluding all pickup shipments)
        const allCandidates = db.prepare("SELECT * FROM shipments WHERE status IN ('DRAFT', 'UNSCHEDULED', 'SCHEDULED', 'ASSIGNED') OR id = ?").all(targetShipmentId);
        const candidates = allCandidates.filter(s => !isPickupShipment(s));

        try {
          const result = findCorridorShipments(origin, targetShipment, candidates, maxCrossTrackKm, maxDetourRatio);
          return sendJson(res, 200, { success: true, data: result });
        } catch (err) {
          return sendJson(res, 400, { success: false, message: err.message });
        }
      }

      if (pathname === '/api/routing/assign-sejalur-trip' && req.method === 'POST') {
        const body = await parseBody(req);
        const { driverName, vehicleType, shipmentIds = [], planDate, assignedBy, tasBingkisan = 'BESAR' } = body;

        // Ensure no pickup shipments are included in driver delivery trip
        const validShipmentIds = shipmentIds.filter(id => {
          const s = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
          return s && !isPickupShipment(s);
        });

        if (!driverName || !vehicleType || validShipmentIds.length === 0) {
          return sendJson(res, 400, { success: false, message: 'Driver, armada, dan minimal 1 SJ pengiriman yang valid wajib dipilih' });
        }

        const date = planDate || new Date().toISOString().split('T')[0];
        const now = new Date().toISOString();

        // 1. Assign all valid delivery shipments in sequential order
        const updateShipment = db.prepare(`UPDATE shipments SET
          status = 'ASSIGNED', assigned_driver = ?, assigned_vehicle_type = ?,
          required_vehicle_type = ?, assigned_by = ?, assigned_at = ?,
          plan_date = COALESCE(plan_date, ?), tas_size = ?
          WHERE id = ?`);

        for (const sId of validShipmentIds) {
          updateShipment.run(driverName, vehicleType, vehicleType, assignedBy || 'Dispatcher', now, date, tasBingkisan, sId);
        }

        // 2. Lock zone if vehicle is a car
        const firstShip = db.prepare('SELECT * FROM shipments WHERE id = ?').get(validShipmentIds[0]);
        if (vehicleType !== 'MOTOR' && firstShip && firstShip.zone_code) {
          const veh = db.prepare('SELECT * FROM vehicles WHERE type = ?').get(vehicleType) || db.prepare('SELECT * FROM vehicles LIMIT 1').get();
          const drv = db.prepare('SELECT * FROM users WHERE name = ? COLLATE NOCASE').get(driverName);
          const existingLock = db.prepare('SELECT 1 FROM zone_locks WHERE plan_date = ? AND zone_code = ?').get(date, firstShip.zone_code);
          if (!existingLock && veh) {
            db.prepare(`INSERT OR IGNORE INTO zone_locks (id, plan_date, zone_code, vehicle_id, vehicle_type, driver_id, locked_by)
              VALUES (?, ?, ?, ?, ?, ?, ?)`).run('zlock-' + Date.now(), date, firstShip.zone_code, veh.id, vehicleType, drv?.id || null, assignedBy || 'Dispatcher');
          }
        }

        return sendJson(res, 200, {
          success: true,
          message: `${validShipmentIds.length} SJ sejalur berhasil ditugaskan ke ${driverName} (${vehicleType})!`,
          count: validShipmentIds.length
        });
      }

      // ─────────────────────────────────────
      // OTOMASI JALUR RUTE SETELAH PEMBAGIAN MUATAN
      // (Jalur A, Jalur B, dst. -> Susunan SJ 1, Susunan SJ 2, dst.)
      // ─────────────────────────────────────
      // ─────────────────────────────────────
      // KATEGORISASI OPTIMASI RUTE PENGIRIMAN (Rute A, Rute B, Rute C, Rute D, dst.)
      // Mengelompokkan seluruh SJ ke rute/koridor tujuan (urutan multi-stop terdekat dari J40)
      // agar tim operasional yang menentukan akan dibawa siapa siapanya
      // ─────────────────────────────────────
      if (pathname === '/api/routing/categorized-routes' && req.method === 'GET') {
        const date = url.searchParams.get('date');
        const period = url.searchParams.get('period') || 'today';
        const origin = db.prepare("SELECT * FROM locations WHERE code = 'J40'").get() || { lat: -7.30211, lng: 112.7819, code: 'J40', name: 'Gudang Utama J40' };

        let whereClauses = ["(fulfillment_type != 'PICKUP_J23' AND type != 'PICKUP')"];
        let params = [];

        if (date && date !== 'all') {
          whereClauses.push('plan_date = ?');
          params.push(date);
        } else if (period === 'all') {
          // All active delivery shipments
        } else if (period === 'tomorrow') {
          whereClauses.push("(plan_date = '2026-10-03' OR plan_date = '2026-10-02' OR plan_date = DATE('now', '+1 day'))");
        } else {
          // Default: today or active delivery
          whereClauses.push("(plan_date = '2026-10-02' OR plan_date = '2026-10-01' OR plan_date = DATE('now'))");
        }

        const whereSql = 'WHERE ' + whereClauses.join(' AND ');
        let shipments = db.prepare(`
          SELECT * FROM shipments
          ${whereSql}
          ORDER BY COALESCE(index_no, 9999) ASC, priority DESC, created_at DESC
        `).all(...params);

        // Fallback: if no shipments on the specific date, load upcoming/active shipments
        if (shipments.length === 0) {
          shipments = db.prepare(`
            SELECT * FROM shipments
            WHERE (fulfillment_type != 'PICKUP_J23' AND type != 'PICKUP')
            ORDER BY plan_date ASC, priority DESC
            LIMIT 50
          `).all();
        }

        const routes = buildCategorizedRoutes(origin, shipments);

        return sendJson(res, 200, {
          success: true,
          date: date || '2026-10-01',
          origin,
          totalShipments: shipments.length,
          routes
        });
      }

      // Endpoint: Tim operasional menugaskan Rute A / B / C / D ke Driver & Kendaraan
      if (pathname === '/api/routing/assign-route' && req.method === 'POST') {
        const body = await parseBody(req);
        const routeName = body.routeName || body.name || 'Rute Pengiriman';
        const driverName = body.driverName || body.driver;
        const vehicleType = body.vehicleType || body.vehicle || 'MOBIL';
        const orderedShipmentIds = body.orderedShipmentIds || body.shipmentIds || [];
        const tasBingkisan = body.tasBingkisan || 'BESAR';

        if (!driverName || !vehicleType || !Array.isArray(orderedShipmentIds) || orderedShipmentIds.length === 0) {
          return sendJson(res, 400, { success: false, message: 'Driver, armada, dan minimal 1 Surat Jalan wajib dipilih' });
        }

        const date = body.planDate || body.date || new Date().toISOString().split('T')[0];
        const now = new Date().toISOString();

        const updateStmt = db.prepare(`
          UPDATE shipments SET
            status = 'ASSIGNED',
            assigned_driver = ?,
            assigned_vehicle_type = ?,
            assigned_by = 'Tim Operasional',
            assigned_at = ?,
            plan_date = COALESCE(plan_date, ?),
            tas_size = ?,
            index_no = ?
          WHERE id = ?
        `);

        orderedShipmentIds.forEach((id, idx) => {
          updateStmt.run(driverName, vehicleType, now, date, tasBingkisan, idx + 1, id);
        });

        // Also lock zone if vehicle is a car
        const firstShip = db.prepare('SELECT * FROM shipments WHERE id = ?').get(orderedShipmentIds[0]);
        if (vehicleType !== 'MOTOR' && firstShip && firstShip.zone_code) {
          const veh = db.prepare('SELECT * FROM vehicles WHERE type = ?').get(vehicleType) || db.prepare('SELECT * FROM vehicles LIMIT 1').get();
          const drv = db.prepare('SELECT * FROM users WHERE name = ? COLLATE NOCASE').get(driverName);
          const existingLock = db.prepare('SELECT 1 FROM zone_locks WHERE plan_date = ? AND zone_code = ?').get(date, firstShip.zone_code);
          if (!existingLock && veh) {
            db.prepare(`INSERT OR IGNORE INTO zone_locks (id, plan_date, zone_code, vehicle_id, vehicle_type, driver_id, locked_by)
              VALUES (?, ?, ?, ?, ?, ?, ?)`).run('zlock-' + Date.now(), date, firstShip.zone_code, veh.id, vehicleType, drv?.id || null, 'Tim Operasional');
          }
        }

        return sendJson(res, 200, {
          success: true,
          message: `${orderedShipmentIds.length} Surat Jalan pada ${routeName || 'rute'} berhasil ditugaskan ke ${driverName} (${vehicleType})!`,
          count: orderedShipmentIds.length
        });
      }

      // Endpoint: Pindahkan Surat Jalan ke Rute lain (misal dari Rute A ke Rute B/C/D)
      if (pathname === '/api/routing/move-stop' && req.method === 'POST') {
        const body = await parseBody(req);
        const { shipmentId, targetRouteKey, targetRouteLetter } = body;
        if (!shipmentId) return sendJson(res, 400, { success: false, message: 'shipmentId wajib diisi' });

        const routeKey = (targetRouteKey || targetRouteLetter || 'A').toUpperCase().trim();
        const mr = db.prepare('SELECT zone_code, route_name FROM master_routes WHERE route_code = ?').get(routeKey);
        const newZone = mr?.zone_code || null;

        db.prepare(`
          UPDATE shipments 
          SET assigned_route = ?, zone_code = COALESCE(?, zone_code)
          WHERE id = ?
        `).run(routeKey, newZone, shipmentId);

        const updated = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);
        return sendJson(res, 200, {
          success: true,
          message: `Surat Jalan ${updated?.sj_number} berhasil dipindahkan ke ${mr?.route_name || `Rute ${routeKey}`}!`,
          data: updated
        });
      }

      // Endpoint: Susun ulang nomor urutan stops dalam rute
      if (pathname === '/api/routing/reorder-stops' && req.method === 'POST') {
        const body = await parseBody(req);
        const { orderedShipmentIds } = body;
        if (Array.isArray(orderedShipmentIds)) {
          const updateStmt = db.prepare('UPDATE shipments SET index_no = ? WHERE id = ?');
          orderedShipmentIds.forEach((id, idx) => {
            updateStmt.run(idx + 1, id);
          });
        }
        return sendJson(res, 200, { success: true, message: 'Urutan rute berhasil diperbarui!' });
      }

      // ─────────────────────────────────────
      // MASTER RUTE (Rute A, B, C, D, E, dst.)
      // Kelola Arah Tujuan, Kata Kunci Wilayah, dan Zona Rute
      // ─────────────────────────────────────
      if (pathname === '/api/master-routes' && req.method === 'GET') {
        const routes = db.prepare(`
          SELECT mr.*, 
            (SELECT COUNT(*) FROM shipments s 
             WHERE (s.assigned_route = mr.route_code OR (s.assigned_route IS NULL AND s.zone_code = mr.zone_code))
             AND (s.fulfillment_type != 'PICKUP_J23' AND s.type != 'PICKUP')
             AND s.status != 'DELIVERED') as active_shipments_count
          FROM master_routes mr
          ORDER BY mr.sequence ASC, mr.route_code ASC
        `).all();
        return sendJson(res, 200, { success: true, count: routes.length, data: routes });
      }

      if (pathname === '/api/master-routes/reset-default' && req.method === 'POST') {
        db.prepare('DELETE FROM master_routes').run();
        seedMasterRoutes();
        const routes = db.prepare('SELECT * FROM master_routes ORDER BY sequence ASC').all();
        return sendJson(res, 200, { success: true, message: 'Master Rute berhasil di-reset ke standar koridor A - F!', data: routes });
      }

      if (pathname.match(/^\/api\/master-routes\/[^/]+$/) && req.method === 'GET') {
        const id = pathname.split('/')[3];
        const route = db.prepare('SELECT * FROM master_routes WHERE id = ?').get(id);
        if (!route) return sendJson(res, 404, { success: false, message: 'Rute tidak ditemukan' });
        return sendJson(res, 200, { success: true, data: route });
      }

      if (pathname === '/api/master-routes' && req.method === 'POST') {
        const body = await parseBody(req);
        const routeCode = (body.route_code || '').toUpperCase().trim();
        const routeName = (body.route_name || `Rute ${routeCode}`).trim();
        const title = (body.title || `Koridor ${routeCode}`).trim();
        const destinationArea = (body.destination_area || '').trim();
        const keywords = (body.keywords || routeCode).trim();
        const zoneCode = (body.zone_code || routeCode).trim();
        const color = body.color || '#2563eb';
        const sequence = parseInt(body.sequence, 10) || 10;
        const description = body.description || '';
        const isActive = body.is_active === false || body.is_active === 0 ? 0 : 1;

        if (!routeCode) return sendJson(res, 400, { success: false, message: 'Kode rute wajib diisi (misal: A, B, C, D, E...)' });
        if (!destinationArea) return sendJson(res, 400, { success: false, message: 'Arah / Area tujuan rute wajib diisi' });

        const id = `route-${routeCode}`;
        const exists = db.prepare('SELECT 1 FROM master_routes WHERE id = ? OR route_code = ?').get(id, routeCode);
        if (exists) return sendJson(res, 400, { success: false, message: `Rute dengan kode ${routeCode} sudah ada di sistem` });

        db.prepare(`
          INSERT INTO master_routes (id, route_code, route_name, title, destination_area, keywords, zone_code, color, sequence, description, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, routeCode, routeName, title, destinationArea, keywords, zoneCode, color, sequence, description, isActive);

        const created = db.prepare('SELECT * FROM master_routes WHERE id = ?').get(id);
        return sendJson(res, 201, { success: true, message: `Master Rute ${routeName} (${destinationArea}) berhasil ditambahkan!`, data: created });
      }

      if (pathname.match(/^\/api\/master-routes\/[^/]+$/) && req.method === 'PUT') {
        const id = pathname.split('/')[3];
        const body = await parseBody(req);
        const existing = db.prepare('SELECT * FROM master_routes WHERE id = ?').get(id);
        if (!existing) return sendJson(res, 404, { success: false, message: 'Rute tidak ditemukan' });

        const routeCode = (body.route_code || existing.route_code).toUpperCase().trim();
        const routeName = (body.route_name !== undefined ? body.route_name : existing.route_name).trim();
        const title = (body.title !== undefined ? body.title : existing.title).trim();
        const destinationArea = (body.destination_area !== undefined ? body.destination_area : existing.destination_area).trim();
        const keywords = (body.keywords !== undefined ? body.keywords : existing.keywords).trim();
        const zoneCode = (body.zone_code !== undefined ? body.zone_code : existing.zone_code).trim();
        const color = body.color || existing.color;
        const sequence = body.sequence !== undefined ? parseInt(body.sequence, 10) : existing.sequence;
        const description = body.description !== undefined ? body.description : existing.description;
        const isActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;

        db.prepare(`
          UPDATE master_routes SET
            route_code = ?,
            route_name = ?,
            title = ?,
            destination_area = ?,
            keywords = ?,
            zone_code = ?,
            color = ?,
            sequence = ?,
            description = ?,
            is_active = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(routeCode, routeName, title, destinationArea, keywords, zoneCode, color, sequence, description, isActive, id);

        const updated = db.prepare('SELECT * FROM master_routes WHERE id = ?').get(id);
        return sendJson(res, 200, { success: true, message: `Master Rute ${routeName} berhasil diperbarui!`, data: updated });
      }

      if (pathname.match(/^\/api\/master-routes\/[^/]+$/) && req.method === 'DELETE') {
        const id = pathname.split('/')[3];
        const existing = db.prepare('SELECT * FROM master_routes WHERE id = ?').get(id);
        if (!existing) return sendJson(res, 404, { success: false, message: 'Rute tidak ditemukan' });

        db.prepare('DELETE FROM master_routes WHERE id = ?').run(id);
        return sendJson(res, 200, { success: true, message: `Rute ${existing.route_name} berhasil dihapus!` });
      }

      // Backward compatible jalur-overview
      if (pathname === '/api/routing/jalur-overview' && req.method === 'GET') {
        const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
        const origin = db.prepare("SELECT * FROM locations WHERE code = 'J40'").get() || { lat: -7.30211, lng: 112.7819, code: 'J40', name: 'Gudang Utama J40' };

        let shipments = db.prepare(`
          SELECT * FROM shipments
          WHERE (plan_date = ? OR status IN ('ASSIGNED', 'SCHEDULED'))
          AND (fulfillment_type != 'PICKUP_J23' AND type != 'PICKUP')
          ORDER BY COALESCE(index_no, 9999) ASC, priority DESC
        `).all(date);

        if (shipments.length === 0) {
          shipments = db.prepare(`
            SELECT * FROM shipments
            WHERE (fulfillment_type != 'PICKUP_J23' AND type != 'PICKUP')
            ORDER BY plan_date ASC, priority DESC
            LIMIT 50
          `).all();
        }

        const categorized = buildCategorizedRoutes(origin, shipments);

        // Convert to jalurs format
        const jalurs = categorized.map(r => ({
          jalurCode: `JALUR-${r.routeLetter}`,
          jalurName: r.routeName,
          driver: r.assignedDriver || 'Menunggu Penugasan Tim Ops',
          vehicleType: r.assignedVehicle || r.suggestedVehicle,
          shipmentCount: r.shipmentCount,
          totalKm: r.totalKm,
          totalMinutes: r.totalMinutes,
          googleMapsUrl: r.googleMapsUrl,
          muatRecommendation: r.muatRecommendation,
          isAssigned: r.isAssigned,
          stops: r.stops.map(st => ({
            sequence: st.sequence,
            susunan_label: `Susunan SJ ${st.sequence}`,
            shipment: st,
            leg_distance_km: st.leg_distance_km,
            cumulative_km: st.cumulative_km,
            eta_time: st.eta_time,
            eta_minutes_from_start: st.eta_minutes,
            google_maps_url: `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${st.lat},${st.lng}&travelmode=driving`
          }))
        }));

        return sendJson(res, 200, {
          success: true,
          date,
          origin,
          jalurs,
          routes: categorized,
          unassignedShipments: shipments.filter(s => !s.assigned_driver),
          totalAssignedShipments: shipments.filter(s => s.assigned_driver).length
        });
      }

      if (pathname === '/api/routing/optimize-jalur' && req.method === 'POST') {
        const body = await parseBody(req);
        const { shipmentIds = [], originCode = 'J40', departureHour = 8, departureMinute = 0 } = body;
        const origin = db.prepare("SELECT * FROM locations WHERE code = ?").get(originCode) || { lat: -7.30211, lng: 112.7819, code: 'J40', name: 'Gudang Utama J40' };

        const shipments = [];
        for (const id of shipmentIds) {
          const s = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
          if (s && !isPickupShipment(s)) {
            const lineItems = db.prepare(`SELECT item_name, quantity, unit_name, item_no FROM shipment_items WHERE shipment_id = ?`).all(id);
            shipments.push({ ...s, items: lineItems });
          }
        }

        if (shipments.length === 0) {
          return sendJson(res, 400, { success: false, message: 'Minimal 1 Surat Jalan pengiriman yang valid wajib dipilih' });
        }

        const routeResult = optimizeJalurRoute(origin, shipments, { departureHour, departureMinute });
        return sendJson(res, 200, { success: true, data: routeResult });
      }

      if (pathname === '/api/routing/save-jalur-trip' && req.method === 'POST') {
        const body = await parseBody(req);
        const { jalurName = 'Jalur A', planDate, driverName, vehicleType, stopShipmentIds = [] } = body;

        const date = planDate || new Date().toISOString().split('T')[0];
        const origin = db.prepare("SELECT * FROM locations WHERE code = 'J40'").get() || { lat: -7.30211, lng: 112.7819, code: 'J40', name: 'Gudang Utama J40' };
        const driver = db.prepare('SELECT * FROM users WHERE name = ? COLLATE NOCASE').get(driverName);
        const vehicle = db.prepare('SELECT * FROM vehicles WHERE type = ?').get(vehicleType) || db.prepare('SELECT * FROM vehicles LIMIT 1').get();

        const shipments = [];
        for (const id of stopShipmentIds) {
          const s = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
          if (s && !isPickupShipment(s)) shipments.push(s);
        }

        if (shipments.length === 0) {
          return sendJson(res, 400, { success: false, message: 'Tidak ada Surat Jalan pengiriman valid untuk disimpan ke jalur' });
        }

        const routeResult = optimizeJalurRoute(origin, shipments);
        const tripId = 'trip-' + Date.now();

        db.prepare(`
          INSERT INTO trips (
            id, plan_date, zone_code, driver_id, driver_name, vehicle_id, vehicle_plate,
            vehicle_type, origin_location_code, trip_type, route_mode, total_km,
            total_points, status, jalur_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'J40', 'REGULAR', 'MODE_1_DISTANCE', ?, ?, 'SCHEDULED', ?)
        `).run(
          tripId, date, shipments[0]?.zone_code || 'B',
          driver?.id || null, driverName || 'Driver ATS',
          vehicle?.id || null, vehicle?.plate || '',
          vehicleType || 'MOTOR', routeResult.totalKm,
          shipments.reduce((acc, cur) => acc + (cur.total_points || 1), 0),
          jalurName
        );

        const insertStop = db.prepare(`
          INSERT INTO stops (
            id, trip_id, shipment_id, sequence, is_locked, customer_name, address,
            lat, lng, distance_from_origin_km, eta_minutes, delivery_result
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `);

        for (const st of routeResult.stops) {
          const stopId = 'stp-' + Math.random().toString(36).substr(2, 9);
          insertStop.run(
            stopId, tripId, st.shipment.id, st.sequence, 0,
            st.shipment.customer_name, st.shipment.destination_address,
            st.shipment.lat, st.shipment.lng,
            st.cumulative_km, st.eta_minutes_from_start
          );
        }

        return sendJson(res, 201, {
          success: true,
          tripId,
          jalurName,
          totalStops: routeResult.stops.length,
          totalKm: routeResult.totalKm,
          googleMapsUrl: routeResult.googleMapsUrl,
          message: `${jalurName} berhasil disimpan dengan ${routeResult.stops.length} susunan Surat Jalan!`
        });
      }

      // LOKET J23: Selesai Serah Terima Barang Pickup ke Customer
      if (pathname.match(/^\/api\/shipments\/[^/]+\/pickup-complete$/) && req.method === 'POST') {
        const parts = pathname.split('/');
        const sId = parts[3];
        const body = await parseBody(req);
        const { receiverName, handledBy } = body;
        const now = new Date().toISOString();

        db.prepare(`UPDATE shipments SET
          status = 'PICKUP_DONE',
          received_by = ?,
          received_at = ?,
          notes = CASE WHEN notes IS NOT NULL THEN notes || ' | Diambil oleh ' || ? ELSE 'Diambil oleh ' || ? END
          WHERE id = ?`).run(
            receiverName || 'Customer / Kurir Toko',
            now,
            receiverName || 'Customer',
            receiverName || 'Customer',
            sId
          );

        return sendJson(res, 200, { success: true, message: 'Barang berhasil diserahkan ke customer di Loket J23.' });
      }


      // Urgent
      if (pathname === '/api/trips/urgent/request' && req.method === 'POST') {
        const body = await parseBody(req);
        return sendJson(res, 200, requestUrgentTrip(body));
      }

      if (pathname === '/api/trips/urgent/approve' && req.method === 'POST') {
        const body = await parseBody(req);
        try { return sendJson(res, 200, approveUrgentTrip(body)); }
        catch (err) { return sendJson(res, 400, { success: false, message: err.message }); }
      }

      // Eligible Drivers
      if (pathname === '/api/drivers/eligible' && req.method === 'GET') {
        const vehicleType = url.searchParams.get('vehicleType') || 'MOTOR';
        const isUrgent = url.searchParams.get('isUrgent') === 'true';
        const drivers = getEligibleDrivers(vehicleType, isUrgent);
        return sendJson(res, 200, { success: true, data: drivers });
      }

      // Delivery Check-In
      if (pathname.match(/^\/api\/stops\/[^/]+\/deliver$/) && req.method === 'POST') {
        const stopId = pathname.split('/')[3];
        const body = await parseBody(req);
        const { receiverName, receiverPhone, proofPhotoUrl, deliveryResult = 'SUCCESS', failReasonCode, notes } = body;
        const now = new Date().toISOString();

        db.prepare(`UPDATE stops SET delivered_at = ?, receiver_name = ?, receiver_phone = ?, proof_photo_url = ?, delivery_result = ?, fail_reason_code = ?, notes = ? WHERE id = ?`)
          .run(now, receiverName, receiverPhone, proofPhotoUrl, deliveryResult, failReasonCode, notes, stopId);

        const stop = db.prepare('SELECT * FROM stops WHERE id = ?').get(stopId);
        if (stop && stop.shipment_id) {
          db.prepare("UPDATE shipments SET status = ? WHERE id = ?").run(
            deliveryResult === 'SUCCESS' ? 'DELIVERED' : 'FAILED', stop.shipment_id);
        }
        return sendJson(res, 200, { success: true, message: 'Status pengiriman dicatat' });
      }

      // Doc Checks
      if (pathname === '/api/doc-checks' && req.method === 'GET') {
        const checks = db.prepare(`SELECT dc.*, s.receiver_name, s.delivered_at, sh.sj_number, sh.customer_name
          FROM stops s JOIN shipments sh ON s.shipment_id = sh.id LEFT JOIN doc_checks dc ON dc.stop_id = s.id
          WHERE s.delivery_result = 'SUCCESS' ORDER BY s.delivered_at DESC`).all();
        return sendJson(res, 200, { success: true, data: checks });
      }

      if (pathname === '/api/doc-checks/l1' && req.method === 'POST') {
        return sendJson(res, 200, submitLevel1Check(await parseBody(req)));
      }
      if (pathname === '/api/doc-checks/l2' && req.method === 'POST') {
        return sendJson(res, 200, submitLevel2Approval(await parseBody(req)));
      }
      if (pathname === '/api/doc-checks/escalate' && req.method === 'POST') {
        return sendJson(res, 200, submitEscalationAudit(await parseBody(req)));
      }

      // Accurate Sync
      if (pathname === '/api/accurate/sync' && req.method === 'POST') {
        const body = await parseBody(req);
        const result = await syncLiveAccurateDeliveryOrders(body.limit || 10);
        return sendJson(res, 200, result);
      }

      // ─────────────────────────────────────
      // MOBILE FIELD DELIVERY API (Tampilan Khusus Lapangan)
      // Cepat, User-friendly, Tanpa Mengetik Berulang, Validasi Alasan Tolak
      // ─────────────────────────────────────
      if (pathname === '/api/mobile/drivers' && req.method === 'GET') {
        const drivers = db.prepare(`
          SELECT id, name, username, role, driver_type, color_code
          FROM users
          WHERE role IN ('DRIVER', 'BACKUP_DRIVER', 'SUPERADMIN')
          ORDER BY (CASE WHEN role = 'DRIVER' THEN 1 WHEN role = 'BACKUP_DRIVER' THEN 2 ELSE 3 END), name ASC
        `).all();
        return sendJson(res, 200, { success: true, data: drivers });
      }

      if (pathname === '/api/mobile/shipments' && req.method === 'GET') {
        const driver = url.searchParams.get('driver') || '';
        const date = url.searchParams.get('date') || '';
        const status = url.searchParams.get('status') || '';
        const search = (url.searchParams.get('q') || '').trim();

        let whereClauses = [];
        let params = [];

        // Exclude pickup if strictly fleet delivery, but allow viewing if needed
        whereClauses.push("(fulfillment_type != 'PICKUP_J23' AND type != 'PICKUP')");

        if (driver && driver !== 'all') {
          whereClauses.push('assigned_driver = ?');
          params.push(driver);
        }

        if (date && date !== 'all') {
          if (date === 'today') {
            whereClauses.push("(plan_date = DATE('now') OR plan_date = '2026-10-02')");
          } else if (date === 'tomorrow') {
            whereClauses.push("(plan_date = DATE('now', '+1 day') OR plan_date = '2026-10-03')");
          } else {
            whereClauses.push('plan_date = ?');
            params.push(date);
          }
        }

        if (status && status !== 'ALL') {
          if (status === 'PENDING') {
            whereClauses.push("status IN ('SCHEDULED', 'ASSIGNED', 'IN_TRANSIT')");
          } else if (status === 'DELIVERED' || status === 'APPROVED') {
            whereClauses.push("status = 'DELIVERED'");
          } else if (status === 'FAILED' || status === 'REJECTED') {
            whereClauses.push("status = 'FAILED'");
          } else {
            whereClauses.push('status = ?');
            params.push(status);
          }
        }

        if (search) {
          whereClauses.push('(sj_number LIKE ? OR customer_name LIKE ? OR destination_address LIKE ? OR po_number LIKE ?)');
          params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
        const rawList = db.prepare(`
          SELECT * FROM shipments
          ${whereSql}
          ORDER BY 
            CASE 
              WHEN status IN ('ASSIGNED', 'IN_TRANSIT') THEN 1
              WHEN status = 'SCHEDULED' THEN 2
              WHEN status = 'FAILED' THEN 3
              WHEN status = 'DELIVERED' THEN 4
              ELSE 5
            END,
            COALESCE(index_no, 9999) ASC,
            created_at DESC
        `).all(...params);

        // Enrich with items summary
        const enriched = rawList.map(s => {
          const items = db.prepare(`SELECT item_name, quantity, unit_name, item_no FROM shipment_items WHERE shipment_id = ?`).all(s.id);
          const itemCount = items.length;
          const itemsSummary = items.slice(0, 3).map(it => `${it.quantity} ${it.unit_name || 'PCS'} ${it.item_name}`).join(', ') + (itemCount > 3 ? ` (+${itemCount - 3} lainnya)` : '');
          
          return {
            ...s,
            items,
            item_count: itemCount,
            items_summary: itemsSummary || '1 Paket Kiriman Standar',
            is_delivered: s.status === 'DELIVERED',
            is_rejected: s.status === 'FAILED' || s.delivery_result === 'REJECTED',
            rejection_reason: s.rejection_reason || (s.status === 'FAILED' ? s.notes : null)
          };
        });

        // Fast statistics
        const allShipments = db.prepare("SELECT status, delivery_result FROM shipments WHERE (fulfillment_type != 'PICKUP_J23' AND type != 'PICKUP')").all();
        const stats = {
          total: enriched.length,
          allTotal: allShipments.length,
          pending: allShipments.filter(x => ['SCHEDULED', 'ASSIGNED', 'IN_TRANSIT'].includes(x.status)).length,
          delivered: allShipments.filter(x => x.status === 'DELIVERED').length,
          failed: allShipments.filter(x => x.status === 'FAILED' || x.delivery_result === 'REJECTED').length
        };

        return sendJson(res, 200, {
          success: true,
          count: enriched.length,
          stats,
          data: enriched
        });
      }

      if (pathname.match(/^\/api\/mobile\/shipments\/[^/]+$/) && req.method === 'GET') {
        const shipmentId = pathname.split('/')[4];
        const s = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);
        if (!s) return sendJson(res, 404, { success: false, message: 'Surat Jalan tidak ditemukan' });

        const items = db.prepare(`SELECT * FROM shipment_items WHERE shipment_id = ?`).all(shipmentId);
        return sendJson(res, 200, {
          success: true,
          data: {
            ...s,
            items,
            item_count: items.length
          }
        });
      }

      // SUBMIT STATUS PENGIRIMAN DARI LAPANGAN
      // Mandatory validation: Jika ditolak harus mengisi alasan ditolak!
      if (pathname.match(/^\/api\/mobile\/shipments\/[^/]+\/update-status$/) && req.method === 'POST') {
        const shipmentId = pathname.split('/')[4];
        const body = await parseBody(req);
        const {
          deliveryResult, // 'APPROVED' | 'REJECTED' | 'IN_TRANSIT' | 'ARRIVED'
          rejectionReason,
          receiverName,
          receiverPhone,
          proofPhotoUrl,
          signatureUrl,
          notes,
          updatedBy
        } = body;

        const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);
        if (!shipment) return sendJson(res, 404, { success: false, message: 'Surat Jalan tidak ditemukan' });

        // VALIDASI KRUSIAL SESUAI PERMINTAAN USER:
        // 1. deliveryResult wajib dipilih
        // 2. Jika ditolak, HARUS mengisi alasan ditolak
        if (!deliveryResult || !['APPROVED', 'REJECTED', 'IN_TRANSIT', 'ARRIVED'].includes(deliveryResult)) {
          return sendJson(res, 400, {
            success: false,
            message: 'Pilih hasil pengiriman: Disetujui (APPROVED) atau Ditolak (REJECTED)'
          });
        }

        if (deliveryResult === 'REJECTED') {
          if (!rejectionReason || !String(rejectionReason).trim()) {
            return sendJson(res, 400, {
              success: false,
              message: 'Validasi Gagal: Alasan penolakan wajib diisi jika pengiriman ditolak!'
            });
          }
        }

        const now = new Date().toISOString();
        let finalStatus = shipment.status || 'SCHEDULED';
        let finalDeliveryResult = deliveryResult;
        let finalRejectionReason = null;
        let finalReceivedBy = shipment.received_by || null;
        let finalReceivedAt = shipment.received_at || null;

        if (deliveryResult === 'APPROVED') {
          finalStatus = 'DELIVERED';
          finalDeliveryResult = 'APPROVED';
          finalRejectionReason = null;
          finalReceivedBy = receiverName?.trim() || shipment.customer_name || 'Penerima di Lokasi';
          finalReceivedAt = now;
        } else if (deliveryResult === 'REJECTED') {
          finalStatus = 'FAILED';
          finalDeliveryResult = 'REJECTED';
          finalRejectionReason = rejectionReason.trim();
          if (receiverName && receiverName.trim()) {
            finalReceivedBy = receiverName.trim();
          }
        } else if (deliveryResult === 'IN_TRANSIT') {
          finalStatus = 'IN_TRANSIT';
        }

        // Combine notes
        let mergedNotes = shipment.notes || '';
        if (notes && notes.trim()) {
          mergedNotes = mergedNotes ? `${mergedNotes} | ${notes.trim()}` : notes.trim();
        }
        if (deliveryResult === 'REJECTED') {
          mergedNotes = mergedNotes ? `${mergedNotes} [Ditolak: ${rejectionReason.trim()}]` : `[Ditolak: ${rejectionReason.trim()}]`;
        }

        db.prepare(`
          UPDATE shipments SET
            status = ?,
            delivery_result = ?,
            rejection_reason = ?,
            received_by = ?,
            received_at = ?,
            proof_photo_url = COALESCE(?, proof_photo_url),
            signature_url = COALESCE(?, signature_url),
            notes = ?
          WHERE id = ?
        `).run(
          finalStatus ?? 'SCHEDULED',
          finalDeliveryResult ?? null,
          finalRejectionReason ?? null,
          finalReceivedBy ?? null,
          finalReceivedAt ?? null,
          proofPhotoUrl || null,
          signatureUrl || null,
          mergedNotes ?? '',
          shipmentId
        );

        // Update corresponding stops if exist
        const stop = db.prepare('SELECT id FROM stops WHERE shipment_id = ?').get(shipmentId);
        if (stop) {
          db.prepare(`
            UPDATE stops SET
              delivery_result = ?,
              delivered_at = ?,
              receiver_name = ?,
              receiver_phone = COALESCE(?, receiver_phone),
              proof_photo_url = COALESCE(?, proof_photo_url),
              signature_url = COALESCE(?, signature_url),
              fail_reason_code = ?,
              notes = ?
            WHERE id = ?
          `).run(
            deliveryResult === 'APPROVED' ? 'SUCCESS' : (deliveryResult === 'REJECTED' ? 'FAILED' : 'PENDING'),
            deliveryResult === 'APPROVED' ? now : null,
            finalReceivedBy ?? null,
            receiverPhone || null,
            proofPhotoUrl || null,
            signatureUrl || null,
            finalRejectionReason ?? null,
            mergedNotes ?? '',
            stop.id
          );
        }

        // Audit log
        try {
          db.prepare(`
            INSERT INTO audit_logs (id, user_id, user_name, action, entity_name, entity_id, details)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            'aud-' + Date.now(),
            updatedBy || 'mobile-user',
            updatedBy || 'Driver Lapangan',
            'UPDATE_STATUS_LAPANGAN',
            'shipments',
            shipmentId,
            `Hasil: ${finalDeliveryResult}, Status: ${finalStatus}${finalRejectionReason ? ', Alasan: ' + finalRejectionReason : ''}`
          );
        } catch (e) {}

        const updated = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);
        const actionLabel = deliveryResult === 'APPROVED' ? 'Disetujui / Selesai Kirim' : (deliveryResult === 'REJECTED' ? 'Ditolak' : 'Diperbarui');

        return sendJson(res, 200, {
          success: true,
          message: `Surat Jalan ${shipment.sj_number} berhasil dicatat: ${actionLabel}!`,
          data: updated
        });
      }

      // KPI
      if (pathname === '/api/kpi' && req.method === 'GET') {
        const totalShipments = db.prepare('SELECT COUNT(*) as c FROM shipments').get().c;
        const draft = db.prepare("SELECT COUNT(*) as c FROM shipments WHERE status = 'DRAFT'").get().c;
        const scheduled = db.prepare("SELECT COUNT(*) as c FROM shipments WHERE status = 'SCHEDULED'").get().c;
        const assigned = db.prepare("SELECT COUNT(*) as c FROM shipments WHERE status = 'ASSIGNED'").get().c;
        const delivered = db.prepare("SELECT COUNT(*) as c FROM shipments WHERE status = 'DELIVERED'").get().c;
        const totalTrips = db.prepare('SELECT COUNT(*) as c FROM trips').get().c;
        const urgentTrips = db.prepare('SELECT COUNT(*) as c FROM trips WHERE is_urgent = 1').get().c;

        return sendJson(res, 200, {
          success: true,
          data: { totalShipments, draft, scheduled, assigned, delivered, totalTrips, urgentTrips }
        });
      }

      // ─────────────────────────────────────
      // SILENT BACKGROUND GOOGLE MAPS GEOCODING
      // ─────────────────────────────────────
      if (pathname === '/api/geocode' && req.method === 'GET') {
        const q = url.searchParams.get('q') || '';
        if (!q.trim()) {
          return sendJson(res, 200, { success: true, results: [] });
        }

        try {
          const coordResult = await lookupGoogleMapsCoordinates(q);
          if (coordResult) {
            return sendJson(res, 200, {
              success: true,
              results: [coordResult]
            });
          }
          return sendJson(res, 200, { success: true, results: [] });
        } catch (err) {
          console.error('[Geocode Route Error]:', err.message);
          return sendJson(res, 200, { success: false, results: [], error: err.message });
        }
      }

      if (pathname === '/api/geocode/pick-coordinates' && req.method === 'POST') {
        const body = await parseBody(req);
        const address = body.address || body.query || body.addressText || '';

        if (!address.trim()) {
          return sendJson(res, 400, {
            success: false,
            message: 'Alamat pengiriman wajib diisi untuk menentukan koordinat'
          });
        }

        try {
          const coordResult = await lookupGoogleMapsCoordinates(address);
          if (coordResult) {
            return sendJson(res, 200, {
              success: true,
              message: 'Titik koordinat berhasil diambil dari Google Maps',
              data: coordResult
            });
          } else {
            return sendJson(res, 404, {
              success: false,
              message: 'Koordinat lokasi tidak ditemukan di Google Maps. Silakan periksa nama jalan atau pilih di peta.'
            });
          }
        } catch (err) {
          console.error('[Pick Coordinates Error]:', err.message);
          return sendJson(res, 500, {
            success: false,
            message: 'Terjadi kesalahan saat mencari titik koordinat: ' + err.message
          });
        }
      }

      if (pathname.match(/^\/api\/shipments\/[^/]+\/auto-pick-coordinates$/) && req.method === 'POST') {
        const shipmentId = pathname.split('/')[3];
        const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);
        if (!shipment) {
          return sendJson(res, 404, { success: false, message: 'Surat Jalan tidak ditemukan' });
        }

        const body = await parseBody(req);
        const searchAddress = body.address || shipment.destination_address || shipment.customer_name;
        if (!searchAddress || !searchAddress.trim()) {
          return sendJson(res, 400, { success: false, message: 'Alamat tujuan tidak tersedia' });
        }

        try {
          const coordResult = await lookupGoogleMapsCoordinates(searchAddress);
          if (!coordResult) {
            return sendJson(res, 404, {
              success: false,
              message: 'Koordinat tidak ditemukan di Google Maps untuk alamat ini.'
            });
          }

          // Update shipment in DB with discovered coordinates and zone
          db.prepare(`
            UPDATE shipments SET
              destination_lat = ?,
              destination_lng = ?,
              zone_code = COALESCE(?, zone_code)
            WHERE id = ?
          `).run(
            coordResult.lat,
            coordResult.lng,
            coordResult.zoneCode,
            shipmentId
          );

          const updated = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);
          return sendJson(res, 200, {
            success: true,
            message: `Titik koordinat berhasil diperbarui: (${coordResult.lat}, ${coordResult.lng})`,
            data: updated,
            coordinates: coordResult
          });
        } catch (err) {
          return sendJson(res, 500, { success: false, message: err.message });
        }
      }

      // 404 for unknown API
      return sendJson(res, 404, { error: 'API endpoint tidak ditemukan' });
    }

    // ─────────────────────────────────────
    // STATIC FILES & MOBILE ROUTING
    // ─────────────────────────────────────
    let requestedPath = pathname;
    if (requestedPath === '/' || requestedPath === '') {
      requestedPath = 'index.html';
    } else if (requestedPath === '/mobile' || requestedPath === '/mobile/') {
      requestedPath = 'mobile.html';
    } else if (requestedPath.startsWith('/')) {
      requestedPath = requestedPath.slice(1);
    }

    let filePath = path.join(__dirname, 'public', requestedPath);
    const ext = path.extname(filePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      const indexHtml = path.join(__dirname, 'public', 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(indexHtml).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      }
    }
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` ATS Logistics Suite v2.0 on http://localhost:${PORT}`);
  console.log(` 2-Stage Workflow: Marketing → Dispatcher`);
  console.log(` Role-Based Permissions Active`);
  console.log(`======================================================\n`);
});
