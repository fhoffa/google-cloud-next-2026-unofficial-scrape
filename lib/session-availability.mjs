import fs from 'node:fs';
import path from 'node:path';

import { extractSessionRecordsFromLibrary } from '../scrape_google_next.mjs';

export function normalizeNumber(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function availabilityBand(session) {
  const remaining = normalizeNumber(session?.remaining_capacity);
  if (remaining == null) return 'unknown';
  if (remaining === 0) return 'full';
  return 'not-full';
}

export function availabilityCounts(sessions) {
  const counts = { known: 0, full: 0, 'not-full': 0, unknown: 0 };
  for (const session of sessions) {
    const band = availabilityBand(session);
    counts[band] += 1;
    if (band !== 'unknown') counts.known += 1;
  }
  return counts;
}

export function loadLibraryAvailabilityRecords(cacheDir) {
  if (!fs.existsSync(cacheDir)) return [];
  const files = fs.readdirSync(cacheDir)
    .filter((name) => /^session-library(?:-page-\d+)?\.html$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const recordsByUrl = new Map();
  for (const file of files) {
    const html = fs.readFileSync(path.join(cacheDir, file), 'utf8');
    for (const record of extractSessionRecordsFromLibrary(html)) {
      if (record?.url) recordsByUrl.set(record.url, record);
    }
  }
  return [...recordsByUrl.values()];
}

export function mergeAvailabilityIntoSessions(sessions, availabilityRecords) {
  const byUrl = new Map(availabilityRecords.map((record) => [record.url, record]));
  return sessions.map((session) => {
    const availability = byUrl.get(session.url);
    return availability ? { ...session, ...availability } : session;
  });
}
