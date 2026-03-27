#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://www.googlecloudevents.com';
const LIBRARY_URL = `${BASE}/next-vegas/session-library`;
const OUT_DIR = path.resolve('sessions');
const LATEST_YAML = path.join(OUT_DIR, 'latest.yaml');
const LATEST_JSON = path.join(OUT_DIR, 'latest.json');
const BY_DAY_DIR = path.join(OUT_DIR, 'by-day');
const SNAPSHOTS_DIR = path.join(OUT_DIR, 'snapshots');
const CACHE_DIR = path.join(OUT_DIR, 'cache');

const CONFIG = {
  minDelayMs: Number(process.env.MIN_DELAY_MS || 1200),
  maxDelayMs: Number(process.env.MAX_DELAY_MS || 2600),
  retries: Number(process.env.RETRIES || 4),
  timeoutMs: Number(process.env.TIMEOUT_MS || 30000),
  forceRefresh: process.env.FORCE_REFRESH === '1',
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

function snapshotStamp(isoString) {
  return isoString.replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z');
}

async function fetchText(url, { cacheKey = null } = {}) {
  await ensureDir(CACHE_DIR);
  const cachePath = cacheKey ? path.join(CACHE_DIR, cacheKey) : null;

  if (cachePath && !CONFIG.forceRefresh) {
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

function extractSessionRecordsFromLibrary(libraryHtml) {
  const records = [];
  const marker = 'GoogleAgendaBuilder.show_sessions(';
  const start = libraryHtml.indexOf(marker);
  if (start === -1) return records;
  const jsonStart = start + marker.length;
  const end = libraryHtml.indexOf('}, 19,1106,', jsonStart);
  if (end === -1) return records;

  const jsonText = libraryHtml.slice(jsonStart, end + 1);
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
      });
    }
  } catch {
    return records;
  }

  return records;
}

async function collectLibraryPages() {
  const pages = [];
  const records = [];
  const seenIdSets = new Set();

  for (let page = 1; page <= 50; page++) {
    const url = page === 1 ? LIBRARY_URL : `${LIBRARY_URL}?page=${page}`;
    const cacheKey = page === 1 ? 'session-library.html' : `session-library-page-${page}.html`;
    console.log(`Fetching library page ${page}: ${url}`);
    const html = await fetchText(url, { cacheKey });
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

function extractJsonObject(html, varName) {
  const marker = `var ${varName} = `;
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const from = start + marker.length;
  const end = html.indexOf(';', from);
  if (end === -1) return null;
  const jsonText = html.slice(from, end).trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function extractSpeakersArray(html) {
  const marker = 'var speakers = ';
  const start = html.indexOf(marker);
  if (start === -1) return [];
  const from = start + marker.length;
  const end = html.indexOf('];', from);
  if (end === -1) return [];
  const jsonText = html.slice(from, end + 1).trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    return [];
  }
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

function toSessionRecord(url, html) {
  const obj = extractJsonObject(html, '_obj_session_modal_p5') || {};
  const first = Object.values(obj)[0] || {};
  const speakers = extractSpeakersArray(html)
    .map((s) => ({
      name: [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || s.fullName || '',
      company: s.company || '',
    }))
    .filter((s) => s.name);

  const visibleLocation = extractVisibleLocation(html);
  const visibleDateTime = extractVisibleDateTime(html);
  const room = first.location_id || visibleLocation || '';
  const date = first.date || '';
  const start_time = first.start_time || '';
  const end_time = first.end_time || '';

  return {
    title: first.name || '',
    description: extractDescription(html),
    url,
    start_at: buildIsoDateTime(date, start_time),
    end_at: buildIsoDateTime(date, end_time),
    date_time: buildDateTime(date, start_time, end_time, visibleDateTime),
    date_text: date,
    start_time_text: start_time,
    end_time_text: end_time,
    room,
    topics: normalizeTopics(first.custom_fields || {}),
    speakers,
  };
}

function yamlScalar(value) {
  if (value == null) return '""';
  const str = String(value);
  if (str === '') return '""';
  if (str.includes('\n')) {
    return `|\n${str
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n')}`;
  }
  return JSON.stringify(str);
}

function toYaml(sessions) {
  const lines = [];
  lines.push('sessions:');
  for (const s of sessions) {
    lines.push('  - title: ' + yamlScalar(s.title));
    lines.push('    description: ' + yamlScalar(s.description));
    lines.push('    url: ' + yamlScalar(s.url));
    lines.push('    start_at: ' + yamlScalar(s.start_at));
    lines.push('    end_at: ' + yamlScalar(s.end_at));
    lines.push('    date_time: ' + yamlScalar(s.date_time));
    lines.push('    date_text: ' + yamlScalar(s.date_text));
    lines.push('    start_time_text: ' + yamlScalar(s.start_time_text));
    lines.push('    end_time_text: ' + yamlScalar(s.end_time_text));
    lines.push('    room: ' + yamlScalar(s.room));
    lines.push('    topics:');
    if (s.topics.length === 0) {
      lines.push('      []');
    } else {
      for (const topic of s.topics) lines.push('      - ' + yamlScalar(topic));
    }
    lines.push('    speakers:');
    if (s.speakers.length === 0) {
      lines.push('      []');
    } else {
      for (const sp of s.speakers) {
        lines.push('      - name: ' + yamlScalar(sp.name));
        lines.push('        company: ' + yamlScalar(sp.company));
      }
    }
  }
  return lines.join('\n') + '\n';
}

export {
  buildIsoDateTime,
  buildDateTime,
  collectLibraryPages,
  extractDescription,
  extractJsonObject,
  dedupeSessionRecords,
  extractSessionIds,
  extractSessionRecordsFromLibrary,
  normalizeTopics,
  partitionSessionRecords,
  stripTags,
  toSessionRecord,
};

async function main() {
  await ensureDir(OUT_DIR);
  await ensureDir(BY_DAY_DIR);
  await ensureDir(SNAPSHOTS_DIR);
  console.log(`Fetching paginated library: ${LIBRARY_URL}`);
  const { pages, sessionUrls, buckets } = await collectLibraryPages();
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
  for (let i = 0; i < selectedUrls.length; i++) {
    const url = selectedUrls[i];
    const idMatch = url.match(/\/session\/(\d+)\//);
    const sessionId = idMatch?.[1] || `idx-${i + 1}`;
    console.log(`[${i + 1}/${selectedUrls.length}] ${sessionId} ${url}`);
    const html = await fetchText(url, { cacheKey: `session-${sessionId}.html` });
    const record = toSessionRecord(url, html);
    sessions.push(record);
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

  if (CONFIG.bucket) {
    const slug = bucketFileSlug(CONFIG.bucket);
    const bucketJson = path.join(BY_DAY_DIR, `${slug}.json`);
    const bucketYaml = path.join(BY_DAY_DIR, `${slug}.yaml`);
    await fs.writeFile(bucketJson, JSON.stringify(payload, null, 2));
    await fs.writeFile(bucketYaml, toYaml(sessions), 'utf8');
    console.log('Wrote:');
    console.log(`- ${bucketJson}`);
    console.log(`- ${bucketYaml}`);
  } else {
    const snapshotJson = path.join(SNAPSHOTS_DIR, `${stamp}.json`);
    const snapshotYaml = path.join(SNAPSHOTS_DIR, `${stamp}.yaml`);
    await fs.writeFile(LATEST_JSON, JSON.stringify(payload, null, 2));
    await fs.writeFile(LATEST_YAML, toYaml(sessions), 'utf8');
    await fs.writeFile(snapshotJson, JSON.stringify(payload, null, 2));
    await fs.writeFile(snapshotYaml, toYaml(sessions), 'utf8');
    console.log('Wrote:');
    console.log(`- ${LATEST_JSON}`);
    console.log(`- ${LATEST_YAML}`);
    console.log(`- ${snapshotJson}`);
    console.log(`- ${snapshotYaml}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
