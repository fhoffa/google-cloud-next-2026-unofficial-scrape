import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const shard = Number(process.argv[2] || '0');
const shards = Number(process.argv[3] || '1');
if (!Number.isInteger(shard) || !Number.isInteger(shards) || shard < 0 || shard >= shards || shards < 1) {
  console.error('usage: node extract_2025_modal_structured_shard.mjs <shardIndex> <shardCount>');
  process.exit(1);
}

const cards = JSON.parse(await fs.readFile('/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25.json', 'utf8'));
const outPath = `/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25_modal.part${shard}.json`;

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
    await page.waitForTimeout(4000);
    const nodes = page.locator('[role="dialog"], .modal, [aria-modal="true"]');
    const count = await nodes.count();
    let text = '';
    for (let j = 0; j < count; j++) {
      const t = await nodes.nth(j).innerText().catch(() => '');
      if (t && t.includes(code)) { text = t; break; }
    }
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

    let title = '';
    const codeIdx = lines.findIndex(l => l.includes(code));
    if (codeIdx >= 0) {
      for (let j = codeIdx + 1; j < Math.min(lines.length, codeIdx + 8); j++) {
        const l = lines[j];
        if (!['schedule','location_on','Share','Partner','Customer','Googler'].includes(l) && !/^\d/.test(l) && !l.includes('•')) {
          title = l;
          break;
        }
      }
    }

    const speakers = [];
    const shareIdx = lines.indexOf('Share');
    const start = shareIdx >= 0 ? shareIdx + 1 : 0;
    const stopWords = new Set(['Partner','Read more','Related sessions','playlist_add','Add to playlist','RESOURCES','Follow us','Why Google Cloud','Event information','Explore more']);
    const affiliationWords = new Set(['Partner','Customer','Googler']);
    const zone = [];
    for (let j = start; j < lines.length; j++) {
      const l = lines[j];
      if (stopWords.has(l) || l.startsWith('This Session is hosted by')) break;
      zone.push(l);
    }
    const normalizedZone = [];
    for (let j = 0; j < zone.length; j++) {
      if (j + 1 < zone.length && zone[j] === zone[j + 1]) continue; // collapse duplicated name lines
      normalizedZone.push(zone[j]);
    }
    const badNames = new Set(['Session Library','Clear Filters','Database Professionals','IT Managers & Business Leaders','Introductory','App Dev','Data Analytics','Gemini','AI']);
    const badCompanies = new Set(['Introductory','Technical','Executive','General','Customer Story','Developer Experiences','Technology','Startup','Application Developers','Data Analysts, Data Scientists, Data Engineers','Google Agentspace','Googler','Customer','Partner']);
    const taxonomyWords = ['App Dev','Business Intelligence','Data Analytics','Database Professionals','Small IT Teams','Application Developers','Data Analysts, Data Scientists, Data Engineers','Databases','Datastream','Gemini','Vertex AI','Google Agentspace','Technical','Executive','Introductory','Startup'];
    const looksTaxonomy = (s) => taxonomyWords.includes(s) || s.split(',').length > 1;
    for (let j = 0; j + 2 < normalizedZone.length; ) {
      const name = normalizedZone[j];
      const role = normalizedZone[j + 1];
      const company = normalizedZone[j + 2];
      const maybeAff = normalizedZone[j + 3] || '';
      const validName = /^[A-Z][A-Za-z'`.-]+(?:\s+[A-Z][A-Za-z'`.-]+){1,3}$/.test(name) && !badNames.has(name) && !looksTaxonomy(name);
      const validRole = role && role.length >= 3 && role.length <= 120 && !badCompanies.has(role) && !affiliationWords.has(role) && !looksTaxonomy(role);
      const validCompany = company && company.length < 80 &&
        !company.includes('•') &&
        !['schedule','location_on','Share','play_circle','Play now','playlist_add'].includes(company) &&
        !/^\d/.test(company) &&
        !badCompanies.has(company) &&
        !affiliationWords.has(company) &&
        !looksTaxonomy(company);
      if (validName && validRole && validCompany) {
        const rec = { name, role, company };
        if (affiliationWords.has(maybeAff)) rec.affiliation = maybeAff;
        speakers.push(rec);
        j += affiliationWords.has(maybeAff) ? 4 : 3;
      } else {
        j += 1;
      }
    }

    results.push({ code, url, found: Boolean(text), title, speakers, rawHead: lines.slice(0, 50) });
  } catch (e) {
    results.push({ code, url, found: false, error: String(e) });
  }
  await fs.writeFile(outPath, JSON.stringify(results, null, 2));
}

await browser.close();
console.log('saved', results.length, 'records to', outPath);
