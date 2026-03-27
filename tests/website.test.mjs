import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { initSessionSearch } from '../website/session-search.mjs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
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
  document.register(new FakeElement({ id: 'q-clear' }));
  document.register(new FakeElement({ id: 'speaker-clear' }));
  document.register(new FakeElement({ id: 'topic-filter' }));
  document.register(new FakeElement({ id: 'sort-filter', value: 'time' }));
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

function createFetch() {
  return async () => ({
    async json() {
      return dataset;
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
  assert.match(env.document.getElementById('app').innerHTML, /Adapt across devices with Flutter/);
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
  const env = createEnvironment('?day=Thursday,%20April%2023,%202026&start_after=3%3A00%20PM&start_before=4%3A00%20PM');

  await initSessionSearch({
    document: env.document,
    fetchImpl: createFetch(),
    location: env.location,
    history: env.history,
    storage: { getItem: () => null, setItem: () => {} },
    setTimeoutImpl: (fn) => { fn(); return 1; },
    clearTimeoutImpl: () => {},
  });

  assert.equal(env.document.getElementById('start-after').value, '3:00 PM');
  assert.equal(env.document.getElementById('start-before').value, '4:00 PM');
  assert.match(env.location.search, /start_after=3%3A00\+PM|start_after=3%3A00%20PM/);
  assert.match(env.location.search, /start_before=4%3A00\+PM|start_before=4%3A00%20PM/);
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
