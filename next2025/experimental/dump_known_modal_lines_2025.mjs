import { chromium } from 'playwright';

const codes = ['BRK1-096','SOL303'];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 2400 } });

for (const code of codes) {
  await page.goto(`https://cloud.withgoogle.com/next/25/session-library?session=${encodeURIComponent(code)}#all`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(5000);
  const nodes = page.locator('[role="dialog"], .modal, [aria-modal="true"]');
  const count = await nodes.count();
  let text = '';
  for (let j = 0; j < count; j++) {
    const t = await nodes.nth(j).innerText().catch(() => '');
    if (t && t.includes(code)) { text = t; break; }
  }
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  console.log(`\n=== ${code} ===`);
  lines.forEach((line, idx) => console.log(String(idx).padStart(3,'0'), line));
}

await browser.close();
