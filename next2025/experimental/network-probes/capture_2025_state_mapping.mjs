import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const code = process.argv[2] || 'BRK1-096';
const url = `https://cloud.withgoogle.com/next/25/session-library?session=${code}#all`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await page.waitForTimeout(5000);
const dump = await page.evaluate(() => {
  const w = window;
  const out = {};
  const nuxt = w.__NUXT__ || null;
  out.keys = nuxt ? Object.keys(nuxt) : [];
  out.route = nuxt?.routePath || nuxt?.route || null;
  out.stateKeys = nuxt?.state ? Object.keys(nuxt.state) : [];
  out.state = nuxt?.state || null;
  return out;
});
console.log(JSON.stringify(dump, null, 2));
await browser.close();
