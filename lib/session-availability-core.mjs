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

export function mergeAvailabilityIntoSessions(sessions, availabilityRecords) {
  const byUrl = new Map(availabilityRecords.map((record) => [record.url, record]));
  return sessions.map((session) => {
    const availability = byUrl.get(session.url);
    return availability ? { ...session, ...availability } : session;
  });
}

export function createAvailabilityArtifact(availabilityRecords, { generatedAt = new Date().toISOString() } = {}) {
  return {
    generatedAt,
    records: availabilityRecords.map((record) => ({
      url: record.url || '',
      remaining_capacity: record.remaining_capacity ?? '',
      capacity: record.capacity ?? '',
      registrant_count: record.registrant_count ?? '',
      session_category: record.session_category ?? '',
      room: record.room ?? '',
    })).filter((record) => record.url),
  };
}
