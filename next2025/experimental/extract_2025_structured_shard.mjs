import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const shard = Number(process.argv[2] || '0');
const shards = Number(process.argv[3] || '1');
if (!Number.isInteger(shard) || !Number.isInteger(shards) || shard < 0 || shard >= shards || shards < 1) {
  console.error('usage: node extract_2025_structured_shard.mjs <shardIndex> <shardCount>');
  process.exit(1);
}

const cards = JSON.parse(await fs.readFile('/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25.json', 'utf8'));
const outPath = `/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25_structured.part${shard}.json`;

function extractCode(text) {
  const m = text.match(/\b([A-Z]{2,}(?:[A-Z]|\d)*(?:-[A-Z0-9]+)+|[A-Z]{2,}\d+(?:-[A-Z0-9]+)*)\b/);
  return m ? m[1] : null;
}

const entries = [];
const seen = new Set();
for (const card of cards) {
  const code = extractCode(card.text || '');
  if (!code || seen.has(code)) continue;
  seen.add(code);
  entries.push({ code, cardText: card.text });
}
const shardEntries = entries.filter((_, i) => i % shards === shard);
console.log('unique session codes', entries.length, 'shard', shard, 'of', shards, 'entries', shardEntries.length);

let existing = [];
try { existing = JSON.parse(await fs.readFile(outPath, 'utf8')); } catch {}
const done = new Set(existing.map(x => x.code));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 2400 } });
const results = [...existing];

for (let i = 0; i < shardEntries.length; i++) {
  const { code } = shardEntries[i];
  if (done.has(code)) continue;
  const url = `https://cloud.withgoogle.com/next/25/session-library?session=${encodeURIComponent(code)}#all`;
  console.log(`[shard ${shard}] [${i+1}/${shardEntries.length}] ${code}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    const idx = body.indexOf(code);
    const tail = idx >= 0 ? body.slice(idx, idx + 5000) : body;
    const lines = tail.split('\n').map(s => s.trim()).filter(Boolean);

    let title = '';
    const codeIdx = lines.findIndex(l => l.includes(code));
    if (codeIdx >= 0) {
      for (let j = codeIdx + 1; j < Math.min(lines.length, codeIdx + 8); j++) {
        const l = lines[j];
        if (!['schedule','location_on','Share','Partner'].includes(l) && !/^\d/.test(l) && !l.includes('•')) {
          title = l;
          break;
        }
      }
    }

    const speakers = [];
    const shareIdx = lines.indexOf('Share');
    const start = shareIdx >= 0 ? shareIdx + 1 : (codeIdx >= 0 ? codeIdx + 1 : 0);
    const stopWords = new Set(['Partner','Read more','Related sessions','Follow us','Why Google Cloud','Event information','Explore more']);
    let zone = [];
    for (let j = start; j < lines.length; j++) {
      const l = lines[j];
      if (stopWords.has(l) || l.startsWith('This Session is hosted by')) break;
      zone.push(l);
    }
    for (let j = 0; j + 2 < zone.length; j++) {
      const name = zone[j];
      const role = zone[j + 1];
      const company = zone[j + 2];
      if (/^[A-Z][A-Za-z'`.-]+(?:\s+[A-Z][A-Za-z'`.-]+){1,3}$/.test(name) &&
          company.length < 80 &&
          !company.includes('•') &&
          !['schedule','location_on','Share','Play now','playlist_add'].includes(company) &&
          !/^\d/.test(company)) {
        speakers.push({ name, role, company });
        j += 2;
      }
    }

    results.push({ code, url, found: idx >= 0, title, speakers, rawHead: lines.slice(0, 60) });
  } catch (e) {
    results.push({ code, url, found: false, error: String(e) });
  }
  await fs.writeFile(outPath, JSON.stringify(results, null, 2));
}

await browser.close();
console.log('saved', results.length, 'records to', outPath);
