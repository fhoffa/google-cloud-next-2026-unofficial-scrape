import { chromium } from 'playwright';
const code = process.argv[2] || 'CT2-28';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 2400 } });
await page.goto('https://cloud.withgoogle.com/next/25/session-library#all', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(8000);

// Try opening via search/query param, then inspect likely dialog/overlay containers.
await page.goto(`https://cloud.withgoogle.com/next/25/session-library?session=${encodeURIComponent(code)}#all`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(5000);

const selectors = [
  '[role="dialog"]',
  '.glue-modal',
  '.modal',
  '[aria-modal="true"]',
  '.session-modal',
  '.overlay',
  '.drawer',
  '.sidebar',
  'main',
];
for (const sel of selectors) {
  const count = await page.locator(sel).count();
  if (!count) continue;
  console.log('\nSELECTOR', sel, 'count', count);
  for (let i = 0; i < Math.min(count, 3); i++) {
    const txt = await page.locator(sel).nth(i).innerText().catch(()=> '');
    if (txt.includes(code) || txt.includes('Databricks') || txt.includes('Anthropic')) {
      console.log('MATCHED NODE', i);
      console.log(txt.slice(0,4000));
    }
  }
}

await browser.close();
