import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const code = process.argv[2] || 'BRK1-096';
const url = `https://cloud.withgoogle.com/next/25/session-library?session=${code}#all`;
const out = `next2025/.tmp-firestore-${code}.json`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const hits = [];
page.on('response', async (res) => {
  const u = res.url();
  if (!u.includes('firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel')) return;
  try {
    const text = await res.text();
    hits.push({ url: u, status: res.status(), text });
    console.log('captured', res.status(), text.length, u.slice(0,140));
  } catch (e) {
    hits.push({ url: u, status: res.status(), error: String(e) });
  }
});
await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await page.waitForTimeout(8000);
await fs.writeFile(out, JSON.stringify(hits, null, 2));
console.log('wrote', out, 'count', hits.length);
await browser.close();
