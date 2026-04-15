#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const options = {
    snapshotsDir: 'sessions/snapshots',
    output: 'media/session-history.json',
    latest: 'sessions/latest.json',
    generatedAt: new Date().toISOString(),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--snapshots-dir') options.snapshotsDir = argv[++i];
    else if (arg === '--output') options.output = argv[++i];
    else if (arg === '--latest') options.latest = argv[++i];
    else if (arg === '--generated-at') options.generatedAt = argv[++i];
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

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function speakerList(session) {
  return (session?.speakers || []).map((speaker) => ({
    n: normalizeText(speaker?.name),
    c: normalizeText(speaker?.company),
  })).filter((speaker) => speaker.n || speaker.c);
}

function speakerSignature(speakers) {
  return JSON.stringify((speakers || []).map((speaker) => [speaker.n, speaker.c]));
}

function availabilityBand(entry) {
  const capacity = normalizeNumber(entry?.cap);
  const registrants = normalizeNumber(entry?.reg);
  const remaining = normalizeNumber(entry?.rem);
  if (remaining != null) {
    if (remaining <= 0) return 'full';
    if (remaining <= 10) return 'limited';
  }
  if (capacity && registrants != null) {
    const ratio = registrants / capacity;
    if (ratio >= 1) return 'full';
    if (ratio >= 0.9) return 'limited';
    if (ratio >= 0.6) return 'filling';
    return 'open';
  }
  return 'unknown';
}

function compactEntry(session) {
  const capacity = normalizeNumber(session?.capacity);
  const registrants = normalizeNumber(session?.registrant_count);
  const remaining = normalizeNumber(session?.remaining_capacity);
  return {
    t: normalizeText(session?.title),
    u: String(session?.url || '').trim(),
    d: normalizeText(session?.date_text),
    s: normalizeText(session?.start_time_text),
    e: normalizeText(session?.end_time_text),
    r: normalizeText(session?.room),
    cap: capacity,
    reg: registrants,
    rem: remaining,
    sp: speakerList(session),
  };
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
        file: path.relative(process.cwd(), filePath),
        scrapedAt,
        label: stableLabel(scrapedAt, name.replace(/\.json$/, '')),
        count: sessions.length,
        sessions,
      };
    });
}

function buildDataset(snapshots, latestPath) {
  const latestPayload = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  const latest = Array.isArray(latestPayload) ? latestPayload : (latestPayload.sessions || []);
  const histories = new Map();

  const ensureHistory = (key, session) => {
    if (!histories.has(key)) {
      histories.set(key, {
        id: key,
        url: String(session?.url || '').trim(),
        latestTitle: normalizeText(session?.title),
        timeline: Array.from({ length: snapshots.length }, () => null),
      });
    }
    return histories.get(key);
  };

  snapshots.forEach((snapshot, snapshotIndex) => {
    snapshot.sessions.forEach((session) => {
      const key = sessionKey(session);
      const history = ensureHistory(key, session);
      history.timeline[snapshotIndex] = compactEntry(session);
      if (!history.url && session?.url) history.url = String(session.url).trim();
      history.latestTitle = normalizeText(session?.title) || history.latestTitle;
    });
  });

  for (const session of latest) {
    const key = sessionKey(session);
    const history = ensureHistory(key, session);
    history.url = history.url || String(session?.url || '').trim();
    history.latestTitle = normalizeText(session?.title) || history.latestTitle;
  }

  const sessions = [];

  for (const history of histories.values()) {
    const uniqueTitleMoments = [];
    const timeline = history.timeline;
    let prevPresent = false;
    let prevEntry = null;
    let titleChangeCount = 0;
    let speakerChangeCount = 0;
    let fullnessChangeCount = 0;
    let timingChangeCount = 0;
    let presenceTransitions = 0;
    let firstSeenIndex = null;
    let lastSeenIndex = null;
    let peakRegistrants = null;
    let minRemaining = null;
    let latestFillPct = null;

    timeline.forEach((entry, index) => {
      const present = Boolean(entry);
      if (present && firstSeenIndex == null) firstSeenIndex = index;
      if (present) lastSeenIndex = index;
      if (index > 0 && present !== prevPresent) presenceTransitions += 1;
      if (!present) {
        prevPresent = false;
        prevEntry = null;
        return;
      }
      const reg = normalizeNumber(entry.reg);
      const rem = normalizeNumber(entry.rem);
      if (reg != null) peakRegistrants = peakRegistrants == null ? reg : Math.max(peakRegistrants, reg);
      if (rem != null) minRemaining = minRemaining == null ? rem : Math.min(minRemaining, rem);
      const cap = normalizeNumber(entry.cap);
      if (cap && reg != null) latestFillPct = Math.round((reg / cap) * 1000) / 10;
      else if (index === timeline.length - 1) latestFillPct = null;

      if (!uniqueTitleMoments.length || uniqueTitleMoments[uniqueTitleMoments.length - 1].title !== entry.t) {
        uniqueTitleMoments.push({ snapshotIndex: index, title: entry.t });
      }
      if (prevEntry) {
        if (prevEntry.t !== entry.t) titleChangeCount += 1;
        if (speakerSignature(prevEntry.sp) !== speakerSignature(entry.sp)) speakerChangeCount += 1;
        if (`${prevEntry.d}|${prevEntry.s}|${prevEntry.e}|${prevEntry.r}` !== `${entry.d}|${entry.s}|${entry.e}|${entry.r}`) timingChangeCount += 1;
        if (`${prevEntry.reg}|${prevEntry.rem}|${prevEntry.cap}|${availabilityBand(prevEntry)}` !== `${entry.reg}|${entry.rem}|${entry.cap}|${availabilityBand(entry)}`) fullnessChangeCount += 1;
      }
      prevPresent = true;
      prevEntry = entry;
    });

    const latestEntry = [...timeline].reverse().find(Boolean) || null;
    sessions.push({
      id: history.id,
      url: history.url,
      latestTitle: history.latestTitle || latestEntry?.t || history.id,
      firstSeenIndex,
      lastSeenIndex,
      titleChangeCount,
      speakerChangeCount,
      fullnessChangeCount,
      timingChangeCount,
      presenceTransitions,
      peakRegistrants,
      minRemaining,
      latestFillPct,
      uniqueTitles: uniqueTitleMoments,
      timeline,
      search: [history.id, history.latestTitle, latestEntry?.r || '', ...(latestEntry?.sp || []).flatMap((speaker) => [speaker.n, speaker.c])].filter(Boolean).join(' ').toLowerCase(),
    });
  }

  sessions.sort((a, b) => {
    const churnA = a.titleChangeCount + a.speakerChangeCount + a.fullnessChangeCount + a.presenceTransitions;
    const churnB = b.titleChangeCount + b.speakerChangeCount + b.fullnessChangeCount + b.presenceTransitions;
    return churnB - churnA || String(a.latestTitle).localeCompare(String(b.latestTitle));
  });

  return {
    generatedAt: new Date().toISOString(),
    snapshotCount: snapshots.length,
    snapshots: snapshots.map((snapshot) => ({
      index: snapshot.index,
      key: snapshot.key,
      scrapedAt: snapshot.scrapedAt,
      label: snapshot.label,
      count: snapshot.count,
      file: snapshot.file,
    })),
    sessions,
  };
}

const options = parseArgs(process.argv.slice(2));
const snapshots = loadSnapshots(options.snapshotsDir);
const dataset = buildDataset(snapshots, options.latest);
const outputPath = path.resolve(options.output);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`);
console.log(`Wrote ${path.relative(process.cwd(), outputPath)} with ${dataset.sessions.length} session histories across ${dataset.snapshotCount} snapshots.`);
