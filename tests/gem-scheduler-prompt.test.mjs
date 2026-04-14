import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const prompt = fs.readFileSync(path.join(root, 'docs/google-gem-scheduler-prompt.md'), 'utf8');
const gemPrompt = fs.readFileSync(path.join(root, 'docs/google-gem-scheduler-gem-prompt.txt'), 'utf8');
const dataset = JSON.parse(fs.readFileSync(path.join(root, 'sessions/classified_sessions.json'), 'utf8'));
const sessions = Array.isArray(dataset.sessions) ? dataset.sessions : [];

function availabilityLabel(session) {
  if (session?.remaining_capacity === 0) return 'Full';
  if (typeof session?.remaining_capacity === 'number' && session.remaining_capacity > 0) return 'Not full';
  return 'Unknown';
}

function sessionId(session) {
  return String(session?.id || '').trim();
}

function dayOf(session) {
  return String(session?.date_text || '').trim();
}

function slotKey(session) {
  const day = dayOf(session);
  const start = String(session?.start_at || '').slice(11, 16);
  const end = String(session?.end_at || '').slice(11, 16);
  return `${day}__${start}__${end}`;
}

function inDays(days) {
  const allowed = new Set(days);
  return sessions.filter((session) => allowed.has(dayOf(session)) && session?.start_at && session?.end_at);
}

function matchesAnyText(session, needles) {
  const haystack = [
    session.title,
    session.description,
    session.room,
    ...(session.topics || []),
    ...(session.speakers || []).flatMap((speaker) => [speaker.name, speaker.company, speaker.job_title]),
    session.llm?.ai_focus,
    session.llm?.theme,
    session.llm?.audience,
  ].filter(Boolean).join(' ').toLowerCase();
  return needles.some((needle) => haystack.includes(String(needle).toLowerCase()));
}

function groupBySlot(list) {
  const grouped = new Map();
  for (const session of list) {
    const key = slotKey(session);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(session);
  }
  return grouped;
}

const DEFAULT_DAYS = [
  'Wednesday, April 22, 2026',
  'Thursday, April 23, 2026',
  'Friday, April 24, 2026',
];

test('copy-paste gem prompt encodes the Wednesday through Friday default attendance assumption', () => {
  assert.match(gemPrompt, /assume they are attending Wednesday through Friday/i);
  assert.match(gemPrompt, /Do not include sessions outside the selected days|Do not include sessions outside the selected days\.|Do not include sessions outside the selected days/i);
});

test('copy-paste gem prompt requires complete timeslot coverage and same-slot fallback for full sessions', () => {
  assert.match(gemPrompt, /exactly one primary session for every covered time slot/i);
  assert.match(gemPrompt, /cover every time slot that has one or more sessions/i);
  assert.match(gemPrompt, /same-slot alternative/i);
  assert.match(gemPrompt, /line up in case of cancellations/i);
});

test('copy-paste gem prompt requires concierge-style concise opinionated guidance', () => {
  assert.match(gemPrompt, /strong concierge/i);
  assert.match(gemPrompt, /concise, opinionated, and helpful/i);
  assert.match(gemPrompt, /best fit|don't miss|backup option|worth lining up for/i);
});

test('copy-paste gem prompt steers inspirational and career requests away from dry executive defaults', () => {
  assert.match(gemPrompt, /inspirational, energizing, visionary, broad-perspective, or career-oriented/i);
  assert.match(gemPrompt, /do not default to dry executive or ROI talks/i);
  assert.match(gemPrompt, /strong speakers, memorable customer stories, broader industry perspective/i);
});

test('copy-paste gem prompt requires an explorer link with sessionids URL parameter', () => {
  assert.match(gemPrompt, /sessionids/i);
  assert.match(gemPrompt, /https:\/\/fhoffa\.github\.io\/google-cloud-next-2026-unofficial-scrape\/\?sessionids=ID1,ID2,ID3/i);
});

test('markdown prompt doc points to the copy-paste gem prompt file', () => {
  assert.match(prompt, /google-gem-scheduler-gem-prompt\.txt/);
});

test('dataset has enough scheduled Wednesday-Friday sessions to support default planning', () => {
  const scheduled = inDays(DEFAULT_DAYS);
  assert.ok(scheduled.length > 300, `expected many Wed-Fri scheduled sessions, got ${scheduled.length}`);
  for (const day of DEFAULT_DAYS) {
    assert.ok(scheduled.some((session) => dayOf(session) === day), `missing scheduled sessions for ${day}`);
  }
});

test('dataset contains multiple full sessions with same-slot alternatives for fallback testing', () => {
  const scheduled = inDays(DEFAULT_DAYS);
  const bySlot = groupBySlot(scheduled);
  const goodSlots = [...bySlot.values()].filter((slotSessions) => slotSessions.some((s) => availabilityLabel(s) === 'Full') && slotSessions.some((s) => availabilityLabel(s) === 'Not full'));
  assert.ok(goodSlots.length >= 10, `expected at least 10 slots with full + not-full choices, got ${goodSlots.length}`);
});

test('dataset supports technical data and AI attendee scenarios', () => {
  const scheduled = inDays(DEFAULT_DAYS);
  const matches = scheduled.filter((session) => matchesAnyText(session, ['bigquery', 'data', 'analytics', 'agent', 'agents', 'gemini', 'vertex ai']));
  assert.ok(matches.length >= 50, `expected at least 50 data/AI-oriented sessions, got ${matches.length}`);
});

test('dataset supports executive or business-oriented attendee scenarios', () => {
  const scheduled = inDays(DEFAULT_DAYS);
  const matches = scheduled.filter((session) => matchesAnyText(session, ['executive', 'leadership', 'business', 'strategy', 'cio', 'ceo']));
  assert.ok(matches.length >= 20, `expected at least 20 executive/business sessions, got ${matches.length}`);
});

test('dataset supports security-focused attendee scenarios', () => {
  const scheduled = inDays(DEFAULT_DAYS);
  const matches = scheduled.filter((session) => matchesAnyText(session, ['security', 'secops', 'zero trust', 'threat', 'identity']));
  assert.ok(matches.length >= 20, `expected at least 20 security sessions, got ${matches.length}`);
});

test('explorer links can be formed from real session ids in the dataset', () => {
  const picked = inDays(DEFAULT_DAYS).slice(0, 3).map(sessionId).filter(Boolean);
  assert.equal(picked.length, 3);
  const link = `https://fhoffa.github.io/google-cloud-next-2026-unofficial-scrape/?sessionids=${picked.join(',')}`;
  assert.match(link, /\?sessionids=\d+(,\d+){2}$/);
});

test('full-session fallback examples are available on the real schedule grid', () => {
  const scheduled = inDays(DEFAULT_DAYS);
  const bySlot = groupBySlot(scheduled);
  const example = [...bySlot.values()].find((slotSessions) => {
    const full = slotSessions.filter((s) => availabilityLabel(s) === 'Full');
    const open = slotSessions.filter((s) => availabilityLabel(s) === 'Not full');
    return full.length >= 1 && open.length >= 1;
  });
  assert.ok(example, 'expected at least one real slot with a full primary candidate and an open fallback');
  const firstFull = example.find((s) => availabilityLabel(s) === 'Full');
  const firstOpen = example.find((s) => availabilityLabel(s) === 'Not full');
  assert.equal(slotKey(firstFull), slotKey(firstOpen));
});
