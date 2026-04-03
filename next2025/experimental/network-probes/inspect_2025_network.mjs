import { chromium } from 'playwright';

const code = process.argv[2] || 'BRK1-096';
const url = `https://cloud.withgoogle.com/next/25/session-library?session=${code}#all`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const seen = [];
page.on('response', async (res) => {
  const req = res.request();
  const u = res.url();
  if (!/session|firestore|payload|state|graphql|api|document|listen/i.test(u)) return;
  seen.push({ status: res.status(), type: req.resourceType(), method: req.method(), url: u });
});
await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await page.waitForTimeout(5000);
console.log(JSON.stringify(seen, null, 2));
await browser.close();
