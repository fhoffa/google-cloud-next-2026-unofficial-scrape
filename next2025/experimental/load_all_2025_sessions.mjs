import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });
await page.goto('https://cloud.withgoogle.com/next/25/session-library#all', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(8000);

async function countCards() {
  return await page.locator('.session-card').count();
}

let last = -1;
for (let round = 0; round < 30; round++) {
  const count = await countCards();
  console.log('round', round, 'cards', count);
  if (count === last) {
    // try clicking a likely load-more control if present
    const texts = ['Load more', 'Show more', 'View more', 'More'];
    let clicked = false;
    for (const t of texts) {
      const loc = page.getByRole('button', { name: new RegExp(`^${t}$`, 'i') }).first();
      if (await loc.count()) {
        try { await loc.click({ timeout: 2000 }); clicked = true; break; } catch {}
      }
    }
    if (!clicked) {
      await page.mouse.wheel(0, 5000);
      await page.waitForTimeout(2500);
      const after = await countCards();
      console.log('after scroll', after);
      if (after === count) break;
    } else {
      await page.waitForTimeout(3000);
    }
  } else {
    await page.mouse.wheel(0, 5000);
    await page.waitForTimeout(2500);
  }
  last = count;
}

const cards = await page.locator('.session-card').evaluateAll(nodes => nodes.map(n => ({
  text: (n.innerText || '').replace(/\s+/g, ' ').trim(),
  html: n.outerHTML,
})));
await fs.writeFile('session_cards_full.json', JSON.stringify(cards, null, 2));
console.log('final_cards', cards.length);
await browser.close();
