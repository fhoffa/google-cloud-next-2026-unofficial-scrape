#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRefreshSanityReport } from '../lib/refresh-sanity.mjs';

function parseArgs(argv) {
  const options = {
    latest: 'sessions/latest.json',
    snapshotsDir: 'sessions/snapshots',
    output: 'media/refresh-sanity.json',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--latest') options.latest = argv[++index];
    else if (arg === '--snapshots-dir') options.snapshotsDir = argv[++index];
    else if (arg === '--output') options.output = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printDeltaSection(title, deltas, unit) {
  console.log(`${title}: ${deltas.length}`);
  for (const item of deltas.slice(0, 5)) {
    const signed = item.delta > 0 ? `+${item.delta}` : String(item.delta);
    console.log(`- ${item.title || item.url}: ${item.before} -> ${item.after} (${signed} ${unit})`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const latestPath = path.resolve(repoRoot, args.latest);
  const snapshotsDir = path.resolve(repoRoot, args.snapshotsDir);
  const outputPath = path.resolve(repoRoot, args.output);

  const report = buildRefreshSanityReport({ latestPath, snapshotsDir });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Latest payload: ${report.latest.file}`);
  console.log(`- scraped_at: ${report.latest.scrapedAt || '(missing)'}`);
  console.log(`- count: ${report.latest.count}`);
  if (report.pair) {
    console.log(`Snapshot pair: ${report.pair.previous.fileName} -> ${report.pair.current.fileName}`);
    console.log(`- previous count: ${report.pair.previous.count}`);
    console.log(`- current count: ${report.pair.current.count}`);
  }
  if (report.comparison) {
    console.log(`Added sessions: ${report.comparison.addedCount}`);
    console.log(`Removed sessions: ${report.comparison.removedCount}`);
    console.log(`Overlapping sessions: ${report.comparison.overlappingSessions}`);
    console.log(`Band changes: ${report.comparison.bandChangeCount}`);
    console.log(`Remaining-capacity delta total: ${report.comparison.totalRemainingDelta}`);
    console.log(`Registrant delta total: ${report.comparison.totalRegistrantDelta}`);
    for (const item of report.comparison.added.slice(0, 5)) {
      console.log(`- added: ${item.title || item.url}`);
    }
    for (const item of report.comparison.removed.slice(0, 5)) {
      console.log(`- removed: ${item.title || item.url}`);
    }
    printDeltaSection('Sessions with seat deltas', report.comparison.topRemainingDeltas, 'seats');
    printDeltaSection('Sessions with registrant deltas', report.comparison.topRegistrantDeltas, 'registrants');
  }
  for (const issue of report.issues) {
    const label = issue.level.toUpperCase();
    console.log(`${label}: ${issue.message}`);
  }
  console.log(`Wrote ${outputPath}`);

  if (report.issues.some((issue) => issue.level === 'error')) {
    process.exitCode = 1;
  }
}

main();
