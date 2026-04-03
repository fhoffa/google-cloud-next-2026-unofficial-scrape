import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
page.on('request', (req) => {
  const url=req.url();
  if (url.includes('session') || url.includes('agenda') || url.includes('api') || url.includes('library')) {
    console.log('REQ', url);
  }
});
page.on('response', async (resp) => {
  const url=resp.url();
  if (url.includes('session') || url.includes('agenda') || url.includes('api') || url.includes('library')) {
    console.log('RES', resp.status(), url);
  }
});
await page.goto('https://cloud.withgoogle.com/next/25/session-library#all', {waitUntil:'domcontentloaded', timeout:60000});
await page.waitForTimeout(10000);
const body = await page.locator('body').innerText();
console.log('HAS_SESSIONS_WORD', body.includes('Explore sessions'));
console.log('HAS_DATABRICKS', body.includes('Databricks'));
console.log('TEXT_LEN', body.length);
await browser.close();
