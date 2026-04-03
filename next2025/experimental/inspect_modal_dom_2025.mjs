import { chromium } from 'playwright';

const code = process.argv[2] || 'BRK1-096';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 2400 } });
await page.goto(`https://cloud.withgoogle.com/next/25/session-library?session=${encodeURIComponent(code)}#all`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(5000);

const result = await page.evaluate((code) => {
  const nodes = [...document.querySelectorAll('[role="dialog"], .modal, [aria-modal="true"]')];
  const match = nodes.find(n => (n.innerText || '').includes(code));
  if (!match) return { found: false };

  function walk(el, depth = 0, out = []) {
    const text = (el.innerText || '').trim();
    if (text && depth <= 4) {
      out.push({ tag: el.tagName, cls: el.className || '', text: text.slice(0, 400) });
    }
    if (depth < 4) {
      for (const child of el.children) walk(child, depth + 1, out);
    }
    return out;
  }

  return {
    found: true,
    html: match.outerHTML.slice(0, 20000),
    walked: walk(match).slice(0, 200),
  };
}, code);

console.log(JSON.stringify(result, null, 2));
await browser.close();
