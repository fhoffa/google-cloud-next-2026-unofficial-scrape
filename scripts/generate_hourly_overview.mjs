#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DAY_ORDER = [
  'Wednesday, April 22, 2026',
  'Thursday, April 23, 2026',
  'Friday, April 24, 2026',
];

function parseArgs(argv) {
  const options = {
    snapshotsDir: 'sessions/snapshots',
    latestSessions: 'sessions/latest.json',
    output: 'media/hourly-overview.json',
    latestOutput: 'media/hourly-overview-latest.json',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--snapshots-dir') options.snapshotsDir = argv[++i];
    else if (arg === '--latest-sessions') options.latestSessions = argv[++i];
    else if (arg === '--output') options.output = argv[++i];
    else if (arg === '--latest-output') options.latestOutput = argv[++i];
  }
  return options;
}

function sessionKey(session) {
  const explicitId = String(session?.id || '').trim();
  const explicitMatch = explicitId.match(/\/(?:session\/)?(\d+)(?:\/|$)/) || explicitId.match(/^(\d+)$/);
  if (explicitMatch) return explicitMatch[1];
  const url = String(session?.url || '').trim();
  const match = url.match(/\/session\/(\d+)(?:\/|$)/);
  if (match) return match[1];
  return explicitId || url || String(session?.title || '').trim();
}

function normalizeNumber(value) {
  if (value == null || value === '') return null;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function parseTimeToMinutes(text) {
  const match = String(text || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  const minute = Number(match[2]);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM') hour += 12;
  return hour * 60 + minute;
}

function clampHourRange(startMinutes, endMinutes) {
  const startHour = Math.floor(startMinutes / 60);
  const endHour = Math.max(startHour + 1, Math.ceil(endMinutes / 60));
  return [startHour, endHour];
}

function stableLabel(scrapedAt, fallbackName) {
  const parsed = new Date(scrapedAt || fallbackName);
  if (Number.isNaN(parsed.getTime())) return fallbackName;
  return parsed.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
}

function loadSnapshots(snapshotsDir) {
  return fs.readdirSync(snapshotsDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name, index) => {
      const filePath = path.join(snapshotsDir, name);
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const sessions = Array.isArray(payload) ? payload : (payload.sessions || []);
      const scrapedAt = payload.scraped_at || payload.scrapedAt || name.replace(/\.json$/, '');
      return {
        index,
        key: name.replace(/\.json$/, ''),
        scrapedAt,
        label: stableLabel(scrapedAt, name.replace(/\.json$/, '')),
        sessions,
      };
    });
}

function loadLatestSessionLookup(latestSessionsPath) {
  const payload = JSON.parse(fs.readFileSync(latestSessionsPath, 'utf8'));
  const sessions = Array.isArray(payload) ? payload : (payload.sessions || []);
  return new Map(sessions.map((session) => [sessionKey(session), session]));
}

function buildOverview(snapshots, latestLookup) {
  const dayHourSet = new Set();
  const sessionIndex = new Map();

  const snapshotViews = snapshots.map((snapshot) => {
    const perHour = new Map();
    const compactSessions = [];

    for (const session of snapshot.sessions) {
      const day = String(session?.date_text || '').trim();
      if (!DAY_ORDER.includes(day)) continue;
      const startMinutes = parseTimeToMinutes(session?.start_time_text);
      const endMinutes = parseTimeToMinutes(session?.end_time_text);
      if (startMinutes == null || endMinutes == null) continue;
      const [startHour, endHour] = clampHourRange(startMinutes, endMinutes);
      const registrants = normalizeNumber(session?.registrant_count);
      const remaining = normalizeNumber(session?.remaining_capacity);
      const capacity = normalizeNumber(session?.capacity);
      const id = sessionKey(session);
      const title = String(session?.title || '').trim();
      const url = String(session?.url || '').trim();
      const room = String(session?.room || '').trim();
      const latestSession = latestLookup.get(id) || {};
      const mergedSpeakers = Array.isArray(session?.speakers) && session.speakers.length ? session.speakers : (latestSession.speakers || []);
      const speakers = Array.isArray(mergedSpeakers)
        ? mergedSpeakers.map((speaker) => ({
            n: String(speaker?.name || '').trim(),
            c: String(speaker?.company || '').trim(),
          })).filter((speaker) => speaker.n)
        : [];
      const sponsorName = String(latestSession?.sponsor_name || session?.sponsor_name || '').trim();
      const description = String(latestSession?.description || session?.description || '').trim();
      const sponsored = Boolean(latestSession?.sponsored || session?.sponsored);
      const searchText = [
        title,
        description,
        ...speakers.flatMap((speaker) => [speaker.n, speaker.c]),
        sponsored ? 'sponsored sponsor sponsor_disclosure' : '',
      ].filter(Boolean).join(' ').toLowerCase();
      const dayIndex = DAY_ORDER.indexOf(day);
      compactSessions.push({
        id,
        t: title,
        u: url,
        d: dayIndex,
        sm: startMinutes,
        em: endMinutes,
        sh: startHour,
        eh: endHour,
        reg: registrants,
        rem: remaining,
        cap: capacity,
        r: room,
        sp: speakers,
        spon: sponsored,
        scon: sponsorName,
        desc: description,
        q: searchText,
      });
      if (!sessionIndex.has(id)) sessionIndex.set(id, { id, title, url });
      for (let hour = startHour; hour < endHour; hour += 1) {
        const key = `${dayIndex}:${hour}`;
        if (!perHour.has(key)) perHour.set(key, { totalReserved: 0, topSession: null, sessionCount: 0 });
        const bucket = perHour.get(key);
        bucket.sessionCount += 1;
        if (registrants != null) {
          bucket.totalReserved += registrants;
          if (!bucket.topSession || registrants > (bucket.topSession.reg ?? -1)) {
            bucket.topSession = { id, title, reg: registrants, url };
          }
        }
        dayHourSet.add(key);
      }
    }

    return {
      index: snapshot.index,
      key: snapshot.key,
      label: snapshot.label,
      scrapedAt: snapshot.scrapedAt,
      hours: Object.fromEntries([...perHour.entries()].map(([key, value]) => [key, value])),
      sessions: compactSessions,
    };
  });

  const hours = [...dayHourSet].map((key) => {
    const [dayIndex, hour] = key.split(':').map(Number);
    return { key, dayIndex, hour };
  }).sort((a, b) => a.dayIndex - b.dayIndex || a.hour - b.hour);

  const hourRange = {
    min: Math.min(...hours.map((item) => item.hour)),
    max: Math.max(...hours.map((item) => item.hour + 1)),
  };

  return {
    generatedAt: new Date().toISOString(),
    days: DAY_ORDER,
    hourRange,
    snapshots: snapshotViews,
    sessions: [...sessionIndex.values()],
  };
}

const options = parseArgs(process.argv.slice(2));
const snapshots = loadSnapshots(options.snapshotsDir);
const latestLookup = loadLatestSessionLookup(options.latestSessions);
const data = buildOverview(snapshots, latestLookup);
const latestData = {
  ...data,
  snapshots: data.snapshots.length ? [data.snapshots[data.snapshots.length - 1]] : [],
};
const outputPath = path.resolve(options.output);
const latestOutputPath = path.resolve(options.latestOutput);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`);
fs.writeFileSync(latestOutputPath, `${JSON.stringify(latestData, null, 2)}\n`);
console.log(`Wrote ${path.relative(process.cwd(), outputPath)} with ${data.snapshots.length} snapshots.`);
console.log(`Wrote ${path.relative(process.cwd(), latestOutputPath)} with ${latestData.snapshots.length} snapshot.`);
