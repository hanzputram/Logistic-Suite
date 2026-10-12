import { db } from '../db/database.js';

// Haversine formula for road/geographical distance calculation in km
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 5.0; // fallback default
  const R = 6371; // Earth radius km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightDistance = R * c;
  // Detour index factor for urban/suburban East Java roads (approx 1.25x straight distance)
  return Math.round(straightDistance * 1.25 * 10) / 10;
}

/**
 * Detect if a shipment is customer pickup (DIAMBIL DI J23 / Ambil Sendiri)
 * These shipments must NEVER be placed in a delivery route or scheduled for armada drivers.
 */
export function isPickupShipment(s) {
  if (!s) return false;
  const fType = String(s.fulfillment_type || '').toUpperCase();
  const type = String(s.type || '').toUpperCase();
  const status = String(s.status || '').toUpperCase();
  const notes = String(s.notes || '').toUpperCase();
  const addr = String(s.destination_address || '').toUpperCase();
  const shipMethod = String(s.ship_method || s.shipping_method || s.transporter_name || '').toUpperCase();

  if (fType.includes('PICKUP') || fType.includes('AMBIL')) return true;
  if (type === 'PICKUP') return true;
  if (status.startsWith('PICKUP')) return true;
  if (notes.includes('DIAMBIL') || notes.includes('AMBIL DI J23') || notes.includes('PICKUP')) return true;
  if (shipMethod.includes('DIAMBIL') || shipMethod.includes('AMBIL') || shipMethod.includes('PICKUP')) return true;
  if (addr.includes('LOKET') && addr.includes('PICKUP')) return true;
  if (addr.includes('DIAMBIL DI J23')) return true;
  return false;
}

/**
 * Route Mode 1: Terdekat -> Terjauh dari titik awal (Gudang J40)
 * Paling mudah dipahami pengemudi, urutan stabil dan tidak berubah sendiri.
 */
export function sortMode1TerdekatTerjauh(origin, stops) {
  // Exclude pickup shipments completely
  const validStops = (stops || []).filter(s => !isPickupShipment(s));
  // Separate priority stops (locked, HARUS, URGENT) from standard stops
  const priorityStops = [];
  const regularStops = [];

  for (const stop of validStops) {
    const dist = calculateDistanceKm(origin.lat, origin.lng, stop.lat, stop.lng);
    stop.distance_from_origin_km = dist;

    if (stop.is_locked || stop.priority === 'HARUS' || stop.priority === 'URGENT') {
      priorityStops.push(stop);
    } else {
      regularStops.push(stop);
    }
  }

  // Sort regular stops ascending by distance from origin
  regularStops.sort((a, b) => a.distance_from_origin_km - b.distance_from_origin_km);
  priorityStops.sort((a, b) => a.distance_from_origin_km - b.distance_from_origin_km);

  const combined = [...priorityStops, ...regularStops];
  let cumulativeDistance = 0;
  let cumulativeMinutes = 0;

  return combined.map((stop, index) => {
    // Service time at customer: 15 mins unload + travel time (avg 35 km/h in Surabaya-Sidoarjo)
    const legDistance = index === 0 ? stop.distance_from_origin_km : calculateDistanceKm(combined[index - 1].lat, combined[index - 1].lng, stop.lat, stop.lng);
    const driveMinutes = Math.round((legDistance / 35) * 60);
    cumulativeDistance += legDistance;
    cumulativeMinutes += (driveMinutes + 15);

    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${stop.lat},${stop.lng}&travelmode=driving`;

    return {
      ...stop,
      sequence: index + 1,
      leg_distance_km: legDistance,
      cumulative_km: Math.round(cumulativeDistance * 10) / 10,
      eta_minutes: cumulativeMinutes,
      google_maps_url: googleMapsUrl
    };
  });
}

/**
 * Route Mode 2: Nearest Neighbor (Travelling Salesperson heuristic)
 */
export function sortMode2NearestNeighbor(origin, stops) {
  const validStops = (stops || []).filter(s => !isPickupShipment(s));
  if (validStops.length <= 1) return sortMode1TerdekatTerjauh(origin, validStops);

  const unvisited = [...validStops];
  const ordered = [];
  let currentLat = origin.lat;
  let currentLng = origin.lng;

  // Pull out priority stops first
  const priorityIdx = unvisited.findIndex(s => s.is_locked || s.priority === 'HARUS' || s.priority === 'URGENT');
  if (priorityIdx !== -1) {
    const prio = unvisited.splice(priorityIdx, 1)[0];
    ordered.push(prio);
    currentLat = prio.lat;
    currentLng = prio.lng;
  }

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const dist = calculateDistanceKm(currentLat, currentLng, unvisited[i].lat, unvisited[i].lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearestIdx = i;
      }
    }

    const nextStop = unvisited.splice(nearestIdx, 1)[0];
    ordered.push(nextStop);
    currentLat = nextStop.lat;
    currentLng = nextStop.lng;
  }

  return ordered.map((stop, index) => {
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${stop.lat},${stop.lng}&travelmode=driving`;
    return {
      ...stop,
      sequence: index + 1,
      google_maps_url: googleMapsUrl
    };
  });
}

/**
 * Calculate forward azimuth/bearing in degrees (0..360) from point 1 to point 2
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) -
            Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return (theta * 180 / Math.PI + 360) % 360;
}

/**
 * Cross-track distance: perpendicular distance in km from point P to great circle segment O -> D
 */
export function calculateCrossTrackDistanceKm(pLat, pLon, oLat, oLon, dLat, dLon) {
  const R = 6371; // Earth radius km
  const distOP = calculateDistanceKm(oLat, oLon, pLat, pLon) / 1.25; // convert back to approx spherical
  const deltaOP = distOP / R;

  const bearingOD = calculateBearing(oLat, oLon, dLat, dLon) * Math.PI / 180;
  const bearingOP = calculateBearing(oLat, oLon, pLat, pLon) * Math.PI / 180;

  const dXt = Math.asin(Math.sin(deltaOP) * Math.sin(bearingOP - bearingOD));
  return Math.abs(dXt * R);
}

/**
 * Find all shipments that are "SEJALUR" along the corridor from Origin (J40/J23) to Target Destination,
 * and automatically order them from closest to furthest starting from J40/J23.
 *
 * @param {Object} origin - { lat, lng, code: 'J40' }
 * @param {Object} targetShipment - The primary destination shipment
 * @param {Array} candidateShipments - All pending shipments to evaluate
 * @param {Number} maxCrossTrackKm - Max perpendicular deviation from corridor (default 12 km)
 * @param {Number} maxDetourRatio - Max detour ratio (default 1.35x)
 */
export function findCorridorShipments(origin, targetShipment, candidateShipments, maxCrossTrackKm = 12, maxDetourRatio = 1.35) {
  if (isPickupShipment(targetShipment)) {
    throw new Error('Pesanan ini bertipe DIAMBIL DI J23 (Customer Pickup), tidak dapat dijadikan tujuan rute pengiriman armada.');
  }

  // Filter out any pickup shipments from candidates!
  const validCandidates = (candidateShipments || []).filter(s => !isPickupShipment(s));

  const oLat = origin.lat;
  const oLng = origin.lng;
  const tLat = targetShipment.destination_lat || -7.38;
  const tLng = targetShipment.destination_lng || 112.72;

  const directDistToTarget = calculateDistanceKm(oLat, oLng, tLat, tLng);
  const bearingTarget = calculateBearing(oLat, oLng, tLat, tLng);

  const evaluated = [];

  for (const ship of validCandidates) {
    const sLat = ship.destination_lat || -7.38;
    const sLng = ship.destination_lng || 112.72;

    const isSameAsTarget = ship.id === targetShipment.id;
    const distFromOrigin = calculateDistanceKm(oLat, oLng, sLat, sLng);
    const distToTarget = calculateDistanceKm(sLat, sLng, tLat, tLng);

    // Detour ratio: (Origin->P + P->Target) / (Origin->Target)
    const totalViaP = distFromOrigin + distToTarget;
    const detourRatio = directDistToTarget > 0.5 ? (totalViaP / directDistToTarget) : 1.0;
    const extraKm = Math.max(0, Math.round((totalViaP - directDistToTarget) * 10) / 10);

    // Cross-track perpendicular distance to OD line
    const crossTrackKm = calculateCrossTrackDistanceKm(sLat, sLng, oLat, oLng, tLat, tLng);

    // Angular bearing difference
    const bearingP = calculateBearing(oLat, oLng, sLat, sLng);
    let angleDiff = Math.abs(bearingP - bearingTarget);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;

    // Conditions to qualify as "SEJALUR":
    // 1. Must not be significantly beyond the target (distFromOrigin <= directDistToTarget + 5km)
    // 2. Cross track distance <= maxCrossTrackKm
    // 3. Detour ratio <= maxDetourRatio
    // 4. Bearing difference <= 65 degrees (searah, bukan arah berlawanan)
    const isAhead = distFromOrigin <= (directDistToTarget + 6.0);
    const isNearby = crossTrackKm <= maxCrossTrackKm;
    const isSmallDetour = detourRatio <= maxDetourRatio;
    const isSameDirection = angleDiff <= 65;

    let isSejalur = false;
    let matchScore = 0;
    let label = 'Beda Arah';
    let labelCls = 'danger';

    if (isSameAsTarget) {
      isSejalur = true;
      matchScore = 100;
      label = '🎯 Tujuan Akhir';
      labelCls = 'primary';
    } else if (isAhead && isNearby && isSmallDetour && isSameDirection) {
      isSejalur = true;
      // Calculate match score (higher = closer to ideal line)
      const penaltyCross = Math.min(40, (crossTrackKm / maxCrossTrackKm) * 40);
      const penaltyDetour = Math.min(40, ((detourRatio - 1.0) / (maxDetourRatio - 1.0)) * 40);
      matchScore = Math.max(50, Math.round(100 - penaltyCross - penaltyDetour));
      label = `✅ Sejalur (${matchScore}%)`;
      labelCls = 'success';
    } else if (distFromOrigin <= 6.0) {
      // Very close to J40/J23 base (radius <= 6km e.g. Rungkut, Waru awal), easy to drop before departure
      isSejalur = true;
      matchScore = 80;
      label = '📍 Drop Dekat Titik Awal';
      labelCls = 'info';
    } else {
      isSejalur = false;
      matchScore = Math.max(5, Math.round(50 - (crossTrackKm * 2) - (angleDiff * 0.5)));
      label = `🚫 Beda Jalur (+${extraKm} km)`;
      labelCls = 'danger';
    }

    evaluated.push({
      ...ship,
      distance_from_origin_km: distFromOrigin,
      distance_to_target_km: distToTarget,
      detour_ratio: Math.round(detourRatio * 100) / 100,
      extra_km: extraKm,
      cross_track_km: Math.round(crossTrackKm * 10) / 10,
      bearing_diff_deg: Math.round(angleDiff),
      is_sejalur: isSejalur,
      is_target: isSameAsTarget,
      match_score: matchScore,
      sejalur_label: label,
      sejalur_class: labelCls
    });
  }

  // Separate sejalur shipments from non-sejalur
  const sejalurList = evaluated.filter(e => e.is_sejalur);
  const otherList = evaluated.filter(e => !e.is_sejalur);

  // AUTOMATIC SEQUENCE: Urut dari terdekat dari J40/J23 ke tujuan akhir
  // Sort ascending by distance from origin
  sejalurList.sort((a, b) => {
    // If one is target, target is placed last
    if (a.is_target) return 1;
    if (b.is_target) return -1;
    return a.distance_from_origin_km - b.distance_from_origin_km;
  });

  // Calculate sequential trip itinerary
  let cumulativeKm = 0;
  let cumulativeMinutes = 0;
  const orderedStops = [];

  for (let idx = 0; idx < sejalurList.length; idx++) {
    const s = sejalurList[idx];
    const prevLat = idx === 0 ? oLat : (sejalurList[idx - 1].destination_lat || -7.38);
    const prevLng = idx === 0 ? oLng : (sejalurList[idx - 1].destination_lng || 112.72);
    const curLat = s.destination_lat || -7.38;
    const curLng = s.destination_lng || 112.72;

    const legDist = calculateDistanceKm(prevLat, prevLng, curLat, curLng);
    cumulativeKm += legDist;
    // Travel time at 35km/h avg + 15 mins drop time
    const driveMins = Math.round((legDist / 35) * 60);
    cumulativeMinutes += (driveMins + 15);

    // Calculate estimated time of arrival starting from 08:00 AM
    const startHour = 8;
    const startMin = 0;
    const totalMins = startHour * 60 + startMin + cumulativeMinutes;
    const etaH = Math.floor(totalMins / 60) % 24;
    const etaM = totalMins % 60;
    const etaStr = `${String(etaH).padStart(2, '0')}:${String(etaM).padStart(2, '0')}`;

    orderedStops.push({
      sequence: idx + 1,
      shipment: s,
      leg_distance_km: Math.round(legDist * 10) / 10,
      cumulative_km: Math.round(cumulativeKm * 10) / 10,
      eta_time: etaStr,
      eta_minutes_from_start: cumulativeMinutes
    });
  }

  // Build multi-stop Google Maps URL
  const gmapsUrl = generateMultiStopGoogleMapsUrl(origin, orderedStops);

  return {
    origin: { code: 'J40', name: 'Gudang Utama J40 / J23', lat: oLat, lng: oLng },
    target: targetShipment,
    sejalurShipments: sejalurList,
    otherShipments: otherList,
    orderedStops,
    totalStops: orderedStops.length,
    totalDistanceKm: Math.round(cumulativeKm * 10) / 10,
    totalEstimatedMinutes: cumulativeMinutes,
    googleMapsUrl: gmapsUrl
  };
}

/**
 * Generate multi-stop Google Maps direction URL
 */
export function generateMultiStopGoogleMapsUrl(origin, orderedStops) {
  if (!orderedStops || orderedStops.length === 0) return '';
  const oStr = `${origin.lat},${origin.lng}`;
  const destStop = orderedStops[orderedStops.length - 1];
  const destStr = `${destStop.shipment.destination_lat || -7.38},${destStop.shipment.destination_lng || 112.72}`;

  const waypoints = orderedStops.slice(0, -1).map(s =>
    `${s.shipment.destination_lat || -7.38},${s.shipment.destination_lng || 112.72}`
  );

  let url = `https://www.google.com/maps/dir/?api=1&origin=${oStr}&destination=${destStr}&travelmode=driving`;
  if (waypoints.length > 0) {
    url += `&waypoints=${waypoints.join('|')}`;
  }
  return url;
}

/**
 * Optimize route for a specific Jalur (Multi-schedule after load assignment)
 * Orders shipments closest-to-furthest starting from Origin (J40 / J23) -> Susunan SJ 1, Susunan SJ 2, dst.
 */
export function optimizeJalurRoute(origin, shipmentList, options = {}) {
  const oLat = origin?.lat || -7.30211;
  const oLng = origin?.lng || 112.7819;
  const departureHour = options.departureHour || 8;
  const departureMinute = options.departureMinute || 0;
  const serviceMinutesPerStop = options.serviceMinutesPerStop || 15;
  const avgSpeedKmh = options.avgSpeedKmh || 35;

  const validShipments = (shipmentList || []).filter(s => !isPickupShipment(s));
  if (validShipments.length === 0) {
    return {
      origin: { code: origin?.code || 'J40', name: origin?.name || 'Gudang Utama J40', lat: oLat, lng: oLng },
      stops: [],
      totalStops: 0,
      totalKm: 0,
      totalMinutes: 0,
      googleMapsUrl: ''
    };
  }

  // Nearest-neighbor heuristic starting from origin
  const unvisited = validShipments.map(s => ({
    ...s,
    lat: Number(s.destination_lat) || -7.38,
    lng: Number(s.destination_lng) || 112.72
  }));

  const ordered = [];
  let curLat = oLat;
  let curLng = oLng;

  // Separate priority/HARUS/URGENT if any
  const priorityIdx = unvisited.findIndex(s => s.priority === 'HARUS' || s.priority === 'URGENT');
  if (priorityIdx !== -1) {
    const prio = unvisited.splice(priorityIdx, 1)[0];
    ordered.push(prio);
    curLat = prio.lat;
    curLng = prio.lng;
  }

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
    const nextItem = unvisited.splice(nearestIdx, 1)[0];
    ordered.push(nextItem);
    curLat = nextItem.lat;
    curLng = nextItem.lng;
  }

  let cumulativeKm = 0;
  let cumulativeMinutes = 0;
  let prevLat = oLat;
  let prevLng = oLng;

  const stops = ordered.map((s, idx) => {
    const legDist = calculateDistanceKm(prevLat, prevLng, s.lat, s.lng);
    cumulativeKm += legDist;
    const driveMins = Math.round((legDist / avgSpeedKmh) * 60);
    cumulativeMinutes += (driveMins + serviceMinutesPerStop);

    const startTotalMins = departureHour * 60 + departureMinute + cumulativeMinutes;
    const etaH = Math.floor(startTotalMins / 60) % 24;
    const etaM = startTotalMins % 60;
    const etaStr = `${String(etaH).padStart(2, '0')}:${String(etaM).padStart(2, '0')}`;

    prevLat = s.lat;
    prevLng = s.lng;

    const stopGmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${oLat},${oLng}&destination=${s.lat},${s.lng}&travelmode=driving`;

    return {
      sequence: idx + 1,
      susunan_label: `Susunan SJ ${idx + 1}`,
      shipment: s,
      leg_distance_km: Math.round(legDist * 10) / 10,
      cumulative_km: Math.round(cumulativeKm * 10) / 10,
      eta_time: etaStr,
      eta_minutes_from_start: cumulativeMinutes,
      google_maps_url: stopGmapsUrl
    };
  });

  const gmapsUrl = generateMultiStopGoogleMapsUrl({ lat: oLat, lng: oLng }, stops);

  return {
    origin: { code: origin?.code || 'J40', name: origin?.name || 'Gudang Utama J40', lat: oLat, lng: oLng },
    stops,
    totalStops: stops.length,
    totalKm: Math.round(cumulativeKm * 10) / 10,
    totalMinutes: cumulativeMinutes,
    googleMapsUrl: gmapsUrl
  };
}

/**
 * Geocode heuristic for East Java / Surabaya addresses
 */
export function getEstimatedCoords(addr = '', cust = '', zone = '') {
  const t = (addr + ' ' + cust + ' ' + (zone || '')).toLowerCase();

  // Gresik & Margomulyo
  if (t.includes('margomulyo') || t.includes('suri mulia')) return { lat: -7.2415, lng: 112.6842, zone: 'A' };
  if (t.includes('tandes') || t.includes('gardu induk')) return { lat: -7.2550, lng: 112.6780, zone: 'A' };
  if (t.includes('driyorejo') || t.includes('bambe') || t.includes('tanjungan')) return { lat: -7.3450, lng: 112.6250, zone: 'A' };
  if (t.includes('manyar')) return { lat: -7.1350, lng: 112.6100, zone: 'A' };
  if (t.includes('kebomas') || t.includes('petrokimia') || t.includes('gresik')) return { lat: -7.1650, lng: 112.6350, zone: 'A' };

  // Pasuruan & Pandaan
  if (t.includes('gunung gangsir') || t.includes('nogosari') || t.includes('pandaan')) return { lat: -7.5843, lng: 112.7481, zone: 'PSR' };
  if (t.includes('pier') || t.includes('rembang') || t.includes('pasuruan')) return { lat: -7.6124, lng: 112.8211, zone: 'PSR' };
  if (t.includes('beji') || t.includes('gempol') || t.includes('bangil')) return { lat: -7.5890, lng: 112.7150, zone: 'PSR' };

  // Mojokerto & Ngoro
  if (t.includes('mojokerto') || t.includes('kranggan') || t.includes('pahlawan no 44')) return { lat: -7.4720, lng: 112.4350, zone: 'NG' };
  if (t.includes('bringinbendo') || t.includes('surabaya - mojokerto km.19')) return { lat: -7.3850, lng: 112.6100, zone: 'NG' };
  if (t.includes('ngoro') || t.includes('nip')) return { lat: -7.5800, lng: 112.6200, zone: 'NG' };

  // Sidoarjo Buduran & Gedangan
  if (t.includes('gedangan') || t.includes('aloha') || t.includes('sariguna')) return { lat: -7.3820, lng: 112.7310, zone: 'C' };
  if (t.includes('buduran')) return { lat: -7.4128, lng: 112.7215, zone: 'C' };
  if (t.includes('candi') || t.includes('porong') || t.includes('tanggulangin')) return { lat: -7.4500, lng: 112.7150, zone: 'C' };
  if (t.includes('sukodono') || t.includes('panjunan')) return { lat: -7.4050, lng: 112.6750, zone: 'C' };

  // Sidoarjo Waru & Sepanjang
  if (t.includes('gwalk') || t.includes('citraland')) return { lat: -7.2910, lng: 112.6450, zone: 'B' };
  if (t.includes('mastrip') || t.includes('waru gunung') || t.includes('kedawung')) return { lat: -7.3400, lng: 112.6850, zone: 'B' };
  if (t.includes('dupak') || t.includes('susanti megah')) return { lat: -7.2510, lng: 112.7250, zone: 'B' };
  if (t.includes('waru') || t.includes('berbek') || t.includes('tambak sawah')) return { lat: -7.3524, lng: 112.7291, zone: 'B' };
  if (t.includes('krian') || t.includes('sepanjang') || t.includes('taman')) return { lat: -7.3892, lng: 112.6321, zone: 'B' };
  if (t.includes('sidoarjo')) return { lat: -7.4478, lng: 112.7183, zone: 'B' };

  // Surabaya Timur / Rungkut / SIER / Pusat
  if (t.includes('kejawan') || t.includes('pakuwon city') || t.includes('pakuwon permai')) return { lat: -7.2750, lng: 112.8020, zone: 'FR' };
  if (t.includes('rungkut') || t.includes('sier') || t.includes('gunung anyar') || t.includes('samator') || t.includes('kedung baruk')) return { lat: -7.3325, lng: 112.7681, zone: 'FR' };
  if (t.includes('klampis') || t.includes('sukolilo') || t.includes('semolowaru')) return { lat: -7.2885, lng: 112.7780, zone: 'FR' };
  if (t.includes('siwalankerto') || t.includes('wonocolo') || t.includes('a.yani')) return { lat: -7.3180, lng: 112.7320, zone: 'FR' };
  if (t.includes('midplaza') || t.includes('sudirman')) return { lat: -7.2850, lng: 112.7450, zone: 'B' };

  return { lat: -7.3021, lng: 112.7819, zone: 'FR' };
}

/**
 * Retrieve all active master routes from SQLite, sorted by sequence ASC
 */
export function getActiveMasterRoutes() {
  try {
    const rows = db.prepare('SELECT * FROM master_routes WHERE is_active = 1 ORDER BY sequence ASC').all();
    if (rows && rows.length > 0) return rows;
  } catch (e) {
    console.warn('[RoutingEngine] Error reading master_routes, using default:', e.message);
  }
  return [
    { id: 'route-A', route_code: 'A', route_name: 'Rute A', title: 'Koridor Gresik, Margomulyo & Surabaya Barat', destination_area: 'Gresik, Manyar, Margomulyo, Tandes, Romokalisari, Benowo', keywords: 'GRESIK, MANYAR, KEBOMAS, MARGOMULYO, TANDES, ROMOKALISARI, BENOWO, DRIYOREJO, A', zone_code: 'A', color: '#2563eb', sequence: 1 },
    { id: 'route-B', route_code: 'B', route_name: 'Rute B', title: 'Koridor Sidoarjo & Waru', destination_area: 'Waru, Berbek, Sepanjang, Krian, Taman', keywords: 'WARU, BERBEK, SEPANJANG, KRIAN, TAMAN, MASTRIP, GWALK, B', zone_code: 'B', color: '#059669', sequence: 2 },
    { id: 'route-C', route_code: 'C', route_name: 'Rute C', title: 'Koridor Sidoarjo Kota, Buduran & Gedangan', destination_area: 'Sidoarjo Kota, Buduran, Gedangan, Candi, Porong', keywords: 'BUDURAN, GEDANGAN, CANDI, PORONG, SIDOARJO KOTA, SUKODONO, TANGGULANGIN, C', zone_code: 'C', color: '#d97706', sequence: 3 },
    { id: 'route-D', route_code: 'D', route_name: 'Rute D', title: 'Koridor Pasuruan, Gempol & Pandaan', destination_area: 'Pasuruan, Gempol, Pandaan, PIER, Bangil', keywords: 'PASURUAN, PANDAAN, GEMPOL, PIER, BEJI, BANGIL, KRATON, REMBANG, D, PSR', zone_code: 'PSR', color: '#9333ea', sequence: 4 },
    { id: 'route-E', route_code: 'E', route_name: 'Rute E', title: 'Koridor Mojokerto & Ngoro', destination_area: 'Mojokerto, Ngoro Industrial Park (NIP), Bringinbendo', keywords: 'NGORO, MOJOKERTO, NIP, BRINGINBENDO, MOJOSARI, PURI, PRAJURIT KULON, E, NG', zone_code: 'NG', color: '#dc2626', sequence: 5 },
    { id: 'route-F', route_code: 'F', route_name: 'Rute F', title: 'Koridor Surabaya Timur, Rungkut & SIER', destination_area: 'Surabaya Timur, Rungkut, SIER, Sukolilo, Kenjeran, Pusat', keywords: 'RUNGKUT, SIER, SUKOLILO, KLAMPIS, GUNUNG ANYAR, SEMOLOWARU, KENJERAN, WONOCOLO, SURABAYA, F, FR', zone_code: 'FR', color: '#0891b2', sequence: 6 }
  ];
}

/**
 * Classify a shipment into logical operational corridors based on Master Routes configuration
 */
export function classifyCorridor(s, masterRoutes = null) {
  const routes = masterRoutes || getActiveMasterRoutes();
  const assigned = (s.assigned_route || '').toUpperCase().trim();

  // 1. Explicit assigned route takes precedence
  if (assigned) {
    const match = routes.find(r => r.route_code.toUpperCase() === assigned);
    if (match) {
      return {
        key: match.route_code,
        routeCode: match.route_code,
        routeName: match.route_name,
        title: match.title,
        area: match.destination_area,
        color: match.color || '#2563eb',
        zoneCode: match.zone_code
      };
    }
  }

  const z = (s.zone_code || '').toUpperCase().trim();
  const addr = (s.destination_address || '').toUpperCase();
  const cust = (s.customer_name || '').toUpperCase();
  const notes = (s.notes || '').toUpperCase();
  const text = ` ${addr} ${cust} ${notes} `;

  // 2. Match based on Master Routes definition in sequence order
  for (const r of routes) {
    // Check zone code
    if (r.zone_code && z && r.zone_code.toUpperCase() === z) {
      return {
        key: r.route_code,
        routeCode: r.route_code,
        routeName: r.route_name,
        title: r.title,
        area: r.destination_area,
        color: r.color || '#2563eb',
        zoneCode: r.zone_code
      };
    }

    // Check keywords
    if (r.keywords) {
      const kwList = r.keywords.split(/[,;\n]+/).map(k => k.trim().toUpperCase()).filter(Boolean);
      for (const kw of kwList) {
        if (kw && text.includes(kw)) {
          return {
            key: r.route_code,
            routeCode: r.route_code,
            routeName: r.route_name,
            title: r.title,
            area: r.destination_area,
            color: r.color || '#2563eb',
            zoneCode: r.zone_code
          };
        }
      }
    }
  }

  // 3. Fallback: last route (Surabaya) or first route
  const fallback = routes[routes.length - 1] || routes[0];
  return {
    key: fallback.route_code,
    routeCode: fallback.route_code,
    routeName: fallback.route_name,
    title: fallback.title,
    area: fallback.destination_area,
    color: fallback.color || '#0891b2',
    zoneCode: fallback.zone_code
  };
}

/**
 * Categorize all delivery shipments into Rute A, Rute B, Rute C, Rute D, dst.
 * With Google Maps multi-stop ordering from J40/J23 base, travel times, and capacity targeting 8-10 SJ.
 */
export function buildCategorizedRoutes(origin, shipments) {
  const oLat = origin?.lat || -7.30211;
  const oLng = origin?.lng || 112.7819;

  // Filter out customer pickup (Ambil di J23)
  const valid = (shipments || []).filter(s => !isPickupShipment(s));
  if (valid.length === 0) return [];

  const masterRoutes = getActiveMasterRoutes();

  // Group by route code
  const groups = {};
  for (const mr of masterRoutes) {
    groups[mr.route_code] = {
      routeCode: mr.route_code,
      routeName: mr.route_name,
      title: mr.title,
      area: mr.destination_area,
      color: mr.color,
      zoneCode: mr.zone_code,
      shipments: []
    };
  }

  for (const s of valid) {
    // Ensure coordinates exist
    if (!s.destination_lat || !s.destination_lng) {
      const estimated = getEstimatedCoords(s.destination_address, s.customer_name, s.zone_code);
      s.destination_lat = estimated.lat;
      s.destination_lng = estimated.lng;
      if (!s.zone_code) s.zone_code = estimated.zone;
    }

    const c = classifyCorridor(s, masterRoutes);
    if (!groups[c.key]) {
      groups[c.key] = {
        routeCode: c.routeCode,
        routeName: c.routeName,
        title: c.title,
        area: c.area,
        color: c.color,
        zoneCode: c.zoneCode,
        shipments: []
      };
    }
    groups[c.key].shipments.push(s);
  }

  const resultRoutes = [];

  for (const mr of masterRoutes) {
    const grp = groups[mr.route_code];
    if (!grp || grp.shipments.length === 0) continue;

    // Chunk if more than 10 shipments (target per person: 8-10 SJ)
    const chunks = [];
    if (grp.shipments.length > 10) {
      const half = Math.ceil(grp.shipments.length / 2);
      chunks.push(grp.shipments.slice(0, half));
      chunks.push(grp.shipments.slice(half));
    } else {
      chunks.push(grp.shipments);
    }

    chunks.forEach((chunk, chunkIdx) => {
      const letter = mr.route_code + (chunks.length > 1 ? `${chunkIdx + 1}` : '');
      const chunkSuffix = chunks.length > 1 ? ` (Bagian ${chunkIdx + 1})` : '';

      // Check if user/ops manually specified index_no on items, preserve that order
      const hasManualIndex = chunk.some(s => s.index_no !== null && s.index_no !== undefined && s.index_no > 0);
      let ordered = [];

      if (hasManualIndex) {
        ordered = [...chunk].sort((a, b) => (a.index_no || 9999) - (b.index_no || 9999)).map(s => ({
          ...s,
          lat: Number(s.destination_lat) || oLat,
          lng: Number(s.destination_lng) || oLng
        }));
      } else {
        // Sequence stops from J40 using Nearest-Neighbor heuristic
        const unvisited = chunk.map(s => ({
          ...s,
          lat: Number(s.destination_lat) || oLat,
          lng: Number(s.destination_lng) || oLng
        }));

        let curLat = oLat;
        let curLng = oLng;

        // Prioritize HARUS / URGENT
        const priorityIdx = unvisited.findIndex(s => s.priority === 'HARUS' || s.priority === 'URGENT');
        if (priorityIdx !== -1) {
          const prio = unvisited.splice(priorityIdx, 1)[0];
          ordered.push(prio);
          curLat = prio.lat;
          curLng = prio.lng;
        }

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
      }

      // Calculate travel distances & ETA
      let cumulativeKm = 0;
      let cumulativeMins = 0;
      let prevLat = oLat;
      let prevLng = oLng;

      const stops = ordered.map((s, idx) => {
        const legD = calculateDistanceKm(prevLat, prevLng, s.lat, s.lng);
        cumulativeKm += legD;
        const driveMins = Math.round((legD / 35) * 60);
        cumulativeMins += (driveMins + 15); // 15 mins drop time

        const totalM = 8 * 60 + cumulativeMins; // Start 08:00 AM
        const h = Math.floor(totalM / 60) % 24;
        const m = totalM % 60;
        const etaStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

        prevLat = s.lat;
        prevLng = s.lng;

        return {
          sequence: idx + 1,
          susunan_label: `Stop ${idx + 1}`,
          shipment_id: s.id,
          sj_number: s.sj_number,
          customer_name: s.customer_name,
          destination_address: s.destination_address,
          zone_code: s.zone_code,
          muat_category: s.muat_category || 'KECIL',
          muat_recommendation: s.muat_recommendation || 'MOTOR',
          notes: s.notes || '',
          lat: s.lat,
          lng: s.lng,
          leg_distance_km: Math.round(legD * 10) / 10,
          leg_minutes: driveMins,
          cumulative_km: Math.round(cumulativeKm * 10) / 10,
          eta_time: etaStr,
          eta_minutes: cumulativeMins
        };
      });

      const gmapsUrl = generateMultiStopGoogleMapsUrl({ lat: oLat, lng: oLng }, stops.map(st => ({ shipment: st })));

      // Vehicle & Muat evaluation for this entire route
      const hasBesar = chunk.some(s => s.muat_category === 'BESAR');
      const hasSedang = chunk.some(s => s.muat_category === 'SEDANG');
      let muatRecommendation = 'MUAT MOTOR';
      let muatBadgeClass = 'badge-motor';
      let suggestedVehicle = 'MOTOR';

      if (hasBesar) {
        muatRecommendation = 'WAJIB MOBIL BOX (CARRY / TRAGA)';
        muatBadgeClass = 'badge-mobil';
        suggestedVehicle = chunk.length >= 8 ? 'TRAGA' : 'CARRY';
      } else if (hasSedang) {
        muatRecommendation = chunk.length > 4 ? 'SARAN MOBIL' : 'EVALUASI MOTOR';
        suggestedVehicle = chunk.length > 4 ? 'CARRY' : 'MOTOR';
      }

      // Existing assignment detection
      const assignedDrivers = [...new Set(chunk.map(s => s.assigned_driver).filter(Boolean))];
      const isAssigned = assignedDrivers.length > 0;
      const assignedDriver = assignedDrivers[0] || '';
      const assignedVehicle = chunk[0].assigned_vehicle_type || suggestedVehicle;

      resultRoutes.push({
        routeId: `route-${mr.route_code.toLowerCase()}`,
        routeLetter: letter,
        routeCode: mr.route_code,
        routeName: `${mr.route_name}: ${mr.title}${chunkSuffix}`,
        corridorTitle: mr.title,
        corridorArea: mr.destination_area,
        color: mr.color || '#2563eb',
        shipmentCount: chunk.length,
        totalKm: Math.round(cumulativeKm * 10) / 10,
        totalMinutes: cumulativeMins,
        totalDurationFormatted: `${Math.floor(cumulativeMins / 60)}j ${cumulativeMins % 60}m`,
        muatRecommendation,
        muatBadgeClass,
        suggestedVehicle,
        assignedDriver,
        assignedVehicle,
        isAssigned,
        stops,
        googleMapsUrl: gmapsUrl
      });
    });
  }

  return resultRoutes;
}



