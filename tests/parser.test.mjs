import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildIsoDateTime,
  dedupeSessionRecords,
  extractFirstJsonObjectAfterMarker,
  extractDescription,
  extractSessionIds,
  extractSessionRecordsFromLibrary,
  parseDateText,
  partitionSessionRecords,
  toSessionRecord,
  validateSessionRecord,
} from '../scrape_google_next.mjs';

const root = path.resolve('sessions/cache');
const page1 = fs.readFileSync(path.join(root, 'session-library.html'), 'utf8');
const page2 = fs.readFileSync(path.join(root, 'session-library-page-2.html'), 'utf8');
const keynote = fs.readFileSync(path.join(root, 'session-3922022.html'), 'utf8');
const geminiCli = fs.readFileSync(path.join(root, 'session-3920378.html'), 'utf8');

test('extracts embedded session ids from library pages', () => {
  assert.equal(extractSessionIds(page1).length, 60);
  assert.equal(extractSessionIds(page2).length, 75);
});

test('extracts session records with moreInfoUrl from paginated library pages', () => {
  const records = extractSessionRecordsFromLibrary(page2);
  assert.ok(records.length > 0);
  assert.ok(records.some((r) => r.url.includes('/session/3920535/gaming-assistant-with-gemini-live-api')));
  assert.ok(records.some((r) => r.title === 'Learn the basics of Gemini CLI'));
});

test('extracts show_sessions payload without relying on fixed trailer tokens', () => {
  const mutated = page2.replace('}, 19,1106,', '}, 99,2000,');
  const jsonObject = extractFirstJsonObjectAfterMarker(mutated, 'GoogleAgendaBuilder.show_sessions(');
  assert.ok(jsonObject);
  const records = extractSessionRecordsFromLibrary(mutated);
  assert.ok(records.length > 0);
});



test('extracts scheduled and unscheduled dates from library records', () => {
  const records = extractSessionRecordsFromLibrary(page1);
  assert.ok(records.some((r) => r.date_text === 'Wednesday, April 22, 2026'));
  assert.ok(records.some((r) => r.date_text === 'Thursday, April 23, 2026'));
  assert.ok(records.some((r) => r.date_text === ''));
});

test('extracts full description from Gemini CLI session page', () => {
  const desc = extractDescription(geminiCli);
  assert.match(desc, /what's new and what's next for Gemini CLI/i);
});

test('builds machine-friendly ISO datetime', () => {
  assert.equal(buildIsoDateTime('Wednesday, April 22, 2026', '1:30 PM'), '2026-04-22T13:30:00');
});

test('parses date strings with and without weekday prefixes deterministically', () => {
  assert.equal(parseDateText('Wednesday, April 22, 2026')?.toISOString(), '2026-04-22T00:00:00.000Z');
  assert.equal(parseDateText('April 22, 2026')?.toISOString(), '2026-04-22T00:00:00.000Z');
});

test('rejects impossible calendar dates', () => {
  assert.equal(parseDateText('February 31, 2026'), null);
});

test('parses keynote session with URL, room, datetime, and speakers', () => {
  const rec = toSessionRecord('https://www.googlecloudevents.com/next-vegas/session/3922022/opening-keynote-the-agentic-cloud', keynote);
  assert.equal(rec.room, 'Michelob ULTRA Arena');
  assert.equal(rec.start_at, '2026-04-22T09:00:00');
  assert.equal(rec.end_at, '2026-04-22T10:30:00');
  assert.ok(rec.speakers.length > 0);
  assert.match(rec.description, /The Next '26 Opening Keynote/i);
});

test('validates malformed session records', () => {
  const malformed = {
    title: 'Example',
    url: 'https://example.test/session/1',
    topics: ['ok', 42],
    speakers: [{ name: '', company: 'ExampleCo' }],
    start_at: '2026-04-22',
    end_at: '2026-04-22T10:00:00',
  };
  const result = validateSessionRecord(malformed);
  assert.equal(result.valid, false);
  assert.ok(result.issues.includes('topics must contain only strings'));
  assert.ok(result.issues.includes('speakers must include valid name/company values'));
  assert.ok(result.issues.includes('invalid start_at'));
});


test('dedupes and partitions library records into date buckets', () => {
  const records = [
    ...extractSessionRecordsFromLibrary(page1),
    ...extractSessionRecordsFromLibrary(page2),
  ];
  const deduped = dedupeSessionRecords(records);
  assert.ok(deduped.length < records.length);
  const buckets = partitionSessionRecords(deduped);
  assert.ok(buckets.has('Wednesday, April 22, 2026'));
  assert.ok(buckets.has('Thursday, April 23, 2026'));
  assert.ok(buckets.has('UNSCHEDULED'));
});
