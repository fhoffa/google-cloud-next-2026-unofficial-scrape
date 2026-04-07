#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve('sessions');
const BY_DAY_DIR = path.join(OUT_DIR, 'by-day');
const LATEST_JSON = path.join(OUT_DIR, 'latest.json');
const SNAPSHOTS_DIR = path.join(OUT_DIR, 'snapshots');

function snapshotStamp(isoString) {
  return isoString.replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z');
}

const files = (await fs.readdir(BY_DAY_DIR)).filter((f) => f.endsWith('.json')).sort();
const payloads = await Promise.all(files.map(async (f) => JSON.parse(await fs.readFile(path.join(BY_DAY_DIR, f), 'utf8'))));
const sessions = payloads.flatMap((p) => p.sessions || []).sort((a, b) => a.title.localeCompare(b.title));
const scrapedAt = new Date().toISOString();
const payload = {
  scraped_at: scrapedAt,
  source_url: 'https://www.googlecloudevents.com/next-vegas/session-library',
  count: sessions.length,
  buckets: files,
  sessions,
};
await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
const stamp = snapshotStamp(scrapedAt);
await fs.writeFile(LATEST_JSON, JSON.stringify(payload, null, 2));
await fs.writeFile(path.join(SNAPSHOTS_DIR, `${stamp}.json`), JSON.stringify(payload, null, 2));
console.log(JSON.stringify({count:sessions.length,buckets:files}, null, 2));
