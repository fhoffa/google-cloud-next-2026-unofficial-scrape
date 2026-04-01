#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const IMPORTANT_FIELDS = ['title', 'date_time', 'date_text', 'start_time_text', 'end_time_text', 'room'];
const MINOR_FIELDS = ['speakers', 'topics', 'description'];
const DESCRIPTION_CHANGE_RATIO_THRESHOLD = 0.18;
const MERGE_NEARBY_SNAPSHOTS_HOURS = 2;

function sessionKey(session) {
  const explicitId = String(session?.id || '').trim();
  const explicitMatch = explicitId.match(/\/session\/(\d+)(?:\/|$)/) || explicitId.match(/^(\d+)$/);
  if (explicitMatch) return explicitMatch[1];
  const url = String(session?.url || '').trim();
  const match = url.match(/\/session\/(\d+)(?:\/|$)/);
  if (match) return match[1];
  return explicitId || url || String(session?.title || '').trim();
}

function normalizeNumber(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function availabilityBand(session) {
  const remaining = normalizeNumber(session?.remaining_capacity);
  if (remaining == null) return 'unknown';
  if (remaining === 0) return 'full';
  if (remaining <= 5) return 'limited';
  return 'available';
}

function percentagePhrase(part, total) {
  if (!total) return 'No usable data yet';
  const ratio = part / total;
  if (ratio === 0) return 'none';
  if (ratio < 0.05) return 'a tiny share';
  if (ratio < 0.15) return 'a small share';
  if (ratio < 0.3) return 'a noticeable share';
  if (ratio < 0.5) return 'a large share';
  return 'most';
}

function arraysEqual(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function tokenizeText(value) {
  return new Set(normalizeText(value).toLowerCase().match(/[a-z0-9]+/g) || []);
}

function tokenChangeRatio(before, after) {
  const left = tokenizeText(before);
  const right = tokenizeText(after);
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  let overlap = 0;
  for (const token of union) {
    if (left.has(token) && right.has(token)) overlap += 1;
  }
  return 1 - (overlap / union.size);
}

function fieldChanged(a, b, field) {
  if (Array.isArray(a?.[field]) || Array.isArray(b?.[field])) return !arraysEqual(a?.[field], b?.[field]);
  return (a?.[field] ?? '') !== (b?.[field] ?? '');
}

function classifyChange(before, after, changedFields) {
  const materialFields = [];
  const minorFields = [];

  for (const field of changedFields) {
    if (IMPORTANT_FIELDS.includes(field)) {
      materialFields.push(field);
      continue;
    }
    if (field === 'description') {
      const ratio = tokenChangeRatio(before?.description, after?.description);
      if (ratio >= DESCRIPTION_CHANGE_RATIO_THRESHOLD) materialFields.push(field);
      else minorFields.push(field);
      continue;
    }
    if (field === 'speakers') {
      const beforeCount = Array.isArray(before?.speakers) ? before.speakers.length : 0;
      const afterCount = Array.isArray(after?.speakers) ? after.speakers.length : 0;
      if (beforeCount !== afterCount) materialFields.push(field);
      else minorFields.push(field);
      continue;
    }
    if (field === 'topics') {
      const beforeTopics = Array.isArray(before?.topics) ? before.topics : [];
      const afterTopics = Array.isArray(after?.topics) ? after.topics : [];
      const beforeSet = new Set(beforeTopics);
      const afterSet = new Set(afterTopics);
      const changedMembership = beforeTopics.length !== afterTopics.length || beforeTopics.some((topic) => !afterSet.has(topic)) || afterTopics.some((topic) => !beforeSet.has(topic));
      if (changedMembership) materialFields.push(field);
      else minorFields.push(field);
      continue;
    }
    minorFields.push(field);
  }

  return { materialFields, minorFields };
}

function friendlyDate(text) {
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function overlapCount(leftItems, rightItems) {
  const left = new Set((leftItems || []).map((item) => String(item || '').toLowerCase().trim()).filter(Boolean));
  const right = new Set((rightItems || []).map((item) => String(item || '').toLowerCase().trim()).filter(Boolean));
  let count = 0;
  for (const item of left) {
    if (right.has(item)) count += 1;
  }
  return count;
}

function scoreReplacementCandidate(removed, added) {
  let score = 0;
  const reasons = [];
  if ((removed.date_text || '') && removed.date_text === added.date_text) {
    score += 3;
    reasons.push('same day');
  }
  if ((removed.start_time_text || '') && removed.start_time_text === added.start_time_text) {
    score += 4;
    reasons.push('same start time');
  }
  if ((removed.end_time_text || '') && removed.end_time_text === added.end_time_text) {
    score += 2;
    reasons.push('same end time');
  }
  if ((removed.room || '') && removed.room === added.room) {
    score += 4;
    reasons.push('same room');
  }
  const topicOverlap = overlapCount(removed.topics, added.topics);
  if (topicOverlap) {
    score += Math.min(3, topicOverlap);
    reasons.push(topicOverlap === 1 ? 'shared topic' : 'shared topics');
  }
  const removedSpeakers = (removed.speakers || []).map((speaker) => speaker?.name || '').filter(Boolean);
  const addedSpeakers = (added.speakers || []).map((speaker) => speaker?.name || '').filter(Boolean);
  const speakerOverlap = overlapCount(removedSpeakers, addedSpeakers);
  if (speakerOverlap) {
    score += Math.min(4, speakerOverlap * 2);
    reasons.push(speakerOverlap === 1 ? 'shared speaker' : 'shared speakers');
  }
  return { score, reasons };
}

function detectReplacements(removedList, addedList) {
  const candidates = [];
  removedList.forEach((removed, removedIndex) => {
    addedList.forEach((added, addedIndex) => {
      const { score, reasons } = scoreReplacementCandidate(removed, added);
      if (score >= 7) {
        candidates.push({ removedIndex, addedIndex, removed, added, score, reasons });
      }
    });
  });
  candidates.sort((a, b) => b.score - a.score || a.removedIndex - b.removedIndex || a.addedIndex - b.addedIndex);
  const usedRemoved = new Set();
  const usedAdded = new Set();
  const replacements = [];
  for (const candidate of candidates) {
    if (usedRemoved.has(candidate.removedIndex) || usedAdded.has(candidate.addedIndex)) continue;
    usedRemoved.add(candidate.removedIndex);
    usedAdded.add(candidate.addedIndex);
    replacements.push(candidate);
  }
  return {
    replacements,
    unmatchedRemoved: removedList.filter((_, index) => !usedRemoved.has(index)),
    unmatchedAdded: addedList.filter((_, index) => !usedAdded.has(index)),
  };
}

function parseArgs(argv) {
  const options = {
    snapshotsDir: 'sessions/snapshots',
    template: 'templates/changelog.template.html',
    outputHtml: 'changelog.html',
    outputSummary: 'media/changelog-summary.json',
    generatedAt: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--snapshots-dir') options.snapshotsDir = argv[++index];
    else if (arg === '--template') options.template = argv[++index];
    else if (arg === '--output-html') options.outputHtml = argv[++index];
    else if (arg === '--output-summary') options.outputSummary = argv[++index];
    else if (arg === '--generated-at') options.generatedAt = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function loadSnapshots(snapshotsDir) {
  if (!fs.existsSync(snapshotsDir)) return [];
  return fs.readdirSync(snapshotsDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const file = path.join(snapshotsDir, name);
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const sessions = Array.isArray(data?.sessions) ? data.sessions : (Array.isArray(data) ? data : []);
      return {
        file: file.replace(/\\/g, '/'),
        fileName: name,
        scrapedAt: data?.scraped_at || name.replace(/\.json$/, ''),
        sessions,
      };
    })
    .filter((entry) => entry.sessions.length > 0);
}

function mergeNearbySnapshots(snapshots, mergeHours = MERGE_NEARBY_SNAPSHOTS_HOURS) {
  const merged = [];
  const mergeMs = mergeHours * 60 * 60 * 1000;
  for (const snapshot of snapshots) {
    const at = new Date(snapshot.scrapedAt);
    if (Number.isNaN(at.getTime())) {
      merged.push([snapshot]);
      continue;
    }
    const lastGroup = merged[merged.length - 1];
    if (!lastGroup) {
      merged.push([snapshot]);
      continue;
    }
    const lastSnapshot = lastGroup[lastGroup.length - 1];
    const lastAt = new Date(lastSnapshot.scrapedAt);
    if (!Number.isNaN(lastAt.getTime()) && (at.getTime() - lastAt.getTime()) <= mergeMs) {
      lastGroup.push(snapshot);
    } else {
      merged.push([snapshot]);
    }
  }
  return merged;
}

function compareSnapshots(previous, current) {
  const prevMap = new Map(previous.sessions.map((session) => [sessionKey(session), session]));
  const curMap = new Map(current.sessions.map((session) => [sessionKey(session), session]));

  const added = [];
  const removed = [];
  const changed = [];
  const nowFull = [];
  const reopened = [];
  const nowLimited = [];

  for (const [key, session] of curMap.entries()) {
    if (!prevMap.has(key)) {
      added.push(session);
      continue;
    }
    const before = prevMap.get(key);
    const after = session;
    const changedFields = [...IMPORTANT_FIELDS, ...MINOR_FIELDS].filter((field) => fieldChanged(before, after, field));
    if (changedFields.length) {
      const { materialFields, minorFields } = classifyChange(before, after, changedFields);
      changed.push({ before, after, changedFields, materialFields, minorFields });
    }

    const beforeBand = availabilityBand(before);
    const afterBand = availabilityBand(after);
    if (beforeBand !== afterBand) {
      if (afterBand === 'full') nowFull.push(after);
      if (beforeBand === 'full' && (afterBand === 'limited' || afterBand === 'available')) reopened.push(after);
      if (afterBand === 'limited' && beforeBand !== 'full') nowLimited.push(after);
    }
  }

  for (const [key, session] of prevMap.entries()) {
    if (!curMap.has(key)) removed.push(session);
  }

  const currentAvailabilityKnown = current.sessions.filter((session) => availabilityBand(session) !== 'unknown');
  const currentFull = currentAvailabilityKnown.filter((session) => availabilityBand(session) === 'full');
  const currentLimited = currentAvailabilityKnown.filter((session) => availabilityBand(session) === 'limited');
  const materialChanges = changed.filter((item) => item.materialFields.length > 0);
  const minorChanges = changed.filter((item) => item.materialFields.length === 0 && item.minorFields.length > 0);
  const replacementDetection = detectReplacements(removed, added);

  return {
    previous: {
      file: previous.fileName,
      scrapedAt: previous.scrapedAt,
      count: previous.sessions.length,
    },
    current: {
      file: current.fileName,
      scrapedAt: current.scrapedAt,
      count: current.sessions.length,
    },
    summary: {
      currentAvailabilityKnown: currentAvailabilityKnown.length,
      currentFull: currentFull.length,
      currentLimited: currentLimited.length,
      fullSharePhrase: percentagePhrase(currentFull.length, currentAvailabilityKnown.length),
      hasReopened: reopened.length > 0,
      hasMaterialChanges: materialChanges.length > 0,
      hasAdditions: replacementDetection.unmatchedAdded.length > 0,
      hasRemovals: replacementDetection.unmatchedRemoved.length > 0,
      hasReplacements: replacementDetection.replacements.length > 0,
    },
    replacements: replacementDetection.replacements.slice(0, 12).map((item) => ({
      removedTitle: item.removed.title,
      removedUrl: item.removed.url || '',
      addedTitle: item.added.title,
      addedUrl: item.added.url || '',
      reasons: item.reasons,
    })),
    added: replacementDetection.unmatchedAdded.slice(0, 12).map((session) => ({ title: session.title, url: session.url || '' })),
    removed: replacementDetection.unmatchedRemoved.slice(0, 12).map((session) => ({ title: session.title, url: session.url || '' })),
    nowFull: nowFull.slice(0, 12).map((session) => ({ title: session.title, url: session.url || '' })),
    reopened: reopened.slice(0, 12).map((session) => ({ title: session.title, url: session.url || '' })),
    nowLimited: nowLimited.slice(0, 12).map((session) => ({ title: session.title, url: session.url || '' })),
    materialChanges: materialChanges.slice(0, 12).map((item) => ({
      title: item.after.title || item.before.title,
      changedFields: item.materialFields,
      url: item.after.url || item.before.url || '',
    })),
    minorChanges: minorChanges.slice(0, 12).map((item) => ({
      title: item.after.title || item.before.title,
      changedFields: item.minorFields,
      url: item.after.url || item.before.url || '',
    })),
  };
}

function summarySentence(diff) {
  const parts = [];
  if (diff.summary.hasReplacements) parts.push('some sessions look like one-to-one substitutions');
  if (diff.summary.hasAdditions) parts.push('new sessions showed up');
  if (diff.summary.hasRemovals) parts.push('some sessions disappeared');
  if (diff.summary.hasMaterialChanges) parts.push('a handful of listings changed in meaningful ways');
  if (diff.summary.currentAvailabilityKnown) parts.push(`${diff.summary.fullSharePhrase} of sessions with availability signals are fully booked`);
  if (diff.summary.hasReopened) parts.push('some previously full sessions reopened');
  if (!parts.length) return 'Mostly quiet update with little visible catalog movement.';
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + (parts.length > 1 ? '; ' + parts.slice(1).join('; ') : '') + '.';
}

function listItems(items, formatter, fallback = 'None in this update') {
  if (!items.length) return `<p class="empty">${esc(fallback)}</p>`;
  return `<ul>${items.map((item) => `<li>${formatter(item)}</li>`).join('')}</ul>`;
}

function renderDiffHtml(diff) {
  const title = `${friendlyDate(diff.previous.scrapedAt)} → ${friendlyDate(diff.current.scrapedAt)}`;
  const updatedSessions = [
    ...diff.replacements.map((item) => ({
      kind: 'replacement',
      title: `${item.removedTitle} → ${item.addedTitle}`,
      url: item.addedUrl || item.removedUrl || '',
      details: item.reasons,
    })),
    ...diff.materialChanges.map((item) => ({
      kind: 'material',
      title: item.title,
      url: item.url || '',
      details: item.changedFields,
    })),
  ].slice(0, 16);

  const availabilityChanges = [
    ...diff.nowFull.map((session) => ({ kind: 'now full', title: session.title, url: session.url || '' })),
    ...diff.reopened.map((session) => ({ kind: 'reopened', title: session.title, url: session.url || '' })),
    ...diff.nowLimited.map((session) => ({ kind: 'limited', title: session.title, url: session.url || '' })),
  ].slice(0, 16);

  return `
    <article class="card">
      <div class="snapshot-header">
        <div>
          <h2 class="snapshot-title">${esc(title)}</h2>
          <div class="muted">Snapshots: <code>${esc(diff.previous.file)}</code> → <code>${esc(diff.current.file)}</code></div>
        </div>
      </div>
      <p class="summary">${esc(summarySentence(diff))}</p>
      <div class="badges">
        <span class="badge changed">Updated sessions</span>
        <span class="badge added">New sessions</span>
        <span class="badge removed">Removed sessions</span>
        <span class="badge full">Availability changes</span>
      </div>
      <details>
        <summary>Show details</summary>
        <div class="section-grid">
          <section class="mini-card">
            <h3>Updated sessions</h3>
            ${listItems(updatedSessions, (item) => `${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a>` : esc(item.title)} <span class="muted">(${esc(item.details.join(', '))})</span>`, 'No strong replacements or meaningful edits in this update')}
          </section>
          <section class="mini-card">
            <h3>New sessions</h3>
            ${listItems(diff.added, (session) => session.url ? `<a href="${esc(session.url)}" target="_blank" rel="noopener">${esc(session.title)}</a>` : esc(session.title))}
          </section>
          <section class="mini-card">
            <h3>Removed sessions</h3>
            ${listItems(diff.removed, (session) => esc(session.title))}
          </section>
          <section class="mini-card">
            <h3>Availability changes</h3>
            ${listItems(availabilityChanges, (item) => `${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a>` : esc(item.title)} <span class="muted">(${esc(item.kind)})</span>`, 'No notable availability movement in this update')}
          </section>
        </div>
        <details>
          <summary>Show minor churn</summary>
          <div class="section-grid">
            <section class="mini-card">
              <h3>Minor metadata churn</h3>
              ${listItems(diff.minorChanges, (item) => `${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a>` : esc(item.title)} <span class="muted">(${esc(item.changedFields.join(', '))})</span>`, 'No obvious low-value churn in this update')}
            </section>
          </div>
        </details>
      </details>
    </article>
  `;
}

function renderHtml(summary, templateText) {
  return templateText
    .replace('__GENERATED_ON__', esc(summary.meta.generatedAt))
    .replace('__LEDE__', esc(summary.lede))
    .replace('__CHANGELOG_HTML__', summary.updates.map(renderDiffHtml).join('\n'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const snapshotsDir = path.resolve(repoRoot, args.snapshotsDir);
  const templatePath = path.resolve(repoRoot, args.template);
  const outputHtmlPath = path.resolve(repoRoot, args.outputHtml);
  const outputSummaryPath = path.resolve(repoRoot, args.outputSummary);

  const generatedAt = args.generatedAt || new Date().toISOString();
  const snapshots = loadSnapshots(snapshotsDir);
  const mergedGroups = mergeNearbySnapshots(snapshots, MERGE_NEARBY_SNAPSHOTS_HOURS);
  const groupedSnapshots = mergedGroups.map((items) => ({
    first: items[0],
    last: items[items.length - 1],
    items,
  }));
  const updates = [];
  for (let index = 1; index < groupedSnapshots.length; index += 1) {
    updates.push(compareSnapshots(groupedSnapshots[index - 1].last, groupedSnapshots[index].last));
  }
  updates.reverse();

  const summary = {
    meta: {
      generatedAt,
      snapshotsDir: args.snapshotsDir,
      template: args.template,
      outputHtml: args.outputHtml,
      generator: 'scripts/generate_changelog.mjs',
      mergeNearbyHours: MERGE_NEARBY_SNAPSHOTS_HOURS,
    },
    lede: 'A changelog that collapses near-duplicate scrape bursts while preserving meaningful gaps between publishes: new sessions, removals, updated listings, and high-level availability movement like fully booked vs reopened.',
    updates,
  };

  const templateText = fs.readFileSync(templatePath, 'utf8');
  const html = renderHtml(summary, templateText);

  fs.mkdirSync(path.dirname(outputSummaryPath), { recursive: true });
  fs.writeFileSync(outputSummaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(outputHtmlPath, html);

  process.stdout.write(`${outputSummaryPath}\n${outputHtmlPath}\n`);
}

main();
