import { chromium } from 'playwright-core';

// In-memory cache for ultra-fast instant repeated lookups
const memoryCache = new Map();

let sharedBrowser = null;
let browserLaunchPromise = null;

async function getBrowser() {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser;
  }
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = (async () => {
    try {
      const browser = await chromium.launch({
        headless: true,
        channel: 'chrome',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--no-default-browser-check'
        ]
      });
      sharedBrowser = browser;
      browserLaunchPromise = null;
      return browser;
    } catch (err) {
      browserLaunchPromise = null;
      // Try edge if chrome fails
      try {
        const browser = await chromium.launch({
          headless: true,
          channel: 'msedge',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
        });
        sharedBrowser = browser;
        return browser;
      } catch (err2) {
        throw new Error('Gagal meluncurkan browser headless: ' + (err.message || err2.message));
      }
    }
  })();

  return browserLaunchPromise;
}

export function detectZoneFromCoords(lat, lng) {
  let zoneCode = 'FR';
  let zoneName = 'Zona FR (Surabaya)';
  if (lat > -7.22 && lng < 112.65) { zoneCode = 'A'; zoneName = 'Zona A (Gresik / Manyar / KIM)'; }
  else if (lat > -7.27 && lng < 112.70) { zoneCode = 'A'; zoneName = 'Zona A (Margomulyo / Tandes)'; }
  else if (lat < -7.52 && lng < 112.65) { zoneCode = 'NG'; zoneName = 'Zona NG (Mojokerto / Ngoro NIP)'; }
  else if (lat < -7.50 && lng > 112.75) { zoneCode = 'PSR'; zoneName = 'Zona PSR (Pasuruan / PIER Rembang)'; }
  else if (lat < -7.42) { zoneCode = 'C'; zoneName = 'Zona C (Sidoarjo Kota / Buduran / Candi)'; }
  else if (lat < -7.33) { zoneCode = 'B'; zoneName = 'Zona B (Sidoarjo Utara / Waru / Berbek)'; }

  return { zoneCode, zoneName };
}

export async function lookupGoogleMapsCoordinates(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
    return null;
  }

  const query = rawQuery.trim();

  // 1. Direct coordinate check (e.g. "-7.3325, 112.7681")
  const directCoordMatch = query.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (directCoordMatch) {
    const lat = parseFloat(directCoordMatch[1]);
    const lng = parseFloat(directCoordMatch[2]);
    const { zoneCode, zoneName } = detectZoneFromCoords(lat, lng);
    return {
      lat,
      lng,
      display_name: `Titik GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
      zoneCode,
      zoneName,
      source: 'direct_coordinate'
    };
  }

  // 2. Direct Google Maps URL paste check (e.g. contains @lat,lng or ?q=lat,lng)
  const urlCoordMatch = query.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || query.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (urlCoordMatch) {
    const lat = parseFloat(urlCoordMatch[1]);
    const lng = parseFloat(urlCoordMatch[2]);
    const { zoneCode, zoneName } = detectZoneFromCoords(lat, lng);
    return {
      lat,
      lng,
      display_name: `Titik Google Maps (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
      zoneCode,
      zoneName,
      source: 'google_maps_url'
    };
  }

  // 3. Cache check
  const cacheKey = query.toLowerCase().replace(/\s+/g, ' ');
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }

  // Clean address for search
  let cleanQ = query
    .replace(/^(alamat|kirim ke|tujuan|customer):\s*/i, '')
    .replace(/telp[\s\d\-+()]+/i, '')
    .trim();

  // If search does not specify province / city, append Jawa Timur / Indonesia
  let searchQ = cleanQ;
  if (!/(jawa timur|surabaya|sidoarjo|gresik|mojokerto|pasuruan)/i.test(cleanQ)) {
    searchQ += ', Jawa Timur';
  }

  // 4. Background Playwright execution
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    locale: 'id-ID'
  });
  const page = await context.newPage();

  try {
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQ)}`;
    
    // Navigate with short timeout, wait for domcontentloaded
    await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

    let foundCoords = null;
    let displayName = cleanQ;

    // Check URL up to 8 times with short pause
    for (let i = 0; i < 8; i++) {
      const currentUrl = page.url();
      const match = currentUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (match) {
        foundCoords = {
          lat: parseFloat(match[1]),
          lng: parseFloat(match[2])
        };

        // Extract title from place URL if available
        const placeTitleMatch = currentUrl.match(/\/place\/([^/@]+)/);
        if (placeTitleMatch) {
          try {
            displayName = decodeURIComponent(placeTitleMatch[1].replace(/\+/g, ' '));
          } catch (e) {}
        }
        break;
      }
      await page.waitForTimeout(600);
    }

    // Fallback: check og:image meta tag
    if (!foundCoords) {
      const meta = await page.$eval('meta[property="og:image"]', el => el.content).catch(() => null);
      if (meta) {
        const centerMatch = meta.match(/center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/) || meta.match(/center=(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (centerMatch) {
          foundCoords = {
            lat: parseFloat(centerMatch[1]),
            lng: parseFloat(centerMatch[2])
          };
        }
      }
    }

    // Fallback: check page title
    if (foundCoords) {
      const pageTitle = await page.title().catch(() => '');
      if (pageTitle && !pageTitle.includes('Google Maps') && pageTitle.length > 3) {
        displayName = pageTitle.replace(/ - Google Maps.*$/, '').trim();
      }

      const { zoneCode, zoneName } = detectZoneFromCoords(foundCoords.lat, foundCoords.lng);
      const result = {
        lat: foundCoords.lat,
        lng: foundCoords.lng,
        display_name: displayName || cleanQ,
        zoneCode,
        zoneName,
        source: 'google_maps'
      };

      memoryCache.set(cacheKey, result);
      return result;
    }

    return null;
  } catch (err) {
    console.error('[Playwright Maps Geocode Error]:', err.message);
    return null;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}
