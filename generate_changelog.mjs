/**
 * generate_changelog.mjs
 *
 * Diffs consecutive session snapshots and writes sessions/changelog.json.
 * Run this after each scrape to update the changelog shown on the website.
 *
 * Usage:
 *   node generate_changelog.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SNAPSHOTS_DIR = 'sessions/snapshots';
const OUTPUT_FILE = 'sessions/changelog.json';

const TRACKED_FIELDS = [
  'title',
  'description',
  'room',
  'start_at',
  'end_at',
  'date_text',
  'start_time_text',
  'end_time_text',
];

function sessionKey(session) {
  const url = String(session?.url || '').trim();
  const match = url.match(/\/session\/(\d+)(?:\/|$)/);
  return match ? match[1] : (url || String(session?.title || ''));
}

function diffSessions(prev, curr) {
  const prevMap = new Map(prev.map((s) => [sessionKey(s), s]));
  const currMap = new Map(curr.map((s) => [sessionKey(s), s]));

  const added = [];
  const removed = [];
  const modified = [];

  for (const [key, session] of currMap) {
    if (!prevMap.has(key)) {
      added.push({ key, title: session.title, url: session.url || '' });
    } else {
      const old = prevMap.get(key);
      const changes = {};

      for (const field of TRACKED_FIELDS) {
        if (old[field] !== session[field]) {
          changes[field] = { old: old[field] ?? null, new: session[field] ?? null };
        }
      }

      // Compare speakers (order-insensitive)
      const sortedSpeakers = (arr) =>
        [...(arr || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      const oldSpk = JSON.stringify(sortedSpeakers(old.speakers));
      const newSpk = JSON.stringify(sortedSpeakers(session.speakers));
      if (oldSpk !== newSpk) {
        changes.speakers = { old: old.speakers || [], new: session.speakers || [] };
      }

      // Compare topics (order-insensitive)
      const sortedTopics = (arr) => [...(arr || [])].sort();
      const oldTop = JSON.stringify(sortedTopics(old.topics));
      const newTop = JSON.stringify(sortedTopics(session.topics));
      if (oldTop !== newTop) {
        changes.topics = { old: old.topics || [], new: session.topics || [] };
      }

      if (Object.keys(changes).length > 0) {
        modified.push({ key, title: session.title, url: session.url || '', changes });
      }
    }
  }

  for (const [key, session] of prevMap) {
    if (!currMap.has(key)) {
      removed.push({ key, title: session.title, url: session.url || '' });
    }
  }

  return { added, removed, modified };
}

function formatSnapshotName(name) {
  // "2026-03-27T16-38-31Z" → "2026-03-27 16:38 UTC"
  const match = name.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})/);
  if (!match) return name;
  return `${match[1]} ${match[2]}:${match[3]} UTC`;
}

const allFiles = readdirSync(SNAPSHOTS_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

// Only compare "complete" snapshots — those produced by merge_buckets.mjs,
// which include the 'buckets' metadata field. Per-bucket scraper snapshots
// (which only contain sessions from a single day) are skipped to avoid false
// removals caused by incremental scraping.
const files = allFiles.filter((f) => {
  try {
    const data = JSON.parse(readFileSync(join(SNAPSHOTS_DIR, f), 'utf8'));
    return Array.isArray(data.buckets);
  } catch {
    return false;
  }
});

if (files.length < 2) {
  console.log(`Found ${files.length} complete snapshot(s) (need at least 2 to diff). No changelog written.`);
  // Write empty changelog so the website can still load it
  writeFileSync(OUTPUT_FILE, JSON.stringify({ generated_at: new Date().toISOString(), snapshot_count: allFiles.length, complete_snapshots: files.length, entries: [] }, null, 2));
  process.exit(0);
}

const entries = [];

for (let i = 1; i < files.length; i++) {
  const fromFile = files[i - 1];
  const toFile = files[i];

  const fromData = JSON.parse(readFileSync(join(SNAPSHOTS_DIR, fromFile), 'utf8'));
  const toData = JSON.parse(readFileSync(join(SNAPSHOTS_DIR, toFile), 'utf8'));

  const fromSessions = fromData.sessions || [];
  const toSessions = toData.sessions || [];

  const diff = diffSessions(fromSessions, toSessions);

  if (diff.added.length || diff.removed.length || diff.modified.length) {
    const fromName = fromFile.replace('.json', '');
    const toName = toFile.replace('.json', '');
    entries.push({
      from: fromName,
      to: toName,
      from_label: formatSnapshotName(fromName),
      to_label: formatSnapshotName(toName),
      from_count: fromSessions.length,
      to_count: toSessions.length,
      added_count: diff.added.length,
      removed_count: diff.removed.length,
      modified_count: diff.modified.length,
      added: diff.added,
      removed: diff.removed,
      modified: diff.modified,
    });
  }
}

const output = {
  generated_at: new Date().toISOString(),
  snapshot_count: files.length,
  entries,
};

writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
console.log(`Wrote ${entries.length} changelog entries to ${OUTPUT_FILE}`);
if (entries.length > 0) {
  const totals = entries.reduce(
    (acc, e) => ({ added: acc.added + e.added_count, removed: acc.removed + e.removed_count, modified: acc.modified + e.modified_count }),
    { added: 0, removed: 0, modified: 0 },
  );
  console.log(`  Total: +${totals.added} added, -${totals.removed} removed, ~${totals.modified} modified`);
}
