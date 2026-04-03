import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });
await page.goto('https://cloud.withgoogle.com/next/25/session-library#all', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(8000);
for (let i=0;i<5;i++) { await page.mouse.wheel(0,7000); await page.waitForTimeout(2000); }
console.log('cards', await page.locator('.session-card').count());
const card = page.locator('.session-card').nth(20);
console.log('cardText', await card.innerText());
await card.locator('.content').click({ timeout: 10000 });
await page.waitForTimeout(3000);
console.log('url', page.url());
const body=await page.locator('body').innerText();
console.log('has Databricks', body.includes('Databricks'));
console.log(body.slice(0,5000));
await browser.close();
