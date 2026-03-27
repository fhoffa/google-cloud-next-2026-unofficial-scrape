#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve('sessions');
const BY_DAY_DIR = path.join(OUT_DIR, 'by-day');
const LATEST_JSON = path.join(OUT_DIR, 'latest.json');
const LATEST_YAML = path.join(OUT_DIR, 'latest.yaml');
const SNAPSHOTS_DIR = path.join(OUT_DIR, 'snapshots');

function snapshotStamp(isoString) {
  return isoString.replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z');
}

function yamlScalar(value) {
  if (value == null) return '""';
  const str = String(value);
  if (str === '') return '""';
  if (str.includes('\n')) {
    return `|\n${str.split('\n').map((line) => `    ${line}`).join('\n')}`;
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
    if (!s.topics?.length) lines.push('      []');
    else for (const topic of s.topics) lines.push('      - ' + yamlScalar(topic));
    lines.push('    speakers:');
    if (!s.speakers?.length) lines.push('      []');
    else for (const sp of s.speakers) { lines.push('      - name: ' + yamlScalar(sp.name)); lines.push('        company: ' + yamlScalar(sp.company)); }
  }
  return lines.join('\n') + '\n';
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
await fs.writeFile(LATEST_YAML, toYaml(sessions), 'utf8');
await fs.writeFile(path.join(SNAPSHOTS_DIR, `${stamp}.json`), JSON.stringify(payload, null, 2));
await fs.writeFile(path.join(SNAPSHOTS_DIR, `${stamp}.yaml`), toYaml(sessions), 'utf8');
console.log(JSON.stringify({count:sessions.length,buckets:files}, null, 2));
