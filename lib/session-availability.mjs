import fs from 'node:fs';
import path from 'node:path';

import { extractSessionRecordsFromLibrary } from '../scrape_google_next.mjs';
export {
  availabilityBand,
  availabilityCounts,
  createAvailabilityArtifact,
  mergeAvailabilityIntoSessions,
  normalizeNumber,
} from './session-availability-core.mjs';

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
