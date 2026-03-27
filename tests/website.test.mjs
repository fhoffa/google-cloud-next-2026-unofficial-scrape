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
  document.register(new FakeElement({ id: 'topic-filter' }));
  document.register(new FakeElement({ id: 'sort-filter', value: 'time' }));
  document.register(new FakeElement({ id: 'result-count' }));
  document.register(new FakeElement({ id: 'header-count' }));
  document.register(new FakeElement({ id: 'clear-btn' }));

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
