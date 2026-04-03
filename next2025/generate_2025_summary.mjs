/**
 * generate_2025_summary.mjs
 *
 * Builds next2025/sessions_25_summary.json from the captured 2025 data.
 * Mirrors the shape of media/insights-summary.json used for 2026.
 *
 * Data sources:
 *   next2025/experimental/sessions_25.json  — 977 session cards
 *   next2025/sessions_25_speakers.json      — 62 sessions with parsed speaker data
 *
 * Run: node next2025/generate_2025_summary.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARDS_FILE  = path.join(ROOT, 'next2025/experimental/sessions_25.json');
const SPEAKERS_FILE = path.join(ROOT, 'next2025/sessions_25_speakers.json');
const OUT_FILE    = path.join(ROOT, 'next2025/sessions_25_summary.json');

const cards   = JSON.parse(await fs.readFile(CARDS_FILE,    'utf8'));
const speakers = JSON.parse(await fs.readFile(SPEAKERS_FILE, 'utf8'));

// ---------------------------------------------------------------------------
// Parse card text for type and tags
// ---------------------------------------------------------------------------
function parseCard(text) {
  // Session type: "Keynotes", or "ICON TypeName title..."
  let type = 'Other';
  if (text.startsWith('Keynotes ')) {
    type = 'Keynotes';
  } else {
    const m = text.match(/^(\w+)\s+(Breakouts|Solution Talks|Lounge Sessions|Spotlights|Cloud Talks|Showcase Demos|Learning Labs|Lightning Talks|Partner Summit|Expo Zone|Developer Keynotes)/);
    if (m) type = m[2];
  }

  // Tags: CODE • TAG1, TAG2, TAG3 ... schedule|play_circle|playlist_add
  const tagBlock = text.match(/[A-Z][A-Z0-9\-]{2,}\s+•\s+((?:[A-Z][A-Z\s]+(?:,\s*)?)+?)(?=\s+(?:schedule|play_circle|playlist_add))/);
  const tags = tagBlock
    ? tagBlock[1].split(',').map(s => s.trim()).filter(s => /^[A-Z]/.test(s) && s.length > 1)
    : [];

  return { type, tags };
}

const typeCounts = {};
const tagCounts  = {};

for (const card of cards) {
  const { type, tags } = parseCard(card.text || '');
  typeCounts[type] = (typeCounts[type] || 0) + 1;
  for (const tag of tags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
}

const total = cards.length;
const aiTagged = tagCounts['AI'] || 0;

const sessionsByType = Object.entries(typeCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([name, count]) => ({ name, count }));

const topProductTags = Object.entries(tagCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([tag, count]) => ({ tag, count }));

// ---------------------------------------------------------------------------
// Speaker / company data (partial coverage)
// ---------------------------------------------------------------------------
const companyCounts = {};
let totalSpeakers = 0;
const seenSpeakerNames = new Set();

for (const session of speakers) {
  for (const sp of session.speakers) {
    totalSpeakers++;
    const key = sp.name + '|' + (sp.company || '');
    const isGoogle = (sp.company || '').toLowerCase().includes('google');

    // Filter known data-quality artifact from one keynote
    if (sp.company === 'Fran Hinkelmann') continue;

    if (!isGoogle && sp.company) {
      companyCounts[sp.company] = (companyCounts[sp.company] || 0) + 1;
    }
  }
}

const topCompanies = Object.entries(companyCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([company, sessions]) => ({ company, sessions }));

const speakerSessionCount = speakers.filter(s => s.speakers.length > 0).length;

// ---------------------------------------------------------------------------
// Build summary JSON
// ---------------------------------------------------------------------------
const summary = {
  meta: {
    year: 2025,
    event: 'Google Cloud Next 2025',
    dates: 'April 9–11, 2025',
    venue: 'Mandalay Bay, Las Vegas',
    generatedAt: new Date().toISOString(),
    dataSource: 'next2025/experimental/sessions_25.json',
    speakerDataSource: 'next2025/sessions_25_speakers.json',
    totalSessionsInCatalog: total,
    sessionsWithSpeakerData: speakerSessionCount,
    speakerCoverageNote:
      `Speaker/company data covers ${speakerSessionCount} of ${total} sessions (${Math.round(speakerSessionCount / total * 100)}%). ` +
      'Full modal extraction was not completed. Company rankings are illustrative.',
  },

  stats: [
    {
      value: total.toLocaleString(),
      label: 'Total sessions',
      note: 'All formats — keynotes, breakouts, solution talks, showcase demos, and more.',
    },
    {
      value: `${Math.round(aiTagged / total * 100)}% AI-tagged`,
      label: 'Sessions with AI product tag',
      sub: `${aiTagged} sessions`,
      note: 'Based on raw product tags from card data. 2026 used LLM-based classification which likely yields higher counts (89%).',
    },
    {
      value: sessionsByType[0]?.name ?? '—',
      label: 'Largest format',
      sub: `${sessionsByType[0]?.count ?? 0} sessions`,
    },
    {
      value: topProductTags.find(t => t.tag !== 'AI')?.tag ?? '—',
      label: 'Top product tag (ex-AI)',
      sub: `${topProductTags.find(t => t.tag !== 'AI')?.count ?? 0} sessions`,
    },
  ],

  sessionsByType,

  topProductTags,

  topCompanies: {
    coverageSessions: speakerSessionCount,
    totalSessions: total,
    coveragePct: `${Math.round(speakerSessionCount / total * 100)}%`,
    note: 'Partial coverage — speaker data from modal extraction of ~6% of sessions.',
    nonGoogle: topCompanies,
  },
};

await fs.writeFile(OUT_FILE, JSON.stringify(summary, null, 2));

// ---------------------------------------------------------------------------
// Print report
// ---------------------------------------------------------------------------
console.log(`Google Cloud Next 2025 — summary`);
console.log(`  Total sessions:   ${total}`);
console.log(`  AI-tagged:        ${aiTagged} (${Math.round(aiTagged/total*100)}%)`);
console.log(`\nSession types:`);
sessionsByType.forEach(({ name, count }) =>
  console.log(`  ${count.toString().padStart(4)}  ${name}`));
console.log(`\nTop product tags:`);
topProductTags.slice(0, 10).forEach(({ tag, count }) =>
  console.log(`  ${count.toString().padStart(4)}  ${tag}`));
console.log(`\nTop non-Google companies (${speakerSessionCount} sessions with speaker data):`);
topCompanies.slice(0, 15).forEach(({ company, sessions }) =>
  console.log(`  ${sessions.toString().padStart(3)}  ${company}`));
console.log(`\nWrote ${OUT_FILE}`);
