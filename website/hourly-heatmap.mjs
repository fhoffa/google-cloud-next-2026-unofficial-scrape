const INITIAL_DATA_URL = './media/hourly-overview-latest.json';
const FULL_DATA_URL = './media/hourly-overview.json';
const MEGA_SESSION_REGISTRANTS = 1000;
const MARKER_WIDTH = 10;
const SMALL_ROOM_MARKER_WIDTH = 5;
const state = { data: null, snapshotIndex: 0, timer: null, startIndex: 0, latestIndex: 0, hasFullHistory: false, loadingHistory: false, query: '' };
const els = {};

function byId(id) { return document.getElementById(id); }
function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function hourLabel(hour) {
  const h = hour % 24;
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const shown = h % 12 || 12;
  return `${shown}${meridiem}`;
}
function fillPct(session) {
  if (session?.cap && session?.reg != null && session.cap > 0) {
    return Math.max(0, Math.min(100, (session.reg / session.cap) * 100));
  }
  if (session?.rem != null) {
    if (session.rem <= 0) return 100;
    if (session.rem <= 10) return 92;
  }
  return null;
}
function hasRealCapacity(session) {
  return Boolean(session?.cap && session.cap > 0);
}
function formatCount(value) {
  return value == null ? '—' : Number(value).toLocaleString();
}
function formatCompactCount(value) {
  if (value == null) return '—';
  const n = Number(value);
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
}
function formatSpeakers(session) {
  const speakers = Array.isArray(session?.sp) ? session.sp.filter((speaker) => speaker?.n) : [];
  if (!speakers.length) return '';
  return speakers.map((speaker) => speaker.c ? `${speaker.n} (${speaker.c})` : speaker.n).join(', ');
}
function isMegaSession(session) {
  return (session?.reg ?? 0) >= MEGA_SESSION_REGISTRANTS;
}
function isVisibleSession(session) {
  return (session?.reg ?? 0) > 1 && !isMegaSession(session);
}
function isSmallRoom(session) {
  return (session?.cap ?? 0) > 0 && session.cap < 100;
}
function fillTieScore(session) {
  return fillPct(session) ?? -1;
}
function compareSessions(a, b) {
  return (b.reg ?? -1) - (a.reg ?? -1)
    || fillTieScore(b) - fillTieScore(a)
    || ((a.rem ?? Number.POSITIVE_INFINITY) - (b.rem ?? Number.POSITIVE_INFINITY))
    || String(a.t).localeCompare(String(b.t));
}
function splitTerms(text) {
  return String(text || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
}
function matchesQuery(session) {
  const terms = splitTerms(state.query);
  if (!terms.length) return false;
  const haystack = String(session?.q || '').toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
function markerFillPct(session, bigMaxReserved, smallMaxReserved) {
  const reg = session?.reg ?? null;
  if (reg == null || reg <= 0) return null;
  const maxReserved = isSmallRoom(session)
    ? Math.max(1, smallMaxReserved || 0)
    : Math.max(1, bigMaxReserved || 0);
  return Math.max(8, Math.min(100, (reg / maxReserved) * 100));
}
function markerWidth(session) {
  if (isSmallRoom(session)) {
    return SMALL_ROOM_MARKER_WIDTH;
  }
  return MARKER_WIDTH;
}
function readInitialState() {
  const params = new URLSearchParams(window.location.search);
  state.query = params.get('q') || '';
}
function writeSearchToUrl() {
  const url = new URL(window.location.href);
  const query = String(state.query || '').trim();
  if (query) url.searchParams.set('q', query);
  else url.searchParams.delete('q');
  window.history.replaceState(null, '', url);
}

function estimateCalloutWidth(title) {
  return Math.max(120, Math.min(220, 26 + String(title || '').length * 5.5));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Overlay is a single body-level element so bubbles render above all day-shells.
function getOrCreateOverlay() {
  let overlay = document.getElementById('sq-global-overlay');
  if (!overlay) {
    if (getComputedStyle(document.body).position === 'static') {
      document.body.style.position = 'relative';
    }
    overlay = document.createElement('div');
    overlay.id = 'sq-global-overlay';
    overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:0;overflow:visible;pointer-events:none;z-index:9999;';
    // Single SVG for all connecting lines across all rows
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'sq-global-svg';
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;overflow:visible;pointer-events:none;';
    svg.innerHTML = '<defs><marker id="sq-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(26,115,232,.5)"/></marker></defs>';
    overlay.appendChild(svg);
    document.body.appendChild(overlay);
  }
  return overlay;
}

function clearOverlay() {
  const overlay = document.getElementById('sq-global-overlay');
  if (!overlay) return;
  // Remove all label divs but keep the SVG skeleton (defs/marker)
  [...overlay.children].forEach((child) => {
    if (child.id !== 'sq-global-svg') child.remove();
  });
  const svg = document.getElementById('sq-global-svg');
  if (svg) {
    [...svg.children].forEach((child) => {
      if (child.tagName !== 'defs') child.remove();
    });
  }
}

// ─── Callout overlay — design goals and constraints ──────────────────────────
//
// GOAL
//   When a search query matches sessions, show floating label bubbles that
//   identify each match by title and connect it to its square via a thin arrow.
//
// HARD CONSTRAINTS
//   1. Zero vertical footprint — rows must not expand or shift.  Bubbles are
//      pure overlays; the page's flex/grid layout is never affected.
//   2. No bubble overlap — labels must never cover each other.
//   3. Full viewport spread — bubbles may extend horizontally beyond the day
//      card and into any white-space on the page, including outside the left or
//      right edges of the `.squares` container.
//   4. Z-order — bubbles must float above all day-shell stacking contexts.
//
// ARCHITECTURE
//   A single `position:absolute` overlay div (`#sq-global-overlay`) is appended
//   to `<body>` at z-index 9999.  Inside it lives one shared SVG
//   (`#sq-global-svg`) for all connecting lines.  All coordinates are computed
//   in document space (getBoundingClientRect + scrollX/Y).
//   `clearOverlay()` is called at the top of every `renderSnapshot()` so stale
//   labels are removed while the SVG `<defs>` marker is preserved.
//
// PLACEMENT ALGORITHM
//   • Each label is initially centered on its anchor square's Y coordinate.
//   • Labels are sorted by row (Y) then horizontal position so siblings in the
//     same hour stay close together.
//   • A greedy pass nudges each label left or right (up to 10 tries) until it
//     no longer overlaps any already-placed label, using a GAP buffer.
//   • Positions are clamped to the viewport width so no label scrolls off-screen.
//
// ARROWS
//   Subtle by design — thin (1.5 px), semi-transparent (45 % opacity).
//   The line starts from the nearest point on the label's border facing the
//   anchor (computed by `labelEdgePoint`), not from the label centre.
//   Arrowhead is a 4×4 marker pointing at the centre of the target square.
//
// DRAGGING
//   Each bubble is draggable so users can reposition it for screenshots.
//   The connecting line updates live via `updateLine()`.
// ─────────────────────────────────────────────────────────────────────────────
function buildDistributedCallouts(squares, matchedButtons) {
  if (!matchedButtons.length) return;
  const GAP = 6;
  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;
  const totalWidth = window.innerWidth;

  const overlay = getOrCreateOverlay();
  const overlaySvg = document.getElementById('sq-global-svg');

  const labels = matchedButtons.map((button) => {
    const title = button.dataset.sessionTitle || '';
    const width = estimateCalloutWidth(title);
    const charsPerLine = Math.max(1, Math.floor((width - 14) / 5.5));
    const lineCount = Math.ceil(Math.max(1, title.length / charsPerLine));
    const height = 10 + lineCount * 14;
    const btnRect = button.getBoundingClientRect();
    const anchorDocX = btnRect.left + scrollX + btnRect.width / 2;
    const anchorDocY = btnRect.top + scrollY + btnRect.height / 2;
    const anchorViewX = btnRect.left + btnRect.width / 2;
    return { title, width, height, anchorDocX, anchorDocY, anchorViewX };
  });

  // Place each label centered on its anchor row, spread horizontally to avoid overlap.
  // Sort by row (Y) then by horizontal position so nearby sessions stay near each other.
  labels.sort((a, b) => a.anchorDocY - b.anchorDocY || a.anchorViewX - b.anchorViewX);

  const placed = [];
  for (const label of labels) {
    let docLeft = clamp(label.anchorViewX - label.width / 2 + scrollX, scrollX, scrollX + totalWidth - label.width);
    const docTop = label.anchorDocY - label.height / 2;

    // Nudge horizontally up to 10 times to resolve overlaps
    for (let attempt = 0; attempt < 10; attempt++) {
      const r = { left: docLeft, right: docLeft + label.width, top: docTop, bottom: docTop + label.height };
      const hit = placed.find((p) => p.left < r.right + GAP && p.right > r.left - GAP && p.top < r.bottom + GAP && p.bottom > r.top - GAP);
      if (!hit) break;
      const movingRight = (hit.left + hit.right) / 2 < docLeft + label.width / 2;
      docLeft = movingRight ? hit.right + GAP : hit.left - label.width - GAP;
      docLeft = clamp(docLeft, scrollX, scrollX + totalWidth - label.width);
    }

    label.docLeft = docLeft;
    label.docTop = docTop;
    placed.push({ left: docLeft, right: docLeft + label.width, top: docTop, bottom: docTop + label.height });
  }

  // Nearest point on label border facing the anchor (clean arrow start)
  function labelEdgePoint(docLeft, docTop, lWidth, lHeight, anchorDocX, anchorDocY) {
    const cx = docLeft + lWidth / 2;
    const cy = docTop + lHeight / 2;
    const dx = anchorDocX - cx;
    const dy = anchorDocY - cy;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return { x: cx, y: cy };
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (docLeft + lWidth - cx) / dx);
    if (dx < 0) t = Math.min(t, (docLeft - cx) / dx);
    if (dy > 0) t = Math.min(t, (docTop + lHeight - cy) / dy);
    if (dy < 0) t = Math.min(t, (docTop - cy) / dy);
    return { x: cx + t * dx, y: cy + t * dy };
  }

  for (const label of labels) {
    const el = document.createElement('div');
    el.className = 'sq-callout-label';
    el.textContent = label.title;
    el.style.position = 'absolute';
    el.style.width = `${label.width}px`;
    el.style.left = `${label.docLeft}px`;
    el.style.top = `${label.docTop}px`;
    el.style.cursor = 'grab';
    el.style.pointerEvents = 'auto';
    el.style.userSelect = 'none';
    overlay.appendChild(el);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('stroke', 'rgba(26,115,232,.45)');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('marker-end', 'url(#sq-arrow)');
    line.setAttribute('x2', String(label.anchorDocX));
    line.setAttribute('y2', String(label.anchorDocY));
    overlaySvg.appendChild(line);

    function updateLine(docLeft, docTop) {
      const { x: x1, y: y1 } = labelEdgePoint(docLeft, docTop, label.width, label.height, label.anchorDocX, label.anchorDocY);
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
    }
    updateLine(label.docLeft, label.docTop);

    el.addEventListener('mousedown', (e) => {
      const startX = e.clientX;
      const startY = e.clientY;
      const origLeft = parseFloat(el.style.left);
      const origTop = parseFloat(el.style.top);
      el.style.cursor = 'grabbing';
      el.style.zIndex = '10000';
      const onMove = (e2) => {
        const newLeft = origLeft + (e2.clientX - startX);
        const newTop = origTop + (e2.clientY - startY);
        el.style.left = `${newLeft}px`;
        el.style.top = `${newTop}px`;
        updateLine(newLeft, newTop);
      };
      const onUp = () => {
        el.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }
}

function buildShell() {
  els.app.innerHTML = '';
  for (const [dayIndex, day] of state.data.days.entries()) {
    const shell = document.createElement('section');
    shell.className = 'day-shell';
    shell.innerHTML = `<h2 class="day-title">${esc(day)}</h2><div class="rows-header"><div>Hour</div><div>Seats</div><div>Sessions</div></div><div class="rows" data-day-index="${dayIndex}"></div>`;
    const rows = shell.querySelector('.rows');
    for (let hour = state.data.hourRange.min; hour < state.data.hourRange.max; hour += 1) {
      const row = document.createElement('div');
      row.className = 'hour-row';
      row.dataset.key = `${dayIndex}:${hour}`;
      row.innerHTML = `
        <div class="hour-label">${esc(hourLabel(hour))}</div>
        <div class="hour-seats">— reserved</div>
        <div class="squares"></div>
      `;
      rows.appendChild(row);
    }
    els.app.appendChild(shell);
  }
}

function hasMeaningfulSnapshot(snapshot) {
  const visibleSessions = snapshot.sessions.filter(isVisibleSession);
  return visibleSessions.some((session) => (session?.reg ?? 0) > 1);
}

function applyDataset(data, { hasFullHistory = false, snapshotIndex = null } = {}) {
  state.data = data;
  state.hasFullHistory = hasFullHistory;
  state.latestIndex = Math.max(0, state.data.snapshots.length - 1);
  const meaningfulIndex = state.data.snapshots.findIndex(hasMeaningfulSnapshot);
  state.startIndex = meaningfulIndex >= 0 ? meaningfulIndex : 0;
  state.snapshotIndex = snapshotIndex == null ? state.latestIndex : Math.max(state.startIndex, Math.min(state.latestIndex, snapshotIndex));
}

async function ensureFullHistoryLoaded() {
  if (state.hasFullHistory || state.loadingHistory) return;
  state.loadingHistory = true;
  els.playbackNote.textContent = 'Loading snapshot history…';
  try {
    const response = await fetch(FULL_DATA_URL);
    const data = await response.json();
    applyDataset(data, { hasFullHistory: true, snapshotIndex: data.snapshots.length - 1 });
    renderSnapshot();
  } finally {
    state.loadingHistory = false;
  }
}

function renderSnapshot() {
  clearOverlay();
  const snapshot = state.data.snapshots[state.snapshotIndex];
  els.snapshotLabel.textContent = snapshot.label;
  els.snapshotSlider.min = String(state.startIndex);
  els.snapshotSlider.max = String(state.latestIndex);
  els.snapshotSlider.value = String(state.snapshotIndex);

  const visibleSessions = snapshot.sessions.filter(isVisibleSession);
  const queryTerms = splitTerms(state.query);
  const matchedSessions = queryTerms.length
    ? visibleSessions.filter((session) => session.sh != null && matchesQuery(session))
    : [];
  const matchedSessionIds = new Set(matchedSessions.map((session) => String(session.id)));
  const calloutSessionIds = matchedSessionIds.size > 0 && matchedSessionIds.size < 20
    ? matchedSessionIds
    : new Set();
  els.searchSummary.textContent = queryTerms.length
    ? `${matchedSessionIds.size.toLocaleString()} session${matchedSessionIds.size === 1 ? '' : 's'} matched`
    : '';
  const snapshotBigMaxReserved = Math.max(1, ...visibleSessions.filter((session) => !isSmallRoom(session)).map((session) => session.reg || 0), 1);
  const snapshotSmallMaxReserved = Math.max(1, ...visibleSessions.filter(isSmallRoom).map((session) => session.reg || 0), 1);

  const grouped = new Map();
  for (const session of visibleSessions) {
    for (let hour = session.sh; hour < session.eh; hour += 1) {
      const key = `${session.d}:${hour}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(session);
    }
  }

  let visibleRowIndex = 0;
  els.app.querySelectorAll('.hour-row').forEach((row) => {
    const key = row.dataset.key;
    const hour = Number(key.split(':')[1]);
    const sessions = (grouped.get(key) || []).sort(compareSessions);
    const startingSessions = sessions
      .filter((session) => session.sh === hour)
      .sort(compareSessions);
    const squares = row.querySelector('.squares');
    const topSession = startingSessions[0] || null;
    const totalReserved = startingSessions.reduce((sum, session) => sum + (session.reg ?? 0), 0);
    if (startingSessions.length === 0 || totalReserved <= 0) {
      row.style.display = 'none';
      row.classList.remove('callouts-below');
      squares.innerHTML = '';
      return;
    }
    row.style.display = 'grid';
    row.querySelector('.hour-seats').textContent = `${formatCompactCount(totalReserved)} res.`;
    const hasQuery = queryTerms.length > 0;

    const markers = startingSessions;
    const showDistributedCallouts = calloutSessionIds.size > 0;
    row.classList.remove('callouts-below');
    visibleRowIndex += 1;
    squares.innerHTML = markers
      .sort(compareSessions)
      .map((session) => {
        const pct = fillPct(session);
        const fill = markerFillPct(session, snapshotBigMaxReserved, snapshotSmallMaxReserved);
        const width = markerWidth(session);
        const speakers = formatSpeakers(session);
        const sponsored = session?.spon ? ` · Sponsored${session?.scon ? ` by ${session.scon}` : ' session'}` : '';
        const title = hasRealCapacity(session)
          ? `${session.t} · ${formatCount(session.reg)} reserved · ${pct.toFixed(0)}% full${speakers ? ` · Speakers: ${speakers}` : ''}${sponsored}`
          : `${session.t} · ${formatCount(session.reg)} reserved${speakers ? ` · Speakers: ${speakers}` : ''}${sponsored}`;
        const searchClass = hasQuery
          ? (matchesQuery(session) ? 'search-match' : 'search-dim')
          : '';
        const fullClass = pct != null && pct >= 100 ? 'full-session' : '';
        const matchedAttr = calloutSessionIds.has(String(session.id)) ? '1' : '';
        return `<button class="sq ${fill == null ? 'unknown' : ''} ${fullClass} ${topSession && session.id === topSession.id ? 'top-marker' : ''} ${searchClass}" type="button" data-session-id="${esc(session.id)}" data-session-title="${esc(session.t)}" data-callout-match="${matchedAttr}" title="${esc(title)}" style="width:${width}px;min-width:${width}px"><span class="sq-fill" style="height:${fill == null ? 35 : fill}%"></span><span class="sq-tooltip">${esc(title)}</span></button>`;
      }).join('');

    if (showDistributedCallouts) {
      const matchedButtons = [...squares.querySelectorAll('[data-callout-match="1"]')];
      buildDistributedCallouts(squares, matchedButtons);
    }

    squares.querySelectorAll('[data-session-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const sessionId = encodeURIComponent(button.dataset.sessionId);
        window.location.href = `./index.html?sessionids=${sessionId}#session-${sessionId}`;
      });
    });

  });

  if (!state.timer) {
    els.playbackNote.textContent = 'Press Play to watch the evolution from here';
  }
}

function stepAutoplay() {
  if (state.snapshotIndex >= state.latestIndex) {
    stopAutoplay();
    return false;
  }
  state.snapshotIndex += 1;
  renderSnapshot();
  return true;
}

async function startAutoplay() {
  stopAutoplay();
  await ensureFullHistoryLoaded();
  if (state.latestIndex <= state.startIndex) {
    renderSnapshot();
    return;
  }
  state.snapshotIndex = Math.min(state.snapshotIndex, state.latestIndex);
  if (state.snapshotIndex >= state.latestIndex || state.snapshotIndex < state.startIndex) {
    state.snapshotIndex = state.startIndex;
    renderSnapshot();
  }
  els.playBtn.textContent = 'Pause';
  els.playbackNote.textContent = 'Playing hourly history…';
  if (!stepAutoplay()) return;
  state.timer = window.setInterval(() => {
    stepAutoplay();
  }, 1500);
}
function stopAutoplay() {
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
  els.playBtn.textContent = 'Play';
}

async function init() {
  Object.assign(els, {
    app: byId('app'),
    playBtn: byId('play-btn'),
    searchInput: byId('search-input'),
    snapshotSlider: byId('snapshot-slider'),
    snapshotLabel: byId('snapshot-label'),
    searchSummaryWrap: byId('search-summary-wrap'),
    searchSummary: byId('search-summary'),
    playbackNote: byId('playback-note'),
  });
  readInitialState();
  els.searchInput.value = state.query;
  const response = await fetch(INITIAL_DATA_URL);
  const data = await response.json();
  applyDataset(data, { hasFullHistory: false });
  buildShell();
  renderSnapshot();

  els.playBtn.addEventListener('click', async () => {
    if (state.timer) stopAutoplay(); else await startAutoplay();
  });
  els.searchInput.addEventListener('input', (event) => {
    state.query = event.target.value || '';
    writeSearchToUrl();
    renderSnapshot();
  });
  els.snapshotSlider.addEventListener('input', (event) => {
    state.snapshotIndex = Number(event.target.value);
    renderSnapshot();
  });
}

init().catch((error) => {
  console.error(error);
  byId('app').innerHTML = `<div class="empty-state">Failed to load hourly overview: ${esc(error.message)}</div>`;
});
