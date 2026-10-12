import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new DatabaseSync(path.join(__dirname, '..', 'data', 'ats_logistics.db'));

// Origin J40 (-7.30211, 112.7819)
const oLat = -7.30211;
const oLng = 112.7819;

function classifyCorridor(s) {
  const z = (s.zone_code || '').toUpperCase();
  const addr = (s.destination_address || '').toUpperCase();
  const cust = (s.customer_name || '').toUpperCase();
  const text = `${addr} ${cust}`;

  // 1. Pasuruan / Gempol / Pandaan / Beji / Bangil / PIER
  if (z === 'PSR' || text.includes('PASURUAN') || text.includes('PANDAAN') || text.includes('GEMPOL') || text.includes('PIER') || text.includes('BEJI') || text.includes('BANGIL') || text.includes('KRATON')) {
    return { code: 'PSR', name: 'Koridor Pasuruan, Gempol & Pandaan', letter: 'C' };
  }

  // 2. Ngoro / Mojokerto
  if (z === 'NG' || text.includes('NGORO') || text.includes('MOJOKERTO') || text.includes('NIP')) {
    return { code: 'NG', name: 'Koridor Ngoro & Mojokerto', letter: 'E' };
  }

  // 3. Gresik / Manyar / Kebomas / Margomulyo / Romokalisari / Tandes
  if (z === 'A' || text.includes('GRESIK') || text.includes('MANYAR') || text.includes('KEBOMAS') || text.includes('MARGOMULYO') || text.includes('TANDES') || text.includes('ROMOKALISARI') || text.includes('BENOWO')) {
    return { code: 'A', name: 'Koridor Gresik & Margomulyo', letter: 'A' };
  }

  // 4. Sidoarjo Buduran, Gedangan, Candi, Porong
  if (z === 'C' || text.includes('BUDURAN') || text.includes('GEDANGAN') || text.includes('CANDI') || text.includes('PORONG') || text.includes('SIDOARJO KOTA')) {
    return { code: 'C', name: 'Koridor Sidoarjo Kota, Buduran & Gedangan', letter: 'C' };
  }

  // 5. Sidoarjo Waru, Krian, Taman, Sepanjang, Berbek
  if (z === 'B' || text.includes('WARU') || text.includes('TAMAN') || text.includes('SEPANJANG') || text.includes('KRIAN') || text.includes('BERBEK') || text.includes('SIDOARJO')) {
    return { code: 'B', name: 'Koridor Sidoarjo & Waru', letter: 'B' };
  }

  // 6. Surabaya Timur, Rungkut, SIER, Sukolilo, Kenjeran, Pusat
  return { code: 'FR', name: 'Koridor Surabaya Timur, Rungkut & Pusat', letter: 'D' };
}

const todayShips = db.prepare("SELECT * FROM shipments WHERE plan_date = '2026-10-01'").all();
console.log('Today shipments count (2026-10-01):', todayShips.length);

const clusters = {};
for (const s of todayShips) {
  const c = classifyCorridor(s);
  if (!clusters[c.name]) clusters[c.name] = [];
  clusters[c.name].push(s);
}

for (const [name, list] of Object.entries(clusters)) {
  console.log(`\n=== ${name} (${list.length} SJ) ===`);
  list.forEach(s => console.log(`   - ${s.sj_number} | ${s.customer_name} | ${s.destination_address.substring(0, 50)}...`));
}
