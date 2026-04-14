import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts/evaluate_gem_scheduler_output.mjs');
const fixturesDir = path.join(root, 'tests/fixtures');

function run(fixture, output) {
  const stdout = execFileSync('node', [script, path.join(fixturesDir, fixture), path.join(fixturesDir, output)], { encoding: 'utf8' });
  return JSON.parse(stdout);
}

test('evaluator passes the default-days sample output', () => {
  const result = run('gem-scheduler-default-days.json', 'gem-scheduler-default-days.output.txt');
  assert.equal(result.failed, 0);
  assert.equal(result.fixture, 'gem-scheduler-default-days.json');
});

test('evaluator passes the executive Thursday sample output', () => {
  const result = run('gem-scheduler-executive-thursday.json', 'gem-scheduler-executive-thursday.output.txt');
  assert.equal(result.failed, 0);
  assert.equal(result.fixture, 'gem-scheduler-executive-thursday.json');
});

test('evaluator passes the full-fallback sample output', () => {
  const result = run('gem-scheduler-full-fallback.json', 'gem-scheduler-full-fallback.output.txt');
  assert.equal(result.failed, 0);
  assert.equal(result.fixture, 'gem-scheduler-full-fallback.json');
});

test('evaluator passes the inspirational-career Stephanie sample output', () => {
  const result = run('gem-scheduler-inspirational-career-stephanie.json', 'gem-scheduler-inspirational-career-stephanie.output.txt');
  assert.equal(result.failed, 0);
  assert.equal(result.fixture, 'gem-scheduler-inspirational-career-stephanie.json');
});

test('whole dataset full-day schedule keeps Stephanie Wong in the Wednesday inspirational career plan', () => {
  const stdout = execFileSync('node', [script, path.join(root, 'sessions/classified_sessions.json'), path.join(fixturesDir, 'gem-scheduler-inspirational-career-full-day.output.txt')], { encoding: 'utf8' });
  const result = JSON.parse(stdout);
  assert.equal(result.failed, 0);
  assert.equal(result.fixture, 'classified_sessions.json');
  const checksByName = Object.fromEntries(result.checks.map((check) => [check.name, check]));
  assert.equal(checksByName['includes Stephanie Wong session in the full-day Wednesday schedule']?.pass, true);
  assert.equal(checksByName['covers all major Wednesday slots in the full-day plan']?.pass, true);
});
