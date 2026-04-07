import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildIsoDateTime,
  computeDetailFingerprint,
  dedupeSessionRecords,
  extractDescription,
  extractSessionIds,
  extractSessionRecordsFromLibrary,
  extractSessionSource,
  isReusableDetailEntry,
  mergeFreshLibraryFields,
  partitionSessionRecords,
  toSessionRecord,
} from '../scrape_google_next.mjs';

const root = path.resolve('sessions/cache');
const page1 = fs.readFileSync(path.join(root, 'session-library.html'), 'utf8');
const page2 = fs.readFileSync(path.join(root, 'session-library-page-2.html'), 'utf8');
const keynote = fs.readFileSync(path.join(root, 'session-3922022.html'), 'utf8');
const geminiCli = fs.readFileSync(path.join(root, 'session-3911908.html'), 'utf8');

test('extracts embedded session ids from library pages', () => {
  assert.equal(extractSessionIds(page1).length, 60);
  assert.equal(extractSessionIds(page2).length, 75);
});

test('extracts session records with moreInfoUrl from paginated library pages', () => {
  const records = extractSessionRecordsFromLibrary(page2);
  assert.ok(records.length > 0);
  assert.ok(records.every((r) => typeof r.url === 'string' && r.url.includes('/session/')));
  assert.ok(records.some((r) => /gemini cli/i.test(r.title)));
});



test('extracts scheduled and unscheduled dates from library records', () => {
  const records = extractSessionRecordsFromLibrary(page1);
  assert.ok(records.some((r) => r.date_text === 'Wednesday, April 22, 2026'));
  assert.ok(records.some((r) => r.date_text === 'Thursday, April 23, 2026'));
  assert.ok(records.some((r) => r.date_text === ''));
});

test('extracts full description from Gemini CLI session page', () => {
  const desc = extractDescription(geminiCli);
  assert.match(desc, /Gemini CLI/i);
  assert.match(desc, /Agent Skills|subagents|productivity/i);
});

test('extracts a source-first session model with speaker job titles', () => {
  const source = extractSessionSource(geminiCli);
  assert.equal(source.sourceSession.id, '3911908');
  assert.equal(source.sourceSession.name, '10x productivity with the Gemini CLI');
  assert.match(source.sourceDescription, /Gemini CLI/i);
  assert.ok(source.sourceSpeakers.length >= 2);
  assert.deepEqual(source.sourceSpeakers[0], {
    name: 'Dmitry Lyalin',
    company: 'Google Cloud',
    job_title: 'Group Product manager',
    moreInfoUrl: 'https://www.googlecloudevents.com/next-vegas/speaker/2144511/dmitry-lyalin',
  });
});

test('builds machine-friendly ISO datetime', () => {
  assert.equal(buildIsoDateTime('Wednesday, April 22, 2026', '1:30 PM'), '2026-04-22T13:30:00');
});

test('parses keynote session with URL, room, datetime, and speakers', () => {
  const rec = toSessionRecord('https://www.googlecloudevents.com/next-vegas/session/3922022/opening-keynote-the-agentic-cloud', keynote);
  assert.equal(rec.room, 'Michelob ULTRA Arena');
  assert.equal(rec.start_at, '2026-04-22T09:00:00');
  assert.equal(rec.end_at, '2026-04-22T10:30:00');
  assert.ok(rec.speakers.length > 0);
  assert.ok(rec.speakers.every((speaker) => 'job_title' in speaker));
  assert.match(rec.description, /The Next '26 Opening Keynote/i);
});


test('dedupes and partitions library records into date buckets', () => {
  const records = [
    ...extractSessionRecordsFromLibrary(page1),
    ...extractSessionRecordsFromLibrary(page2),
  ];
  const deduped = dedupeSessionRecords(records);
  assert.ok(deduped.length <= records.length);
  const uniqueUrls = new Set(deduped.map((record) => record.url));
  assert.equal(uniqueUrls.size, deduped.length);
  const buckets = partitionSessionRecords(deduped);
  assert.ok(buckets.has('Wednesday, April 22, 2026'));
  assert.ok(buckets.has('Thursday, April 23, 2026'));
  assert.ok(buckets.has('UNSCHEDULED'));
});

test('detail fingerprint is stable for unchanged library metadata and changes when relevant fields change', () => {
  const [record] = extractSessionRecordsFromLibrary(page1);
  assert.ok(record);

  const sameFingerprint = computeDetailFingerprint({ ...record });
  assert.equal(computeDetailFingerprint(record), sameFingerprint);

  const changedTime = computeDetailFingerprint({
    ...record,
    start_time_text: '11:45 AM',
  });
  assert.notEqual(changedTime, sameFingerprint);

  const changedCapacity = computeDetailFingerprint({
    ...record,
    remaining_capacity: 7,
  });
  assert.notEqual(changedCapacity, sameFingerprint);
});

test('detail reuse requires matching manifest fingerprint, previous enriched data, and cache presence', () => {
  const [record] = extractSessionRecordsFromLibrary(page2);
  const fingerprint = computeDetailFingerprint(record);

  assert.equal(
    isReusableDetailEntry({
      manifestEntry: { fingerprint },
      record,
      enrichedRecord: { url: record.url, title: record.title },
      cacheExists: true,
      forceRefresh: false,
    }),
    true,
  );

  assert.equal(
    isReusableDetailEntry({
      manifestEntry: { fingerprint: 'stale' },
      record,
      enrichedRecord: { url: record.url, title: record.title },
      cacheExists: true,
      forceRefresh: false,
    }),
    false,
  );

  assert.equal(
    isReusableDetailEntry({
      manifestEntry: { fingerprint },
      record,
      enrichedRecord: null,
      cacheExists: true,
      forceRefresh: false,
    }),
    false,
  );

  assert.equal(
    isReusableDetailEntry({
      manifestEntry: { fingerprint },
      record,
      enrichedRecord: { url: record.url, title: record.title },
      cacheExists: false,
      forceRefresh: false,
    }),
    false,
  );

  assert.equal(
    isReusableDetailEntry({
      manifestEntry: { fingerprint },
      record,
      enrichedRecord: { url: record.url, title: record.title },
      cacheExists: true,
      forceRefresh: true,
    }),
    false,
  );
});

test('detail reuse keeps rich cached fields while refreshing live library fields', () => {
  const merged = mergeFreshLibraryFields(
    {
      id: '123',
      url: 'https://example.com/session/123/demo',
      title: 'Old title',
      room: 'Old room',
      remaining_capacity: 42,
      registrant_count: 100,
      description: 'keep me',
      speakers: [{ name: 'Ada' }],
      topics: ['ai'],
    },
    {
      id: '123',
      url: 'https://example.com/session/123/demo',
      title: 'New title',
      room: 'New room',
      remaining_capacity: 5,
      registrant_count: 111,
      capacity: 60,
    },
  );

  assert.equal(merged.title, 'New title');
  assert.equal(merged.room, 'New room');
  assert.equal(merged.remaining_capacity, 5);
  assert.equal(merged.registrant_count, 111);
  assert.equal(merged.capacity, 60);
  assert.equal(merged.description, 'keep me');
  assert.deepEqual(merged.speakers, [{ name: 'Ada' }]);
  assert.deepEqual(merged.topics, ['ai']);
});
