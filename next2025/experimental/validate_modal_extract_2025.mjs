import { chromium } from 'playwright';

const codes = ['CT2-28','BRK1-096','SPTL212'];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 2400 } });

for (const code of codes) {
  await page.goto(`https://cloud.withgoogle.com/next/25/session-library?session=${encodeURIComponent(code)}#all`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(5000);
  const modal = page.locator('[role="dialog"], .modal, [aria-modal="true"]').first();
  const text = await modal.innerText();
  console.log('\n=== CODE', code, '===');
  console.log(text.slice(0,3500));
}

await browser.close();
