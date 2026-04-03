import { chromium } from 'playwright';

const codes = ['BRK1-096','SOL303'];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 2400 } });

const affiliationWords = new Set(['Partner','Customer','Googler']);
const badNames = new Set(['Session Library','Clear Filters','Database Professionals','IT Managers & Business Leaders','Introductory','App Dev','Data Analytics','Gemini','AI']);
const badCompanies = new Set(['Introductory','Technical','Executive','General','Customer Story','Developer Experiences','Technology','Startup','Application Developers','Data Analysts, Data Scientists, Data Engineers','Google Agentspace','Googler','Customer','Partner']);
const taxonomyWords = ['App Dev','Business Intelligence','Data Analytics','Database Professionals','Small IT Teams','Application Developers','Data Analysts, Data Scientists, Data Engineers','Databases','Datastream','Gemini','Vertex AI','Google Agentspace','Technical','Executive','Introductory','Startup'];
const looksTaxonomy = (s) => taxonomyWords.includes(s) || s.split(',').length > 1;

for (const code of codes) {
  await page.goto(`https://cloud.withgoogle.com/next/25/session-library?session=${encodeURIComponent(code)}#all`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(5000);
  const nodes = page.locator('[role="dialog"], .modal, [aria-modal="true"]');
  const count = await nodes.count();
  let text = '';
  for (let j = 0; j < count; j++) {
    const t = await nodes.nth(j).innerText().catch(() => '');
    if (t && t.includes(code)) { text = t; break; }
  }
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const shareIdx = lines.indexOf('Share');
  const start = shareIdx >= 0 ? shareIdx + 1 : 0;
  const stopWords = new Set(['Partner','Read more','Related sessions','playlist_add','Add to playlist','RESOURCES','Follow us','Why Google Cloud','Event information','Explore more']);
  const zone = [];
  for (let j = start; j < lines.length; j++) {
    const l = lines[j];
    if (stopWords.has(l) || l.startsWith('This Session is hosted by')) break;
    zone.push(l);
  }
  const normalizedZone = [];
  for (let j = 0; j < zone.length; j++) {
    if (j + 1 < zone.length && zone[j] === zone[j + 1]) continue;
    normalizedZone.push(zone[j]);
  }
  const speakers = [];
  for (let j = 0; j + 2 < normalizedZone.length; ) {
    const name = normalizedZone[j];
    const role = normalizedZone[j + 1];
    const company = normalizedZone[j + 2];
    const maybeAff = normalizedZone[j + 3] || '';
    const validName = /^[A-Z][A-Za-z'`.-]+(?:\s+[A-Z][A-Za-z'`.-]+){1,3}$/.test(name) && !badNames.has(name) && !looksTaxonomy(name);
    const validRole = role && role.length >= 3 && role.length <= 120 && !badCompanies.has(role) && !affiliationWords.has(role) && !looksTaxonomy(role);
    const validCompany = company && company.length < 80 && !company.includes('•') && !['schedule','location_on','Share','play_circle','Play now','playlist_add'].includes(company) && !/^\d/.test(company) && !badCompanies.has(company) && !affiliationWords.has(company) && !looksTaxonomy(company);
    if (validName && validRole && validCompany) {
      const rec = { name, role, company };
      if (affiliationWords.has(maybeAff)) rec.affiliation = maybeAff;
      speakers.push(rec);
      j += affiliationWords.has(maybeAff) ? 4 : 3;
    } else {
      j += 1;
    }
  }
  console.log('\nCODE', code);
  console.log(JSON.stringify(speakers, null, 2));
}

await browser.close();
