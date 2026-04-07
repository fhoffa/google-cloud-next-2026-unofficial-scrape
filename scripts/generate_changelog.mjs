#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRefreshSanityReport } from '../lib/refresh-sanity.mjs';
import { availabilityBand } from '../lib/session-availability.mjs';

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

function extractSessionId(session) {
  const explicit = String(session?.id || '').trim();
  if (explicit) return explicit;
  const url = String(session?.url || '').trim();
  const match = url.match(/\/session\/([^/]+)\//);
  return match?.[1] || '';
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

function buildExplorerHref(session) {
  const sessionId = extractSessionId(session);
  if (!sessionId) return String(session?.url || '').trim();
  return `index.html?sessionids=${encodeURIComponent(sessionId)}`;
}

function scoreReplacementCandidate(removed, added) {
  let score = 0;
  const reasons = [];
  const sameSessionId = String(removed.id || '').trim() && String(removed.id || '').trim() === String(added.id || '').trim();
  if (sameSessionId) {
    score += 100;
    reasons.push('same session ID');
  }
  if ((removed.date_text || '') && removed.date_text === added.date_text) {
    score += 3;
    if (!sameSessionId) reasons.push('same day');
  }
  if ((removed.start_time_text || '') && removed.start_time_text === added.start_time_text) {
    score += 4;
    if (!sameSessionId) reasons.push('same start time');
  }
  if ((removed.end_time_text || '') && removed.end_time_text === added.end_time_text) {
    score += 2;
    if (!sameSessionId) reasons.push('same end time');
  }
  if ((removed.room || '') && removed.room === added.room) {
    score += 4;
    if (!sameSessionId) reasons.push('same room');
  }
  const topicOverlap = overlapCount(removed.topics, added.topics);
  if (topicOverlap) {
    score += Math.min(3, topicOverlap);
    if (!sameSessionId) reasons.push(topicOverlap === 1 ? 'shared topic' : 'shared topics');
  }
  const removedSpeakers = (removed.speakers || []).map((speaker) => speaker?.name || '').filter(Boolean);
  const addedSpeakers = (added.speakers || []).map((speaker) => speaker?.name || '').filter(Boolean);
  const speakerOverlap = overlapCount(removedSpeakers, addedSpeakers);
  if (speakerOverlap) {
    score += Math.min(4, speakerOverlap * 2);
    if (!sameSessionId) reasons.push(speakerOverlap === 1 ? 'shared speaker' : 'shared speakers');
  }
  return { score, reasons, sameSessionId };
}

function detectReplacements(removedList, addedList) {
  const candidates = [];
  removedList.forEach((removed, removedIndex) => {
    addedList.forEach((added, addedIndex) => {
      const { score, reasons, sameSessionId } = scoreReplacementCandidate(removed, added);
      if (score >= 7) {
        candidates.push({ removedIndex, addedIndex, removed, added, score, reasons, sameSessionId });
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
    latest: 'sessions/latest.json',
    snapshotsDir: 'sessions/snapshots',
    template: 'templates/changelog.template.html',
    outputHtml: 'changelog.html',
    outputSummary: 'media/changelog-summary.json',
    generatedAt: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--latest') options.latest = argv[++index];
    else if (arg === '--snapshots-dir') options.snapshotsDir = argv[++index];
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

function buildFlappySessionMap(snapshots, minTransitions = 2) {
  const keys = new Set();
  const presenceBySnapshot = snapshots.map((snapshot) => {
    const map = new Map();
    for (const session of snapshot.sessions) {
      const key = sessionKey(session);
      keys.add(key);
      map.set(key, session);
    }
    return map;
  });

  const flappy = new Map();
  for (const key of keys) {
    const timeline = presenceBySnapshot.map((map) => (map.has(key) ? 1 : 0));
    const transitions = timeline.slice(1).reduce((count, present, index) => count + (present !== timeline[index] ? 1 : 0), 0);
    if (transitions < minTransitions || !timeline.includes(0) || !timeline.includes(1)) continue;
    const session = presenceBySnapshot.map((map) => map.get(key)).find(Boolean) || null;
    flappy.set(key, {
      key,
      transitions,
      timeline,
      title: session?.title || '',
      url: session?.url || '',
      id: extractSessionId(session),
    });
  }
  return flappy;
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

function compareSnapshots(previous, current, { flappySessions = new Map() } = {}) {
  const prevMap = new Map(previous.sessions.map((session) => [sessionKey(session), session]));
  const curMap = new Map(current.sessions.map((session) => [sessionKey(session), session]));
  const prevById = new Map(previous.sessions.map((session) => [extractSessionId(session), session]).filter(([id]) => id));
  const curById = new Map(current.sessions.map((session) => [extractSessionId(session), session]).filter(([id]) => id));

  const added = [];
  const removed = [];
  const changed = [];
  const moved = [];
  const renamed = [];
  const metadataChanges = [];
  const nowFull = [];
  const reopened = [];
  const nowLimited = [];

  for (const [key, session] of curMap.entries()) {
    if (!prevMap.has(key)) {
      const sessionId = extractSessionId(session);
      const sameIdBefore = sessionId ? prevById.get(sessionId) : null;
      if (sameIdBefore) continue;
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
    if (!curMap.has(key)) {
      const sessionId = extractSessionId(session);
      const sameIdAfter = sessionId ? curById.get(sessionId) : null;
      if (sameIdAfter) continue;
      removed.push(session);
    }
  }

  for (const [sid, before] of prevById.entries()) {
    if (!curById.has(sid)) continue;
    const after = curById.get(sid);
    const moveFields = ['date_text','start_time_text','end_time_text','start_at','end_at','room'].filter((field) => fieldChanged(before, after, field));
    const renamedFields = ['title'].filter((field) => fieldChanged(before, after, field));
    const linkOnlyFields = ['url'].filter((field) => fieldChanged(before, after, field));
    const metadataFields = ['description','speakers','topics','session_category'].filter((field) => fieldChanged(before, after, field));
    if (moveFields.length) moved.push({ before, after, changedFields: moveFields });
    if (renamedFields.length) renamed.push({ before, after, changedFields: renamedFields });
    if (metadataFields.length) metadataChanges.push({ before, after, changedFields: metadataFields });
    if (linkOnlyFields.length) changed.push({ before, after, changedFields: linkOnlyFields, materialFields: [], minorFields: linkOnlyFields });
  }

  const currentAvailabilityKnown = current.sessions.filter((session) => availabilityBand(session) !== 'unknown');
  const currentFull = currentAvailabilityKnown.filter((session) => availabilityBand(session) === 'full');
  const currentLimited = currentAvailabilityKnown.filter((session) => availabilityBand(session) === 'limited');
  const materialChanges = changed.filter((item) => item.materialFields.length > 0);
  const minorChanges = changed.filter((item) => item.materialFields.length === 0 && item.minorFields.length > 0);
  const replacementDetection = detectReplacements(removed, added);
  const flappyAdded = replacementDetection.unmatchedAdded.filter((session) => flappySessions.has(sessionKey(session)));
  const flappyRemoved = replacementDetection.unmatchedRemoved.filter((session) => flappySessions.has(sessionKey(session)));
  const stableAdded = replacementDetection.unmatchedAdded.filter((session) => !flappySessions.has(sessionKey(session)));
  const stableRemoved = replacementDetection.unmatchedRemoved.filter((session) => !flappySessions.has(sessionKey(session)));
  const flappyChanges = [...new Map([
    ...flappyAdded.map((session) => {
      const info = flappySessions.get(sessionKey(session));
      return [sessionKey(session), { title: session.title, url: session.url || '', id: extractSessionId(session), transitions: info?.transitions || 0 }];
    }),
    ...flappyRemoved.map((session) => {
      const info = flappySessions.get(sessionKey(session));
      return [sessionKey(session), { title: session.title, url: session.url || '', id: extractSessionId(session), transitions: info?.transitions || 0 }];
    }),
  ].filter(Boolean)).values()];

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
      hasAdditions: stableAdded.length > 0,
      hasRemovals: stableRemoved.length > 0,
      hasReplacements: replacementDetection.replacements.length > 0,
      hasFlappy: flappyChanges.length > 0,
      hasMoves: moved.length > 0,
      hasRenames: renamed.length > 0,
      hasMetadataChanges: metadataChanges.length > 0,
    },
    moved: moved.slice(0, 20).map((item) => ({
      title: item.after.title || item.before.title,
      url: buildExplorerHref(item.after.url ? item.after : item.before),
      before: {
        date: item.before.date_text || '',
        start: item.before.start_time_text || '',
        end: item.before.end_time_text || '',
        room: item.before.room || '',
      },
      after: {
        date: item.after.date_text || '',
        start: item.after.start_time_text || '',
        end: item.after.end_time_text || '',
        room: item.after.room || '',
      },
      changedFields: item.changedFields,
    })),
    renamed: renamed.slice(0, 20).map((item) => ({
      beforeTitle: item.before.title || '',
      afterTitle: item.after.title || '',
      url: buildExplorerHref(item.after.url ? item.after : item.before),
      changedFields: item.changedFields,
    })),
    metadataChanges: metadataChanges.slice(0, 20).map((item) => ({
      title: item.after.title || item.before.title,
      url: buildExplorerHref(item.after.url ? item.after : item.before),
      changedFields: item.changedFields,
    })),
    replacements: replacementDetection.replacements.slice(0, 12).map((item) => ({
      removedTitle: item.removed.title,
      removedUrl: buildExplorerHref(item.removed),
      addedTitle: item.added.title,
      addedUrl: buildExplorerHref(item.added),
      reasons: item.reasons,
      sameSessionId: Boolean(item.sameSessionId),
    })),
    added: stableAdded.slice(0, 12).map((session) => ({ title: session.title, url: buildExplorerHref(session) })),
    removed: stableRemoved.slice(0, 12).map((session) => ({ title: session.title, url: buildExplorerHref(session) })),
    flappyChanges: flappyChanges.slice(0, 12).map((item) => ({ ...item, url: buildExplorerHref(item) })),
    nowFull: nowFull.slice(0, 12).map((session) => ({ title: session.title, url: buildExplorerHref(session) })),
    reopened: reopened.slice(0, 12).map((session) => ({ title: session.title, url: buildExplorerHref(session) })),
    nowLimited: nowLimited.slice(0, 12).map((session) => ({ title: session.title, url: buildExplorerHref(session) })),
    materialChanges: materialChanges.slice(0, 12).map((item) => ({
      title: item.after.title || item.before.title,
      changedFields: item.materialFields,
      url: buildExplorerHref(item.after.url ? item.after : item.before),
    })),
    minorChanges: minorChanges.slice(0, 12).map((item) => ({
      title: item.after.title || item.before.title,
      changedFields: item.minorFields,
      url: buildExplorerHref(item.after.url ? item.after : item.before),
    })),
  };
}

function hasMeaningfulDiff(diff) {
  return Boolean(
    diff.summary.hasReplacements ||
    diff.summary.hasAdditions ||
    diff.summary.hasRemovals ||
    diff.summary.hasFlappy ||
    diff.summary.hasMaterialChanges ||
    diff.summary.hasReopened ||
    (diff.summary.currentFull > 0) ||
    (diff.summary.currentLimited > 0)
  );
}

function summarySentence(diff) {
  const parts = [];
  if (diff.summary.hasMoves) parts.push('some session IDs moved time slots or rooms');
  if (diff.summary.hasRenames) parts.push('some session IDs were retitled');
  if (diff.summary.hasMetadataChanges) parts.push('some existing sessions changed descriptions, speakers, or other metadata');
  if (diff.summary.hasAdditions) parts.push('new session IDs appeared');
  if (diff.summary.hasRemovals) parts.push('some session IDs disappeared');
  if (!diff.summary.hasMoves && !diff.summary.hasRenames && diff.summary.hasReplacements) parts.push('a few listings may reflect slot swaps or related replacements');
  if (diff.summary.hasFlappy) parts.push('some listings continue to flap in and out of the catalog');
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
  const movedSessions = diff.moved.slice(0, 16);
  const renamedSessions = diff.renamed.slice(0, 16);
  const metadataUpdates = diff.metadataChanges.slice(0, 16);
  const possibleReplacements = diff.replacements.filter((item) => !item.sameSessionId).slice(0, 12);

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
        <span class="badge changed">Moved sessions</span>
        <span class="badge changed">Renamed sessions</span>
        <span class="badge added">New sessions</span>
        <span class="badge removed">Removed sessions</span>
        <span class="badge full">Availability changes</span>
      </div>
      <details>
        <summary>Show details</summary>
        <div class="section-grid">
          <section class="mini-card">
            <h3>Moved sessions</h3>
            ${listItems(movedSessions, (item) => `${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a>` : esc(item.title)} <span class="muted">(${esc(`${item.before.date} ${item.before.start}-${item.before.end}${item.before.room ? `, ${item.before.room}` : ''}`.trim())} → ${esc(`${item.after.date} ${item.after.start}-${item.after.end}${item.after.room ? `, ${item.after.room}` : ''}`.trim())})</span>`, 'No same-ID time or room moves in this update')}
          </section>
          <section class="mini-card">
            <h3>Renamed sessions</h3>
            ${listItems(renamedSessions, (item) => `${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.beforeTitle)} → ${esc(item.afterTitle)}</a>` : `${esc(item.beforeTitle)} → ${esc(item.afterTitle)}`}`, 'No same-ID retitles in this update')}
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
            <h3>Metadata changes</h3>
            ${listItems(metadataUpdates, (item) => `${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a>` : esc(item.title)} <span class="muted">(${esc(item.changedFields.join(', '))})</span>`, 'No same-ID description or speaker changes in this update')}
          </section>
          <section class="mini-card">
            <h3>Availability changes</h3>
            ${listItems(availabilityChanges, (item) => `${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a>` : esc(item.title)} <span class="muted">(${esc(item.kind)})</span>`, 'No notable availability movement in this update')}
          </section>
        </div>
        <details>
          <summary>Show possible slot replacements</summary>
          <div class="section-grid">
            <section class="mini-card">
              <h3>Possible slot replacements</h3>
              ${listItems(possibleReplacements, (item) => `${item.addedUrl || item.removedUrl ? `<a href="${esc(item.addedUrl || item.removedUrl)}" target="_blank" rel="noopener">${esc(item.removedTitle)} → ${esc(item.addedTitle)}</a>` : `${esc(item.removedTitle)} → ${esc(item.addedTitle)}`} <span class="muted">(${esc(item.reasons.join(', '))})</span>`, 'No heuristic slot-replacement guesses in this update')}
            </section>
            <section class="mini-card">
              <h3>Minor metadata churn</h3>
              ${listItems(diff.minorChanges, (item) => `${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a>` : esc(item.title)} <span class="muted">(${esc(item.changedFields.join(', '))})</span>`, 'No obvious low-value churn in this update')}
            </section>
            <section class="mini-card">
              <h3>Flappy / unstable listings</h3>
              ${listItems(diff.flappyChanges || [], (item) => `${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a>` : esc(item.title)} <span class="muted">(${esc(`${item.transitions} presence transitions across snapshots`)})</span>`, 'No known flappy listings in this update')}
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

export function generateChangelog(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const latestPath = path.resolve(repoRoot, args.latest);
  const snapshotsDir = path.resolve(repoRoot, args.snapshotsDir);
  const templatePath = path.resolve(repoRoot, args.template);
  const outputHtmlPath = path.resolve(repoRoot, args.outputHtml);
  const outputSummaryPath = path.resolve(repoRoot, args.outputSummary);

  const generatedAt = args.generatedAt || new Date().toISOString();
  const refreshSanity = buildRefreshSanityReport({ latestPath, snapshotsDir });
  const refreshErrors = refreshSanity.issues.filter((issue) => issue.level === 'error');
  if (refreshErrors.length) {
    throw new Error(refreshErrors.map((issue) => issue.message).join('\n'));
  }
  const snapshots = loadSnapshots(snapshotsDir);
  const mergedGroups = mergeNearbySnapshots(snapshots, MERGE_NEARBY_SNAPSHOTS_HOURS);
  const flappySessions = buildFlappySessionMap(snapshots);
  const groupedSnapshots = mergedGroups.map((items) => ({
    first: items[0],
    last: items[items.length - 1],
    items,
  }));
  const updates = [];
  for (let index = 1; index < groupedSnapshots.length; index += 1) {
    const diff = compareSnapshots(groupedSnapshots[index - 1].last, groupedSnapshots[index].last, { flappySessions });
    if (hasMeaningfulDiff(diff)) updates.push(diff);
  }
  updates.reverse();

  const summary = {
    meta: {
      generatedAt,
      latest: args.latest,
      snapshotsDir: args.snapshotsDir,
      template: args.template,
      outputHtml: args.outputHtml,
      generator: 'scripts/generate_changelog.mjs',
      mergeNearbyHours: MERGE_NEARBY_SNAPSHOTS_HOURS,
      latestLivePair: refreshSanity.pair,
      refreshWarnings: refreshSanity.issues.filter((issue) => issue.level === 'warning'),
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
  return { summary, outputSummaryPath, outputHtmlPath };
}

function main() {
  generateChangelog();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
