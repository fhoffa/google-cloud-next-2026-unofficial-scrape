import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const year = process.argv[2];
if (!year) {
  console.error('usage: node load_all_year_sessions.mjs <24|25>');
  process.exit(1);
}
const url = `https://cloud.withgoogle.com/next/${year}/session-library#all`;
const out = `sessions_${year}.json`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(8000);

async function countCards() {
  return await page.locator('.session-card').count();
}

let stableRounds = 0;
let last = -1;
for (let round = 0; round < 120; round++) {
  const count = await countCards();
  console.log('year', year, 'round', round, 'cards', count);

  if (count === last) stableRounds += 1;
  else stableRounds = 0;

  let clicked = false;
  for (const t of ['Load more', 'Show more', 'View more', 'More']) {
    const loc = page.getByRole('button', { name: new RegExp(`^${t}$`, 'i') }).first();
    if (await loc.count()) {
      try {
        await loc.click({ timeout: 1500 });
        clicked = true;
        break;
      } catch {}
    }
  }

  if (!clicked) {
    await page.mouse.wheel(0, 7000);
  }
  await page.waitForTimeout(2000);

  const after = await countCards();
  if (after === count && stableRounds >= 3) {
    console.log('year', year, 'stopping_after_stable', after);
    break;
  }
  last = after;
}

const cards = await page.locator('.session-card').evaluateAll(nodes => nodes.map(n => ({
  text: (n.innerText || '').replace(/\s+/g, ' ').trim(),
  html: n.outerHTML,
})));
await fs.writeFile(out, JSON.stringify(cards, null, 2));
console.log('year', year, 'final_cards', cards.length, 'saved_to', out);
await browser.close();
