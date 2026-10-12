import crypto from 'node:crypto';
import { db, recalculateShipmentMuat } from '../db/database.js';
import { getEstimatedCoords } from './routingEngine.js';

try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch (_) {}

const token = process.env.ACCURATE_API_TOKEN || "";
const signatureSecret = process.env.ACCURATE_SIGNATURE_SECRET || "";
const apiBaseUrl = process.env.ACCURATE_BASE_URL || "https://zeus.accurate.id/accurate/api";

export async function callAccurate(endpoint, params = {}, retries = 2) {
  const queryParams = new URLSearchParams(params).toString();
  const url = `${apiBaseUrl}/${endpoint}${queryParams ? '?' + queryParams : ''}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const timestamp = new Date().toISOString();
      const signature = crypto.createHmac('sha256', signatureSecret).update(timestamp).digest('hex');

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Api-Timestamp': timestamp,
          'X-Api-Signature': signature,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(15000)
      });

      const json = await res.json();
      return { status: res.status, ok: res.ok, data: json };
    } catch (err) {
      if (attempt < retries) {
        console.warn(`[Accurate API] Attempt ${attempt + 1} failed for ${endpoint}: ${err.message}. Retrying in ${attempt + 1}s...`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      } else {
        throw err;
      }
    }
  }
}

export async function checkAccurateStatus() {
  try {
    const res = await callAccurate('warehouse/list.do');
    return {
      connected: res.data?.s === true,
      warehouseCount: res.data?.sp?.rowCount || 0,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message,
      timestamp: new Date().toISOString()
    };
  }
}

function parseAccurateDate(dStr) {
  if (!dStr) return null;
  const parts = dStr.split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  return dStr;
}

export async function syncLiveAccurateDeliveryOrders(limit = 50) {
  const syncId = 'sync-' + Date.now();
  try {
    console.log(`[AccurateSync] Fetching ${limit} Delivery Orders from Accurate Online...`);
    const listRes = await callAccurate('delivery-order/list.do', { 'sp.pageSize': limit });
    
    if (!listRes.data?.s || !listRes.data?.d) {
      throw new Error(listRes.data?.d?.[0] || 'Gagal mengambil data delivery-order');
    }

    const items = listRes.data.d;
    let savedCount = 0;

    const upsertStmt = db.prepare(`
      INSERT INTO shipments (
        id, type, sj_number, po_number, so_ref, customer_name, destination_address,
        zone_code, origin_location_code, fulfillment_type, status, priority, 
        total_points, total_weight_kg, required_vehicle_type, tas_size, notes, accurate_id, plan_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        sj_number = excluded.sj_number,
        customer_name = excluded.customer_name,
        notes = excluded.notes,
        total_points = excluded.total_points,
        required_vehicle_type = excluded.required_vehicle_type,
        plan_date = COALESCE(shipments.plan_date, excluded.plan_date)
    `);

    const insertLineItem = db.prepare(`
      INSERT INTO shipment_items (id, shipment_id, accurate_item_id, item_no, item_name, quantity, unit_name, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const upsertMasterItem = db.prepare(`
      INSERT INTO items (id, accurate_item_id, sku, name, size_class, unit_name, updated_by, updated_at)
      VALUES (?, ?, ?, ?, 'KECIL', ?, 'Accurate DO Sync', datetime('now'))
      ON CONFLICT(accurate_item_id) DO UPDATE SET
        sku = excluded.sku,
        name = excluded.name,
        unit_name = excluded.unit_name
    `);

    for (const row of items) {
      // Fetch DO detail to get complete items and customer address
      const detailRes = await callAccurate('delivery-order/detail.do', { id: row.id });
      const d = detailRes.data?.d;
      if (!d) continue;

      const sjNumber = d.number || `SJ/ACC/${row.id}`;
      const customerName = d.customer?.name || 'Customer Accurate';
      const address = d.toAddress || d.customer?.address || 'Alamat Customer';
      const poNumber = d.poNumber || '';
      const notes = d.description || '';

      // Determine size & points from line items
      let totalQty = 0;
      if (Array.isArray(d.detailItem)) {
        for (const item of d.detailItem) {
          totalQty += (item.quantity || 1);
        }
      }

      // Calculation: points = qty * 3 (avg)
      const calculatedPoints = Math.max(1, Math.round(totalQty * 3));
      const requiredVehicle = calculatedPoints <= 15 ? 'MOTOR' : calculatedPoints <= 120 ? 'MOBIL_CARRY' : 'TRAGA';
      const tasSize = calculatedPoints > 15 ? 'BESAR' : 'KECIL';
      const isUrgent = notes.toLowerCase().includes('urgent') || notes.toLowerCase().includes('segera');
      const rawMethod = [
        d.shipment?.name,
        d.shipmentName,
        d.transporter?.name,
        d.transporterName,
        d.shippingMethod,
        d.shipping,
        d.shipMethod,
        d.deliveryMethod,
        d.driverName
      ].filter(Boolean).join(' ').toLowerCase();

      const isPickup = rawMethod.includes('ambil') || rawMethod.includes('pickup') || rawMethod.includes('j23') ||
                       notes.toLowerCase().includes('j23') || notes.toLowerCase().includes('ambil') || notes.toLowerCase().includes('pickup') ||
                       address.toLowerCase().includes('ambil') || address.toLowerCase().includes('j23') || address.toLowerCase().includes('pickup');

      // Detect zone heuristic
      let zone = 'B';
      const lowerAddr = (address + ' ' + customerName).toLowerCase();
      if (lowerAddr.includes('gresik') || lowerAddr.includes('manyar') || lowerAddr.includes('kebomas')) zone = 'A';
      else if (lowerAddr.includes('buduran') || lowerAddr.includes('gedangan') || lowerAddr.includes('candi') || lowerAddr.includes('sidoarjo kota')) zone = 'C';
      else if (lowerAddr.includes('surabaya') || lowerAddr.includes('rungkut') || lowerAddr.includes('margomulyo')) zone = 'FR';
      else if (lowerAddr.includes('ngoro') || lowerAddr.includes('mojokerto')) zone = 'NG';
      else if (lowerAddr.includes('pasuruan') || lowerAddr.includes('pier') || lowerAddr.includes('rembang')) zone = 'PSR';

      const shipmentId = 'acc-do-' + row.id;
      const transDateIso = parseAccurateDate(d.transDate || d.shipDate);

      upsertStmt.run(
        shipmentId,
        isPickup ? 'PICKUP' : 'SJ',
        sjNumber,
        poNumber,
        d.salesOrder?.number || '',
        customerName,
        address,
        zone,
        'J40',
        isPickup ? 'PICKUP_J23' : 'ARMADA_SENDIRI',
        isPickup ? 'PICKUP_READY' : (transDateIso ? 'SCHEDULED' : 'UNSCHEDULED'),
        isUrgent ? 'URGENT' : 'NORMAL',
        calculatedPoints,
        calculatedPoints * 1.5,
        requiredVehicle,
        tasSize,
        notes || (isPickup ? 'DIAMBIL DI J23' : 'Sinkronisasi Accurate Online'),
        String(row.id),
        transDateIso
      );

      // Process Line Items in detailItem
      if (Array.isArray(d.detailItem) && d.detailItem.length > 0) {
        db.prepare('DELETE FROM shipment_items WHERE shipment_id = ?').run(shipmentId);

        for (let idx = 0; idx < d.detailItem.length; idx++) {
          const it = d.detailItem[idx];
          const accItemId = String(it.itemId || it.item?.id || '');
          const sku = it.item?.no || it.detailName?.split(',')[0]?.trim() || `SKU-${accItemId || (idx + 1)}`;
          const name = it.item?.name || it.detailName || 'Produk Accurate';
          const qty = Number(it.quantity || 1);
          const unit = it.availableItemUnitName || it.availableItemUnit?.name || it.item?.unit1?.name || 'PCS';

          if (accItemId) {
            upsertMasterItem.run(`item-acc-${accItemId}`, accItemId, sku, name, unit);
          }

          const lineId = `si-acc-${row.id}-${idx + 1}`;
          insertLineItem.run(lineId, shipmentId, accItemId || null, sku, name, qty, unit, it.detailNotes || null);
        }

        // Auto-recalculate muat requirement based on items
        recalculateShipmentMuat(shipmentId);
      }

      savedCount++;
    }

    // Log sync
    db.prepare(`
      INSERT INTO sync_logs (id, entity_type, status, records_fetched, records_saved)
      VALUES (?, 'DELIVERY_ORDER', 'SUCCESS', ?, ?)
    `).run(syncId, items.length, savedCount);

    return {
      success: true,
      fetched: items.length,
      saved: savedCount,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('[AccurateSync Error]:', err);
    db.prepare(`
      INSERT INTO sync_logs (id, entity_type, status, records_fetched, records_saved, error_message)
      VALUES (?, 'DELIVERY_ORDER', 'ERROR', 0, 0, ?)
    `).run(syncId, err.message);

    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Sync master items catalog directly from Accurate item/list.do
 */
export async function syncAccurateItems({ maxPages = 5, pageSize = 100, search = '' } = {}) {
  const syncId = 'sync-items-' + Date.now();
  let totalFetched = 0;
  let totalSaved = 0;
  let page = 1;
  let totalRowsInAccurate = 0;

  try {
    console.log(`[AccurateSync] Syncing Master Items from Accurate Online (maxPages=${maxPages}, pageSize=${pageSize})...`);

    const upsertItem = db.prepare(`
      INSERT INTO items (id, accurate_item_id, sku, name, size_class, unit_name, updated_by, updated_at)
      VALUES (?, ?, ?, ?, 'KECIL', ?, 'Accurate Catalog Sync', datetime('now'))
      ON CONFLICT(accurate_item_id) DO UPDATE SET
        sku = excluded.sku,
        name = excluded.name,
        unit_name = excluded.unit_name
    `);

    while (page <= maxPages) {
      const params = {
        'sp.pageSize': pageSize,
        'sp.page': page,
        fields: 'id,no,name,itemType,unit1Name'
      };
      if (search) params['filter.keywords.val'] = search;

      const res = await callAccurate('item/list.do', params);
      if (!res.data?.s || !Array.isArray(res.data?.d)) {
        break;
      }

      const rows = res.data.d;
      totalRowsInAccurate = res.data.sp?.rowCount || 0;
      if (rows.length === 0) break;

      totalFetched += rows.length;

      for (const r of rows) {
        const accId = String(r.id);
        const sku = r.no || `SKU-${accId}`;
        const name = r.name || 'Produk';
        const unit = r.unit1Name || 'PCS';
        upsertItem.run(`item-acc-${accId}`, accId, sku, name, unit);
        totalSaved++;
      }

      if (rows.length < pageSize) break;
      page++;
    }

    db.prepare(`
      INSERT INTO sync_logs (id, entity_type, status, records_fetched, records_saved)
      VALUES (?, 'ITEMS', 'SUCCESS', ?, ?)
    `).run(syncId, totalFetched, totalSaved);

    return {
      success: true,
      pagesFetched: page - 1,
      fetched: totalFetched,
      saved: totalSaved,
      totalRowsInAccurate,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('[AccurateSync Items Error]:', err);
    db.prepare(`
      INSERT INTO sync_logs (id, entity_type, status, records_fetched, records_saved, error_message)
      VALUES (?, 'ITEMS', 'ERROR', ?, ?, ?)
    `).run(syncId, totalFetched, totalSaved, err.message);

    return {
      success: false,
      error: err.message,
      fetched: totalFetched,
      saved: totalSaved
    };
  }
}

/**
 * Sync line items for a single shipment from Accurate Online on-demand
 */
export async function syncSingleShipmentItemsFromAccurate(shipmentId, accurateDoId) {
  if (!accurateDoId) return { success: false, message: 'Tidak memiliki ID Accurate' };

  const shipment = db.prepare('SELECT type, sj_number FROM shipments WHERE id = ?').get(shipmentId);
  const docType = shipment?.type || '';
  const sjNumber = shipment?.sj_number || '';

  const detailRes = await getAccurateDeliveryOrderDetail(accurateDoId, docType, sjNumber);
  if (!detailRes.success || !detailRes.data) {
    return { success: false, message: detailRes.error || 'Data detail dokumen tidak ditemukan di Accurate' };
  }

  const d = detailRes.data;
  const items = d.items || [];

  const insertLineItem = db.prepare(`
    INSERT INTO shipment_items (id, shipment_id, accurate_item_id, item_no, item_name, quantity, unit_name, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const upsertMasterItem = db.prepare(`
    INSERT INTO items (id, accurate_item_id, sku, name, size_class, unit_name, updated_by, updated_at)
    VALUES (?, ?, ?, ?, 'KECIL', ?, 'Accurate Sync', datetime('now'))
    ON CONFLICT(accurate_item_id) DO UPDATE SET
      sku = excluded.sku,
      name = excluded.name,
      unit_name = excluded.unit_name
  `);

  db.prepare('DELETE FROM shipment_items WHERE shipment_id = ?').run(shipmentId);

  let insertedCount = 0;
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const accItemId = String(it.accurateItemId || '');
    const sku = it.sku || `SKU-${accItemId || (idx + 1)}`;
    const name = it.name || 'Produk Accurate';
    const qty = Number(it.quantity || 1);
    const unit = it.unitName || 'PCS';

    if (accItemId) {
      try {
        upsertMasterItem.run(`item-acc-${accItemId}`, accItemId, sku, name, unit);
      } catch (e) {
        // Ignore duplicate primary key
      }
    }

    const lineId = `si-acc-${accurateDoId}-${idx + 1}-${Date.now()}`;
    insertLineItem.run(lineId, shipmentId, accItemId || null, sku, name, qty, unit, it.notes || null);
    insertedCount++;
  }

  // Recalculate load recommendation
  recalculateShipmentMuat(shipmentId);

  return {
    success: true,
    count: insertedCount,
    items
  };
}

/**
 * Sync line items for all existing shipments with accurate_id
 */
export async function syncAllExistingDoItems() {
  const shipments = db.prepare('SELECT id, accurate_id, sj_number FROM shipments WHERE accurate_id IS NOT NULL').all();
  const results = [];
  for (const s of shipments) {
    try {
      const res = await syncSingleShipmentItemsFromAccurate(s.id, s.accurate_id);
      results.push({ id: s.id, sj: s.sj_number, success: res.success, count: res.count });
    } catch (err) {
      results.push({ id: s.id, sj: s.sj_number, success: false, error: err.message });
    }
  }
  return results;
}

/**
/**
 * Get standard warehouse address by name
 */
export function getWarehouseAddress(name = '') {
  const n = String(name).toLowerCase();
  if (n.includes('jagalan')) {
    return 'Jl. Jagalan No. 38, Bongkaran, Kec. Pabean Cantian, Surabaya, Jawa Timur 60161';
  }
  if (n.includes('taman dayu')) {
    return 'Kawasan Pertokoan Taman Dayu, Sukorejo, Pasuruan, Jawa Timur 67161';
  }
  if (n.includes('j-23') || n.includes('j1-23') || n.includes('kalirungkut')) {
    return 'Ruko Galaxi Bumi Permai J1-23, Semolowaru, Kec. Sukolilo, Surabaya, Jawa Timur 60119';
  }
  if (n.includes('j-40') || n.includes('j1-40')) {
    return 'Jl. Semolowaru Timur II No.19, RT.006/RW.002, Semolowaru, Kec. Sukolilo, Surabaya, Jawa Timur 60119';
  }
  if (n.includes('workshop')) {
    return 'Kawasan Workshop ATS, Rungkut Industri, Surabaya';
  }
  return name ? `${name}, Surabaya` : 'Gudang ATS Logistics Surabaya';
}

/**
 * Live search Delivery Orders, Job Costing (JC), Item Transfers (IT), and Material Adjustments (MA)
 */
export async function searchLiveAccurateDeliveryOrders(keywords = '', limit = 30) {
  try {
    const cleanQ = (keywords || '').trim();
    const upperQ = cleanQ.toUpperCase();

    const isExplicitJC = upperQ.startsWith('JC');
    const isExplicitIT = upperQ.startsWith('IT') || upperQ.startsWith('RIT');
    const isExplicitMA = upperQ.startsWith('MA');
    const isExplicitDO = upperQ.startsWith('DO') || upperQ.startsWith('SJ');
    const isExplicitPrefix = isExplicitJC || isExplicitIT || isExplicitMA || isExplicitDO;

    const pageSize = Math.min(50, Math.max(5, limit));

    // Map existing shipments from local database by accurate_id and sj_number
    const existingShipments = db.prepare('SELECT id, accurate_id, sj_number, status, plan_date FROM shipments').all();
    const existingMap = new Map();
    existingShipments.forEach(s => {
      if (s.accurate_id) existingMap.set(String(s.accurate_id), s);
      if (s.sj_number) existingMap.set(String(s.sj_number).toUpperCase(), s);
    });

    const searchPromises = [];

    // 1. Delivery Orders (DO)
    if (!isExplicitPrefix || isExplicitDO) {
      const p = {
        fields: 'id,number,transDate,customer,toAddress,poNumber',
        'sp.pageSize': pageSize
      };
      if (cleanQ) {
        p['filter.keywords.op'] = 'CONTAIN';
        p['filter.keywords.val'] = cleanQ;
      }
      searchPromises.push(
        callAccurate('delivery-order/list.do', p)
          .then(res => (res.data?.s && Array.isArray(res.data?.d)) ? res.data.d.map(r => ({ ...r, __docType: 'DO' })) : [])
          .catch(() => [])
      );
    }

    // 2. Job Costing / Job Order (JC)
    if (!isExplicitPrefix || isExplicitJC) {
      const p = {
        fields: 'id,number,transDate,description,customer',
        'sp.pageSize': pageSize
      };
      if (cleanQ) {
        p['filter.keywords.op'] = 'CONTAIN';
        p['filter.keywords.val'] = cleanQ;
      }
      searchPromises.push(
        callAccurate('job-order/list.do', p)
          .then(res => (res.data?.s && Array.isArray(res.data?.d)) ? res.data.d.map(r => ({ ...r, __docType: 'JC' })) : [])
          .catch(() => [])
      );
    }

    // 3. Item Transfer / Pindah Barang (IT)
    if (!isExplicitPrefix || isExplicitIT) {
      const p = {
        fields: 'id,number,transDate,description,warehouse,warehouseName,referenceWarehouse,referenceWarehouseName',
        'sp.pageSize': pageSize
      };
      if (cleanQ) {
        p['filter.keywords.op'] = 'CONTAIN';
        p['filter.keywords.val'] = cleanQ;
      }
      searchPromises.push(
        callAccurate('item-transfer/list.do', p)
          .then(res => (res.data?.s && Array.isArray(res.data?.d)) ? res.data.d.map(r => ({ ...r, __docType: 'IT' })) : [])
          .catch(() => [])
      );
    }

    // 4. Material Adjustment / Penyesuaian Bahan (MA)
    if (!isExplicitPrefix || isExplicitMA) {
      const p = {
        fields: 'id,number,transDate,description,jobOrder',
        'sp.pageSize': pageSize
      };
      if (cleanQ) {
        p['filter.keywords.op'] = 'CONTAIN';
        p['filter.keywords.val'] = cleanQ;
      }
      searchPromises.push(
        callAccurate('material-adjustment/list.do', p)
          .then(res => (res.data?.s && Array.isArray(res.data?.d)) ? res.data.d.map(r => ({ ...r, __docType: 'MA' })) : [])
          .catch(() => [])
      );
    }

    const settled = await Promise.all(searchPromises);
    const combinedRows = settled.flat();

    const results = combinedRows.map(row => {
      const docType = row.__docType || 'DO';
      const num = row.number || `${docType}/ACC/${row.id}`;
      const existing = existingMap.get(String(row.id)) || existingMap.get(num.toUpperCase());
      const transDateIso = parseAccurateDate(row.transDate);

      let customerName = 'Customer Accurate';
      let address = '';
      let poNumber = '';

      if (docType === 'DO') {
        customerName = row.customer?.name || 'Customer Accurate';
        address = row.toAddress || row.customer?.address || '';
        poNumber = row.poNumber || '';
      } else if (docType === 'JC') {
        customerName = row.customer?.name || (row.description ? row.description.split('\n')[0] : 'Job Costing Project');
        address = row.customer?.shipStreet || row.customer?.billStreet || row.customer?.address || '';
        const poMatch = (row.description || '').match(/No\.?\s*PO\s*[:=]?\s*([A-Za-z0-9\-_/]+)/i);
        poNumber = poMatch ? poMatch[1] : '';
      } else if (docType === 'IT') {
        const toWh = row.warehouseName || row.warehouse?.name || 'Gudang Tujuan';
        const fromWh = row.referenceWarehouseName || row.referenceWarehouse?.name || 'Gudang Asal';
        customerName = `Transfer ke ${toWh}`;
        poNumber = `Dari: ${fromWh}`;
        address = getWarehouseAddress(toWh);
      } else if (docType === 'MA') {
        customerName = row.description ? row.description.split('\n')[0] : (row.jobOrder?.number ? `Penyesuaian Bahan ${row.jobOrder.number}` : 'Material Adjustment');
        poNumber = row.jobOrder?.number || '';
        address = row.jobOrder?.description || 'Penyesuaian Bahan Gudang J40';
      }

      return {
        id: row.id,
        accurateId: String(row.id),
        docType,
        docTypeLabel: docType === 'DO' ? 'Delivery Order (DO)' : docType === 'JC' ? 'Job Costing (JC)' : docType === 'IT' ? 'Transfer Barang (IT)' : 'Penyesuaian Bahan (MA)',
        number: num,
        customerName,
        customerNo: row.customer?.customerNo || '',
        address,
        poNumber,
        transDate: row.transDate || '',
        transDateIso,
        isScheduled: Boolean(existing && existing.status !== 'DRAFT'),
        existingStatus: existing?.status || null,
        existingPlanDate: existing?.plan_date || null,
        shipmentId: existing?.id || null
      };
    });

    // Sort by transDate descending
    results.sort((a, b) => {
      const timeA = a.transDateIso ? new Date(a.transDateIso).getTime() : 0;
      const timeB = b.transDateIso ? new Date(b.transDateIso).getTime() : 0;
      return timeB - timeA;
    });

    return {
      success: true,
      count: results.length,
      data: results.slice(0, Math.max(limit, 50))
    };
  } catch (err) {
    console.error('[Search Accurate Docs Error]:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get single document detail (DO, JC, IT, MA) from Accurate Online for scheduling preview
 */
export async function getAccurateDeliveryOrderDetail(accurateId, explicitDocType = '', docNumber = '') {
  try {
    let docType = (explicitDocType || '').toUpperCase();
    const num = (docNumber || '').toUpperCase();

    if (!docType) {
      if (num.startsWith('JC.') || num.startsWith('JC-')) docType = 'JC';
      else if (num.startsWith('IT.') || num.startsWith('RIT.') || num.startsWith('IT-')) docType = 'IT';
      else if (num.startsWith('MA.') || num.startsWith('MA-')) docType = 'MA';
      else docType = 'DO';
    }

    let d = null;
    let customerName = 'Customer Accurate';
    let address = '';
    let poNumber = '';
    let number = '';
    let notes = '';
    let transDate = '';
    let transDateIso = null;
    let rawItems = [];

    if (docType === 'JC') {
      const res = await callAccurate('job-order/detail.do', { id: accurateId });
      d = res.data?.d;
      if (!d) throw new Error('Job Costing (JC) tidak ditemukan di Accurate');

      number = d.number || `JC/${accurateId}`;
      customerName = d.customer?.name || (d.description ? d.description.split('\n')[0] : 'Job Costing Project');
      
      // Try to get complete customer address if available
      address = d.customer?.shipStreet || d.customer?.billStreet || d.customer?.address || '';
      if (!address && d.customer?.id) {
        try {
          const cRes = await callAccurate('customer/detail.do', { id: d.customer.id });
          const c = cRes.data?.d;
          if (c) {
            address = [c.shipStreet || c.billStreet, c.shipCity || c.billCity].filter(Boolean).join(', ');
          }
        } catch (e) {}
      }
      if (!address) {
        address = d.description || 'Proyek Job Costing ATS';
      }

      const poMatch = (d.description || '').match(/No\.?\s*PO\s*[:=]?\s*([A-Za-z0-9\-_/]+)/i);
      poNumber = poMatch ? poMatch[1] : '';
      notes = d.description || 'Job Costing ATS';
      transDate = d.transDate || '';
      transDateIso = parseAccurateDate(d.transDate);
      rawItems = d.detailItem || [];
    } else if (docType === 'IT') {
      const res = await callAccurate('item-transfer/detail.do', { id: accurateId });
      d = res.data?.d;
      if (!d) throw new Error('Item Transfer (IT) tidak ditemukan di Accurate');

      number = d.number || `IT/${accurateId}`;
      const toWh = d.warehouseName || d.warehouse?.name || 'Gudang Tujuan';
      const fromWh = d.referenceWarehouseName || d.referenceWarehouse?.name || 'Gudang Asal';
      customerName = `Transfer ke ${toWh}`;
      poNumber = `Dari: ${fromWh}`;
      address = getWarehouseAddress(toWh);
      notes = d.description ? `${d.description} (Transfer dari ${fromWh} ke ${toWh})` : `Pindah barang dari ${fromWh} ke ${toWh}`;
      transDate = d.transDate || '';
      transDateIso = parseAccurateDate(d.transDate);
      rawItems = d.detailItem || [];
    } else if (docType === 'MA') {
      const res = await callAccurate('material-adjustment/detail.do', { id: accurateId });
      d = res.data?.d;
      if (!d) throw new Error('Material Adjustment (MA) tidak ditemukan di Accurate');

      number = d.number || `MA/${accurateId}`;
      customerName = d.description ? d.description.split('\n')[0] : (d.jobOrder?.number ? `Penyesuaian Bahan ${d.jobOrder.number}` : 'Material Adjustment');
      poNumber = d.jobOrder?.number || '';
      address = d.jobOrder?.description || 'Penyesuaian Bahan Gudang J40';
      notes = d.description || 'Material Adjustment ATS';
      transDate = d.transDate || '';
      transDateIso = parseAccurateDate(d.transDate);
      rawItems = d.detailItem || [];
    } else {
      // Default: DO
      docType = 'DO';
      const res = await callAccurate('delivery-order/detail.do', { id: accurateId });
      d = res.data?.d;
      if (!d) throw new Error('Delivery order tidak ditemukan di Accurate');

      number = d.number || `DO/${accurateId}`;
      customerName = d.customer?.name || 'Customer Accurate';
      address = d.toAddress || d.customer?.address || '';
      poNumber = d.poNumber || '';
      notes = d.description || '';
      transDate = d.transDate || '';
      transDateIso = parseAccurateDate(d.transDate || d.shipDate);
      rawItems = d.detailItem || [];
    }

    const coords = getEstimatedCoords(address, customerName);

    const items = rawItems.map((it, idx) => ({
      index: idx + 1,
      accurateItemId: it.itemId || it.item?.id || '',
      sku: it.item?.no || it.detailName?.split(',')[0]?.trim() || `SKU-${idx + 1}`,
      name: it.item?.name || it.detailName || 'Produk Accurate',
      quantity: Number(it.quantity || 1),
      unitName: it.itemUnit?.name || it.availableItemUnitName || it.availableItemUnit?.name || it.item?.unit1?.name || 'PCS',
      notes: it.detailNotes || ''
    }));

    // Check existing DB status
    const existing = db.prepare('SELECT * FROM shipments WHERE accurate_id = ? OR UPPER(sj_number) = ?').get(String(accurateId), number.toUpperCase());

    return {
      success: true,
      data: {
        accurateId: String(accurateId),
        docType,
        docTypeLabel: docType === 'DO' ? 'Delivery Order (DO)' : docType === 'JC' ? 'Job Costing (JC)' : docType === 'IT' ? 'Transfer Barang (IT)' : 'Penyesuaian Bahan (MA)',
        number,
        customerName,
        address: existing?.destination_address || address,
        originalAddress: address,
        poNumber,
        notes,
        transDate,
        transDateIso,
        lat: existing?.destination_lat || coords.lat,
        lng: existing?.destination_lng || coords.lng,
        zoneCode: existing?.zone_code || coords.zone,
        items,
        itemCount: items.length,
        isScheduled: Boolean(existing && existing.status !== 'DRAFT'),
        existingStatus: existing?.status || null,
        existingPlanDate: existing?.plan_date || null,
        shipmentId: existing?.id || null
      }
    };
  } catch (err) {
    console.error('[Get Accurate Doc Detail Error]:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Schedule a single document (DO, JC, IT, MA) into the system with custom date, edited address, and verified coordinates
 */
export async function scheduleSingleDeliveryOrder({
  accurateId,
  docType = 'DO',
  planDate,
  customAddress,
  lat,
  lng,
  zoneCode,
  priority = 'NORMAL',
  scheduledBy = 'Marketing',
  notes = ''
}) {
  try {
    if (!accurateId) throw new Error('ID Accurate dokumen wajib disertakan');
    if (!planDate) throw new Error('Tanggal kirim wajib diisi');

    const previewRes = await getAccurateDeliveryOrderDetail(accurateId, docType);
    if (!previewRes.success || !previewRes.data) {
      throw new Error(previewRes.error || 'Gagal mengambil rincian dokumen Accurate');
    }
    const d = previewRes.data;
    const finalDocType = d.docType || docType || 'DO';

    const shipmentId = `acc-${finalDocType.toLowerCase()}-${accurateId}`;
    const sjNumber = d.number;
    const customerName = d.customerName;
    const finalAddress = (customAddress || d.address || 'Alamat Tujuan').trim();
    const poNumber = d.poNumber || '';
    const doNotes = (notes || d.notes || '').trim();

    // Determine coords & zone
    let finalLat = Number(lat);
    let finalLng = Number(lng);
    let finalZone = zoneCode;

    if (!finalLat || !finalLng || isNaN(finalLat)) {
      const estimated = getEstimatedCoords(finalAddress, customerName, finalZone);
      finalLat = estimated.lat;
      finalLng = estimated.lng;
      if (!finalZone) finalZone = estimated.zone;
    }
    if (!finalZone) finalZone = 'B';

    // Total points & muat calculation
    let totalQty = 0;
    for (const item of d.items || []) {
      totalQty += (item.quantity || 1);
    }
    const calculatedPoints = Math.max(1, Math.round(totalQty * 3));
    const requiredVehicle = calculatedPoints <= 15 ? 'MOTOR' : calculatedPoints <= 120 ? 'MOBIL_CARRY' : 'TRAGA';
    const tasSize = calculatedPoints > 15 ? 'BESAR' : 'KECIL';

    const now = new Date().toISOString();

    const isPickup = finalAddress.toLowerCase().includes('j23') || finalAddress.toLowerCase().includes('ambil') || finalAddress.toLowerCase().includes('pickup') || doNotes.toLowerCase().includes('j23');

    db.prepare(`
      INSERT INTO shipments (
        id, type, sj_number, po_number, so_ref, customer_name, destination_address,
        destination_lat, destination_lng, zone_code, origin_location_code, fulfillment_type,
        status, priority, total_points, total_weight_kg, required_vehicle_type, tas_size,
        notes, accurate_id, plan_date, scheduled_by, scheduled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'J40', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        sj_number = excluded.sj_number,
        customer_name = excluded.customer_name,
        destination_address = excluded.destination_address,
        destination_lat = excluded.destination_lat,
        destination_lng = excluded.destination_lng,
        zone_code = excluded.zone_code,
        notes = excluded.notes,
        total_points = excluded.total_points,
        status = excluded.status,
        plan_date = excluded.plan_date,
        scheduled_by = excluded.scheduled_by,
        scheduled_at = excluded.scheduled_at
    `).run(
      shipmentId,
      finalDocType,
      sjNumber,
      poNumber,
      '',
      customerName,
      finalAddress,
      finalLat,
      finalLng,
      finalZone,
      isPickup ? 'PICKUP_J23' : 'ARMADA_SENDIRI',
      isPickup ? 'PICKUP_READY' : 'SCHEDULED',
      priority,
      calculatedPoints,
      calculatedPoints * 1.5,
      requiredVehicle,
      tasSize,
      doNotes || `Jadwal ${finalDocType} ATS`,
      String(accurateId),
      planDate,
      scheduledBy,
      now
    );

    // Save line items
    const insertLineItem = db.prepare(`
      INSERT INTO shipment_items (id, shipment_id, accurate_item_id, item_no, item_name, quantity, unit_name, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const upsertMasterItem = db.prepare(`
      INSERT INTO items (id, accurate_item_id, sku, name, size_class, unit_name, updated_by, updated_at)
      VALUES (?, ?, ?, ?, 'KECIL', ?, 'Accurate Sync', datetime('now'))
      ON CONFLICT(accurate_item_id) DO UPDATE SET
        sku = excluded.sku,
        name = excluded.name,
        unit_name = excluded.unit_name
    `);

    db.prepare('DELETE FROM shipment_items WHERE shipment_id = ?').run(shipmentId);

    if (Array.isArray(d.items)) {
      for (let idx = 0; idx < d.items.length; idx++) {
        const it = d.items[idx];
        const accItemId = String(it.accurateItemId || '');
        const sku = it.sku || `SKU-${idx + 1}`;
        const name = it.name || 'Produk Accurate';
        const qty = Number(it.quantity || 1);
        const unit = it.unitName || 'PCS';

        if (accItemId) {
          try {
            upsertMasterItem.run(`item-acc-${accItemId}`, accItemId, sku, name, unit);
          } catch (e) {}
        }

        const lineId = `si-acc-${accurateId}-${idx + 1}-${Date.now()}`;
        insertLineItem.run(lineId, shipmentId, accItemId || null, sku, name, qty, unit, it.notes || null);
      }
    }

    recalculateShipmentMuat(shipmentId);

    const savedShipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);

    return {
      success: true,
      message: `${finalDocType} ${sjNumber} (${customerName}) berhasil dijadwalkan untuk ${planDate}!`,
      data: savedShipment
    };
  } catch (err) {
    console.error('[Schedule Single Accurate Doc Error]:', err);
    return { success: false, error: err.message };
  }
}


