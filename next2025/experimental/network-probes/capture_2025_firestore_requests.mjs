import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const code = process.argv[2] || 'BRK1-096';
const url = `https://cloud.withgoogle.com/next/25/session-library?session=${code}#all`;
const out = `next2025/.tmp-firestore-requests-${code}.json`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const hits = [];
page.on('request', (req) => {
  const u = req.url();
  if (!u.includes('firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel')) return;
  hits.push({ url: u, method: req.method(), headers: req.headers(), postData: req.postData() });
  console.log('request', req.method(), u.slice(0,140), 'bodylen', (req.postData()||'').length);
});
await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await page.waitForTimeout(8000);
await fs.writeFile(out, JSON.stringify(hits, null, 2));
console.log('wrote', out, 'count', hits.length);
await browser.close();
