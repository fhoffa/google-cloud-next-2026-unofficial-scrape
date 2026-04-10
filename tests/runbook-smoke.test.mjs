import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const latest = JSON.parse(fs.readFileSync(new URL('../sessions/latest.json', import.meta.url), 'utf8'));
const classified = JSON.parse(fs.readFileSync(new URL('../sessions/classified_sessions.json', import.meta.url), 'utf8'));
const refreshSanity = JSON.parse(fs.readFileSync(new URL('../media/refresh-sanity.json', import.meta.url), 'utf8'));
const changelogSummary = JSON.parse(fs.readFileSync(new URL('../media/changelog-summary.json', import.meta.url), 'utf8'));
const insightsSummary = JSON.parse(fs.readFileSync(new URL('../media/insights-summary.json', import.meta.url), 'utf8'));
const relatedSessions = JSON.parse(fs.readFileSync(new URL('../media/related-sessions-2026-embeddings.json', import.meta.url), 'utf8'));
const insightsHtml = fs.readFileSync(new URL('../insights.html', import.meta.url), 'utf8');

function classifiedSessionsArray(payload) {
  return Array.isArray(payload) ? payload : (payload.sessions || []);
}

test('runbook smoke: latest and classified datasets stay aligned', () => {
  const latestSessions = latest.sessions || [];
  const classifiedSessions = classifiedSessionsArray(classified);
  assert.equal(classifiedSessions.length, latestSessions.length);
  assert.equal(latest.count, latestSessions.length);
  assert.ok(classifiedSessions.every((session) => session.url));
  assert.ok(classifiedSessions.every((session) => session.llm && typeof session.llm === 'object'));
});

test('runbook smoke: refresh sanity binds to the current latest snapshot pair', () => {
  assert.equal(refreshSanity.latest.scrapedAt, latest.scraped_at);
  assert.equal(refreshSanity.pair.current.scrapedAt, latest.scraped_at);
  assert.equal(changelogSummary.meta.latestLivePair.current.scrapedAt, latest.scraped_at);
  assert.ok(refreshSanity.comparison.addedCount >= 0);
  assert.ok(refreshSanity.comparison.removedCount >= 0);
});

test('runbook smoke: generated summaries match current live totals', () => {
  const latestSessions = latest.sessions || [];
  assert.equal(insightsSummary.meta.dataScrapedAt, latest.scraped_at);
  assert.equal(changelogSummary.meta.latestLivePair.current.count, latestSessions.length);
  assert.ok(Array.isArray(insightsSummary.stats));
  assert.ok(insightsSummary.stats.length > 0);
});

test('runbook smoke: related sessions artifact covers the classified explorer dataset', () => {
  const classifiedSessions = classifiedSessionsArray(classified);
  const byId = relatedSessions.sessions || {};
  const ids = classifiedSessions.map((session) => String(session.id || '').trim()).filter(Boolean);
  assert.equal(Object.keys(byId).length, ids.length);
  assert.ok(ids.every((id) => byId[id] && byId[id].sessionId === id && Array.isArray(byId[id].related)));
});

test('runbook smoke: generated insights HTML has no unreplaced placeholders', () => {
  assert.doesNotMatch(insightsHtml, /__[A-Z_]+__/);
});
