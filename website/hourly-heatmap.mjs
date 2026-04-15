const DATA_URL = './media/hourly-overview.json';
const MEGA_SESSION_REGISTRANTS = 1000;
const MARKER_WIDTH = 10;
const SMALL_ROOM_MARKER_WIDTH = 5;
const state = { data: null, snapshotIndex: 0, timer: null, startIndex: 0 };
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

function buildShell() {
  els.app.innerHTML = '';
  for (const [dayIndex, day] of state.data.days.entries()) {
    const shell = document.createElement('section');
    shell.className = 'day-shell';
    shell.innerHTML = `<h2 class="day-title">${esc(day)}</h2><div class="rows-header"><div>Hour</div><div>Seats</div><div>Top session</div><div>Sessions</div></div><div class="rows" data-day-index="${dayIndex}"></div>`;
    const rows = shell.querySelector('.rows');
    for (let hour = state.data.hourRange.min; hour < state.data.hourRange.max; hour += 1) {
      const row = document.createElement('div');
      row.className = 'hour-row';
      row.dataset.key = `${dayIndex}:${hour}`;
      row.innerHTML = `
        <div class="hour-label">${esc(hourLabel(hour))}</div>
        <div class="hour-seats">— reserved</div>
        <div class="top-session muted">No scheduled sessions</div>
        <div class="squares"></div>
      `;
      rows.appendChild(row);
    }
    els.app.appendChild(shell);
  }
}

function renderSnapshot() {
  const snapshot = state.data.snapshots[state.snapshotIndex];
  els.snapshotLabel.textContent = snapshot.label;
  els.snapshotSlider.min = String(state.startIndex);
  els.snapshotSlider.max = String(state.data.snapshots.length - 1);
  els.snapshotSlider.value = String(state.snapshotIndex);

  const visibleSessions = snapshot.sessions.filter(isVisibleSession);
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

  const movementNotes = [];

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
      squares.innerHTML = '';
      return;
    }
    row.style.display = 'grid';
    row.querySelector('.hour-seats').textContent = `${formatCompactCount(totalReserved)} res.`;
    row.querySelector('.top-session').textContent = topSession ? `${formatCompactCount(topSession.reg)}: ${topSession.t}` : 'No new starts this hour';
    row.querySelector('.top-session').className = `top-session${topSession ? '' : ' muted'}`;

    const markers = topSession
      ? [topSession, ...sessions.filter((session) => session.id !== topSession.id)]
      : sessions;
    squares.innerHTML = markers
      .sort(compareSessions)
      .map((session) => {
        const pct = fillPct(session);
        const fill = markerFillPct(session, snapshotBigMaxReserved, snapshotSmallMaxReserved);
        const width = markerWidth(session);
        const title = hasRealCapacity(session)
          ? `${session.t} · ${formatCount(session.reg)} reserved · ${pct.toFixed(0)}% full`
          : `${session.t} · ${formatCount(session.reg)} reserved${session.rem == null ? '' : ` · ${formatCount(session.rem)} seat${session.rem === 1 ? '' : 's'} left`} · capacity unknown`;
        return `<button class="sq ${fill == null ? 'unknown' : ''} ${topSession && session.id === topSession.id ? 'top-marker' : ''}" type="button" data-session-id="${esc(session.id)}" title="${esc(title)}" style="width:${width}px;min-width:${width}px"><span class="sq-fill" style="height:${fill == null ? 35 : fill}%"></span><span class="sq-tooltip">${esc(title)}</span></button>`;
      }).join('');

    squares.querySelectorAll('[data-session-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const sessionId = encodeURIComponent(button.dataset.sessionId);
        window.location.href = `./index.html?sessionids=${sessionId}#session-${sessionId}`;
      });
    });

    if (topSession && (topSession.reg ?? 0) >= 400) {
      movementNotes.push(topSession.t);
    }
  });

  els.playbackNote.textContent = movementNotes.length
    ? `Biggest rooms right now: ${movementNotes.slice(0, 3).join(' · ')}`
    : 'Press Play to watch the evolution from here';
}

function startAutoplay() {
  stopAutoplay();
  if (state.snapshotIndex >= state.data.snapshots.length - 1) {
    state.snapshotIndex = 0;
    renderSnapshot();
  }
  state.timer = window.setInterval(() => {
    if (state.snapshotIndex >= state.data.snapshots.length - 1) {
      stopAutoplay();
      return;
    }
    state.snapshotIndex += 1;
    renderSnapshot();
  }, 1500);
  els.playBtn.textContent = 'Pause';
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
    snapshotSlider: byId('snapshot-slider'),
    snapshotLabel: byId('snapshot-label'),
    playbackNote: byId('playback-note'),
  });
  const response = await fetch(DATA_URL);
  state.data = await response.json();
  state.startIndex = Math.max(0, state.data.snapshots.length - 1);
  state.snapshotIndex = state.startIndex;
  buildShell();
  renderSnapshot();

  els.playBtn.addEventListener('click', () => {
    if (state.timer) stopAutoplay(); else startAutoplay();
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
