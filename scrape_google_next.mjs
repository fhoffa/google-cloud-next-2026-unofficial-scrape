#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE = 'https://www.googlecloudevents.com';
const LIBRARY_URL = `${BASE}/next-vegas/session-library`;
const OUT_DIR = path.resolve('sessions');
const LATEST_JSON = path.join(OUT_DIR, 'latest.json');
const BY_DAY_DIR = path.join(OUT_DIR, 'by-day');
const SNAPSHOTS_DIR = path.join(OUT_DIR, 'snapshots');
const CACHE_DIR = path.join(OUT_DIR, 'cache');
const DETAIL_MANIFEST_PATH = path.join(OUT_DIR, 'detail-manifest.json');
const DETAIL_MANIFEST_VERSION = 1;

const CONFIG = {
  minDelayMs: Number(process.env.MIN_DELAY_MS || 1200),
  maxDelayMs: Number(process.env.MAX_DELAY_MS || 2600),
  retries: Number(process.env.RETRIES || 4),
  timeoutMs: Number(process.env.TIMEOUT_MS || 30000),
  forceRefresh: process.env.FORCE_REFRESH === '1',
  useLibraryCache: process.env.USE_LIBRARY_CACHE === '1',
  maxSessions: process.env.MAX_SESSIONS ? Number(process.env.MAX_SESSIONS) : null,
  bucket: process.env.BUCKET || '',
  userAgent:
    process.env.USER_AGENT ||
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 polite-research-scraper/0.1',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function politeDelay() {
  await sleep(randInt(CONFIG.minDelayMs, CONFIG.maxDelayMs));
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function snapshotStamp(isoString) {
  return isoString.replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z');
}

async function fetchText(url, { cacheKey = null, preferCache = true } = {}) {
  await ensureDir(CACHE_DIR);
  const cachePath = cacheKey ? path.join(CACHE_DIR, cacheKey) : null;

  if (cachePath && preferCache && !CONFIG.forceRefresh) {
    try {
      return await fs.readFile(cachePath, 'utf8');
    } catch {}
  }

  let lastErr;
  for (let attempt = 1; attempt <= CONFIG.retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
    try {
      if (attempt > 1) {
        await sleep(attempt * 1500 + randInt(200, 900));
      }
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'user-agent': CONFIG.userAgent,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          referer: LIBRARY_URL,
        },
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      const text = await res.text();
      if (cachePath) await fs.writeFile(cachePath, text, 'utf8');
      return text;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
    }
  }
  throw lastErr;
}

function decodeJsonEscapedUrl(s) {
  return s.replace(/\\\//g, '/');
}

function unique(arr) {
  return [...new Set(arr)];
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function dedupeSessionRecords(records) {
  const byUrl = new Map();
  for (const record of records) {
    if (!record?.url) continue;
    byUrl.set(record.url, record);
  }
  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
}

function bucketKeyForRecord(record) {
  return record.date_text || 'UNSCHEDULED';
}

function bucketFileSlug(bucket) {
  if (bucket === 'UNSCHEDULED') return 'unscheduled';
  const parsed = parseDateText(bucket);
  if (!parsed) return bucket.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const y = parsed.getUTCFullYear();
  const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const d = String(parsed.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function partitionSessionRecords(records) {
  const buckets = new Map();
  for (const record of dedupeSessionRecords(records)) {
    const key = bucketKeyForRecord(record);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(record);
  }
  return buckets;
}

function extractSessionIds(libraryHtml) {
  return unique([...libraryHtml.matchAll(/"session_(\d+)"\s*:\s*\{/g)].map((m) => m[1])).sort();
}

function extractBalancedJsonObject(text, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let started = false;
  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (!started) {
      if (ch === '{') {
        started = true;
        depth = 1;
      } else if (/\s/.test(ch)) {
        continue;
      } else {
        return null;
      }
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, i + 1);
    }
  }
  return null;
}

function extractSessionRecordsFromLibrary(libraryHtml) {
  const records = [];
  const marker = 'GoogleAgendaBuilder.show_sessions(';
  const start = libraryHtml.indexOf(marker);
  if (start === -1) return records;
  const jsonStart = start + marker.length;
  const jsonText = extractBalancedJsonObject(libraryHtml, jsonStart);
  if (!jsonText) return records;

  try {
    const parsed = JSON.parse(jsonText);
    for (const [key, value] of Object.entries(parsed)) {
      if (!key.startsWith('session_')) continue;
      if (!value?.moreInfoUrl) continue;
      records.push({
        id: String(value.id || key.replace(/^session_/, '')),
        url: decodeJsonEscapedUrl(value.moreInfoUrl),
        title: value.name || '',
        date_text: value.date || '',
        start_time_text: value.start_time || '',
        end_time_text: value.end_time || '',
        room: value.location_id || '',
        session_category: value.custom_fields?.c_92132 || '',
        capacity: value.capacity ?? '',
        remaining_capacity: value.remaining_capacity ?? '',
        registrant_count: value.registrantCount ?? '',
        agenda_status: value.addedInAgenda ?? '',
        disabled_class: value.disabledClass ?? '',
      });
    }
  } catch {
    return records;
  }

  return records;
}

function sessionDetailCacheKey(record, index = 0) {
  const sessionId =
    record?.id ||
    record?.url?.match(/\/session\/(\d+)\//)?.[1] ||
    `idx-${index + 1}`;
  return {
    sessionId: String(sessionId),
    cacheKey: `session-${sessionId}.html`,
  };
}

function detailFingerprintInput(record = {}) {
  return {
    id: record.id || '',
    url: record.url || '',
    title: record.title || '',
    date_text: record.date_text || '',
    start_time_text: record.start_time_text || '',
    end_time_text: record.end_time_text || '',
    room: record.room || '',
    session_category: record.session_category || '',
    capacity: record.capacity ?? '',
    remaining_capacity: record.remaining_capacity ?? '',
    registrant_count: record.registrant_count ?? '',
    agenda_status: record.agenda_status ?? '',
    disabled_class: record.disabled_class ?? '',
  };
}

function computeDetailFingerprint(record = {}) {
  return crypto
    .createHash('sha256')
    .update(stableStringify(detailFingerprintInput(record)))
    .digest('hex');
}

function isReusableDetailEntry({
  manifestEntry,
  record,
  enrichedRecord,
  cacheExists,
  forceRefresh = false,
}) {
  if (forceRefresh) return false;
  if (!manifestEntry || !record || !enrichedRecord) return false;
  if (!cacheExists) return false;
  return manifestEntry.fingerprint === computeDetailFingerprint(record);
}

function hasSponsorDisclosure(text = '') {
  return /By attending this session, your contact information may be shared with the sponsor/i.test(String(text || ''));
}

function deriveSponsoredSessionFields(session = {}) {
  const description = session.description || '';
  const topics = Array.isArray(session.topics) ? session.topics : [];
  const sponsor_disclosure = hasSponsorDisclosure(description);
  const sponsored = sponsor_disclosure || topics.includes('Partner Innovation');
  return {
    sponsored,
    sponsor_disclosure,
  };
}

function mergeFreshLibraryFields(previousEnriched = {}, seed = {}) {
  const merged = {
    ...previousEnriched,
    id: seed.id ?? previousEnriched.id ?? '',
    url: seed.url ?? previousEnriched.url ?? '',
    title: seed.title ?? previousEnriched.title ?? '',
    date_text: seed.date_text ?? previousEnriched.date_text ?? '',
    start_time_text: seed.start_time_text ?? previousEnriched.start_time_text ?? '',
    end_time_text: seed.end_time_text ?? previousEnriched.end_time_text ?? '',
    date_time: seed.date_time ?? previousEnriched.date_time ?? '',
    start_at: seed.start_at ?? previousEnriched.start_at ?? '',
    end_at: seed.end_at ?? previousEnriched.end_at ?? '',
    room: seed.room ?? previousEnriched.room ?? '',
    session_category: seed.session_category ?? previousEnriched.session_category ?? '',
    capacity: seed.capacity ?? previousEnriched.capacity ?? '',
    remaining_capacity: seed.remaining_capacity ?? previousEnriched.remaining_capacity ?? '',
    registrant_count: seed.registrant_count ?? previousEnriched.registrant_count ?? '',
    agenda_status: seed.agenda_status ?? previousEnriched.agenda_status ?? '',
    disabled_class: seed.disabled_class ?? previousEnriched.disabled_class ?? '',
  };
  return {
    ...merged,
    ...deriveSponsoredSessionFields(merged),
  };
}

async function readDetailManifest() {
  const manifest = await readJsonFile(DETAIL_MANIFEST_PATH, null);
  if (!manifest || typeof manifest !== 'object') {
    return { version: DETAIL_MANIFEST_VERSION, entries: {} };
  }
  const entries =
    manifest.entries && typeof manifest.entries === 'object' ? manifest.entries : {};
  return {
    version: manifest.version || DETAIL_MANIFEST_VERSION,
    updated_at: manifest.updated_at || '',
    entries,
  };
}

async function writeDetailManifest(entries, updatedAt) {
  const payload = {
    version: DETAIL_MANIFEST_VERSION,
    updated_at: updatedAt,
    entries,
  };
  await fs.writeFile(DETAIL_MANIFEST_PATH, JSON.stringify(payload, null, 2));
}

async function collectLibraryPages() {
  const pages = [];
  const records = [];
  const seenIdSets = new Set();

  for (let page = 1; page <= 50; page++) {
    const url = page === 1 ? LIBRARY_URL : `${LIBRARY_URL}?page=${page}`;
    const cacheKey = page === 1 ? 'session-library.html' : `session-library-page-${page}.html`;
    console.log(`Fetching library page ${page}: ${url}`);
    const html = await fetchText(url, {
      cacheKey,
      preferCache: CONFIG.useLibraryCache,
    });
    const ids = extractSessionIds(html);
    const pageRecords = extractSessionRecordsFromLibrary(html);
    const signature = ids.join(',');

    if (ids.length === 0) {
      console.log(`No sessions found on page ${page}; stopping.`);
      break;
    }
    if (seenIdSets.has(signature)) {
      console.log(`Page ${page} repeats a previous result set; stopping.`);
      break;
    }

    seenIdSets.add(signature);
    pages.push({ page, idsCount: ids.length, recordsCount: pageRecords.length });
    records.push(...pageRecords);

    const uniqueCount = dedupeSessionRecords(records).length;
    console.log(`- page ${page}: ${ids.length} embedded sessions, ${pageRecords.length} records with URLs, cumulative unique URLs: ${uniqueCount}`);
    await politeDelay();
  }

  const dedupedRecords = dedupeSessionRecords(records);
  const bucketMap = partitionSessionRecords(dedupedRecords);

  return {
    pages,
    records: dedupedRecords,
    sessionUrls: dedupedRecords.map((r) => r.url),
    buckets: Object.fromEntries([...bucketMap.entries()].map(([key, value]) => [bucketFileSlug(key), value.map((r) => r.url)])),
  };
}

function extractBalancedJsonValue(html, startIndex) {
  const opener = html[startIndex];
  if (!['{', '['].includes(opener)) return null;
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIndex; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opener) depth += 1;
    if (ch === closer) {
      depth -= 1;
      if (depth === 0) return html.slice(startIndex, i + 1);
    }
  }
  return null;
}

function extractAssignedJson(html, varName, opener) {
  const marker = `var ${varName} = `;
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const from = start + marker.length;
  const jsonStart = html.indexOf(opener, from);
  if (jsonStart === -1) return null;
  const jsonText = extractBalancedJsonValue(html, jsonStart);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function extractJsonObject(html, varName) {
  return extractAssignedJson(html, varName, '{');
}

function extractSpeakersArray(html) {
  return extractAssignedJson(html, 'speakers', '[') || [];
}

function stripTags(html = '') {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((s) => s.trim())
    .join('\n')
    .trim();
}

function extractDescription(html) {
  const patterns = [
    /<span class="full-description[^>]*">([\s\S]*?)<\/span>/i,
    /<div class="full-description[^>]*">([\s\S]*?)<\/div>/i,
    /<span class="short-description[^>]*">([\s\S]*?)<\/span>/i,
    /<div class="short-description[^>]*">([\s\S]*?)<\/div>/i,
  ];
  for (const rx of patterns) {
    const match = html.match(rx);
    const text = stripTags(match?.[1] || '');
    if (text) return text;
  }
  return '';
}

function normalizeTopics(customFields = {}) {
  const topicFieldIds = ['c_92132', 'c_48160', 'c_79385', 'c_92133', 'c_92134', 'c_79386', 'c_68702', 'c_53002', 'c_79388'];
  const values = [];
  for (const key of topicFieldIds) {
    const raw = customFields[key];
    if (!raw || typeof raw !== 'string') continue;
    for (const piece of raw.split(/\s*\|\s*|\s*,\s*/)) {
      const v = piece.trim();
      if (v) values.push(v);
    }
  }
  return unique(values);
}

function extractTextByRegex(html, regex) {
  const match = html.match(regex);
  return stripTags(match?.[1] || '');
}

function extractVisibleLocation(html) {
  return extractTextByRegex(html, /<span class="location">([\s\S]*?)<\/span>/i);
}

function extractVisibleDateTime(html) {
  return extractTextByRegex(html, /<div class="session-start-end-time">([\s\S]*?)<\/div>/i);
}

function parseDateText(dateText) {
  const value = (dateText || '').trim();
  if (!value) return null;
  const parsed = new Date(`${value} UTC`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeTimeText(timeText) {
  return (timeText || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function buildIsoDateTime(dateText, timeText) {
  const date = parseDateText(dateText);
  const time = normalizeTimeText(timeText);
  if (!date || !time) return '';
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '';
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:00`;
}

function buildDateTime(date, startTime, endTime, fallbackText = '') {
  const start = buildIsoDateTime(date, startTime);
  const end = buildIsoDateTime(date, endTime);
  if (start && end) return `${start}/${end}`;
  if (start) return start;
  return fallbackText.trim();
}

function extractSessionSource(html) {
  const obj = extractJsonObject(html, '_obj_session_modal_p5') || {};
  const sourceSession = Object.values(obj)[0] || {};
  const sourceSpeakers = extractSpeakersArray(html)
    .map((speaker) => ({
      name: [speaker.first_name, speaker.last_name].filter(Boolean).join(' ').trim() || speaker.fullName || '',
      company: speaker.company || '',
      job_title: speaker.job_title || '',
      moreInfoUrl: decodeJsonEscapedUrl(speaker.moreInfoUrl || ''),
    }))
    .filter((speaker) => speaker.name);
  return {
    sourceSession,
    sourceSpeakers,
    sourceDescription: extractDescription(html),
  };
}

function toSessionRecord(url, html, seed = {}) {
  const { sourceSession, sourceSpeakers, sourceDescription } = extractSessionSource(html);
  const visibleLocation = extractVisibleLocation(html);
  const visibleDateTime = extractVisibleDateTime(html);
  const room = sourceSession.location_id || visibleLocation || seed.room || '';
  const date = sourceSession.date || seed.date_text || '';
  const start_time = sourceSession.start_time || seed.start_time_text || '';
  const end_time = sourceSession.end_time || seed.end_time_text || '';
  const topics = normalizeTopics(sourceSession.custom_fields || {});

  const record = {
    id: seed.id || String(sourceSession.id || ''),
    title: sourceSession.name || seed.title || '',
    description: sourceDescription,
    url,
    start_at: buildIsoDateTime(date, start_time),
    end_at: buildIsoDateTime(date, end_time),
    date_time: buildDateTime(date, start_time, end_time, visibleDateTime),
    date_text: date,
    start_time_text: start_time,
    end_time_text: end_time,
    room,
    topics,
    speakers: sourceSpeakers,
    session_category: seed.session_category || sourceSession.custom_fields?.c_92132 || '',
    capacity: sourceSession.capacity ?? seed.capacity ?? '',
    remaining_capacity: sourceSession.remaining_capacity ?? seed.remaining_capacity ?? '',
    registrant_count: sourceSession.registrantCount ?? seed.registrant_count ?? '',
    agenda_status: sourceSession.addedInAgenda ?? seed.agenda_status ?? '',
    disabled_class: sourceSession.disabledClass ?? seed.disabled_class ?? '',
  };
  return {
    ...record,
    ...deriveSponsoredSessionFields(record),
  };
}

export {
  buildIsoDateTime,
  buildDateTime,
  computeDetailFingerprint,
  collectLibraryPages,
  extractDescription,
  extractJsonObject,
  extractSessionSource,
  dedupeSessionRecords,
  extractSessionIds,
  extractSessionRecordsFromLibrary,
  isReusableDetailEntry,
  deriveSponsoredSessionFields,
  mergeFreshLibraryFields,
  normalizeTopics,
  partitionSessionRecords,
  stripTags,
  toSessionRecord,
};

async function main() {
  await ensureDir(OUT_DIR);
  await ensureDir(BY_DAY_DIR);
  await ensureDir(SNAPSHOTS_DIR);
  const previousLatest = await readJsonFile(LATEST_JSON, null);
  const priorSessionsByUrl = new Map(
    Array.isArray(previousLatest?.sessions)
      ? previousLatest.sessions
          .filter((session) => session?.url)
          .map((session) => [session.url, session])
      : [],
  );
  const existingManifest = await readDetailManifest();
  const nextManifestEntries = { ...existingManifest.entries };
  console.log(`Fetching paginated library: ${LIBRARY_URL}`);
  const { pages, records: libraryRecords, sessionUrls, buckets } = await collectLibraryPages();
  const libraryRecordsByUrl = new Map(libraryRecords.map((record) => [record.url, record]));
  if (!CONFIG.bucket) {
    for (const url of Object.keys(nextManifestEntries)) {
      if (!libraryRecordsByUrl.has(url)) delete nextManifestEntries[url];
    }
  }
  let selectedUrls = sessionUrls;
  if (CONFIG.bucket) {
    const bucketUrls = buckets[CONFIG.bucket];
    if (!bucketUrls) throw new Error(`Unknown bucket: ${CONFIG.bucket}`);
    selectedUrls = bucketUrls;
  }
  selectedUrls = CONFIG.maxSessions ? selectedUrls.slice(0, CONFIG.maxSessions) : selectedUrls;
  console.log(`Collected ${sessionUrls.length} unique session URLs across ${pages.length} library pages.`);
  if (CONFIG.bucket) console.log(`Bucket ${CONFIG.bucket}: ${selectedUrls.length} URLs selected.`);
  else console.log(`Scraping ${selectedUrls.length} URLs.`);

  const sessions = [];
  let detailFetchCount = 0;
  let detailReuseCount = 0;
  for (let i = 0; i < selectedUrls.length; i++) {
    const url = selectedUrls[i];
    const seed = libraryRecordsByUrl.get(url) || {};
    const { sessionId, cacheKey } = sessionDetailCacheKey(seed, i);
    const cachePath = path.join(CACHE_DIR, cacheKey);
    const fingerprint = computeDetailFingerprint(seed);
    const manifestEntry = existingManifest.entries[url];
    const previousEnriched = priorSessionsByUrl.get(url);
    const cacheExists = await fs
      .access(cachePath)
      .then(() => true)
      .catch(() => false);

    console.log(`[${i + 1}/${selectedUrls.length}] ${sessionId} ${url}`);

    if (
      isReusableDetailEntry({
        manifestEntry,
        record: seed,
        enrichedRecord: previousEnriched,
        cacheExists,
        forceRefresh: CONFIG.forceRefresh,
      })
    ) {
      sessions.push(mergeFreshLibraryFields(previousEnriched, seed));
      detailReuseCount += 1;
      nextManifestEntries[url] = {
        ...manifestEntry,
        id: sessionId,
        cache_path: path.relative(OUT_DIR, cachePath),
        last_seen_at: new Date().toISOString(),
      };
      console.log('  reused cached detail enrichment');
      continue;
    }

    const html = await fetchText(url, { cacheKey });
    const record = toSessionRecord(url, html, seed);
    sessions.push(record);
    detailFetchCount += 1;
    const fetchedAt = new Date().toISOString();
    nextManifestEntries[url] = {
      id: sessionId,
      cache_path: path.relative(OUT_DIR, cachePath),
      fingerprint,
      last_detail_fetch_at: fetchedAt,
      last_seen_at: fetchedAt,
    };
    await politeDelay();
  }

  sessions.sort((a, b) => a.title.localeCompare(b.title));

  const scrapedAt = new Date().toISOString();
  const payload = {
    scraped_at: scrapedAt,
    source_url: LIBRARY_URL,
    count: sessions.length,
    library_pages: pages.length,
    bucket: CONFIG.bucket || '',
    sessions,
  };
  const stamp = snapshotStamp(scrapedAt);
  await writeDetailManifest(nextManifestEntries, scrapedAt);

  if (CONFIG.bucket) {
    const slug = bucketFileSlug(CONFIG.bucket);
    const bucketJson = path.join(BY_DAY_DIR, `${slug}.json`);
    await fs.writeFile(bucketJson, JSON.stringify(payload, null, 2));
    console.log('Wrote:');
    console.log(`- ${bucketJson}`);
    console.log(`- ${DETAIL_MANIFEST_PATH}`);
  } else {
    const snapshotJson = path.join(SNAPSHOTS_DIR, `${stamp}.json`);
    await fs.writeFile(LATEST_JSON, JSON.stringify(payload, null, 2));
    await fs.writeFile(snapshotJson, JSON.stringify(payload, null, 2));
    console.log('Wrote:');
    console.log(`- ${LATEST_JSON}`);
    console.log(`- ${snapshotJson}`);
    console.log(`- ${DETAIL_MANIFEST_PATH}`);
  }
  console.log(`Detail pages fetched: ${detailFetchCount}`);
  console.log(`Detail pages reused: ${detailReuseCount}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
