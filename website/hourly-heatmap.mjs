const DATA_URL = './media/hourly-overview.json';
const state = { data: null, snapshotIndex: 0, timer: null };
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

function buildShell() {
  els.app.innerHTML = '';
  for (const [dayIndex, day] of state.data.days.entries()) {
    const shell = document.createElement('section');
    shell.className = 'day-shell';
    shell.innerHTML = `<h2 class="day-title">${esc(day)}</h2><div class="rows" data-day-index="${dayIndex}"></div>`;
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
  els.snapshotSlider.max = String(state.data.snapshots.length - 1);
  els.snapshotSlider.value = String(state.snapshotIndex);

  const grouped = new Map();
  for (const session of snapshot.sessions) {
    for (let hour = session.sh; hour < session.eh; hour += 1) {
      const key = `${session.d}:${hour}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(session);
    }
  }

  const movementNotes = [];

  els.app.querySelectorAll('.hour-row').forEach((row) => {
    const key = row.dataset.key;
    const hourInfo = snapshot.hours[key];
    const sessions = grouped.get(key) || [];
    const squares = row.querySelector('.squares');
    row.querySelector('.hour-seats').textContent = `${formatCount(hourInfo?.totalReserved)} reserved`;
    const topSession = hourInfo?.topSession;
    row.querySelector('.top-session').textContent = topSession ? topSession.title : 'No scheduled sessions';
    row.querySelector('.top-session').className = `top-session${topSession ? '' : ' muted'}`;

    const others = topSession ? sessions.filter((session) => session.id !== topSession.id) : sessions;
    squares.innerHTML = others
      .sort((a, b) => (b.reg ?? -1) - (a.reg ?? -1) || String(a.t).localeCompare(String(b.t)))
      .map((session) => {
        const band = availabilityBand(session);
        const title = `${session.t}\n${session.r || 'Room TBD'}\n${formatCount(session.reg)} reserved`;
        return `<button class="sq ${band}" type="button" data-session-id="${esc(session.id)}" title="${esc(title)}"></button>`;
      }).join('');

    squares.querySelectorAll('[data-session-id]').forEach((button) => {
      button.addEventListener('click', () => {
        window.location.href = `./session-timeline.html#${encodeURIComponent(button.dataset.sessionId)}`;
      });
    });

    if (topSession && (topSession.reg ?? 0) >= 400) {
      movementNotes.push(topSession.title);
    }
  });

  els.playbackNote.textContent = movementNotes.length
    ? `Biggest rooms right now: ${movementNotes.slice(0, 3).join(' · ')}`
    : 'Rows regroup as sessions move across hours';
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
