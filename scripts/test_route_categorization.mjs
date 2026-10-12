import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new DatabaseSync(path.join(__dirname, '..', 'data', 'ats_logistics.db'));

import { calculateDistanceKm, isPickupShipment, generateMultiStopGoogleMapsUrl } from '../services/routingEngine.js';

const origin = { lat: -7.30211, lng: 112.7819, code: 'J40', name: 'Gudang Utama J40' };

function classifyCorridor(s) {
  const z = (s.zone_code || '').toUpperCase();
  const addr = (s.destination_address || '').toUpperCase();
  const cust = (s.customer_name || '').toUpperCase();
  const text = `${addr} ${cust}`;

  // 1. Pasuruan / Gempol / Pandaan / PIER
  if (z === 'PSR' || text.includes('PASURUAN') || text.includes('PANDAAN') || text.includes('GEMPOL') || text.includes('PIER') || text.includes('BEJI') || text.includes('BANGIL') || text.includes('KRATON')) {
    return { key: 'PASURUAN', title: 'Koridor Pasuruan, Gempol & Pandaan', area: 'Pasuruan / Pandaan' };
  }

  // 2. Ngoro / Mojokerto
  if (z === 'NG' || text.includes('NGORO') || text.includes('MOJOKERTO') || text.includes('NIP') || text.includes('BRINGINBENDO')) {
    return { key: 'MOJOKERTO', title: 'Koridor Mojokerto & Ngoro', area: 'Mojokerto / Ngoro' };
  }

  // 3. Gresik / Margomulyo / Tandes / Manyar
  if (z === 'A' || text.includes('GRESIK') || text.includes('MANYAR') || text.includes('KEBOMAS') || text.includes('MARGOMULYO') || text.includes('TANDES') || text.includes('ROMOKALISARI') || text.includes('BENOWO') || text.includes('DRIYOREJO')) {
    return { key: 'GRESIK', title: 'Koridor Gresik, Margomulyo & Surabaya Barat', area: 'Gresik / Margomulyo' };
  }

  // 4. Sidoarjo Kota, Buduran, Gedangan, Candi
  if (z === 'C' || text.includes('BUDURAN') || text.includes('GEDANGAN') || text.includes('CANDI') || text.includes('PORONG') || text.includes('SIDOARJO KOTA') || text.includes('SUKODONO')) {
    return { key: 'SIDOARJO_KOTA', title: 'Koridor Sidoarjo Kota, Buduran & Gedangan', area: 'Sidoarjo Kota / Buduran' };
  }

  // 5. Sidoarjo Waru, Krian, Taman, Sepanjang, Berbek
  if (z === 'B' || text.includes('WARU') || text.includes('TAMAN') || text.includes('SEPANJANG') || text.includes('KRIAN') || text.includes('BERBEK') || text.includes('SIDOARJO') || text.includes('GWALK') || text.includes('MASTRIP')) {
    return { key: 'SIDOARJO_WARU', title: 'Koridor Sidoarjo & Waru', area: 'Waru / Sepanjang / Krian' };
  }

  // 6. Surabaya Timur, Rungkut, SIER, Sukolilo, Kenjeran, Pusat
  return { key: 'SURABAYA', title: 'Koridor Surabaya Timur, Rungkut & SIER', area: 'Surabaya Timur / Rungkut' };
}

function buildCategorizedRoutes(shipments) {
  const valid = shipments.filter(s => !isPickupShipment(s));
  const groups = {};

  for (const s of valid) {
    const c = classifyCorridor(s);
    if (!groups[c.key]) {
      groups[c.key] = {
        title: c.title,
        area: c.area,
        shipments: []
      };
    }
    groups[c.key].shipments.push(s);
  }

  // Order of corridors from Northwest to South/East
  const corridorOrder = ['GRESIK', 'SIDOARJO_WARU', 'SIDOARJO_KOTA', 'PASURUAN', 'MOJOKERTO', 'SURABAYA'];
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let routeIdx = 0;
  const resultRoutes = [];

  for (const cKey of corridorOrder) {
    const grp = groups[cKey];
    if (!grp || grp.shipments.length === 0) continue;

    // Chunk into 8-10 SJ if more than 10
    const chunks = [];
    if (grp.shipments.length > 10) {
      const chunkSize = Math.ceil(grp.shipments.length / 2);
      chunks.push(grp.shipments.slice(0, chunkSize));
      chunks.push(grp.shipments.slice(chunkSize));
    } else {
      chunks.push(grp.shipments);
    }

    chunks.forEach((chunk, chunkIdx) => {
      const letter = alphabet[routeIdx % alphabet.length];
      routeIdx++;

      // Sequence stops from J40 using nearest neighbor
      const unvisited = chunk.map(s => ({
        ...s,
        lat: Number(s.destination_lat) || -7.38,
        lng: Number(s.destination_lng) || 112.72
      }));

      const ordered = [];
      let curLat = origin.lat;
      let curLng = origin.lng;

      while (unvisited.length > 0) {
        let nearestIdx = 0;
        let minD = Infinity;
        for (let i = 0; i < unvisited.length; i++) {
          const d = calculateDistanceKm(curLat, curLng, unvisited[i].lat, unvisited[i].lng);
          if (d < minD) {
            minD = d;
            nearestIdx = i;
          }
        }
        const nextStop = unvisited.splice(nearestIdx, 1)[0];
        ordered.push(nextStop);
        curLat = nextStop.lat;
        curLng = nextStop.lng;
      }

      // Calculate travel times & distances
      let cumulativeKm = 0;
      let cumulativeMins = 0;
      let prevLat = origin.lat;
      let prevLng = origin.lng;

      const stops = ordered.map((s, idx) => {
        const legD = calculateDistanceKm(prevLat, prevLng, s.lat, s.lng);
        cumulativeKm += legD;
        const driveMins = Math.round((legD / 35) * 60);
        cumulativeMins += (driveMins + 15);

        const totalM = 8 * 60 + cumulativeMins; // start 08:00 AM
        const h = Math.floor(totalM / 60) % 24;
        const m = totalM % 60;
        const etaStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

        prevLat = s.lat;
        prevLng = s.lng;

        return {
          sequence: idx + 1,
          susunan_label: `Stop ${idx + 1}`,
          shipment: s,
          leg_distance_km: Math.round(legD * 10) / 10,
          leg_minutes: driveMins,
          cumulative_km: Math.round(cumulativeKm * 10) / 10,
          eta_time: etaStr,
          eta_minutes: cumulativeMins
        };
      });

      const gmapsUrl = generateMultiStopGoogleMapsUrl(origin, stops);

      // Check muat recommendation
      const hasBesar = chunk.some(s => s.muat_category === 'BESAR');
      const hasSedang = chunk.some(s => s.muat_category === 'SEDANG');
      let muatSaran = 'MUAT MOTOR';
      let muatBadgeClass = 'badge-motor';
      let defaultVehicle = 'MOTOR';
      if (hasBesar) {
        muatSaran = 'WAJIB MOBIL BOX (CARRY / TRAGA)';
        muatBadgeClass = 'badge-mobil';
        defaultVehicle = chunk.length >= 8 ? 'TRAGA' : 'CARRY';
      } else if (hasSedang) {
        muatSaran = chunk.length > 4 ? 'SARAN MOBIL' : 'EVALUASI MOTOR';
        defaultVehicle = chunk.length > 4 ? 'CARRY' : 'MOTOR';
      }

      // Check current assignment if any
      const assignedDrivers = [...new Set(chunk.map(s => s.assigned_driver).filter(Boolean))];
      const isAssigned = assignedDrivers.length > 0;
      const assignedDriver = assignedDrivers[0] || '';
      const assignedVehicle = chunk[0].assigned_vehicle_type || defaultVehicle;

      const chunkSuffix = chunks.length > 1 ? ` (Bagian ${chunkIdx + 1})` : '';

      resultRoutes.push({
        routeId: `route-${letter.toLowerCase()}`,
        routeLetter: letter,
        routeName: `Rute ${letter}: ${grp.title}${chunkSuffix}`,
        corridorArea: grp.area,
        shipmentCount: chunk.length,
        totalKm: Math.round(cumulativeKm * 10) / 10,
        totalMinutes: cumulativeMins,
        totalDurationFormatted: `${Math.floor(cumulativeMins / 60)}j ${cumulativeMins % 60}m`,
        muatRecommendation: muatSaran,
        defaultVehicle,
        assignedDriver,
        assignedVehicle,
        isAssigned,
        stops: stops,
        googleMapsUrl: gmapsUrl
      });
    });
  }

  return resultRoutes;
}

const todayShips = db.prepare("SELECT * FROM shipments WHERE plan_date = '2026-10-01'").all();
const routes = buildCategorizedRoutes(todayShips);

console.log(`\n=== HASIL KATEGORISASI OPTIMASI RUTE UNTUK HARI INI (${routes.length} RUTE) ===\n`);
for (const r of routes) {
  console.log(`▶ ${r.routeName}`);
  console.log(`  - Kapasitas: ${r.shipmentCount} SJ | Est. Jarak: ${r.totalKm} km | Waktu: ${r.totalDurationFormatted}`);
  console.log(`  - Saran Armada: ${r.muatRecommendation} (Default: ${r.defaultVehicle})`);
  console.log(`  - Driver Ditugaskan: ${r.assignedDriver || '[Belum Ditentukan - Menunggu Tim Ops]'}`);
  console.log(`  - Urutan Titik Pengiriman (Google Maps Multi-Stop):`);
  r.stops.forEach(st => {
    console.log(`     [Stop ${st.sequence}] +${st.leg_minutes}mnt (${st.leg_distance_km}km) -> ${st.shipment.sj_number} | ${st.shipment.customer_name} | Est. Tiba: ${st.eta_time}`);
  });
  console.log(`  - Google Maps: ${r.googleMapsUrl.substring(0, 80)}...\n`);
}
