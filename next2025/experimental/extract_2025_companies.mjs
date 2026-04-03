import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const cards = JSON.parse(await fs.readFile('/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25.json', 'utf8'));
const outPath = '/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25_detail.json';

function extractCode(text) {
  const m = text.match(/\b([A-Z]{2,}(?:[A-Z]|\d)*(?:-[A-Z0-9]+)+|[A-Z]{2,}\d+(?:-[A-Z0-9]+)*)\b/);
  return m ? m[1] : null;
}

const entries = [];
const seen = new Set();
for (const card of cards) {
  const code = extractCode(card.text || '');
  if (!code || seen.has(code)) continue;
  seen.add(code);
  entries.push({ code, cardText: card.text });
}
console.log('unique session codes', entries.length);

let existing = [];
try {
  existing = JSON.parse(await fs.readFile(outPath, 'utf8'));
} catch {}
const done = new Set(existing.map(x => x.code));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });

const results = [...existing];
for (let i = 0; i < entries.length; i++) {
  const { code } = entries[i];
  if (done.has(code)) continue;
  const url = `https://cloud.withgoogle.com/next/25/session-library?session=${encodeURIComponent(code)}#all`;
  console.log(`[${i+1}/${entries.length}] ${code}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    const idx = body.indexOf(code);
    const slice = idx >= 0 ? body.slice(Math.max(0, idx - 300), idx + 5000) : body.slice(0, 5000);
    results.push({ code, url, found: idx >= 0, detailText: slice });
  } catch (e) {
    results.push({ code, url, found: false, error: String(e) });
  }
  await fs.writeFile(outPath, JSON.stringify(results, null, 2));
}

await browser.close();
console.log('saved', results.length, 'records');
