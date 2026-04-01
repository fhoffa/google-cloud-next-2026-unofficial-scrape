#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalCompanyName, isGoogleInternalCompany } from '../lib/company-identity.mjs';
import {
  availabilityBand,
  availabilityCounts,
  createAvailabilityArtifact,
  loadLibraryAvailabilityRecords,
  mergeAvailabilityIntoSessions,
} from '../lib/session-availability.mjs';
import { collectWordStatItems } from '../lib/word-stats.mjs';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeHref(params) {
  return `./index.html?${new URLSearchParams(params).toString()}`;
}

function counts(key, subset) {
  const mapped = new Map();
  for (const session of subset) {
    const value = session?.llm?.[key];
    if (!value || (key === 'audience' && value === 'General')) continue;
    mapped.set(value, (mapped.get(value) || 0) + 1);
  }
  return [...mapped.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function percentage(part, total, digits = 0) {
  if (!total) return `${(0).toFixed(digits)}%`;
  return `${((part / total) * 100).toFixed(digits)}%`;
}

function formatAvailabilityShare(part, total) {
  if (!total) return 'No current availability signals';
  return `${part.toLocaleString()} of ${total.toLocaleString()} (${percentage(part, total)})`;
}

function availabilityBreakdown(subset) {
  const counts = availabilityCounts(subset);
  return {
    ...counts,
    fullShare: percentage(counts.full, counts.known),
    notFullShare: percentage(counts['not-full'], counts.known),
  };
}

function categoryCounts(subset, allowedBand) {
  const mapped = new Map();
  for (const session of subset) {
    if (availabilityBand(session) !== allowedBand) continue;
    const value = String(session?.session_category || '').trim();
    if (!value) continue;
    mapped.set(value, (mapped.get(value) || 0) + 1);
  }
  return [...mapped.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function wordStats(subset, limit = 18) {
  return collectWordStatItems(subset, {
    limit,
    getSessionId: (session) => session?.url || session?.title || '',
  });
}

function companyCounts(subset, { excludeGoogle = false } = {}) {
  const mapped = new Map();
  for (const session of subset) {
    const seen = new Set();
    for (const speaker of session.speakers || []) {
      const company = canonicalCompanyName(speaker.company);
      if (!company || seen.has(company)) continue;
      seen.add(company);
      if (excludeGoogle && isGoogleInternalCompany(company)) continue;
      mapped.set(company, (mapped.get(company) || 0) + 1);
    }
  }
  return [...mapped.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .filter(([, count]) => count >= 2)
    .slice(0, 120);
}

function rankItemsHtml(items, color, paramsFor) {
  const maxCount = items[0]?.[1] || 1;
  return items.map(([name, count]) => {
    const width = maxCount ? (count / maxCount) * 100 : 0;
    return `<a class="rank-row" href="${esc(makeHref(paramsFor(name)))}" style="text-decoration:none;color:inherit"><div class="rank-main"><div class="rank-name">${esc(name)}</div><div class="rank-bar"><div class="rank-fill" style="width:${width.toFixed(6)}%;background:${color}"></div></div></div><div class="rank-count">${count}</div></a>`;
  }).join('');
}

function wordItemsHtml(items, extraParams = {}) {
  return items.map((item) => `<a class="word-chip" href="${esc(makeHref({ q: item.word, ...extraParams }))}">${esc(item.label)} <small>${item.count}</small></a>`).join('');
}

function chipItemsHtml(items, key) {
  return items.map(([name, count]) => `<a class="chip" href="${esc(makeHref({ [key]: name }))}">${esc(name)} (${count})</a>`).join('');
}

function statsCardsHtml(cards) {
  return cards.map((card) => {
    const sub = card.sub ? `<div class="stat-sub">${esc(card.sub)}</div>` : '';
    const note = card.note ? `<div class="stat-note">${card.note}</div>` : '';
    const value = card.valueHtml || esc(card.value);
    return `<div class="card"><div class="stat-value">${value}</div><div class="stat-label">${esc(card.label)}</div>${sub}${note}</div>`;
  }).join('');
}

function observationListHtml(items) {
  return items.map((item) => `<li>${item}</li>`).join('');
}

function slicesHtml(items) {
  return items.map((item) => `<a class="slice-link" href="${esc(makeHref(item.params))}"><strong>${esc(item.title)}</strong><span>${esc(item.desc)}</span></a>`).join('');
}

function buildSummary(sessions, sankeyLatest, generatedAt, availabilitySource) {
  const withLlm = sessions.filter((session) => session.llm);
  const ai = counts('ai_focus', withLlm);
  const themes = counts('theme', withLlm);
  const audiences = counts('audience', withLlm);
  const aiSessions = withLlm.filter((session) => session.llm?.ai_focus === 'AI');
  const notAiSessions = withLlm.filter((session) => session.llm?.ai_focus === 'Not AI');
  const aiThemes = counts('theme', aiSessions);
  const notAiThemes = counts('theme', notAiSessions);
  const total = sessions.length;
  const aiCount = ai.find(([name]) => name === 'AI')?.[1] || 0;
  const notAiCount = ai.find(([name]) => name === 'Not AI')?.[1] || 0;
  const nonGoogleCompanyCount = new Set(
    withLlm.flatMap((session) => (session.speakers || []).map((speaker) => canonicalCompanyName(speaker.company)))
      .filter((company) => company && !isGoogleInternalCompany(company))
  ).size;

  const topNonGoogle = companyCounts(withLlm, { excludeGoogle: true });
  const topCompany = topNonGoogle[0] || null;

  const CONSULTING_FIRMS = ['Accenture', 'McKinsey & Company', 'Deloitte', 'PwC', 'Cognizant', 'HCLTech'];
  const consultingTotal = CONSULTING_FIRMS.reduce((sum, name) => {
    return sum + (topNonGoogle.find(([n]) => n === name)?.[1] || 0);
  }, 0);
  const anthropicCount = topNonGoogle.find(([n]) => n === 'Anthropic')?.[1] || 0;
  const wizCount = topNonGoogle.find(([n]) => n === 'Wiz')?.[1] || 0;
  const nvidiaEntry = topNonGoogle.find(([n]) => n === 'NVIDIA');
  const nvidiaCount = nvidiaEntry?.[1] || 0;
  const nvidiaRank = nvidiaEntry ? topNonGoogle.indexOf(nvidiaEntry) + 1 : null;
  const shopifyCount = topNonGoogle.find(([n]) => n === 'Shopify')?.[1] || 0;
  const snapCount = topNonGoogle.find(([n]) => n === 'Snap')?.[1] || 0;
  const geotabEntry = topNonGoogle.find(([n]) => n === 'Geotab');
  const geotabCount = geotabEntry?.[1] || 0;
  const geotabRank = geotabEntry ? topNonGoogle.indexOf(geotabEntry) + 1 : null;

  const companyObservationParts = [];
  if (topCompany) {
    companyObservationParts.push(`<strong>${esc(topCompany[0])}</strong> leads all non-Google companies with <strong>${topCompany[1]}</strong> sessions — a persistent presence throughout the program.`);
  }
  if (consultingTotal > 0) {
    const firmList = CONSULTING_FIRMS.filter((name) => topNonGoogle.find(([n]) => n === name)).join(', ');
    companyObservationParts.push(`The major consulting firms (${firmList}) add up to <strong>${consultingTotal} sessions combined</strong> — more than any individual non-Google company. A big slice of the conference is about enterprise adoption, with consultants as the delivery vehicle.`);
  }
  if (nvidiaCount > 0 && nvidiaRank) {
    companyObservationParts.push(`<strong>NVIDIA</strong> at #${nvidiaRank} (${nvidiaCount} sessions) makes the AI hardware dependency explicit — the software story at this conference runs on their chips.`);
  }
  if (anthropicCount > 0) {
    companyObservationParts.push(`<strong>Anthropic</strong> appears ${anthropicCount} times — Google's AI model investment earns a recurring stage presence.`);
  }
  if (wizCount > 0) {
    companyObservationParts.push(`<strong>Wiz</strong> shows up ${wizCount} times, all in Security — Google acquired Wiz for ~$32B, yet the catalog still lists them as an external company.`);
  }
  if (shopifyCount > 0 && snapCount > 0) {
    companyObservationParts.push(`<strong>Shopify</strong> (${shopifyCount}) and <strong>Snap</strong> (${snapCount}) are consumer brands, not enterprise software companies — Google is using them as scale proof points for what Cloud infrastructure can handle.`);
  }

  const leaderShare = audiences.find(([name]) => name === 'Leaders')?.[1] || 0;
  const devShare = audiences.find(([name]) => name === 'Developers')?.[1] || 0;
  const topAiTheme = aiThemes[0] || ['n/a', 0];
  const topNotAiTheme = notAiThemes[0] || ['n/a', 0];
  const availability = availabilityBreakdown(withLlm);
  const workshopSessions = withLlm.filter((session) => session.session_category === 'Workshops');
  const workshopAvailability = availabilityBreakdown(workshopSessions);
  const fullByCategory = categoryCounts(withLlm, 'full');
  const notFullByCategory = categoryCounts(withLlm, 'not-full');

  const aiThemeNotes = {
    'App dev': '— builders are clearly the primary target',
    'Data': '— data work drives more of the AI agenda than any other theme',
    'Security': "— even AI's biggest footprint is in security",
    'Business': '— the AI story is as much a business case as a technical one',
    'Infra': '— AI infrastructure dominates the technical agenda',
  };
  const aiThemeNote = aiThemeNotes[topAiTheme[0]] || '';

  const observationsHtml = [
    `<strong>${((aiCount / Math.max(1, total)) * 100).toFixed(1)}%</strong> of the entire catalog is AI — ${aiCount} of ${total} sessions.`,
    `<strong>${esc(themes[0]?.[0] || 'n/a')}</strong> is the most common theme at <strong>${themes[0]?.[1] || 0}</strong> sessions, spanning both AI and non-AI content.`,
    `Inside AI, <strong>${esc(topAiTheme[0])}</strong> leads at ${topAiTheme[1]} sessions${aiThemeNote ? ` ${aiThemeNote}` : ''}.`,
    `Outside AI, <strong>${esc(topNotAiTheme[0])}</strong> takes the top spot with ${topNotAiTheme[1]} sessions.`,
    `<strong>${leaderShare >= devShare ? 'Leaders' : 'Developers'}</strong> get slightly more sessions than ${leaderShare >= devShare ? 'developers' : 'leaders'} (${Math.max(leaderShare, devShare)} vs ${Math.min(leaderShare, devShare)}).`,
    ...(consultingTotal > 0 ? [`The major consulting firms together account for <strong>${consultingTotal} sessions</strong> — more than any single non-Google company on the list.`] : []),
  ];
  const fullnessObservations = [
    `<a href="${esc(makeHref({ availability: 'full' }))}"><strong>${availability.full} sessions are already sold out</strong></a>. The other <a href="${esc(makeHref({ availability: 'not-full' }))}">${ availability['not-full']} still have seats</a>.`,
    workshopAvailability.known ? `<a href="${esc(makeHref({ availability: 'full', topic: 'Workshops' }))}"><strong>Workshops are the main sellout zone</strong></a>: ${formatAvailabilityShare(workshopAvailability.full, workshopAvailability.known)} are already full.` : `Workshop availability is not currently exposed in the cached library pages.`,
  ];

  return {
    meta: {
      generatedAt,
      source: 'sessions/classified_sessions.json',
      availabilitySource,
      template: 'templates/insights.template.html',
      outputHtml: 'insights.html',
      sankeyLatest,
      generator: 'scripts/generate_insights.mjs',
      wordRules: 'config/word-rules.json',
    },
    lede: `${aiCount.toLocaleString()} of ${total.toLocaleString()} sessions at Google Cloud Next 2026 are about AI — ${Math.round((aiCount / Math.max(1, total)) * 100)}% of the whole conference. ${esc(themes[0]?.[0] || 'Security')} is the biggest single theme. The ${notAiCount} non-AI sessions are where the rest of the cloud story holds out.`,
    stats: [
      { value: total.toLocaleString(), label: 'Total sessions', note: `Across all formats — keynotes, breakouts, workshops, and labs.` },
      { value: `${Math.round((aiCount / Math.max(1, total)) * 100)}% AI`, label: 'Share of the conference', sub: `${aiCount.toLocaleString()} AI · ${notAiCount.toLocaleString()} not AI`, note: `For every non-AI session, there are roughly ${Math.round(aiCount / Math.max(1, notAiCount))} AI ones.` },
      { value: themes[0]?.[0] || 'n/a', label: 'Largest theme', sub: `${themes[0]?.[1] || 0} sessions`, note: themes[0]?.[0] === 'Security' ? 'Security runs through both AI and non-AI content — it\'s the one theme that shows up everywhere.' : themes[0]?.[0] === 'App dev' ? 'Building things is the dominant mode — app dev spans both AI and non-AI sessions.' : `${themes[0]?.[0] || 'This theme'} spans both AI and non-AI content — it shows up across the whole conference.` },
      { value: audiences[0]?.[0] || 'n/a', label: 'Largest audience', sub: `${audiences[0]?.[1] || 0} sessions`, note: `Slightly ahead of Developers (${Math.min(leaderShare, devShare)} sessions) — the conference leans executive.` },
      { value: nonGoogleCompanyCount.toLocaleString(), valueHtml: `<a href="#top-companies-speaking">${nonGoogleCompanyCount.toLocaleString()}</a>`, label: 'Non-Google companies represented', note: `Most appear once. A handful show up 10+ times and are part of the conference narrative.` },
    ],
    fullness: {
      stats: [],
      observations: fullnessObservations,
      rankings: {
        fullByCategory: fullByCategory.slice(0, 6).map(([name, count]) => ({ name, count })),
        notFullByCategory: notFullByCategory.slice(0, 6).map(([name, count]) => ({ name, count })),
      },
    },
    quickPivots: {
      aiFocus: ai.map(([name, count]) => ({ name, count, href: makeHref({ ai_focus: name }) })),
      themes: themes.slice(0, 8).map(([name, count]) => ({ name, count, href: makeHref({ theme: name }) })),
      audiences: audiences.slice(0, 8).map(([name, count]) => ({ name, count, href: makeHref({ audience: name }) })),
    },
    observations: observationsHtml,
    rankings: {
      topThemes: themes.slice(0, 8).map(([name, count]) => ({ name, count, href: makeHref({ theme: name }) })),
      topAudiences: audiences.slice(0, 8).map(([name, count]) => ({ name, count, href: makeHref({ audience: name }) })),
      topAiThemes: aiThemes.slice(0, 8).map(([name, count]) => ({ name, count, href: makeHref({ ai_focus: 'AI', theme: name }) })),
      topNotAiThemes: notAiThemes.slice(0, 8).map(([name, count]) => ({ name, count, href: makeHref({ ai_focus: 'Not AI', theme: name }) })),
    },
    topWords: {
      all: wordStats(withLlm).map((item) => ({ ...item, href: makeHref({ q: item.word }) })),
      ai: wordStats(aiSessions).map((item) => ({ ...item, href: makeHref({ q: item.word, ai_focus: 'AI' }) })),
      notAi: wordStats(notAiSessions).map((item) => ({ ...item, href: makeHref({ q: item.word, ai_focus: 'Not AI' }) })),
    },
    companies: {
      observationHtml: companyObservationParts.map((p) => `<li>${p}</li>`).join(''),
      topNonGoogle: topNonGoogle.map(([name, count]) => ({ name, count, href: makeHref({ company: name }) })),
      minimumCount: 2,
      limit: 120,
    },
    interestingSlices: [
      { title: 'AI for Leaders', desc: 'AI through a strategy lens, not a coding one', params: { ai_focus: 'AI', audience: 'Leaders' } },
      { title: 'AI for Developers', desc: 'Hands-on AI: building, shipping, and deploying', params: { ai_focus: 'AI', audience: 'Developers' } },
      { title: 'Agents & Applied AI', desc: 'Deploying agents, voice bots, and agentic workflows', params: { theme: 'Applied AI' } },
      { title: 'AI Infrastructure', desc: 'The infrastructure powering all that AI', params: { ai_focus: 'AI', theme: 'Infra' } },
      { title: 'Security without the AI angle', desc: 'Classic security work — no AI required', params: { ai_focus: 'Not AI', theme: 'Security' } },
      { title: 'Data pros', desc: 'For the people who live in the data layer', params: { audience: 'Data pros' } },
      { title: 'Business for Leaders', desc: 'Strategy sessions for business decision-makers', params: { theme: 'Business', audience: 'Leaders' } },
    ],
  };
}

function renderHtml(summary, templateText) {
  const aiFocusCounts = summary.quickPivots.aiFocus.map((item) => [item.name, item.count]);
  const themeCounts = summary.quickPivots.themes.map((item) => [item.name, item.count]);
  const audienceCounts = summary.quickPivots.audiences.map((item) => [item.name, item.count]);
  const topThemes = summary.rankings.topThemes.map((item) => [item.name, item.count]);
  const topAudiences = summary.rankings.topAudiences.map((item) => [item.name, item.count]);
  const topAiThemes = summary.rankings.topAiThemes.map((item) => [item.name, item.count]);
  const topNotAiThemes = summary.rankings.topNotAiThemes.map((item) => [item.name, item.count]);
  const topNonGoogle = summary.companies.topNonGoogle.map((item) => [item.name, item.count]);
  const fullByCategory = summary.fullness.rankings.fullByCategory.map((item) => [item.name, item.count]);
  const notFullByCategory = summary.fullness.rankings.notFullByCategory.map((item) => [item.name, item.count]);

  const replacements = {
    '__OG_IMAGE__': esc(summary.meta.sankeyLatest),
    '__GENERATED_ON__': esc(summary.meta.generatedAt),
    '__LEDE__': esc(summary.lede),
    '__DEFAULT_SANKEY__': esc(summary.meta.sankeyLatest),
    '__STATS_HTML__': statsCardsHtml(summary.stats),
    '__FULLNESS_STATS_HTML__': statsCardsHtml(summary.fullness.stats),
    '__OBSERVATIONS_HTML__': observationListHtml(summary.observations),
    '__FULLNESS_OBSERVATIONS_HTML__': observationListHtml(summary.fullness.observations),
    '__AI_FOCUS_LINKS_HTML__': chipItemsHtml(aiFocusCounts, 'ai_focus'),
    '__THEME_LINKS_HTML__': chipItemsHtml(themeCounts, 'theme'),
    '__AUDIENCE_LINKS_HTML__': chipItemsHtml(audienceCounts, 'audience'),
    '__TOP_THEMES_HTML__': rankItemsHtml(topThemes, '#4285f4', (name) => ({ theme: name })),
    '__TOP_AUDIENCES_HTML__': rankItemsHtml(topAudiences, '#34a853', (name) => ({ audience: name })),
    '__TOP_AI_THEMES_HTML__': rankItemsHtml(topAiThemes, '#c62828', (name) => ({ ai_focus: 'AI', theme: name })),
    '__TOP_NOT_AI_THEMES_HTML__': rankItemsHtml(topNotAiThemes, '#ef6c00', (name) => ({ ai_focus: 'Not AI', theme: name })),
    '__TOP_WORDS_ALL_HTML__': wordItemsHtml(summary.topWords.all),
    '__TOP_WORDS_AI_HTML__': wordItemsHtml(summary.topWords.ai, { ai_focus: 'AI' }),
    '__TOP_WORDS_NOT_AI_HTML__': wordItemsHtml(summary.topWords.notAi, { ai_focus: 'Not AI' }),
    '__FULL_NOW_CATEGORIES_HTML__': rankItemsHtml(fullByCategory, '#c62828', () => ({ availability: 'full' })),
    '__NOT_FULL_NOW_CATEGORIES_HTML__': rankItemsHtml(notFullByCategory, '#34a853', () => ({ availability: 'not-full' })),
    '__COMPANY_OBSERVATIONS_HTML__': summary.companies.observationHtml,
    '__TOP_NON_GOOGLE_COMPANIES_HTML__': rankItemsHtml(topNonGoogle, '#6a1b9a', (name) => ({ company: name })),
    '__INTERESTING_SLICES_HTML__': slicesHtml(summary.interestingSlices),
  };

  let html = templateText;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replace(key, value);
  }
  return html;
}

function parseArgs(argv) {
  const options = {
    input: 'sessions/classified_sessions.json',
    libraryCacheDir: 'sessions/cache',
    template: 'templates/insights.template.html',
    outputHtml: 'insights.html',
    outputSummary: 'media/insights-summary.json',
    outputAvailability: null,
    sankeyIndex: 'media/sankey-index.json',
    generatedAt: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[++index];
    else if (arg === '--library-cache-dir') options.libraryCacheDir = argv[++index];
    else if (arg === '--template') options.template = argv[++index];
    else if (arg === '--output-html') options.outputHtml = argv[++index];
    else if (arg === '--output-summary') options.outputSummary = argv[++index];
    else if (arg === '--output-availability') options.outputAvailability = argv[++index];
    else if (arg === '--sankey-index') options.sankeyIndex = argv[++index];
    else if (arg === '--generated-at') options.generatedAt = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const inputPath = path.resolve(repoRoot, args.input);
  const libraryCacheDir = path.resolve(repoRoot, args.libraryCacheDir);
  const templatePath = path.resolve(repoRoot, args.template);
  const outputHtmlPath = path.resolve(repoRoot, args.outputHtml);
  const outputSummaryPath = path.resolve(repoRoot, args.outputSummary);
  const outputAvailabilityPath = path.resolve(
    repoRoot,
    args.outputAvailability || path.join(path.dirname(args.outputSummary), 'session-availability.json'),
  );
  const sankeyIndexPath = path.resolve(repoRoot, args.sankeyIndex);

  const sessionsPayload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const baseSessions = Array.isArray(sessionsPayload) ? sessionsPayload : sessionsPayload.sessions;
  const availabilityRecords = loadLibraryAvailabilityRecords(libraryCacheDir);
  const sessions = mergeAvailabilityIntoSessions(baseSessions, availabilityRecords);
  let sankeyLatest = '';
  if (fs.existsSync(sankeyIndexPath)) {
    sankeyLatest = JSON.parse(fs.readFileSync(sankeyIndexPath, 'utf8')).latest || '';
  }
  if (!sankeyLatest) {
    sankeyLatest = './media/fhoffa.github.io_google-cloud-next-2026-unofficial-scrape_sankey_20260331.png';
  }

  const generatedAt = args.generatedAt || new Date().toISOString();
  const summary = buildSummary(sessions, sankeyLatest, generatedAt, args.libraryCacheDir);
  const html = renderHtml(summary, fs.readFileSync(templatePath, 'utf8'));
  const availabilityArtifact = createAvailabilityArtifact(availabilityRecords, { generatedAt });

  fs.mkdirSync(path.dirname(outputSummaryPath), { recursive: true });
  fs.mkdirSync(path.dirname(outputAvailabilityPath), { recursive: true });
  fs.writeFileSync(outputSummaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(outputAvailabilityPath, `${JSON.stringify(availabilityArtifact, null, 2)}\n`);
  fs.writeFileSync(outputHtmlPath, html);

  process.stdout.write(`${outputSummaryPath}\n${outputAvailabilityPath}\n${outputHtmlPath}\n`);
}

main();
