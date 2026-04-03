import { chromium } from 'playwright';

const codes = ['CT2-28','BRK1-096','SPTL212','SOL205','BRK2-137'];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 2400 } });

for (const code of codes) {
  await page.goto('https://cloud.withgoogle.com/next/25/session-library#all', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(8000);
  // Use query param to target the session, then inspect if real detail appears; fallback to search text presence.
  await page.goto(`https://cloud.withgoogle.com/next/25/session-library?session=${encodeURIComponent(code)}#all`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  const body = await page.locator('body').innerText();
  const idx = body.indexOf(code);
  const slice = idx >= 0 ? body.slice(Math.max(0, idx - 300), idx + 2500) : body.slice(0, 2500);
  console.log('\n=== CODE', code, '===');
  console.log(slice);
}

await browser.close();
