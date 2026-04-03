import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
const seen=[];
page.on('response', async (resp) => {
  const url = resp.url();
  if (url.includes('session') || url.includes('agenda') || url.includes('api') || url.includes('library')) {
    seen.push({url, status: resp.status(), ct: resp.headers()['content-type'] || ''});
  }
});
await page.goto('https://cloud.withgoogle.com/next/25/session-library#all', {waitUntil:'networkidle', timeout:120000});
await page.waitForTimeout(5000);
const text = await page.locator('body').innerText();
console.log('BODY_HAS_DATABRICKS', text.includes('Databricks'));
console.log('BODY_SLICE', text.slice(0,3000));
console.log('RESPONSES');
for (const r of seen.slice(0,80)) console.log(JSON.stringify(r));
await browser.close();
