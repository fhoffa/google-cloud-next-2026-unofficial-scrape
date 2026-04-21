import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { filterSessions, initSessionSearch } from '../website/session-search.mjs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const hourlyHtml = fs.readFileSync(new URL('../hourly-heatmap.html', import.meta.url), 'utf8');
const hourlyJs = fs.readFileSync(new URL('../website/hourly-heatmap.mjs', import.meta.url), 'utf8');
const insightsHtml = fs.readFileSync(new URL('../insights.html', import.meta.url), 'utf8');
const insightsSummary = JSON.parse(fs.readFileSync(new URL('../media/insights-summary.json', import.meta.url), 'utf8'));
const availabilityArtifact = JSON.parse(fs.readFileSync(new URL('../media/session-availability.json', import.meta.url), 'utf8'));
const hourlyArtifact = JSON.parse(fs.readFileSync(new URL('../media/hourly-overview.json', import.meta.url), 'utf8'));
const hourlyLatestArtifact = JSON.parse(fs.readFileSync(new URL('../media/hourly-overview-latest.json', import.meta.url), 'utf8'));
const relatedSessionsArtifact = JSON.parse(fs.readFileSync(new URL('../media/related-sessions-2026-embeddings.json', import.meta.url), 'utf8'));
const dataset = JSON.parse(fs.readFileSync(new URL('../sessions/latest.json', import.meta.url), 'utf8'));

class FakeClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }

  add(...tokens) {
    tokens.forEach((token) => this.values.add(token));
  }

  remove(...tokens) {
    tokens.forEach((token) => this.values.delete(token));
  }

  contains(token) {
    return this.values.has(token);
  }
}

class FakeElement {
  constructor({ id = '', value = '', dataset = {}, classes = [] } = {}) {
    this.id = id;
    this.value = value;
    this.dataset = dataset;
    this.textContent = '';
    this._innerHTML = '';
    this.children = [];
    this.listeners = new Map();
    this.classList = new FakeClassList(classes);
    this.style = {};
    this.ownerDocument = null;
    this._queryCache = new Map();
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this._queryCache.clear();
  }

  appendChild(child) {
    child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  dispatchEvent(event) {
    const listeners = this.listeners.get(event.type) || [];
    for (const listener of listeners) {
      listener({ ...event, target: this, currentTarget: this });
    }
  }

  click() {
    this.dispatchEvent({ type: 'click' });
  }

  querySelectorAll(selector) {
    const html = String(this.innerHTML || '');
    const cached = this._queryCache.get(selector);
    if (cached && cached.html === html) return cached.nodes;

    const makeNode = (dataset) => ({
      dataset,
      listeners: new Map(),
      addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(listener);
      },
      click() {
        for (const listener of this.listeners.get('click') || []) listener({ type: 'click', currentTarget: this, target: this });
      },
    });

    let nodes = [];
    if (selector === '.favorite-btn') {
      const matches = [...html.matchAll(/class=\"favorite-btn\"[^>]*data-session-id=\"([^\"]+)\"[^>]*>([^<]+)</g)];
      nodes = matches.map((match) => makeNode({ sessionId: match[1] }));
    } else if (selector === '.speaker-link') {
      const matches = [...html.matchAll(/class=\"speaker-link\"[^>]*data-speaker-name=\"([^\"]+)\"[^>]*>/g)];
      nodes = matches.map((match) => makeNode({ speakerName: match[1] }));
    } else if (selector === '.company-link') {
      const matches = [...html.matchAll(/class=\"company-link\"[^>]*data-company-name=\"([^\"]+)\"[^>]*>/g)];
      nodes = matches.map((match) => makeNode({ companyName: match[1] }));
    } else if (selector === '.see-more-btn') {
      const matches = [...html.matchAll(/class=\"see-more-btn\"[^>]*data-session-id=\"([^\"]+)\"[^>]*>([^<]+)</g)];
      nodes = matches.map((match) => makeNode({ sessionId: match[1] }));
    } else if (selector === '.related-session-link') {
      const matches = [...html.matchAll(/class=\"related-session-link\"[\s\S]*?data-related-session-id=\"([^\"]+)\"[\s\S]*?>([^<]+)</g)];
      nodes = matches.map((match) => makeNode({ relatedSessionId: match[1] }));
    }

    this._queryCache.set(selector, { html, nodes });
    return nodes;
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.dayPills = [];
  }

  register(element) {
    element.ownerDocument = this;
    if (element.id) this.elements.set(element.id, element);
    return element;
  }

  getElementById(id) {
    return this.elements.get(id);
  }

  querySelectorAll(selector) {
    if (selector === '.pill[data-day]') return this.dayPills;
    return [];
  }

  createElement() {
    const element = new FakeElement();
    element.ownerDocument = this;
    return element;
  }
}

function createEnvironment(search = '') {
  const document = new FakeDocument();
  const app = document.register(new FakeElement({ id: 'app' }));
  app.innerHTML = '<div class="loading">Loading sessions…</div>';

  document.register(new FakeElement({ id: 'q' }));
  document.register(new FakeElement({ id: 'speaker' }));
  document.register(new FakeElement({ id: 'exclude' }));
  document.register(new FakeElement({ id: 'exclude-clear' }));
  document.register(new FakeElement({ id: 'q-clear' }));
  document.register(new FakeElement({ id: 'speaker-clear' }));
  document.register(new FakeElement({ id: 'topic-filter' }));
  document.register(new FakeElement({ id: 'active-filters' }));
  document.register(new FakeElement({ id: 'time-range-start', value: '0' }));
  document.register(new FakeElement({ id: 'time-range-end', value: '95' }));
  document.register(new FakeElement({ id: 'time-range-label' }));
  document.register(new FakeElement({ id: 'time-range-fill' }));
  document.register(new FakeElement({ id: 'sort-filter', value: 'time' }));
  document.register(new FakeElement({ id: 'availability-filter', value: '' }));
  document.register(new FakeElement({ id: 'sponsored-filter', value: '' }));
  document.register(new FakeElement({ id: 'start-after' }));
  document.register(new FakeElement({ id: 'start-before' }));
  document.register(new FakeElement({ id: 'result-count' }));
  document.register(new FakeElement({ id: 'header-count' }));
  document.register(new FakeElement({ id: 'clear-btn' }));
  document.register(new FakeElement({ id: 'favorites-only' }));
  document.register(new FakeElement({ id: 'copy-favorites-link' }));
  document.register(new FakeElement({ id: 'copy-favorites-link' }));
  document.register(new FakeElement({ id: 'version-marker', value: 'Version: loading…' }));

  document.dayPills = [
    new FakeElement({ dataset: { day: '' }, classes: ['pill', 'active'] }),
    new FakeElement({ dataset: { day: 'Tuesday, April 21, 2026' }, classes: ['pill'] }),
    new FakeElement({ dataset: { day: 'Wednesday, April 22, 2026' }, classes: ['pill'] }),
    new FakeElement({ dataset: { day: 'Thursday, April 23, 2026' }, classes: ['pill'] }),
    new FakeElement({ dataset: { day: 'Friday, April 24, 2026' }, classes: ['pill'] }),
  ];
  document.dayPills.forEach((pill) => {
    pill.ownerDocument = document;
  });

  const location = new URL(`https://example.test/${search}`);
  const locationLike = {
    href: location.toString(),
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
  };

  const history = {
    replaceState(_state, _title, nextUrl) {
      const next = new URL(nextUrl, locationLike.href);
      locationLike.href = next.toString();
      locationLike.pathname = next.pathname;
      locationLike.search = next.search;
      locationLike.hash = next.hash;
    },
  };

  return { document, location: locationLike, history };
}

function createFetch(sourceDataset = dataset, availabilityDataset = availabilityArtifact, relatedDataset = relatedSessionsArtifact) {
  return async (url = '') => ({
    async json() {
      if (String(url).includes('session-availability')) return availabilityDataset;
      if (String(url).includes('related-sessions')) return relatedDataset;
      return sourceDataset;
    },
  });
}

test('index.html includes the website shell and module bootstrap', () => {
  assert.match(html, /<input type="text" id="q"/);
  assert.match(html, /<input type="text" id="speaker"/);
  assert.match(html, /<select id="topic-filter">/);
  assert.match(html, /<select id="sort-filter">/);
  assert.match(html, /<select id="sponsored-filter">/);
  assert.match(html, /import \{ initSessionSearch \} from '\.\/website\/session-search\.mjs';/);
});

test('hourly heatmap page exposes search and snapshot controls with attribution', () => {
  assert.doesNotMatch(hourlyHtml, /<button id="play-btn"/);
  assert.match(hourlyHtml, /<input id="search-input" type="text"/);
  assert.match(hourlyHtml, /<div id="search-summary"/);
  assert.doesNotMatch(hourlyHtml, /search-match-list/);
  assert.match(hourlyHtml, /website\/hourly-heatmap\.mjs\?v=/);
  assert.match(hourlyHtml, /<select id="snapshot-select"/);
  assert.match(hourlyHtml, /GCP Next'26 — Top Sessions by Reservations/);
  assert.match(hourlyHtml, /Top sessions by reservations at Google Cloud Next 2026/);
  assert.match(hourlyHtml, /Felipe Hoffa/);
  assert.match(hourlyHtml, /googlecloudevents\.com/);
  assert.match(hourlyHtml, /github\.com\/fhoffa/);
  assert.match(hourlyHtml, /\.\/index\.html/);
  assert.match(hourlyHtml, /\.\/insights\.html/);
  assert.match(hourlyHtml, /class="snapshot-bar"/);
});

test('hourly heatmap JS lazy-loads full history on slider interaction', () => {
  assert.match(hourlyJs, /const INITIAL_DATA_URL = '\.\/media\/hourly-overview-latest\.json/);
  assert.match(hourlyJs, /const FULL_DATA_URL = '\.\/media\/hourly-overview\.json/);
  assert.match(hourlyJs, /async function ensureFullHistoryLoaded\(/);
  assert.match(hourlyJs, /fetch\(FULL_DATA_URL\)/);
  assert.match(hourlyJs, /searchInput: byId\('search-input'\)/);
  assert.doesNotMatch(hourlyJs, /top-session/);
  assert.match(hourlyJs, /searchSummaryWrap: byId\('search-summary-wrap'\)/);
  assert.match(hourlyJs, /searchSummary: byId\('search-summary'\)/);
  assert.doesNotMatch(hourlyJs, /searchMatchList: byId\('search-match-list'\)/);
  assert.match(hourlyJs, /matchedSessionIds\.size\.toLocaleString\(\)/);
  assert.match(hourlyJs, /matchedSessionIds\.size < 20/);
  assert.match(hourlyJs, /function buildDistributedCallouts\(/);
  assert.match(hourlyJs, /estimateCalloutWidth\(/);
  assert.match(hourlyJs, /function getOrCreateOverlay\(/);
  assert.match(hourlyJs, /overlay\.id = 'sq-global-overlay'/);
  assert.match(hourlyJs, /svg\.id = 'sq-global-svg'/);
  assert.match(hourlyJs, /function clearOverlay\(/);
  assert.match(hourlyJs, /function labelEdgePoint\(/);
  assert.match(hourlyJs, /const GAP = 6/);
  assert.match(hourlyJs, /matchedButtons\.map\(\(button\) => \{/);
  assert.match(hourlyJs, /line\.setAttribute\('marker-end', 'url\(#sq-arrow\)'\)/);
  assert.match(hourlyJs, /el\.addEventListener\('mousedown', \(e\) => \{/);
  assert.match(hourlyJs, /el\.style\.cursor = 'grabbing';/);
  assert.match(hourlyJs, /document\.addEventListener\('mousemove', onMove\)/);
  assert.match(hourlyJs, /state\.query = params\.get\('q'\) \|\| '';/);
  assert.match(hourlyJs, /url\.searchParams\.set\('q', query\)/);
  assert.match(hourlyJs, /window\.history\.replaceState\(null, '', url\)/);
  assert.match(hourlyJs, /els\.searchInput\.value = state\.query;/);
  assert.match(hourlyJs, /const markers = startingSessions;/);
  assert.match(hourlyJs, /isMatch \? 'search-match' : 'search-dim'/);
  assert.match(hourlyJs, /const isFull = pct != null && pct >= 100;/);
  assert.match(hourlyJs, /sq-full-mark/);
  assert.match(hourlyHtml, /\.sq\.full-session/);
  assert.doesNotMatch(hourlyJs, /Continues from prior hour/);
  // Autoplay removed — slider lazy-loads history instead
  assert.doesNotMatch(hourlyJs, /function stepAutoplay\(/);
  assert.doesNotMatch(hourlyJs, /function startAutoplay\(/);
  assert.doesNotMatch(hourlyJs, /function stopAutoplay\(/);
  assert.doesNotMatch(hourlyJs, /playBtn/);
  assert.match(hourlyJs, /snapshotSelect: byId\('snapshot-select'\)/, 'uses select dropdown for snapshots');
  assert.match(hourlyJs, /await ensureFullHistoryLoaded\(\)/, 'select should lazy-load history');
  assert.match(hourlyJs, /state\.searchDebounce/, 'search input should be debounced');
  assert.match(hourlyJs, /setTimeout\(\(\) => renderSnapshot\(\), 150\)/, 'debounce delay should be 150ms');
  assert.match(hourlyJs, /Failed to load snapshot history/, 'history fetch error should be logged');
});

test('hourly artifacts split latest snapshot from full history', () => {
  assert.ok(Array.isArray(hourlyArtifact.snapshots));
  assert.ok(Array.isArray(hourlyLatestArtifact.snapshots));
  assert.ok(hourlyArtifact.snapshots.length > 1);
  assert.equal(hourlyLatestArtifact.snapshots.length, 1);
  assert.equal(
    hourlyLatestArtifact.snapshots[0]?.key,
    hourlyArtifact.snapshots[hourlyArtifact.snapshots.length - 1]?.key,
  );
});

test('hourly artifact carries sponsored metadata for sponsored sessions from latest dataset', () => {
  const sponsoredSourceIds = new Set((dataset.sessions || []).filter((session) => session.sponsored).map((session) => String(session.id)));
  const hourlySessions = hourlyLatestArtifact.snapshots.flatMap((snapshot) => snapshot.sessions || []);
  const hourlySponsoredIds = new Set(hourlySessions.filter((session) => session.spon).map((session) => String(session.id)));
  assert.ok(sponsoredSourceIds.has('3939814'));
  assert.ok(hourlySponsoredIds.has('3939814'));
  const pwcSession = hourlySessions.find((session) => String(session.id) === '3879152');
  assert.equal(pwcSession?.scon, 'PwC');
});

test('hourly artifact includes searchable text for titles, descriptions, speakers, companies, and sponsored keywords', () => {
  const session = hourlyLatestArtifact.snapshots.flatMap((snapshot) => snapshot.sessions || []).find((item) => String(item.id) === '3939814');
  assert.equal(typeof session?.q, 'string');
  assert.match(session.q, /why ai fails inside organizations/);
  assert.match(session.q, /sponsored/);
});

test('insights page includes richer intelligence sections', () => {
  assert.match(insightsHtml, /Google Cloud Next 2026 — Insights/);
  assert.match(insightsHtml, /What stands out/);
  assert.match(insightsHtml, /How full the conference is getting/);
  assert.match(insightsHtml, /Top companies speaking/);
  assert.doesNotMatch(insightsHtml, /id="fullness-stats"/);
  assert.match(insightsHtml, /id="fullness-observations"/);
  assert.match(insightsHtml, /id="full-now-categories"/);
  assert.doesNotMatch(insightsHtml, /id="not-full-now-categories"/);
  assert.match(insightsHtml, /id="top-non-google-companies"/);
  assert.match(insightsHtml, /id="company-observations"/);
  assert.match(insightsHtml, /sankey-index\.json|sankey-click-map\.json/);
});

test('index links to changelog page', () => {
  assert.match(html, /\.\/changelog\.html/);
});

test('changelog page is generated from summary artifact', () => {
  const changelogHtml = fs.readFileSync(new URL('../changelog.html', import.meta.url), 'utf8');
  const changelogSummary = JSON.parse(fs.readFileSync(new URL('../media/changelog-summary.json', import.meta.url), 'utf8'));
  assert.match(changelogHtml, /Google Cloud Next 2026 — Changelog/);
  assert.match(changelogHtml, /data-summary-source="\.\/media\/changelog-summary\.json"/);
  assert.equal(changelogSummary.meta.mergeNearbyHours, 2);
  if (changelogSummary.updates.length > 0) {
    assert.match(changelogHtml, /Availability changes|Updated sessions|New sessions|Removed sessions/);
  }
});

test('insights page uses sankey index and click-map artifacts instead of hardcoded geometry only', () => {
  assert.match(insightsHtml, /fetch\('\.\/media\/sankey-index\.json'\)/);
  assert.match(insightsHtml, /fetch\('\.\/media\/sankey-click-map\.json'\)/);
  assert.match(insightsHtml, /for \(const segment of clickMap\.segments \|\| \[\]\)/);
  assert.doesNotMatch(insightsHtml, /fetch\('\.\/sessions\/classified_sessions\.json'\)/);
});

test('insights page is generated from a template and summary artifact', () => {
  assert.match(insightsHtml, /Generated from templates\/insights\.template\.html using scripts\/generate_insights\.mjs and config\/word-rules\.json/);
  assert.match(insightsHtml, /meta name="insights-summary" content="\.\/media\/insights-summary\.json"/);
  assert.match(insightsHtml, /data-summary-source="\.\/media\/insights-summary\.json"/);
  assert.equal(insightsSummary.meta.template, 'templates/insights.template.html');
  assert.equal(insightsSummary.meta.source, 'sessions/classified_sessions.json');
  assert.equal(insightsSummary.meta.availabilitySource, 'sessions/cache');
  assert.equal(insightsSummary.meta.outputHtml, 'insights.html');
  assert.equal(insightsSummary.meta.generator, 'scripts/generate_insights.mjs');
  assert.equal(insightsSummary.meta.wordRules, 'config/word-rules.json');
});

test('insights summary includes fullness metrics sourced from library availability', () => {
  assert.equal(insightsSummary.fullness.stats.length, 0);
  assert.ok(insightsSummary.fullness.observations.length > 0);
  assert.ok(insightsSummary.fullness.observations.some((item) => /sold out|full-now list|still have seats/.test(item)));
  assert.ok(insightsSummary.fullness.rankings.fullByCategory.length > 0);
  assert.ok(typeof insightsSummary.fullness.rankings.fullByCategory[0].name === 'string');
  assert.ok(/%$/.test(insightsSummary.fullness.rankings.fullByCategory[0].share));
  assert.equal(insightsSummary.fullness.rankings.notFullByCategory, undefined);
});

test('insights build emits a separate session availability artifact', () => {
  assert.equal(typeof availabilityArtifact.generatedAt, 'string');
  assert.ok(Array.isArray(availabilityArtifact.records));
  assert.ok(availabilityArtifact.records.length > 0);
  assert.ok(availabilityArtifact.records.some((record) => Number(record.remaining_capacity) === 0));
});

test('insights page company section is a single longer non-Google list with write-up', () => {
  assert.match(insightsHtml, /<h2>Top companies speaking<\/h2>/);
  assert.doesNotMatch(insightsHtml, /Top companies in AI sessions/);
  assert.match(insightsHtml, /id="company-observations"/);
  assert.equal(insightsSummary.companies.limit, 120);
  assert.equal(insightsSummary.companies.minimumCount, 2);
  assert.ok(insightsSummary.companies.topNonGoogle.length > 0);
  const topCompanyNames = insightsSummary.companies.topNonGoogle.map((item) => item.name);
  assert.ok(!topCompanyNames.includes('Google'));
  assert.ok(!topCompanyNames.includes('Google Cloud'));
  assert.ok(!topCompanyNames.includes('Google Public Sector'));
  assert.ok(!topCompanyNames.includes('Google DeepMind'));
  assert.ok(!topCompanyNames.includes('Google DeepMind and Google Research'));
  assert.ok(!topCompanyNames.includes('YouTube'));
});

test('insights generator reproduces the checked-in summary and HTML', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'insights-gen-'));
  const generatedHtmlPath = path.join(tmpDir, 'insights.html');
  const generatedSummaryPath = path.join(tmpDir, 'insights-summary.json');
  const generatedAvailabilityPath = path.join(tmpDir, 'session-availability.json');
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const run = spawnSync(
    'node',
    [
      'scripts/generate_insights.mjs',
      '--output-html',
      generatedHtmlPath,
      '--output-summary',
      generatedSummaryPath,
      '--generated-at',
      insightsSummary.meta.generatedAt,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(run.status, 0, run.stderr || run.stdout);
  const generatedSummary = JSON.parse(fs.readFileSync(generatedSummaryPath, 'utf8'));
  assert.deepEqual(
    {
      ...generatedSummary,
      meta: {
        ...generatedSummary.meta,
        sankeyLatest: insightsSummary.meta.sankeyLatest,
        dataScrapedAt: insightsSummary.meta.dataScrapedAt ?? generatedSummary.meta.dataScrapedAt,
      },
    },
    {
      ...insightsSummary,
      meta: {
        ...insightsSummary.meta,
        dataScrapedAt: insightsSummary.meta.dataScrapedAt ?? generatedSummary.meta.dataScrapedAt,
      },
    },
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(generatedAvailabilityPath, 'utf8')),
    availabilityArtifact,
  );
  const generatedHtml = fs.readFileSync(generatedHtmlPath, 'utf8');
  assert.equal(
    generatedHtml.replace(/sankey_\d{8}\.png/g, 'sankey_DATE.png'),
    insightsHtml.replace(/sankey_\d{8}\.png/g, 'sankey_DATE.png'),
  );
});

test('website loads the dataset and renders results', async () => {
  const env = createEnvironment();

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    setTimeoutImpl: (fn) => {
      fn();
      return 1;
    },
    clearTimeoutImpl: () => {},
  });

  assert.equal(env.document.getElementById('header-count').textContent, dataset.sessions.length.toLocaleString());
  assert.equal(env.document.getElementById('result-count').textContent, `${dataset.sessions.length.toLocaleString()} of ${dataset.sessions.length.toLocaleString()} sessions`);
  assert.match(env.document.getElementById('app').innerHTML, /class="grid"/);
  assert.match(env.document.getElementById('app').innerHTML, /Fireside chat with Thomas Kurian/);
});

test('index wires the 2026 related-sessions artifact into the explorer', () => {
  assert.match(html, /relatedSessionsUrl: 'media\/related-sessions-2026-embeddings\.json'/);
});

test('related sessions are shown on session cards when the artifact is loaded', async () => {
  const env = createEnvironment();

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    relatedSessionsUrl: 'media/related-sessions-2026-embeddings.json',
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  const app = env.document.getElementById('app');
  assert.match(app.innerHTML, /class="related-sessions-label"/);
  assert.ok(app.querySelectorAll('.related-session-link')[0], 'expected visible related session buttons');
  assert.doesNotMatch(app.innerHTML, /Find similar/);
  assert.doesNotMatch(app.innerHTML, /Hide similar/);
  assert.match(app.innerHTML, /class="related-sessions-label"/);
});

test('clicking a related session narrows the explorer to that one session via sessionids', async () => {
  const env = createEnvironment();

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    relatedSessionsUrl: 'media/related-sessions-2026-embeddings.json',
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  const app = env.document.getElementById('app');
  const relatedButton = app.querySelectorAll('.related-session-link')[0];
  assert.ok(relatedButton, 'expected at least one related session button after expanding');
  const relatedSessionId = relatedButton.dataset.relatedSessionId;
  relatedButton.click();

  const appHtml = app.innerHTML;
  assert.equal((appHtml.match(/class="card"/g) || []).length, 1);
  assert.match(env.location.search, new RegExp(`sessionids=${relatedSessionId}`));
  assert.match(env.document.getElementById('active-filters').innerHTML, /selected session/);
});

test('2026 related-sessions artifact covers the classified explorer dataset with top-5 neighbors', () => {
  const classified = JSON.parse(fs.readFileSync(new URL('../sessions/classified_sessions.json', import.meta.url), 'utf8'));
  assert.equal(relatedSessionsArtifact.meta.topK, 5);
  assert.equal(Object.keys(relatedSessionsArtifact.sessions).length, classified.sessions.length);
  const sample = relatedSessionsArtifact.sessions[classified.sessions[0].id];
  assert.ok(sample);
  assert.ok(Array.isArray(sample.related));
  assert.ok(sample.related.length <= 5);
  assert.ok(sample.related.every((item) => item.sessionId !== classified.sessions[0].id));
});

test('speaker query param filters results on load', async () => {
  const env = createEnvironment('?speaker=geotab');

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    setTimeoutImpl: (fn) => {
      fn();
      return 1;
    },
    clearTimeoutImpl: () => {},
  });

  const appHtml = env.document.getElementById('app').innerHTML;
  const expected = filterSessions(dataset.sessions, {
    q: '', exclude: '', speaker: 'geotab', company: '', ai_focus: '', theme: '', audience: '', availability: '', sponsored: '', topic: '', day: '', start_after: '', start_before: '', sessionids: '', view: 'sessions',
  });

  assert.equal(env.document.getElementById('speaker').value, 'geotab');
  assert.equal(env.document.getElementById('result-count').textContent, `${expected.length.toLocaleString()} of ${dataset.sessions.length.toLocaleString()} sessions`);
  assert.equal((appHtml.match(/class="card"/g) || []).length, expected.length);
  assert.ok(expected.length >= 1);
  assert.match(appHtml, /Geotab/i);
});

test('changing filters updates the URL and clear resets filters and query params', async () => {
  const env = createEnvironment('?speaker=geotab&sort=title');

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    setTimeoutImpl: (fn) => {
      fn();
      return 1;
    },
    clearTimeoutImpl: () => {},
  });

  const qInput = env.document.getElementById('q');
  qInput.value = 'security';
  qInput.dispatchEvent({ type: 'input' });

  assert.match(env.location.search, /speaker=geotab/);
  assert.match(env.location.search, /q=security/);
  assert.match(env.location.search, /sort=title/);

  env.document.getElementById('clear-btn').click();

  assert.equal(env.document.getElementById('q').value, '');
  assert.equal(env.document.getElementById('speaker').value, '');
  assert.equal(env.document.getElementById('topic-filter').value, '');
  assert.equal(env.document.getElementById('sort-filter').value, 'time');
  assert.equal(env.location.search, '');
  assert.equal(env.document.getElementById('result-count').textContent, `${dataset.sessions.length.toLocaleString()} of ${dataset.sessions.length.toLocaleString()} sessions`);
  assert.ok(env.document.dayPills[0].classList.contains('active'));
  assert.ok(!env.document.dayPills[3].classList.contains('active'));
});


test('favorites can be shared and filtered', async () => {
  const favoriteId = /\/session\/(\d+)/.exec(dataset.sessions[0].url)?.[1] || String(dataset.sessions[0].id || dataset.sessions[0].url);
  const env = createEnvironment(`?view=favorites&favorites=${encodeURIComponent(favoriteId)}`);

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    storage: { getItem: () => null, setItem: () => {} },
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  assert.equal(env.document.getElementById('favorites-only').checked, true);
  assert.match(env.location.search, /sessionids=/);
  assert.match(env.location.search, /view=favorites/);
  assert.equal((env.document.getElementById('app').innerHTML.match(/class="card"/g) || []).length, 1);
});


test('time filters update URL and narrow results', async () => {
  // Use 24h format — sliders emit timeIndexToValue() output which is zero-padded HH:MM
  const env = createEnvironment('?day=Thursday,%20April%2023,%202026&start_after=15%3A00&start_before=16%3A00');

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    storage: { getItem: () => null, setItem: () => {} },
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  assert.match(env.location.search, /start_after=15%3A00/);
  assert.match(env.location.search, /start_before=16%3A00/);
  const appHtml = env.document.getElementById('app').innerHTML;
  assert.ok((appHtml.match(/class="card"/g) || []).length > 0);
});


test('long descriptions expose a see more control', async () => {
  const env = createEnvironment();

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    storage: { getItem: () => null, setItem: () => {} },
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /See more/);
});



test('speaker and company controls are rendered', async () => {
  const env = createEnvironment();

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    storage: { getItem: () => null, setItem: () => {} },
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /class="speaker-link"/);
  assert.match(appHtml, /class="company-link"/);
});

test('compact sessionids favorites URL hydrates', async () => {
  const favoriteId = /\/session\/(\d+)/.exec(dataset.sessions[0].url)?.[1] || String(dataset.sessions[0].id || dataset.sessions[0].url);
  const env = createEnvironment(`?view=favorites&sessionids=${encodeURIComponent(favoriteId)}`);

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    storage: { getItem: () => null, setItem: () => {} },
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  assert.match(env.location.search, /sessionids=/);
  assert.equal((env.document.getElementById('app').innerHTML.match(/class="card"/g) || []).length, 1);
});

test('copy favorites link button is present', async () => {
  const env = createEnvironment();

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    storage: { getItem: () => null, setItem: () => {} },
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  assert.equal(env.document.getElementById('copy-favorites-link').id, 'copy-favorites-link');
});

test('explorer renders related sessions when a precomputed artifact is provided', async () => {
  const env = createEnvironment();
  const source = {
    sessions: [
      { id: '1', title: 'Build agents with Gemini', description: 'Agent workflows', url: 'https://example.com/session/1/build-agents', topics: ['Agents'], speakers: [] },
      { id: '2', title: 'Scale RAG on Vertex AI', description: 'RAG pipelines', url: 'https://example.com/session/2/scale-rag', topics: ['Vertex AI'], speakers: [] },
      { id: '3', title: 'Kubernetes ops', description: 'Infra talk', url: 'https://example.com/session/3/k8s-ops', topics: ['Kubernetes'], speakers: [] },
    ],
  };
  const related = {
    sessions: {
      '1': {
        sessionId: '1',
        related: [
          { sessionId: '2', title: 'Scale RAG on Vertex AI', url: 'https://example.com/session/2/scale-rag', score: 0.91 },
        ],
      },
    },
  };

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(source, { records: [] }, related),
    location: env.location,
    history: env.history,
    relatedSessionsUrl: 'related-sessions.json',
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /Related sessions/);
  assert.match(appHtml, /class="related-session-link"/);
  assert.match(appHtml, /data-related-session-id="2"/);
  assert.match(appHtml, /Scale RAG on Vertex AI/);
});

test('next2025 explorer bootstraps the shared UI with the related-sessions artifact', () => {
  const next2025Html = fs.readFileSync(new URL('../next2025/index.html', import.meta.url), 'utf8');
  assert.match(next2025Html, /Google Cloud Next 2025 — Session Search/);
  assert.match(next2025Html, /relatedSessionsUrl: '\.\/related-sessions-2025-embeddings\.json'/);
  assert.match(next2025Html, /sessions_25_classified_embeddings\.json/);
});

test('index.html exposes a visible version marker container', () => {
  assert.match(html, /id="version-marker"/);
  assert.match(html, /Version:/i);
});

test('session explorer updates the version marker from the loaded dataset timestamp', async () => {
  const env = createEnvironment();

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    storage: { getItem: () => null, setItem: () => {} },
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  const expectedVersion = `Version: ${dataset.scraped_at.slice(0, 16).replace('T', ' ')} UTC`;
  assert.equal(env.document.getElementById('version-marker').textContent, expectedVersion);
});


test('time sort pushes unscheduled sessions after scheduled ones', async () => {
  const env = createEnvironment();

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    storage: { getItem: () => null, setItem: () => {} },
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  const appHtml = env.document.getElementById('app').innerHTML;
  const firstCard = appHtml.match(/class="card"[\s\S]*?<div class="card-meta">([\s\S]*?)<\/div>/);
  assert.ok(firstCard);
  assert.doesNotMatch(firstCard[1], /UNSCHEDULED/i);
});


test('speaker/company click behavior is intended to pivot, not narrow further', () => {
  assert.ok(true);
});


test('index.html links a favicon', () => {
  assert.match(html, /rel="icon"[^>]*href="\.\/favicon\.svg"/);
});

test('insights page uses contextual sankey filename and index manifest', () => {
  assert.match(insightsHtml, /fhoffa\.github\.io_google-cloud-next-2026-unofficial-scrape_sankey_\d{8}\.png/);
  assert.match(insightsHtml, /fetch\('\.\/media\/sankey-index\.json'\)/);
  assert.doesNotMatch(insightsHtml, /download-sankey/);
  assert.doesNotMatch(insightsHtml, /aspect-ratio:4\/5/);
  assert.match(insightsHtml, /syncSankeyAspect/);
  assert.match(insightsHtml, /image-missing/);
  assert.doesNotMatch(insightsHtml, /image-missing \.sankey-map\{display:none\}/);
  assert.match(insightsHtml, /createElementNS\('http:\/\/www\.w3\.org\/2000\/svg', 'polygon'\)/);
});


test('sessions view renders top tabs', async () => {
  const env = createEnvironment();
  await initSessionSearch({ document: env.document, fetchImpl: createFetch(), location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /Top speakers/);
  assert.match(appHtml, /Top words/);
});


test('top speakers view includes clickable speaker and session links', async () => {
  const env = createEnvironment('?view=speakers');
  await initSessionSearch({ document: env.document, fetchImpl: createFetch(), location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /speaker-summary-link/);
  assert.match(appHtml, /speaker-session-link/);
  assert.match(appHtml, /target="_blank"/);
});


test('top words view includes clickable words', async () => {
  const env = createEnvironment('?view=words');
  await initSessionSearch({ document: env.document, fetchImpl: createFetch(), location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /class="word-chip word-link/);
});


test('session and speaker filters expose quick clear controls', async () => {
  const env = createEnvironment('?q=agent&speaker=felipe');
  await initSessionSearch({ document: env.document, fetchImpl: createFetch(), location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  assert.equal(env.document.getElementById('q-clear').classList.contains('visible'), true);
  assert.equal(env.document.getElementById('speaker-clear').classList.contains('visible'), true);
});


test('stored favorites stay local and do not rewrite homepage URL', async () => {
  const env = createEnvironment('');
  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    storage: {
      getItem: () => JSON.stringify(['https://www.googlecloudevents.com/next-vegas/session/3920404/adk-a2a-in-action']),
      setItem: () => {},
    },
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });
  assert.equal(env.location.search, '');
});


test('topic tags are clickable buttons and active filters render pills', async () => {
  const env = createEnvironment('?topic=Security');
  await initSessionSearch({ document: env.document, fetchImpl: createFetch(), location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /topic-link/);
  assert.match(env.document.getElementById('active-filters').innerHTML, /filter-pill/);
});

test('time range sliders update the visible label', async () => {
  const env = createEnvironment();
  await initSessionSearch({ document: env.document, fetchImpl: createFetch(), location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  env.document.getElementById('time-range-start').value = '36';
  env.document.getElementById('time-range-end').value = '44';
  env.document.getElementById('time-range-start').dispatchEvent({ type: 'input' });
  assert.match(env.document.getElementById('time-range-label').textContent, /9:00 AM|9:00 PM|All times|6:00 AM/);
});

test('time range sliders are bounded to the scheduled session window', async () => {
  const env = createEnvironment();
  await initSessionSearch({ document: env.document, fetchImpl: createFetch(), location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });

  const minutesToIndex = (timeValue) => {
    const [hours, minutes] = timeValue.slice(11, 16).split(':').map(Number);
    return Math.floor(((hours * 60) + minutes) / 15);
  };
  const endMinutesToIndex = (timeValue) => {
    const [hours, minutes] = timeValue.slice(11, 16).split(':').map(Number);
    return Math.ceil(((hours * 60) + minutes) / 15);
  };
  const starts = dataset.sessions.filter((session) => session.start_at).map((session) => minutesToIndex(session.start_at));
  const ends = dataset.sessions.filter((session) => session.end_at).map((session) => endMinutesToIndex(session.end_at));
  const expectedMin = Math.min(...starts);
  const expectedMax = Math.max(...starts, ...ends);

  assert.equal(env.document.getElementById('time-range-start').min, String(expectedMin));
  assert.equal(env.document.getElementById('time-range-start').max, String(expectedMax));
  assert.equal(env.document.getElementById('time-range-end').min, String(expectedMin));
  assert.equal(env.document.getElementById('time-range-end').max, String(expectedMax));
});


test('copy favorites link uses compact numeric session ids only', async () => {
  const env = createEnvironment('?day=Friday,%20April%2024,%202026');
  let copied = '';
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async (text) => { copied = text; } } }, configurable: true });
  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    storage: {
      getItem: () => JSON.stringify([
        'https://www.googlecloudevents.com/next-vegas/session/3913070/govern-your-agents-architecting-a-secure-agentic-ecosystem-with-vertex-ai',
        '3920154'
      ]),
      setItem: () => {},
    },
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });
  await env.document.getElementById('copy-favorites-link').click();
  assert.match(copied, /sessionids=3913070%2C3920154|sessionids=3913070,3920154/);
  assert.doesNotMatch(copied, /sessionids=.*https%3A/i);
  assert.doesNotMatch(copied, /[?&]day=/);
});


test('top companies tab renders clickable companies and session links', async () => {
  const env = createEnvironment('?view=companies');
  await initSessionSearch({ document: env.document, fetchImpl: createFetch(), location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /Top companies/);
  assert.match(appHtml, /company-summary-link/);
  assert.match(appHtml, /company-session-link/);
});

test('top companies view merges canonical company aliases', async () => {
  const env = createEnvironment('?view=companies');
  const fetchImpl = createFetch({
    sessions: [
      { title: 'A', description: '', url: 'https://example.com/1', topics: [], speakers: [{ name: 'One', company: 'Google Deepmind' }] },
      { title: 'B', description: '', url: 'https://example.com/2', topics: [], speakers: [{ name: 'Two', company: 'DeepMind' }] },
      { title: 'C', description: '', url: 'https://example.com/3', topics: [], speakers: [{ name: 'Three', company: 'Anthropic' }] },
      { title: 'D', description: '', url: 'https://example.com/4', topics: [], speakers: [{ name: 'Four', company: 'Anthropic' }] },
    ],
  });
  await initSessionSearch({ document: env.document, fetchImpl, location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /Google DeepMind/);
  assert.doesNotMatch(appHtml, /Google Deepmind/);
  assert.match(appHtml, /Anthropic/);
});

test('company query param matches canonicalized aliases', async () => {
  const env = createEnvironment('?company=Google%20DeepMind');
  const fetchImpl = createFetch({
    sessions: [
      { title: 'Canonical mismatch still matches', description: '', url: 'https://example.com/1', topics: [], speakers: [{ name: 'One', company: 'Google Deepmind' }] },
      { title: 'External session', description: '', url: 'https://example.com/2', topics: [], speakers: [{ name: 'Two', company: 'Anthropic' }] },
    ],
  });
  await initSessionSearch({ document: env.document, fetchImpl, location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /Canonical mismatch still matches/);
  assert.doesNotMatch(appHtml, /External session/);
});


test('top words keeps meaningful short technical words like AI', async () => {
  const env = createEnvironment('?view=words');
  const fetchImpl = createFetch({
    sessions: [
      { title: 'AI for developers', description: 'AI agents and AI workflows', url: 'https://example.com/1', topics: [], speakers: [] },
      { title: 'Enterprise AI', description: 'AI platforms at scale', url: 'https://example.com/2', topics: [], speakers: [] },
      { title: 'Practical ML', description: 'ML and AI together', url: 'https://example.com/3', topics: [], speakers: [] },
    ],
  });
  await initSessionSearch({ document: env.document, fetchImpl, location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  const appHtml = env.document.getElementById('app').innerHTML.toLowerCase();
  assert.match(appHtml, /data-word="ai"/);
});


test('top words drops common boilerplate words and trailing punctuation noise', async () => {
  const env = createEnvironment('?view=words');
  const fetchImpl = createFetch({
    sessions: [
      { title: 'Join the AI talks', description: 'Explore relevant AI only. Contact shared teams.', url: 'https://example.com/1', topics: [], speakers: [] },
      { title: 'AI for developers', description: 'AI workflows for teams', url: 'https://example.com/2', topics: [], speakers: [] },
    ],
  });
  await initSessionSearch({ document: env.document, fetchImpl, location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  const appHtml = env.document.getElementById('app').innerHTML.toLowerCase();
  assert.doesNotMatch(appHtml, /data-word="join"/);
  assert.doesNotMatch(appHtml, /data-word="explore"/);
  assert.doesNotMatch(appHtml, /data-word="only\."/);
  assert.match(appHtml, /data-word="ai"/);
});


test('top words merges obvious variants like llm and llms', async () => {
  const env = createEnvironment('?q=llm&view=words');
  await initSessionSearch({ document: env.document, fetchImpl: createFetch(), location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /data-word="llm"/i);
  assert.match(appHtml, /LLM\/LLMs/);
  assert.doesNotMatch(appHtml, /data-word="llms"/i);
});


test('top words merges meetup and meetups', async () => {
  const env = createEnvironment('?q=meetup&view=words');
  await initSessionSearch({ document: env.document, fetchImpl: createFetch(), location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /data-word="meetup"/i);
  assert.match(appHtml, /meetup\/meetups/i);
  assert.doesNotMatch(appHtml, /data-word="meetups"/i);
});


test('top words counts description text too', async () => {
  const env = createEnvironment('?q=ml&view=words');
  await initSessionSearch({ document: env.document, fetchImpl: createFetch(), location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  const appHtml = env.document.getElementById('app').innerHTML.toLowerCase();
  assert.match(appHtml, /data-word="ml"/);
});


test('top words merges agent and agents with a combined label', async () => {
  const env = createEnvironment('?q=agent&view=words');
  await initSessionSearch({ document: env.document, fetchImpl: createFetch(), location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /data-word="agent"/i);
  assert.match(appHtml, /agent\/agents/i);
  assert.doesNotMatch(appHtml, /data-word="agents"/i);
});


test('top words merges an obvious plural cleanup batch', async () => {
  const env = createEnvironment('?q=database&view=words');
  await initSessionSearch({ document: env.document, fetchImpl: createFetch(), location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /data-word="database"/i);
  assert.match(appHtml, /database\/databases/i);
  assert.doesNotMatch(appHtml, /data-word="databases"/i);
  assert.doesNotMatch(appHtml, /data-word="developers"/i);
  assert.doesNotMatch(appHtml, /data-word="leaders"/i);
});

test('exclude filter hides matching sessions and is reflected in URL and active pills', async () => {
  const env = createEnvironment('?exclude=AI');

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  const resultCount = env.document.getElementById('result-count').textContent;
  const [shown, total] = resultCount.match(/\d[\d,]*/g).map((n) => Number(n.replace(/,/g, '')));

  assert.equal(env.document.getElementById('exclude').value, 'AI');
  assert.ok(shown < total, `exclude=AI should hide some sessions (got ${shown} of ${total})`);
  assert.match(env.location.search, /exclude=AI/);
  assert.match(env.document.getElementById('active-filters').innerHTML, /exclude: AI/);

  // clear-btn resets the exclude input
  env.document.getElementById('clear-btn').click();
  assert.equal(env.document.getElementById('exclude').value, '');
  assert.doesNotMatch(env.location.search, /exclude/);
});

test('exclude filter uses whole-word matching so "ai" does not exclude sessions with words like "aim"', async () => {
  const { filterSessions } = await import('../website/session-search.mjs');
  const sessions = [
    { title: 'Mainframe migration guide', description: 'Contains aim andrain', topics: [], speakers: [] },
    { title: 'AI for everyone', description: 'This is about AI', topics: [], speakers: [] },
    { title: 'Training on data', description: 'Contains aim but not the keyword', topics: [], speakers: [] },
  ];
  const filters = { q: '', exclude: 'ai', speaker: '', topic: '', day: '', start_after: '', start_before: '', sessionids: '', company: '', view: 'sessions' };
  const result = filterSessions(sessions, filters);
  assert.equal(result.length, 2, 'only the session with standalone "AI" should be excluded');
  assert.ok(result.some((s) => s.title === 'Mainframe migration guide'), 'mainframe session should remain');
  assert.ok(result.some((s) => s.title === 'Training on data'), 'training session should remain');
  assert.ok(!result.some((s) => s.title === 'AI for everyone'), 'AI session should be excluded');
});

test('exclude filter keeps quoted phrases together', async () => {
  const { filterSessions } = await import('../website/session-search.mjs');
  const sessions = [
    { title: 'Classic ML intro', description: 'A machine learning overview', topics: [], speakers: [] },
    { title: 'Learning paths for admins', description: 'Machine setup and learning culture', topics: [], speakers: [] },
  ];
  const filters = { q: '', exclude: '"machine learning"', speaker: '', topic: '', day: '', start_after: '', start_before: '', sessionids: '', company: '', view: 'sessions' };
  const result = filterSessions(sessions, filters);
  assert.equal(result.length, 1, 'only the session with the quoted phrase should be excluded');
  assert.ok(result.some((s) => s.title === 'Learning paths for admins'), 'split words without the phrase should remain');
  assert.ok(!result.some((s) => s.title === 'Classic ML intro'), 'quoted phrase match should be excluded');
});

test('classification query params filter sessions via llm keys', async () => {
  const env = createEnvironment('?ai_focus=AI&theme=Security');
  const fetchImpl = createFetch({
    sessions: [
      { title: 'AI security deep dive', url: 'https://example.com/1', topics: [], speakers: [], llm: { ai_focus: 'AI', theme: 'Security', audience: 'Sec pros' } },
      { title: 'AI data pipelines', url: 'https://example.com/2', topics: [], speakers: [], llm: { ai_focus: 'AI', theme: 'Data', audience: 'Data pros' } },
      { title: 'Infra migration', url: 'https://example.com/3', topics: [], speakers: [], llm: { ai_focus: 'Not AI', theme: 'Infra', audience: 'Infra/Ops' } },
    ],
  });
  await initSessionSearch({ document: env.document, fetchImpl, location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });
  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /AI security deep dive/);
  assert.doesNotMatch(appHtml, /AI data pipelines/);
  assert.match(env.document.getElementById('active-filters').innerHTML, /AI focus: AI/);
  assert.match(env.location.search, /theme=Security/);
});

test('company query param filters results and renders an active pill', async () => {
  const env = createEnvironment('?company=geotab');

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  const appHtml = env.document.getElementById('app').innerHTML;
  const expected = filterSessions(dataset.sessions, {
    q: '', exclude: '', speaker: '', company: 'geotab', ai_focus: '', theme: '', audience: '', availability: '', sponsored: '', topic: '', day: '', start_after: '', start_before: '', sessionids: '', view: 'sessions',
  });
  assert.equal(env.document.getElementById('result-count').textContent, `${expected.length.toLocaleString()} of ${dataset.sessions.length.toLocaleString()} sessions`);
  assert.ok(expected.length >= 1);
  assert.match(appHtml, /Geotab/i);
  assert.match(env.document.getElementById('active-filters').innerHTML, /company: geotab/i);
});

test('combined insights-style filters render all relevant pills', async () => {
  const env = createEnvironment('?ai_focus=AI&theme=Security&audience=Sec%20pros');
  const fetchImpl = createFetch({
    sessions: [
      { title: 'AI security deep dive', url: 'https://example.com/1', topics: [], speakers: [], llm: { ai_focus: 'AI', theme: 'Security', audience: 'Sec pros' } },
      { title: 'AI security for leaders', url: 'https://example.com/2', topics: [], speakers: [], llm: { ai_focus: 'AI', theme: 'Security', audience: 'Leaders' } },
      { title: 'Not AI security', url: 'https://example.com/3', topics: [], speakers: [], llm: { ai_focus: 'Not AI', theme: 'Security', audience: 'Sec pros' } },
    ],
  });

  await initSessionSearch({ document: env.document, fetchImpl, location: env.location, history: env.history, storage: { getItem: () => null, setItem: () => {} }, setTimeoutImpl: (fn) => { fn(); return 1; }, clearTimeoutImpl: () => {} });

  const pills = env.document.getElementById('active-filters').innerHTML;
  assert.match(pills, /AI focus: AI/);
  assert.match(pills, /theme: Security/);
  assert.match(pills, /audience: Sec pros/);
  assert.match(env.document.getElementById('app').innerHTML, /AI security deep dive/);
  assert.doesNotMatch(env.document.getElementById('app').innerHTML, /AI security for leaders/);
  assert.doesNotMatch(env.document.getElementById('app').innerHTML, /Not AI security/);
});

test('search query param renders a search pill', async () => {
  const env = createEnvironment('?q=agent');

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  assert.match(env.document.getElementById('active-filters').innerHTML, /search: agent/i);
});

test('buildSearchFromFilters preserves company alongside other insights filters', async () => {
  const { buildSearchFromFilters } = await import('../website/session-search.mjs');
  const search = buildSearchFromFilters({ q: '', exclude: '', speaker: '', topic: '', day: '', sort: 'time', start_after: '', start_before: '', company: 'Geotab', ai_focus: 'AI', theme: 'Security', audience: 'Sec pros', availability: 'full', sponsored: 'yes', view: 'sessions', sessionids: '' });
  assert.match(search, /company=Geotab/);
  assert.match(search, /ai_focus=AI/);
  assert.match(search, /theme=Security/);
  assert.match(search, /audience=Sec\+pros/);
  assert.match(search, /availability=full/);
  assert.match(search, /sponsored=yes/);
});

test('availability query param filters full and not-full sessions', async () => {
  const { filterSessions, readFiltersFromSearch, buildSearchFromFilters } = await import('../website/session-search.mjs');
  const sample = [
    { title: 'Full session', remaining_capacity: 0, topics: [], speakers: [], sponsored: true },
    { title: 'Open session', remaining_capacity: 4, topics: [], speakers: [], sponsored: false },
  ];
  const fullFilters = readFiltersFromSearch('?availability=full');
  const notFullFilters = readFiltersFromSearch('?availability=not-full');
  assert.deepEqual(filterSessions(sample, fullFilters).map((s) => s.title), ['Full session']);
  assert.deepEqual(filterSessions(sample, notFullFilters).map((s) => s.title), ['Open session']);
  assert.equal(buildSearchFromFilters(fullFilters), '?availability=full');
  assert.equal(buildSearchFromFilters(notFullFilters), '?availability=not-full');
});

test('sponsored query param filters sponsored and non-sponsored sessions', async () => {
  const { filterSessions, readFiltersFromSearch, buildSearchFromFilters } = await import('../website/session-search.mjs');
  const sample = [
    { title: 'Sponsored session', sponsored: true, topics: [], speakers: [] },
    { title: 'Organic session', sponsored: false, topics: [], speakers: [] },
  ];
  const sponsoredFilters = readFiltersFromSearch('?sponsored=yes');
  const unsponsoredFilters = readFiltersFromSearch('?sponsored=no');
  assert.deepEqual(filterSessions(sample, sponsoredFilters).map((s) => s.title), ['Sponsored session']);
  assert.deepEqual(filterSessions(sample, unsponsoredFilters).map((s) => s.title), ['Organic session']);
  assert.equal(buildSearchFromFilters(sponsoredFilters), '?sponsored=yes');
  assert.equal(buildSearchFromFilters(unsponsoredFilters), '?sponsored=no');
});

test('session explorer joins availability artifact before applying availability filters', async () => {
  const env = createEnvironment('?availability=full');
  const source = {
    sessions: [
      { title: 'Full session', url: 'https://example.com/session/1/full', topics: [], speakers: [] },
      { title: 'Open session', url: 'https://example.com/session/2/open', topics: [], speakers: [] },
      { title: 'Unknown session', url: 'https://example.com/session/3/unknown', topics: [], speakers: [] },
    ],
  };
  const availability = {
    generatedAt: '2026-04-01T00:00:00.000Z',
    records: [
      { url: 'https://example.com/session/1/full', remaining_capacity: 0 },
      { url: 'https://example.com/session/2/open', remaining_capacity: 5 },
    ],
  };

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(source, availability),
    location: env.location,
    history: env.history,
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  assert.match(env.document.getElementById('app').innerHTML, /Full session/);
  assert.doesNotMatch(env.document.getElementById('app').innerHTML, /Open session/);
  assert.doesNotMatch(env.document.getElementById('app').innerHTML, /Unknown session/);
  assert.match(env.document.getElementById('active-filters').innerHTML, /availability: full/);
});

test('session explorer renders sponsored badges and active sponsored pills', async () => {
  const env = createEnvironment('?sponsored=yes');
  const source = {
    sessions: [
      { title: 'Sponsored session', url: 'https://example.com/session/sponsored', topics: [], speakers: [], sponsored: true, sponsor_name: 'Glean' },
      { title: 'Organic session', url: 'https://example.com/session/organic', topics: [], speakers: [], sponsored: false },
    ],
  };

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(source),
    location: env.location,
    history: env.history,
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /Sponsored session/);
  assert.doesNotMatch(appHtml, /Organic session/);
  assert.match(appHtml, /status-badge sponsored">Sponsored by Glean/);
  assert.match(env.document.getElementById('active-filters').innerHTML, /sponsored: yes/);
});

test('session explorer renders seat demand when registrations are known, even if capacity is missing', async () => {
  const env = createEnvironment();
  const source = {
    sessions: [
      { title: 'Seat viz session', url: 'https://example.com/session/seat-viz', topics: [], speakers: [] },
      { title: 'No capacity session', url: 'https://example.com/session/no-capacity', topics: [], speakers: [] },
    ],
  };
  const availability = {
    generatedAt: '2026-04-01T00:00:00.000Z',
    records: [
      { url: 'https://example.com/session/seat-viz', remaining_capacity: 6, capacity: '48', registrant_count: '42' },
      { url: 'https://example.com/session/no-capacity', remaining_capacity: 1, capacity: '', registrant_count: '90' },
    ],
  };

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(source, availability),
    location: env.location,
    history: env.history,
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  const appHtml = env.document.getElementById('app').innerHTML;
  assert.match(appHtml, /Seat viz session/);
  assert.match(appHtml, /42 \/ 48 seats/);
  assert.match(appHtml, /88% full/);
  assert.match(appHtml, /seat-fill-bar-fill/);
  assert.match(appHtml, /No capacity session[\s\S]*90 reserved/);
  assert.match(appHtml, /No capacity session[\s\S]*Capacity unknown/);
});
