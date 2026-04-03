/**
 * parse_2025_speakers.mjs
 *
 * Re-parses rawHead data from the captured modal shards (sessions_25_modal.part*.json)
 * using a corrected speaker-block parser.
 *
 * No browser required — works entirely on the already-captured rawHead arrays.
 *
 * Output: next2025/sessions_25_speakers.json
 *
 * Fixed bugs vs. extract_2025_modal_structured_shard.mjs:
 *   1. Name regex now allows lowercase-starting word parts (e.g. "Francis deSouza")
 *   2. looksTaxonomy no longer treats commas in a string as a taxonomy signal,
 *      so job titles like "COO, Google Cloud" or "Senior Manager, Data Strategy..."
 *      are correctly classified as roles, not taxonomy tags.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const SHARD_DIR = new URL('./experimental', import.meta.url).pathname;
const OUT_FILE = new URL('./sessions_25_speakers.json', import.meta.url).pathname;

// --- Load all shard parts ---
const all = [];
for (let i = 0; i < 8; i++) {
  const raw = await fs.readFile(path.join(SHARD_DIR, `sessions_25_modal.part${i}.json`), 'utf8');
  all.push(...JSON.parse(raw));
}
console.log(`Loaded ${all.length} sessions from 8 shards`);
console.log(`  found: ${all.filter(s => s.found).length}`);
console.log(`  not found: ${all.filter(s => !s.found).length}`);

// --- Parser constants ---
const affiliationWords = new Set(['Partner', 'Customer', 'Googler']);
const stopWords = new Set([
  'Read more', 'Related sessions', 'playlist_add', 'Add to playlist',
  'RESOURCES', 'Follow us', 'Why Google Cloud', 'Event information', 'Explore more',
]);
const badNames = new Set([
  'Session Library', 'Clear Filters', 'Database Professionals',
  'IT Managers & Business Leaders', 'Introductory', 'App Dev', 'Data Analytics', 'Gemini', 'AI',
]);
const badCompanies = new Set([
  'Introductory', 'Technical', 'Executive', 'General', 'Customer Story',
  'Developer Experiences', 'Technology', 'Startup',
  'Application Developers', 'Data Analysts, Data Scientists, Data Engineers',
  'Google Agentspace', 'Googler', 'Customer', 'Partner',
]);
const taxonomyWords = new Set([
  'App Dev', 'Business Intelligence', 'Data Analytics', 'Database Professionals',
  'Small IT Teams', 'Application Developers', 'Data Analysts, Data Scientists, Data Engineers',
  'Databases', 'Datastream', 'Gemini', 'Vertex AI', 'Google Agentspace',
  'Technical', 'Executive', 'Introductory', 'Startup',
]);

// Fix #2: only match explicit taxonomy words — do NOT treat commas as a taxonomy signal
const looksTaxonomy = (s) => taxonomyWords.has(s);

// Fix #1: allow lowercase-starting word parts (e.g. "deSouza", "de Silva", "van Der Berg")
const NAME_RE = /^[A-Z][A-Za-z'`.-]+(?:\s+[A-Za-z][A-Za-z'`.-]+){1,3}$/;

function isValidName(s) {
  return NAME_RE.test(s) && !badNames.has(s) && !looksTaxonomy(s) && !s.includes(',');
}

function isValidRole(s) {
  return s && s.length >= 3 && s.length <= 120
    && !badCompanies.has(s) && !affiliationWords.has(s) && !looksTaxonomy(s);
}

function isValidCompany(s) {
  return s && s.length < 80
    && !s.includes('•')
    && !['schedule', 'location_on', 'Share', 'play_circle', 'Play now', 'playlist_add'].includes(s)
    && !/^\d/.test(s)
    && !badCompanies.has(s)
    && !affiliationWords.has(s)
    && !looksTaxonomy(s);
}

function parseSpeakers(rawHead) {
  if (!rawHead || rawHead.length === 0) return [];

  const shareIdx = rawHead.indexOf('Share');
  const start = shareIdx >= 0 ? shareIdx + 1 : 0;

  // Build zone: lines after Share, stopping at stop markers
  const zone = [];
  for (let j = start; j < rawHead.length; j++) {
    const l = rawHead[j];
    if (stopWords.has(l) || l.startsWith('This Session is hosted by')) break;
    zone.push(l);
  }

  // Collapse consecutive duplicate lines (artifact of some modal renders)
  const norm = [];
  for (let j = 0; j < zone.length; j++) {
    if (j + 1 < zone.length && zone[j] === zone[j + 1]) continue;
    norm.push(zone[j]);
  }

  // Walk name/role/company[/affiliation] blocks
  const speakers = [];
  for (let j = 0; j + 2 < norm.length; ) {
    const name = norm[j];
    const role = norm[j + 1];
    const company = norm[j + 2];
    const maybeAff = norm[j + 3] || '';

    if (isValidName(name) && isValidRole(role) && isValidCompany(company)) {
      const rec = { name, role, company };
      if (affiliationWords.has(maybeAff)) rec.affiliation = maybeAff;
      speakers.push(rec);
      j += affiliationWords.has(maybeAff) ? 4 : 3;
    } else {
      j += 1;
    }
  }

  return speakers;
}

// --- Re-parse all found sessions ---
const results = all
  .filter(s => s.found)
  .map(s => ({
    code: s.code,
    title: s.title || '',
    speakers: parseSpeakers(s.rawHead),
  }));

// --- Validate known test cases ---
const KNOWN = [
  {
    code: 'BRK1-096',
    must: [
      { name: 'Matt Bell', company: 'Anthropic' },
      { name: 'Francis deSouza', company: 'Google Cloud' },
    ],
  },
  {
    code: 'SOL303',
    must: [
      { name: 'Chandu Bhuman', company: 'Virgin Media 02' },
      { name: 'Pedro Esteves', company: 'Google Cloud' },
      { name: 'Suda Srinivasan', company: 'Google Cloud' },
    ],
  },
  { code: 'IND-113', mustBeEmpty: true },
  { code: 'AIN-106', mustBeEmpty: true },
  { code: 'DAI-101', mustBeEmpty: true },
  { code: 'IND-109', mustBeEmpty: true },
];

let allPassed = true;
for (const test of KNOWN) {
  const session = results.find(r => r.code === test.code);
  if (!session) {
    console.warn(`WARN: ${test.code} not in results (not found during scrape)`);
    continue;
  }
  if (test.mustBeEmpty) {
    const fakeNames = new Set([
      'App Dev', 'Database Professionals', 'Google Agentspace',
      'IT Managers & Business Leaders', 'Application Developers',
    ]);
    const fake = session.speakers.filter(sp => fakeNames.has(sp.name));
    if (fake.length > 0) {
      console.error(`FAIL ${test.code}: fake speakers present: ${fake.map(s => s.name).join(', ')}`);
      allPassed = false;
    } else {
      console.log(`PASS ${test.code}: no fake speakers (${session.speakers.length} speakers)`);
    }
  }
  if (test.must) {
    for (const expected of test.must) {
      const found = session.speakers.find(sp => sp.name === expected.name && sp.company === expected.company);
      if (!found) {
        console.error(`FAIL ${test.code}: missing ${expected.name} → ${expected.company}`);
        allPassed = false;
      } else {
        console.log(`PASS ${test.code}: found ${expected.name} → ${expected.company}`);
      }
    }
  }
}

if (allPassed) {
  console.log('\nAll validation checks passed.');
} else {
  console.error('\nSome validation checks FAILED — review parser logic.');
  process.exit(1);
}

// --- Stats ---
const withSpeakers = results.filter(r => r.speakers.length > 0);
console.log(`\nSessions with speakers: ${withSpeakers.length} / ${results.length}`);

// Top non-Google companies
const companyCounts = {};
for (const session of results) {
  for (const sp of session.speakers) {
    if (!sp.company.toLowerCase().includes('google')) {
      companyCounts[sp.company] = (companyCounts[sp.company] || 0) + 1;
    }
  }
}
const topCompanies = Object.entries(companyCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);

console.log('\nTop non-Google companies by speaker appearances (2025, partial coverage):');
for (const [company, count] of topCompanies) {
  console.log(`  ${count.toString().padStart(3)}  ${company}`);
}
console.log(`\nNote: coverage is ${results.length} sessions (of ~977 total in 2025 library)`);

// --- Write output ---
await fs.writeFile(OUT_FILE, JSON.stringify(results, null, 2));
console.log(`\nWrote ${results.length} records to ${OUT_FILE}`);
