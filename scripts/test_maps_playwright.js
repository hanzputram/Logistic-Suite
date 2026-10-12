import { chromium } from 'playwright-core';

async function test() {
  console.log('Launching headless Chrome via playwright-core...');
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    locale: 'id-ID'
  });

  const page = await context.newPage();
  const address = 'PT ECCO Indonesia Bligo Candi Sidoarjo';
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(address)}`;
  console.log('Navigating to:', mapsUrl);

  try {
    await page.goto(mapsUrl, { waitUntil: 'load', timeout: 20000 });
  } catch (e) {
    console.log('Goto timed out or partial, proceeding...');
  }

  // Wait for Google Maps to settle / redirect to @lat,lng
  for (let i = 0; i < 10; i++) {
    const currentUrl = page.url();
    console.log(`[Attempt ${i + 1}] URL:`, currentUrl);
    const match = currentUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match) {
      console.log('SUCCESS! Coordinates found in URL:', {
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2]),
        url: currentUrl
      });
      await browser.close();
      return;
    }
    await page.waitForTimeout(1000);
  }

  // Check meta content
  const meta = await page.$eval('meta[property="og:image"]', el => el.content).catch(() => null);
  console.log('Meta og:image:', meta);
  if (meta) {
    const centerMatch = meta.match(/center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/) || meta.match(/center=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (centerMatch) {
      console.log('SUCCESS! Coordinates found in meta og:image:', {
        lat: parseFloat(centerMatch[1]),
        lng: parseFloat(centerMatch[2])
      });
      await browser.close();
      return;
    }
  }

  await browser.close();
  console.log('Done test.');
}

test().catch(console.error);
