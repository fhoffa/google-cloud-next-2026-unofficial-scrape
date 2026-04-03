import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve('next2025');
const INPUT = path.join(ROOT, 'experimental', 'sessions_25.json');
const CACHE_DIR = path.resolve('.cache/next2025/raw-modals');
const INDEX_FILE = path.resolve('.cache/next2025/index.json');
const CONCURRENCY = Number(process.env.CONCURRENCY || 2);
const START = Number(process.env.START || 0);
const LIMIT = Number(process.env.LIMIT || 40);
const MODAL_TIMEOUT_MS = Number(process.env.MODAL_TIMEOUT_MS || 10000);
const SITE = 'https://cloud.withgoogle.com/next/25/session-library';

await fs.mkdir(CACHE_DIR, { recursive: true });

const sessions = JSON.parse(await fs.readFile(INPUT, 'utf8'));
const dedup = [];
const seen = new Set();
for (const s of sessions) {
  if (!s?.code || seen.has(s.code)) continue;
  seen.add(s.code);
  dedup.push({ code: s.code, title: s.title || '', text: s.text || '' });
}
const batch = dedup.slice(START, START + LIMIT);
console.log(`sessions total=${dedup.length} batch=${batch.length} start=${START} limit=${LIMIT} concurrency=${CONCURRENCY}`);

let index = {};
try { index = JSON.parse(await fs.readFile(INDEX_FILE, 'utf8')); } catch {}

async function scrapeOne(browser, item) {
  const outFile = path.join(CACHE_DIR, `${item.code}.json`);
  try {
    await fs.access(outFile);
    console.log(`skip ${item.code} cached`);
    return;
  } catch {}

  const page = await browser.newPage();
  try {
    const url = `${SITE}?session=${encodeURIComponent(item.code)}#all`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);

    let found = false;
    let rawText = '';
    let rawLines = [];
    let title = item.title || '';

    const dialog = page.locator('[role="dialog"], [aria-modal="true"], .modal').first();
    try {
      await dialog.waitFor({ state: 'visible', timeout: MODAL_TIMEOUT_MS });
      rawText = await dialog.innerText();
      rawLines = rawText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const firstLong = rawLines.find(s => s.length > 12 && !['Share','Read more'].includes(s));
      if (firstLong) title = firstLong;
      found = rawLines.length > 0;
    } catch {
      rawText = await page.locator('body').innerText();
      rawLines = rawText.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 200);
    }

    const record = {
      code: item.code,
      requestedUrl: url,
      found,
      title,
      rawText,
      rawLines,
      capturedAt: new Date().toISOString()
    };
    await fs.writeFile(outFile, JSON.stringify(record, null, 2));
    index[item.code] = { found, capturedAt: record.capturedAt, file: outFile };
    await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
    console.log(`${found ? 'ok  ' : 'miss'} ${item.code} lines=${rawLines.length}`);
  } finally {
    await page.close().catch(() => {});
  }
}

const browser = await chromium.launch({ headless: true });
try {
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const wave = batch.slice(i, i + CONCURRENCY);
    await Promise.all(wave.map(item => scrapeOne(browser, item)));
  }
} finally {
  await browser.close();
}

console.log('done');
