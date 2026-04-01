#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalCompanyName, isGoogleInternalCompany } from '../lib/company-identity.mjs';
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
    return `<div class="card"><div class="stat-value">${esc(card.value)}</div><div class="stat-label">${esc(card.label)}</div>${sub}${note}</div>`;
  }).join('');
}

function observationListHtml(items) {
  return items.map((item) => `<li>${item}</li>`).join('');
}

function slicesHtml(items) {
  return items.map((item) => `<a class="slice-link" href="${esc(makeHref(item.params))}"><strong>${esc(item.title)}</strong><span>${esc(item.desc)}</span></a>`).join('');
}

function buildSummary(sessions, sankeyLatest, generatedAt) {
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

  const companyObservationParts = [];
  if (topCompany) {
    companyObservationParts.push(`<strong>${esc(topCompany[0])}</strong> leads all non-Google companies with <strong>${topCompany[1]}</strong> sessions — a persistent presence throughout the program.`);
  }
  if (consultingTotal > 0) {
    const firmList = CONSULTING_FIRMS.filter((name) => topNonGoogle.find(([n]) => n === name)).join(', ');
    companyObservationParts.push(`The major consulting firms (${firmList}) add up to <strong>${consultingTotal} sessions combined</strong> — more than any individual non-Google company. A big slice of the conference is about enterprise adoption, with consultants as the delivery vehicle.`);
  }
  if (anthropicCount > 0) {
    companyObservationParts.push(`<strong>Anthropic</strong> appears ${anthropicCount} times — Google's AI model investment shows up on stage as a first-class partner, not a footnote.`);
  }
  companyObservationParts.push('Frequency is the signal — five, ten, twenty sessions means Google put this company on stage repeatedly for a reason.');

  const leaderShare = audiences.find(([name]) => name === 'Leaders')?.[1] || 0;
  const devShare = audiences.find(([name]) => name === 'Developers')?.[1] || 0;
  const topAiTheme = aiThemes[0] || ['n/a', 0];
  const topNotAiTheme = notAiThemes[0] || ['n/a', 0];
  const observationsHtml = [
    `<strong>${((aiCount / Math.max(1, total)) * 100).toFixed(1)}%</strong> of the entire catalog is AI — ${aiCount} of ${total} sessions.`,
    `<strong>${esc(themes[0]?.[0] || 'n/a')}</strong> is the most common theme at <strong>${themes[0]?.[1] || 0}</strong> sessions, spanning both AI and non-AI content.`,
    `Inside AI, <strong>${esc(topAiTheme[0])}</strong> leads at ${topAiTheme[1]} sessions — builders are clearly the primary target.`,
    `Outside AI, <strong>${esc(topNotAiTheme[0])}</strong> takes the top spot with ${topNotAiTheme[1]} sessions.`,
    `<strong>${leaderShare >= devShare ? 'Leaders' : 'Developers'}</strong> get slightly more sessions than ${leaderShare >= devShare ? 'developers' : 'leaders'} (${Math.max(leaderShare, devShare)} vs ${Math.min(leaderShare, devShare)}).`,
    ...(consultingTotal > 0 ? [`The major consulting firms together account for <strong>${consultingTotal} sessions</strong> — more than any single non-Google company on the list.`] : []),
  ];

  return {
    meta: {
      generatedAt,
      source: 'sessions/classified_sessions.json',
      template: 'templates/insights.template.html',
      outputHtml: 'insights.html',
      sankeyLatest,
      generator: 'scripts/generate_insights.mjs',
      wordRules: 'config/word-rules.json',
    },
    lede: 'Nine out of ten sessions at Google Cloud Next 2026 are about AI. This page breaks down what that actually means — and what\'s waiting in the other 10%.',
    stats: [
      { value: total.toLocaleString(), label: 'Total sessions', note: `Across all formats — keynotes, breakouts, workshops, and labs.` },
      { value: `${Math.round((aiCount / Math.max(1, total)) * 100)}%`, label: 'AI share of the conference', sub: `${aiCount.toLocaleString()} AI · ${notAiCount.toLocaleString()} not AI`, note: `For every non-AI session, there are roughly ${Math.round(aiCount / Math.max(1, notAiCount))} AI ones.` },
      { value: themes[0]?.[0] || 'n/a', label: 'Largest theme', sub: `${themes[0]?.[1] || 0} sessions`, note: `Spans both AI and non-AI content — building things is the dominant conference mode.` },
      { value: audiences[0]?.[0] || 'n/a', label: 'Largest audience', sub: `${audiences[0]?.[1] || 0} sessions`, note: `Slightly ahead of Developers (${Math.min(leaderShare, devShare)} sessions) — the conference leans executive.` },
      { value: nonGoogleCompanyCount.toLocaleString(), label: 'Non-Google companies represented', note: `Most appear once. A handful show up 10+ times and are part of the conference narrative.` },
    ],
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
      observationHtml: companyObservationParts.join(' '),
      topNonGoogle: topNonGoogle.map(([name, count]) => ({ name, count, href: makeHref({ company: name }) })),
      minimumCount: 2,
      limit: 120,
    },
    interestingSlices: [
      { title: 'AI for Leaders', desc: 'AI through a strategy lens, not a coding one', params: { ai_focus: 'AI', audience: 'Leaders' } },
      { title: 'AI for Developers', desc: 'Hands-on AI: building, shipping, and deploying', params: { ai_focus: 'AI', audience: 'Developers' } },
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

  const replacements = {
    '__OG_IMAGE__': esc(summary.meta.sankeyLatest),
    '__GENERATED_ON__': esc(summary.meta.generatedAt),
    '__LEDE__': esc(summary.lede),
    '__DEFAULT_SANKEY__': esc(summary.meta.sankeyLatest),
    '__STATS_HTML__': statsCardsHtml(summary.stats),
    '__OBSERVATIONS_HTML__': observationListHtml(summary.observations),
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
    template: 'templates/insights.template.html',
    outputHtml: 'insights.html',
    outputSummary: 'media/insights-summary.json',
    sankeyIndex: 'media/sankey-index.json',
    generatedAt: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[++index];
    else if (arg === '--template') options.template = argv[++index];
    else if (arg === '--output-html') options.outputHtml = argv[++index];
    else if (arg === '--output-summary') options.outputSummary = argv[++index];
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
  const templatePath = path.resolve(repoRoot, args.template);
  const outputHtmlPath = path.resolve(repoRoot, args.outputHtml);
  const outputSummaryPath = path.resolve(repoRoot, args.outputSummary);
  const sankeyIndexPath = path.resolve(repoRoot, args.sankeyIndex);

  const sessionsPayload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const sessions = Array.isArray(sessionsPayload) ? sessionsPayload : sessionsPayload.sessions;
  let sankeyLatest = '';
  if (fs.existsSync(sankeyIndexPath)) {
    sankeyLatest = JSON.parse(fs.readFileSync(sankeyIndexPath, 'utf8')).latest || '';
  }
  if (!sankeyLatest) {
    sankeyLatest = './media/fhoffa.github.io_google-cloud-next-2026-unofficial-scrape_sankey_20260331.png';
  }

  const generatedAt = args.generatedAt || new Date().toISOString();
  const summary = buildSummary(sessions, sankeyLatest, generatedAt);
  const html = renderHtml(summary, fs.readFileSync(templatePath, 'utf8'));

  fs.mkdirSync(path.dirname(outputSummaryPath), { recursive: true });
  fs.writeFileSync(outputSummaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(outputHtmlPath, html);

  process.stdout.write(`${outputSummaryPath}\n${outputHtmlPath}\n`);
}

main();
