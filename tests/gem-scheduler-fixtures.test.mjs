import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures', name), 'utf8'));
}

function byId(data, id) {
  return data.sessions.find((session) => String(session.id) === String(id));
}

function slotKey(session) {
  return `${session.date_text}__${String(session.start_at).slice(11, 16)}__${String(session.end_at).slice(11, 16)}`;
}

function linkFor(ids) {
  return `https://fhoffa.github.io/google-cloud-next-2026-unofficial-scrape/?sessionids=${ids.join(',')}`;
}

test('default-days fixture supports a Wed-Fri technical attendee scenario', () => {
  const data = loadFixture('gem-scheduler-default-days.json');
  assert.equal(data.sessions.length, 6);
  const ids = ['3001', '3003', '3005'];
  for (const id of ids) assert.ok(byId(data, id), `missing expected session ${id}`);
  const days = new Set(data.sessions.map((session) => session.date_text));
  assert.deepEqual([...days], [
    'Wednesday, April 22, 2026',
    'Thursday, April 23, 2026',
    'Friday, April 24, 2026',
  ]);
  assert.match(linkFor(ids), /sessionids=3001,3003,3005$/);
});

test('executive Thursday fixture is constrained to Thursday and favors leader sessions', () => {
  const data = loadFixture('gem-scheduler-executive-thursday.json');
  assert.equal(new Set(data.sessions.map((session) => session.date_text)).size, 1);
  assert.equal(data.sessions[0].date_text, 'Thursday, April 23, 2026');
  assert.equal(byId(data, '5001').llm.audience, 'Leaders');
  assert.equal(byId(data, '5003').llm.audience, 'Leaders');
  assert.match(linkFor(['5001', '5003']), /sessionids=5001,5003$/);
});

test('full-fallback fixture contains a full primary candidate and a same-slot open alternative', () => {
  const data = loadFixture('gem-scheduler-full-fallback.json');
  const primary = byId(data, '4001');
  const alternative = byId(data, '4002');
  const weakFallback = byId(data, '4003');
  assert.equal(primary.remaining_capacity, 0);
  assert.ok(alternative.remaining_capacity > 0);
  assert.equal(slotKey(primary), slotKey(alternative));
  assert.equal(slotKey(primary), slotKey(weakFallback));
  assert.equal(primary.llm.theme, 'Security');
  assert.equal(alternative.llm.theme, 'Security');
  assert.equal(weakFallback.llm.theme, 'Infra');
});

test('fixture docs enumerate the intended requests and expected recommendation anchors', () => {
  const doc = fs.readFileSync(path.join(root, 'docs/google-gem-scheduler-test-pack.md'), 'utf8');
  for (const needle of ['3001', '3005', '5001,5003', '4001', '4002', 'Wednesday through Friday']) {
    assert.match(doc, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
