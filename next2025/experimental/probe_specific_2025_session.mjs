import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });
await page.goto('https://cloud.withgoogle.com/next/25/session-library?session=CT2-28#all', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(8000);
const body = await page.locator('body').innerText();
console.log('body_has_databricks', body.includes('Databricks'));
console.log('body_has_digital_turbine', body.includes('Digital Turbine'));
for (const needle of ['CT2-28','Digital Turbine','Databricks','Speaker','Presented by']) {
  console.log(needle, body.indexOf(needle));
}
console.log(body.slice(Math.max(0, body.indexOf('CT2-28')-500), Math.max(0, body.indexOf('CT2-28')+2500)));
await browser.close();
