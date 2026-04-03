import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const firestore = [];

page.on('response', async (resp) => {
  const url = resp.url();
  if (!url.includes('firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel')) return;
  try {
    const text = await resp.text();
    firestore.push({ url, status: resp.status(), text });
  } catch (e) {
    firestore.push({ url, status: resp.status(), text: `__READ_ERROR__ ${e}` });
  }
});

await page.goto('https://cloud.withgoogle.com/next/25/session-library#all', {
  waitUntil: 'domcontentloaded',
  timeout: 120000,
});
await page.waitForTimeout(15000);

const bodyText = await page.locator('body').innerText();
const html = await page.content();

await fs.writeFile('body.txt', bodyText);
await fs.writeFile('page.html', html);
await fs.writeFile('firestore_listen.json', JSON.stringify(firestore, null, 2));

console.log('saved', { bodyLen: bodyText.length, firestoreResponses: firestore.length });
await browser.close();
