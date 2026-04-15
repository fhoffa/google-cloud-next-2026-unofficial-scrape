const DATA_URL = './media/hourly-overview.json';
const TILE_H = 30;
const TILE_GAP = 4;
const HOUR_W = 88;
const HEADER_H = 28;
const state = { data: null, snapshotIndex: 0, timer: null };
const els = {};
const boards = [];

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
function availabilityBand(session) {
  if (session.rem != null) {
    if (session.rem <= 0) return 'full';
    if (session.rem <= 10) return 'limited';
  }
  if (session.cap && session.reg != null) {
    const ratio = session.reg / session.cap;
    if (ratio >= 1) return 'full';
    if (ratio >= 0.9) return 'limited';
    if (ratio >= 0.6) return 'filling';
    return 'open';
  }
  return 'unknown';
}
function formatCount(value) {
  return value == null ? '—' : Number(value).toLocaleString();
}

function layoutDaySessions(daySessions, minHour) {
  const sorted = [...daySessions].sort((a, b) => a.sm - b.sm || a.em - b.em || String(a.t).localeCompare(String(b.t)));
  const laneEnds = [];
  return sorted.map((session) => {
    let lane = laneEnds.findIndex((end) => end <= session.sm);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(session.em);
    } else {
      laneEnds[lane] = session.em;
    }
    const left = (session.sh - minHour) * HOUR_W + 6;
    const width = Math.max(18, (session.eh - session.sh) * HOUR_W - 12);
    const top = HEADER_H + lane * (TILE_H + TILE_GAP) + 6;
    return { ...session, lane, left, width, top };
  });
}

function buildShell() {
  els.app.innerHTML = '';
  boards.length = 0;
  const cols = state.data.hourRange.max - state.data.hourRange.min;
  for (const [dayIndex, day] of state.data.days.entries()) {
    const shell = document.createElement('section');
    shell.className = 'day-shell';
    shell.innerHTML = `
      <h2 class="day-title">${esc(day)}</h2>
      <div class="hour-metrics" style="grid-template-columns:repeat(${cols}, minmax(0, 1fr))"></div>
      <div class="board" style="--hour-width:${HOUR_W}px; width:${cols * HOUR_W}px">
        <div class="board-labels"></div>
      </div>
    `;
    els.app.appendChild(shell);
    const metrics = shell.querySelector('.hour-metrics');
    const board = shell.querySelector('.board');
    const labels = shell.querySelector('.board-labels');
    for (let hour = state.data.hourRange.min; hour < state.data.hourRange.max; hour += 1) {
      const metric = document.createElement('div');
      metric.className = 'hour-metric';
      metric.dataset.hour = `${dayIndex}:${hour}`;
      metric.innerHTML = `<div class="hour">${esc(hourLabel(hour))}</div><div class="seats">—</div><div class="leader">No scheduled sessions</div>`;
      metrics.appendChild(metric);
      const label = document.createElement('div');
      label.className = 'hour-label';
      label.style.left = `${(hour - state.data.hourRange.min + 0.5) * HOUR_W}px`;
      label.textContent = hourLabel(hour);
      labels.appendChild(label);
    }
    boards.push({ dayIndex, metrics, board, labels, tileMap: new Map() });
  }
}

function renderSnapshot() {
  const snapshot = state.data.snapshots[state.snapshotIndex];
  els.snapshotLabel.textContent = snapshot.label;
  els.snapshotSlider.max = String(state.data.snapshots.length - 1);
  els.snapshotSlider.value = String(state.snapshotIndex);
  const interesting = [];

  for (const boardState of boards) {
    const { dayIndex, metrics, board, tileMap } = boardState;
    const daySessions = snapshot.sessions.filter((session) => session.d === dayIndex);
    const layouts = layoutDaySessions(daySessions, state.data.hourRange.min);
    const lanes = Math.max(1, ...layouts.map((item) => item.lane + 1), 1);
    board.style.height = `${HEADER_H + lanes * (TILE_H + TILE_GAP) + 12}px`;

    metrics.querySelectorAll('.hour-metric').forEach((metric) => {
      const key = metric.dataset.hour;
      const info = snapshot.hours[key];
      const seats = info?.totalReserved ?? null;
      metric.querySelector('.seats').textContent = seats == null ? '— reserved' : `${formatCount(seats)} reserved`;
      metric.querySelector('.leader').textContent = info?.topSession ? `${info.topSession.title} (${formatCount(info.topSession.reg)})` : 'No scheduled sessions';
    });

    const liveKeys = new Set();
    for (const layout of layouts) {
      const key = layout.id;
      liveKeys.add(key);
      let tile = tileMap.get(key);
      if (!tile) {
        tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'tile';
        tile.addEventListener('click', () => {
          window.location.href = `./session-timeline.html#${encodeURIComponent(layout.id)}`;
        });
        board.appendChild(tile);
        tileMap.set(key, tile);
      }
      tile.className = `tile ${availabilityBand(layout)}`;
      tile.style.left = `${layout.left}px`;
      tile.style.top = `${layout.top}px`;
      tile.style.width = `${layout.width}px`;
      tile.style.height = `${TILE_H}px`;
      tile.style.opacity = '1';
      tile.style.zIndex = String(layout.lane + 2);
      tile.title = `${layout.t}\n${layout.r || 'Room TBD'}\n${hourLabel(layout.sh)}-${hourLabel((layout.eh - 1 + 24) % 24 + 1)}\n${formatCount(layout.reg)} reserved`;
      tile.innerHTML = `<div class="tile-title">${esc(layout.t)}</div><div class="tile-meta">${esc(layout.r || 'Room TBD')} · ${formatCount(layout.reg)} reserved</div>`;
      if ((layout.reg ?? 0) > 250) interesting.push(layout.t);
    }

    for (const [key, tile] of tileMap.entries()) {
      if (!liveKeys.has(key)) {
        tile.style.opacity = '0';
        tile.style.pointerEvents = 'none';
      } else {
        tile.style.pointerEvents = 'auto';
      }
    }
  }
  els.playbackNote.textContent = interesting.length ? `Big rooms right now: ${interesting.slice(0, 3).join(' · ')}` : 'Tiles move when sessions reschedule';
}

function startAutoplay() {
  stopAutoplay();
  state.timer = window.setInterval(() => {
    state.snapshotIndex = (state.snapshotIndex + 1) % state.data.snapshots.length;
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
  state.snapshotIndex = state.data.snapshots.length - 1;
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
