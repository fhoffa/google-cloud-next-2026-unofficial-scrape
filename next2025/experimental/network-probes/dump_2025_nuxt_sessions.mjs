import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const url = 'https://cloud.withgoogle.com/next/25/session-library#all';
const out = 'next2025/.tmp-nuxt-sessions.json';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await page.waitForTimeout(5000);
const dump = await page.evaluate(() => {
  const s = window.__NUXT__?.state?.sessions || {};
  return {
    keys: Object.keys(s),
    sessionsCount: Array.isArray(s.sessions) ? s.sessions.length : null,
    byIdCount: s.sessionsById ? Object.keys(s.sessionsById).length : null,
    byIdCodeCount: s.sessionsByIdCode ? Object.keys(s.sessionsByIdCode).length : null,
    sample: s.sessionsByIdCode ? Object.fromEntries(Object.entries(s.sessionsByIdCode).slice(0,3)) : null,
    full: s,
  };
});
await fs.writeFile(out, JSON.stringify(dump, null, 2));
console.log('keys', dump.keys);
console.log('sessionsCount', dump.sessionsCount);
console.log('byIdCount', dump.byIdCount);
console.log('byIdCodeCount', dump.byIdCodeCount);
await browser.close();
