import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildRefreshSanityReport } from '../lib/refresh-sanity.mjs';
import { generateChangelog } from '../scripts/generate_changelog.mjs';

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function makeSession(id, title, overrides = {}) {
  return {
    id: String(id),
    title,
    url: `https://example.com/session/${id}/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    remaining_capacity: 10,
    registrant_count: 20,
    speakers: [],
    topics: [],
    ...overrides,
  };
}

test('classify_new_sessions_rules is safe by default in source and no longer hardcodes a stale snapshot merge', () => {
  const script = fs.readFileSync(path.resolve('scripts/classify_new_sessions_rules.py'), 'utf8');
  assert.match(script, /"--input", "--latest", dest="input", default="sessions\/latest\.json"/);
  assert.doesNotMatch(script, /sessions\/snapshots\/2026-04-01T04-47-15Z\.json/);
  assert.doesNotMatch(script, /Updated latest\.json/);
  assert.doesNotMatch(script, /latest_path\.write_text/);
  assert.match(script, /output_data\["sessions"\] = classified_sessions/);
});

test('refresh sanity report resolves the current live pair and surfaces hidden availability drift', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-sanity-'));
  const snapshotsDir = path.join(tmpDir, 'snapshots');
  const latestPath = path.join(tmpDir, 'latest.json');
  const previous = {
    scraped_at: '2026-04-04T06:24:23.616Z',
    count: 2,
    sessions: [
      makeSession(1, 'Session A', { remaining_capacity: 10, registrant_count: 100 }),
      makeSession(2, 'Session B', { remaining_capacity: 0, registrant_count: 200 }),
    ],
  };
  const current = {
    scraped_at: '2026-04-05T16:43:11.520Z',
    count: 2,
    sessions: [
      makeSession(1, 'Session A', { remaining_capacity: 8, registrant_count: 103 }),
      makeSession(2, 'Session B', { remaining_capacity: 0, registrant_count: 199 }),
    ],
  };
  writeJson(path.join(snapshotsDir, '2026-04-04T06-24-23Z.json'), previous);
  writeJson(path.join(snapshotsDir, '2026-04-05T16-43-11Z.json'), current);
  writeJson(latestPath, current);

  const report = buildRefreshSanityReport({ latestPath, snapshotsDir });

  assert.equal(report.pair.previous.fileName, '2026-04-04T06-24-23Z.json');
  assert.equal(report.pair.current.fileName, '2026-04-05T16-43-11Z.json');
  assert.equal(report.comparison.addedCount, 0);
  assert.equal(report.comparison.removedCount, 0);
  assert.equal(report.comparison.changedRemainingCount, 1);
  assert.equal(report.comparison.totalRemainingDelta, -2);
  assert.equal(report.comparison.changedRegistrantCount, 2);
  assert.equal(report.comparison.totalRegistrantDelta, 2);
  assert.equal(report.comparison.bandChangeCount, 0);
  assert.ok(report.issues.some((issue) => issue.code === 'hidden-availability-drift'));
});

test('generate_changelog records the verified latest live pair in summary metadata', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-changelog-'));
  const snapshotsDir = path.join(tmpDir, 'snapshots');
  const latestPath = path.join(tmpDir, 'latest.json');
  const templatePath = path.join(tmpDir, 'changelog.template.html');
  const outputSummary = path.join(tmpDir, 'changelog-summary.json');
  const outputHtml = path.join(tmpDir, 'changelog.html');
  const previous = {
    scraped_at: '2026-04-04T06:24:23.616Z',
    count: 1,
    sessions: [makeSession(1, 'Session A', { remaining_capacity: 1 })],
  };
  const current = {
    scraped_at: '2026-04-05T16:43:11.520Z',
    count: 1,
    sessions: [makeSession(1, 'Session A', { remaining_capacity: 0 })],
  };
  writeJson(path.join(snapshotsDir, '2026-04-04T06-24-23Z.json'), previous);
  writeJson(path.join(snapshotsDir, '2026-04-05T16-43-11Z.json'), current);
  writeJson(latestPath, current);
  fs.writeFileSync(templatePath, '<html><body>__GENERATED_ON__ __LEDE__ __CHANGELOG_HTML__</body></html>');

  generateChangelog([
    '--latest',
    latestPath,
    '--snapshots-dir',
    snapshotsDir,
    '--template',
    templatePath,
    '--output-summary',
    outputSummary,
    '--output-html',
    outputHtml,
  ]);

  const summary = JSON.parse(fs.readFileSync(outputSummary, 'utf8'));
  assert.equal(summary.meta.latestLivePair.current.fileName, '2026-04-05T16-43-11Z.json');
  assert.equal(summary.meta.latestLivePair.previous.fileName, '2026-04-04T06-24-23Z.json');
  assert.match(fs.readFileSync(outputHtml, 'utf8'), /index\.html\?sessionids=1/);
});

test('generate_changelog demotes flappy sessions out of headline add/remove buckets', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-changelog-flappy-'));
  const snapshotsDir = path.join(tmpDir, 'snapshots');
  const latestPath = path.join(tmpDir, 'latest.json');
  const templatePath = path.join(tmpDir, 'changelog.template.html');
  const outputSummary = path.join(tmpDir, 'changelog-summary.json');
  const outputHtml = path.join(tmpDir, 'changelog.html');
  const s1 = {
    scraped_at: '2026-04-01T00:00:00.000Z',
    count: 1,
    sessions: [makeSession(1, 'Flappy Session')],
  };
  const s2 = {
    scraped_at: '2026-04-02T00:00:00.000Z',
    count: 1,
    sessions: [makeSession(99, 'Stable Session')],
  };
  const s3 = {
    scraped_at: '2026-04-03T00:00:00.000Z',
    count: 1,
    sessions: [makeSession(1, 'Flappy Session')],
  };
  const s4 = {
    scraped_at: '2026-04-04T00:00:00.000Z',
    count: 1,
    sessions: [makeSession(99, 'Stable Session')],
  };
  const current = {
    scraped_at: '2026-04-05T00:00:00.000Z',
    count: 2,
    sessions: [makeSession(1, 'Flappy Session'), makeSession(99, 'Stable Session')],
  };
  writeJson(path.join(snapshotsDir, '2026-04-01T00-00-00Z.json'), s1);
  writeJson(path.join(snapshotsDir, '2026-04-02T00-00-00Z.json'), s2);
  writeJson(path.join(snapshotsDir, '2026-04-03T00-00-00Z.json'), s3);
  writeJson(path.join(snapshotsDir, '2026-04-04T00-00-00Z.json'), s4);
  writeJson(path.join(snapshotsDir, '2026-04-05T00-00-00Z.json'), current);
  writeJson(latestPath, current);
  fs.writeFileSync(templatePath, '<html><body>__GENERATED_ON__ __LEDE__ __CHANGELOG_HTML__</body></html>');

  generateChangelog([
    '--latest', latestPath,
    '--snapshots-dir', snapshotsDir,
    '--template', templatePath,
    '--output-summary', outputSummary,
    '--output-html', outputHtml,
  ]);

  const summary = JSON.parse(fs.readFileSync(outputSummary, 'utf8'));
  const flappyUpdate = summary.updates.find((update) => Array.isArray(update.flappyChanges) && update.flappyChanges.length > 0);
  assert.ok(flappyUpdate);
  assert.equal(flappyUpdate.added.length, 0);
  assert.equal(flappyUpdate.removed.length, 0);
  assert.equal(flappyUpdate.flappyChanges.length, 1);
  const html = fs.readFileSync(outputHtml, 'utf8');
  assert.match(html, /Flappy \/ unstable listings/);
  assert.match(html, /1 flappy listing/);
});

test('generate_changelog fails when latest.json does not match a snapshot on disk', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-changelog-mismatch-'));
  const snapshotsDir = path.join(tmpDir, 'snapshots');
  const latestPath = path.join(tmpDir, 'latest.json');
  const templatePath = path.join(tmpDir, 'changelog.template.html');
  const outputSummary = path.join(tmpDir, 'changelog-summary.json');
  const outputHtml = path.join(tmpDir, 'changelog.html');
  const previous = {
    scraped_at: '2026-04-04T06:24:23.616Z',
    count: 1,
    sessions: [makeSession(1, 'Session A')],
  };
  writeJson(path.join(snapshotsDir, '2026-04-04T06-24-23Z.json'), previous);
  writeJson(latestPath, { ...previous, scraped_at: '2026-04-05T16:43:11.520Z' });
  fs.writeFileSync(templatePath, '<html><body>__GENERATED_ON__ __LEDE__ __CHANGELOG_HTML__</body></html>');

  assert.throws(() => {
    generateChangelog([
      '--latest',
      latestPath,
      '--snapshots-dir',
      snapshotsDir,
      '--template',
      templatePath,
      '--output-summary',
      outputSummary,
      '--output-html',
      outputHtml,
    ]);
  }, /No snapshot.*matches latest scraped_at/);
});
