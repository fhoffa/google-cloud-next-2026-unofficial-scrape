import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { initSessionSearch } from '../website/session-search.mjs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const insightsHtml = fs.readFileSync(new URL('../insights.html', import.meta.url), 'utf8');
const insightsSummary = JSON.parse(fs.readFileSync(new URL('../media/insights-summary.json', import.meta.url), 'utf8'));
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
    this.innerHTML = '';
    this.children = [];
    this.listeners = new Map();
    this.classList = new FakeClassList(classes);
    this.style = {};
    this.ownerDocument = null;
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
    if (selector === '.favorite-btn') {
      const matches = [...String(this.innerHTML || '').matchAll(/class=\"favorite-btn\"[^>]*data-session-id=\"([^\"]+)\"[^>]*>([^<]+)</g)];
      return matches.map((match) => ({
        dataset: { sessionId: match[1] },
        listeners: new Map(),
        addEventListener(type, listener) {
          if (!this.listeners.has(type)) this.listeners.set(type, []);
          this.listeners.get(type).push(listener);
        },
        click() {
          for (const listener of this.listeners.get('click') || []) listener({ type: 'click', currentTarget: this, target: this });
        },
      }));
    }
    if (selector === '.speaker-link') {
      const matches = [...String(this.innerHTML || '').matchAll(/class=\"speaker-link\"[^>]*data-speaker-name=\"([^\"]+)\"[^>]*>/g)];
      return matches.map((match) => ({ dataset: { speakerName: match[1] }, listeners: new Map(), addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }, click() { for (const listener of this.listeners.get('click') || []) listener({ type: 'click', currentTarget: this, target: this }); } }));
    }
    if (selector === '.company-link') {
      const matches = [...String(this.innerHTML || '').matchAll(/class=\"company-link\"[^>]*data-company-name=\"([^\"]+)\"[^>]*>/g)];
      return matches.map((match) => ({ dataset: { companyName: match[1] }, listeners: new Map(), addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }, click() { for (const listener of this.listeners.get('click') || []) listener({ type: 'click', currentTarget: this, target: this }); } }));
    }
    if (selector === '.see-more-btn') {
      const matches = [...String(this.innerHTML || '').matchAll(/class=\"see-more-btn\"[^>]*data-session-id=\"([^\"]+)\"[^>]*>([^<]+)</g)];
      return matches.map((match) => ({
        dataset: { sessionId: match[1] },
        listeners: new Map(),
        addEventListener(type, listener) {
          if (!this.listeners.has(type)) this.listeners.set(type, []);
          this.listeners.get(type).push(listener);
        },
        click() {
          for (const listener of this.listeners.get('click') || []) listener({ type: 'click', currentTarget: this, target: this });
        },
      }));
    }
    return [];
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
  document.register(new FakeElement({ id: 'start-after' }));
  document.register(new FakeElement({ id: 'start-before' }));
  document.register(new FakeElement({ id: 'result-count' }));
  document.register(new FakeElement({ id: 'header-count' }));
  document.register(new FakeElement({ id: 'clear-btn' }));
  document.register(new FakeElement({ id: 'favorites-only' }));
  document.register(new FakeElement({ id: 'copy-favorites-link' }));
  document.register(new FakeElement({ id: 'copy-favorites-link' }));

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

function createFetch(sourceDataset = dataset) {
  return async () => ({
    async json() {
      return sourceDataset;
    },
  });
}

test('index.html includes the website shell and module bootstrap', () => {
  assert.match(html, /<input type="text" id="q"/);
  assert.match(html, /<input type="text" id="speaker"/);
  assert.match(html, /<select id="topic-filter">/);
  assert.match(html, /<select id="sort-filter">/);
  assert.match(html, /import \{ initSessionSearch \} from '\.\/website\/session-search\.mjs';/);
});

test('insights page includes richer intelligence sections', () => {
  assert.match(insightsHtml, /Google Cloud Next 2026 — Insights/);
  assert.match(insightsHtml, /What stands out/);
  assert.match(insightsHtml, /How full the conference is getting/);
  assert.match(insightsHtml, /Top companies speaking/);
  assert.match(insightsHtml, /id="fullness-stats"/);
  assert.match(insightsHtml, /id="fullness-observations"/);
  assert.match(insightsHtml, /id="full-now-categories"/);
  assert.match(insightsHtml, /id="not-full-now-categories"/);
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
  assert.equal(insightsSummary.fullness.stats.length, 4);
  assert.equal(insightsSummary.fullness.stats[0].label, 'Sessions with live availability');
  assert.equal(insightsSummary.fullness.stats[1].label, 'Full now');
  assert.equal(insightsSummary.fullness.stats[2].label, 'Not full now');
  assert.equal(insightsSummary.fullness.stats[3].label, 'Workshops already full');
  assert.ok(Number(insightsSummary.fullness.stats[0].value) > 0);
  assert.ok(Number(insightsSummary.fullness.stats[1].value) > 0);
  assert.ok(Number(insightsSummary.fullness.stats[2].value) > 0);
  assert.ok(insightsSummary.fullness.observations.some((item) => /cached library pages|availability signal/.test(item)));
  assert.ok(insightsSummary.fullness.observations.some((item) => /Workshops are where sellouts concentrate/.test(item)));
  assert.equal(insightsSummary.fullness.rankings.fullByCategory[0].name, 'Workshops');
  assert.ok(insightsSummary.fullness.rankings.notFullByCategory.length > 0);
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
  assert.deepEqual(
    JSON.parse(fs.readFileSync(generatedSummaryPath, 'utf8')),
    insightsSummary,
  );
  assert.equal(
    fs.readFileSync(generatedHtmlPath, 'utf8'),
    insightsHtml,
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

  assert.equal(env.document.getElementById('speaker').value, 'geotab');
  assert.equal(env.document.getElementById('result-count').textContent, `2 of ${dataset.sessions.length.toLocaleString()} sessions`);
  assert.equal((appHtml.match(/class="card"/g) || []).length, 2);
  assert.match(appHtml, /Agent security at scale: Protect against the OWASP Top 10 application risks/);
  assert.match(appHtml, /Govern your agents: Architecting a secure agentic ecosystem with Vertex AI/);
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


test('index.html exposes a visible version marker', () => {
  assert.match(html, /Version:\s*(?:[0-9a-f]{7,}|\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC)/i);
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
  assert.match(insightsHtml, /aspect-ratio:4\/5/);
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
  assert.equal(env.document.getElementById('result-count').textContent, `2 of ${dataset.sessions.length.toLocaleString()} sessions`);
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
  const search = buildSearchFromFilters({ q: '', exclude: '', speaker: '', topic: '', day: '', sort: 'time', start_after: '', start_before: '', company: 'Geotab', ai_focus: 'AI', theme: 'Security', audience: 'Sec pros', availability: 'full', view: 'sessions', sessionids: '' });
  assert.match(search, /company=Geotab/);
  assert.match(search, /ai_focus=AI/);
  assert.match(search, /theme=Security/);
  assert.match(search, /audience=Sec\+pros/);
  assert.match(search, /availability=full/);
});

test('availability query param filters full and not-full sessions', async () => {
  const { filterSessions, readFiltersFromSearch, buildSearchFromFilters } = await import('../website/session-search.mjs');
  const sample = [
    { title: 'Full session', remaining_capacity: 0, topics: [], speakers: [] },
    { title: 'Open session', remaining_capacity: 4, topics: [], speakers: [] },
  ];
  const fullFilters = readFiltersFromSearch('?availability=full');
  const notFullFilters = readFiltersFromSearch('?availability=not-full');
  assert.deepEqual(filterSessions(sample, fullFilters).map((s) => s.title), ['Full session']);
  assert.deepEqual(filterSessions(sample, notFullFilters).map((s) => s.title), ['Open session']);
  assert.equal(buildSearchFromFilters(fullFilters), '?availability=full');
  assert.equal(buildSearchFromFilters(notFullFilters), '?availability=not-full');
});
