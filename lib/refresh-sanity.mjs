import fs from 'node:fs';
import path from 'node:path';

import { availabilityBand, normalizeNumber } from './session-availability.mjs';

export function sessionKey(session) {
  const explicitId = String(session?.id || '').trim();
  const explicitMatch = explicitId.match(/\/session\/(\d+)(?:\/|$)/) || explicitId.match(/^(\d+)$/);
  if (explicitMatch) return explicitMatch[1];
  const url = String(session?.url || '').trim();
  const urlMatch = url.match(/\/session\/(\d+)(?:\/|$)/);
  if (urlMatch) return urlMatch[1];
  return explicitId || url || String(session?.title || '').trim();
}

export function readSessionsPayload(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const sessions = Array.isArray(data?.sessions) ? data.sessions : (Array.isArray(data) ? data : []);
  return { data, sessions };
}

export function loadSnapshots(snapshotsDir) {
  if (!fs.existsSync(snapshotsDir)) return [];
  return fs.readdirSync(snapshotsDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const file = path.join(snapshotsDir, name);
      const { data, sessions } = readSessionsPayload(file);
      return {
        file,
        fileName: name,
        scrapedAt: data?.scraped_at || name.replace(/\.json$/, ''),
        sessions,
      };
    })
    .filter((entry) => entry.sessions.length > 0);
}

export function compareAvailability(previous, current) {
  const previousMap = new Map(previous.sessions.map((session) => [sessionKey(session), session]));
  const currentMap = new Map(current.sessions.map((session) => [sessionKey(session), session]));
  const added = [];
  const removed = [];
  const seatDeltas = [];
  const registrantDeltas = [];
  let overlappingSessions = 0;
  let bandChangeCount = 0;

  for (const [key, after] of currentMap.entries()) {
    const before = previousMap.get(key);
    if (!before) {
      added.push({
        title: after.title || '',
        url: after.url || '',
      });
      continue;
    }
    overlappingSessions += 1;

    const beforeRemaining = normalizeNumber(before.remaining_capacity);
    const afterRemaining = normalizeNumber(after.remaining_capacity);
    const beforeRegistrant = normalizeNumber(before.registrant_count);
    const afterRegistrant = normalizeNumber(after.registrant_count);
    const beforeBand = availabilityBand(before);
    const afterBand = availabilityBand(after);

    if (beforeBand !== afterBand) bandChangeCount += 1;

    if (beforeRemaining != null && afterRemaining != null && beforeRemaining !== afterRemaining) {
      seatDeltas.push({
        title: after.title || before.title || '',
        url: after.url || before.url || '',
        before: beforeRemaining,
        after: afterRemaining,
        delta: afterRemaining - beforeRemaining,
      });
    }
    if (beforeRegistrant != null && afterRegistrant != null && beforeRegistrant !== afterRegistrant) {
      registrantDeltas.push({
        title: after.title || before.title || '',
        url: after.url || before.url || '',
        before: beforeRegistrant,
        after: afterRegistrant,
        delta: afterRegistrant - beforeRegistrant,
      });
    }
  }

  for (const [key, before] of previousMap.entries()) {
    if (currentMap.has(key)) continue;
    removed.push({
      title: before.title || '',
      url: before.url || '',
    });
  }

  const byMagnitude = (left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.title.localeCompare(right.title);
  seatDeltas.sort(byMagnitude);
  registrantDeltas.sort(byMagnitude);

  return {
    addedCount: added.length,
    removedCount: removed.length,
    overlappingSessions,
    bandChangeCount,
    changedRemainingCount: seatDeltas.length,
    totalRemainingDelta: seatDeltas.reduce((sum, item) => sum + item.delta, 0),
    changedRegistrantCount: registrantDeltas.length,
    totalRegistrantDelta: registrantDeltas.reduce((sum, item) => sum + item.delta, 0),
    added: added.slice(0, 12),
    removed: removed.slice(0, 12),
    topRemainingDeltas: seatDeltas.slice(0, 12),
    topRegistrantDeltas: registrantDeltas.slice(0, 12),
  };
}

export function buildRefreshSanityReport({ latestPath, snapshotsDir }) {
  const latest = readSessionsPayload(latestPath);
  const snapshots = loadSnapshots(snapshotsDir);
  const issues = [];
  const latestScrapedAt = latest.data?.scraped_at || '';
  const newestSnapshot = snapshots.at(-1) || null;

  if (!latestScrapedAt) {
    issues.push({ level: 'error', code: 'latest-missing-scraped-at', message: `Latest payload ${latestPath} is missing scraped_at.` });
  }

  const currentIndex = snapshots.findIndex((snapshot) => snapshot.scrapedAt === latestScrapedAt);
  const currentSnapshot = currentIndex >= 0 ? snapshots[currentIndex] : null;
  if (!currentSnapshot) {
    issues.push({
      level: 'error',
      code: 'latest-snapshot-mismatch',
      message: `No snapshot in ${snapshotsDir} matches latest scraped_at ${latestScrapedAt || '(missing)'}.`,
    });
  }

  if (currentSnapshot && newestSnapshot && currentSnapshot.fileName !== newestSnapshot.fileName) {
    issues.push({
      level: 'error',
      code: 'latest-not-newest-snapshot',
      message: `Latest payload matches ${currentSnapshot.fileName}, but the newest snapshot on disk is ${newestSnapshot.fileName}.`,
    });
  }

  if (currentSnapshot && latest.sessions.length !== currentSnapshot.sessions.length) {
    issues.push({
      level: 'error',
      code: 'latest-count-mismatch',
      message: `Latest payload count ${latest.sessions.length} does not match ${currentSnapshot.fileName} count ${currentSnapshot.sessions.length}.`,
    });
  }

  const previousSnapshot = currentIndex > 0 ? snapshots[currentIndex - 1] : null;
  if (currentSnapshot && !previousSnapshot) {
    issues.push({
      level: 'error',
      code: 'missing-previous-snapshot',
      message: `No previous snapshot exists before ${currentSnapshot.fileName}.`,
    });
  }

  const comparison = currentSnapshot && previousSnapshot
    ? compareAvailability(previousSnapshot, currentSnapshot)
    : null;

  if (
    comparison &&
    comparison.bandChangeCount === 0 &&
    (comparison.changedRemainingCount > 0 || comparison.changedRegistrantCount > 0)
  ) {
    issues.push({
      level: 'warning',
      code: 'hidden-availability-drift',
      message: `Seat/registrant counts changed for ${Math.max(comparison.changedRemainingCount, comparison.changedRegistrantCount)} overlapping sessions, but no session crossed the full/not-full availability band boundary.`,
    });
  }

  return {
    latest: {
      file: latestPath,
      scrapedAt: latestScrapedAt,
      count: latest.sessions.length,
    },
    pair: currentSnapshot && previousSnapshot
      ? {
          current: {
            file: currentSnapshot.file,
            fileName: currentSnapshot.fileName,
            scrapedAt: currentSnapshot.scrapedAt,
            count: currentSnapshot.sessions.length,
          },
          previous: {
            file: previousSnapshot.file,
            fileName: previousSnapshot.fileName,
            scrapedAt: previousSnapshot.scrapedAt,
            count: previousSnapshot.sessions.length,
          },
        }
      : null,
    comparison,
    issues,
  };
}
