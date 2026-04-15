const DATA_URL = './media/session-history.json';
const state = {
  data: null,
  filtered: [],
  selectedId: null,
  snapshotIndex: 0,
  sort: 'churn',
  changedOnly: true,
  query: '',
  timer: null,
};

const els = {};

function speakerKey(speaker) {
  return `${speaker?.n || ''}__${speaker?.c || ''}`;
}

function byId(id) {
  return document.getElementById(id);
}

function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sessionChurn(session) {
  return session.titleChangeCount + session.speakerChangeCount + session.fullnessChangeCount + session.presenceTransitions;
}

function availabilityBand(entry) {
  if (!entry) return 'missing';
  if (entry.rem != null) {
    if (entry.rem <= 0) return 'full';
    if (entry.rem <= 10) return 'limited';
  }
  if (entry.cap && entry.reg != null) {
    const ratio = entry.reg / entry.cap;
    if (ratio >= 1) return 'full';
    if (ratio >= 0.9) return 'limited';
    if (ratio >= 0.6) return 'filling';
    return 'open';
  }
  return 'unknown';
}

function fillPct(entry) {
  if (!entry || !entry.cap || entry.reg == null) return null;
  return Math.max(0, Math.min(100, (entry.reg / entry.cap) * 100));
}

function sortSessions(items) {
  const sorted = [...items];
  const sorters = {
    churn: (a, b) => sessionChurn(b) - sessionChurn(a) || a.latestTitle.localeCompare(b.latestTitle),
    title: (a, b) => b.titleChangeCount - a.titleChangeCount || sessionChurn(b) - sessionChurn(a),
    speakers: (a, b) => b.speakerChangeCount - a.speakerChangeCount || sessionChurn(b) - sessionChurn(a),
    fullness: (a, b) => b.fullnessChangeCount - a.fullnessChangeCount || (b.peakRegistrants ?? -1) - (a.peakRegistrants ?? -1),
    recent: (a, b) => (b.lastSeenIndex ?? -1) - (a.lastSeenIndex ?? -1) || sessionChurn(b) - sessionChurn(a),
    alpha: (a, b) => a.latestTitle.localeCompare(b.latestTitle),
  };
  sorted.sort(sorters[state.sort] || sorters.churn);
  return sorted;
}

function currentSession() {
  return state.data?.sessions.find((session) => session.id === state.selectedId) || null;
}

function currentEntry(session) {
  return session?.timeline?.[state.snapshotIndex] || null;
}

function previousEntry(session) {
  for (let i = state.snapshotIndex - 1; i >= 0; i -= 1) {
    if (session?.timeline?.[i]) return session.timeline[i];
  }
  return null;
}

function formatCount(value) {
  if (value == null || value === '') return '—';
  return Number(value).toLocaleString();
}

function diffSummary(prev, next) {
  if (!next) return ['Not listed in this snapshot'];
  if (!prev) return ['First appearance in tracked snapshots'];
  const changes = [];
  if (prev.t !== next.t) changes.push(`Title changed`);
  const prevSpeakers = JSON.stringify(prev.sp || []);
  const nextSpeakers = JSON.stringify(next.sp || []);
  if (prevSpeakers !== nextSpeakers) changes.push(`Speakers changed`);
  if (`${prev.d}|${prev.s}|${prev.e}|${prev.r}` !== `${next.d}|${next.s}|${next.e}|${next.r}`) changes.push(`Schedule/room changed`);
  if (`${prev.reg}|${prev.rem}|${prev.cap}` !== `${next.reg}|${next.rem}|${next.cap}`) changes.push(`Fullness changed`);
  return changes.length ? changes : ['No visible change from prior appearance'];
}

function compareSpeakers(prev = [], next = []) {
  const prevMap = new Map(prev.map((speaker) => [speakerKey(speaker), speaker]));
  const nextMap = new Map(next.map((speaker) => [speakerKey(speaker), speaker]));
  const added = [];
  const unchanged = [];
  const removed = [];
  for (const [key, speaker] of nextMap) {
    if (prevMap.has(key)) unchanged.push(speaker);
    else added.push(speaker);
  }
  for (const [key, speaker] of prevMap) {
    if (!nextMap.has(key)) removed.push(speaker);
  }
  return { added, unchanged, removed };
}

function renderSpeakerChip(speaker, cls, tag) {
  return `<span class="speaker-chip ${cls}"><strong>${esc(speaker.n || 'Unknown')}</strong>${speaker.c ? `<small>${esc(speaker.c)}</small>` : ''}${tag ? `<span class="delta-tag">${esc(tag)}</span>` : ''}</span>`;
}

function renderList() {
  const items = state.filtered.slice(0, 200);
  els.resultsCount.textContent = `${state.filtered.length.toLocaleString()} sessions`;
  els.sessionList.innerHTML = items.map((session) => {
    const selected = session.id === state.selectedId;
    return `<button class="session-list-item${selected ? ' selected' : ''}" data-session-id="${esc(session.id)}">
      <div class="session-list-title">${esc(session.latestTitle)}</div>
      <div class="session-list-meta">ID ${esc(session.id)} · titles ${session.titleChangeCount} · speakers ${session.speakerChangeCount} · fullness ${session.fullnessChangeCount}</div>
    </button>`;
  }).join('');
  els.sessionList.querySelectorAll('[data-session-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedId = button.dataset.sessionId;
      render();
    });
  });
}

function renderFilmstrip(session) {
  els.filmstrip.innerHTML = state.data.snapshots.map((snapshot) => {
    const entry = session.timeline[snapshot.index];
    const active = snapshot.index === state.snapshotIndex ? ' active' : '';
    const band = availabilityBand(entry);
    const pct = fillPct(entry);
    const title = entry ? `${snapshot.label}\n${entry.t}` : `${snapshot.label}\nNot listed`;
    return `<button class="film-cell ${band}${active}" data-snapshot-index="${snapshot.index}" title="${esc(title)}">
      <span class="film-fill" style="height:${pct == null ? 8 : Math.max(8, pct)}%"></span>
    </button>`;
  }).join('');
  els.filmstrip.querySelectorAll('[data-snapshot-index]').forEach((button) => {
    button.addEventListener('click', () => {
      state.snapshotIndex = Number(button.dataset.snapshotIndex);
      renderViewer();
    });
  });
}

function renderViewer() {
  const session = currentSession();
  if (!session) {
    els.viewer.classList.add('empty');
    els.viewer.innerHTML = '<div class="empty-state">No session selected.</div>';
    return;
  }
  const snapshot = state.data.snapshots[state.snapshotIndex];
  const entry = currentEntry(session);
  const prev = previousEntry(session);
  const changes = diffSummary(prev, entry);
  const pct = fillPct(entry);
  const prevPct = fillPct(prev);
  const titleChanged = Boolean(prev && entry && prev.t !== entry.t);
  const fullnessChanged = Boolean(prev && entry && `${prev.reg}|${prev.rem}|${prev.cap}` !== `${entry.reg}|${entry.rem}|${entry.cap}`);
  const scheduleChanged = Boolean(prev && entry && `${prev.d}|${prev.s}|${prev.e}|${prev.r}` !== `${entry.d}|${entry.s}|${entry.e}|${entry.r}`);
  const speakerDelta = compareSpeakers(prev?.sp || [], entry?.sp || []);
  const titleMoments = session.uniqueTitles.map((item) => `<li><strong>${esc(state.data.snapshots[item.snapshotIndex]?.label || '')}</strong><span>${esc(item.title)}</span></li>`).join('');
  const speakers = entry?.sp?.length
    ? [
      ...speakerDelta.added.map((speaker) => renderSpeakerChip(speaker, 'added', 'added')),
      ...speakerDelta.unchanged.map((speaker) => renderSpeakerChip(speaker, 'unchanged', 'kept')),
      ...speakerDelta.removed.map((speaker) => renderSpeakerChip(speaker, 'removed', 'removed')),
    ].join('')
    : '<span class="muted">No speakers listed</span>';
  const stats = [
    ['Title changes', session.titleChangeCount],
    ['Speaker changes', session.speakerChangeCount],
    ['Fullness changes', session.fullnessChangeCount],
    ['Presence flips', session.presenceTransitions],
  ].map(([label, value]) => `<div class="stat-card"><span>${label}</span><strong>${value}</strong></div>`).join('');

  els.viewer.classList.remove('empty');
  els.viewer.innerHTML = `
    <div class="viewer-topline">
      <div>
        <div class="eyebrow">Snapshot ${state.snapshotIndex + 1} of ${state.data.snapshots.length}</div>
        <h2 class="session-title${entry ? ' animate-in' : ''}">${esc(entry?.t || session.latestTitle)}</h2>
        <div class="session-subtitle">ID ${esc(session.id)}${session.url ? ` · <a href="${esc(session.url)}" target="_blank" rel="noopener">open source page ↗</a>` : ''}</div>
      </div>
      <div class="snapshot-badge">${esc(snapshot.label)}</div>
    </div>
    <div class="stats-grid">${stats}</div>
    <div class="delta-grid">
      <section class="delta-col previous">
        <div class="card-label">Previous visible snapshot</div>
        <div class="delta-title">${esc(prev?.t || 'No previous tracked state')}</div>
        <div class="delta-meta">${prev ? `${esc(prev.d || 'Date TBD')} · ${esc([prev.s, prev.e].filter(Boolean).join(' – ') || 'Time TBD')}${prev.r ? ` · ${esc(prev.r)}` : ''}` : 'This is the first appearance in tracked history.'}</div>
      </section>
      <div class="delta-arrow">→</div>
      <section class="delta-col current ${changes[0] === 'No visible change from prior appearance' ? '' : 'changed flash-in'}">
        <div class="card-label">Current snapshot</div>
        <div class="delta-title">${esc(entry?.t || session.latestTitle)}</div>
        <div class="delta-meta">${entry ? `${esc(entry.d || 'Date TBD')} · ${esc([entry.s, entry.e].filter(Boolean).join(' – ') || 'Time TBD')}${entry.r ? ` · ${esc(entry.r)}` : ''}` : 'Not listed in this snapshot.'}</div>
      </section>
    </div>
    <div class="viewer-grid">
      <section class="card primary-card ${entry ? '' : 'missing-card'}">
        <div class="card-label">Current snapshot state</div>
        ${entry ? `
          <div class="meta-row ${scheduleChanged ? 'flash-in' : ''}">${esc(entry.d || 'Date TBD')} · ${esc([entry.s, entry.e].filter(Boolean).join(' – ') || 'Time TBD')}${entry.r ? ` · ${esc(entry.r)}` : ''}</div>
          <div class="fill-wrap ${fullnessChanged ? 'flash-in' : ''}">
            <div class="fill-header"><span>Seat fullness</span><strong>${pct == null ? 'Unknown' : `${pct.toFixed(1)}%`}</strong></div>
            <div class="fill-track"><div class="fill-bar-prev" style="width:${prevPct == null ? 0 : prevPct}%"></div><div class="fill-bar ${availabilityBand(entry)}" style="width:${pct == null ? 0 : pct}%"></div></div>
            <div class="fill-meta">${formatCount(entry.reg)} registered · ${formatCount(entry.rem)} seats left · capacity ${formatCount(entry.cap)}${prev && fullnessChanged ? ` · was ${formatCount(prev.reg)} / ${formatCount(prev.cap)}` : ''}</div>
          </div>
          <div class="speaker-list ${speakerDelta.added.length || speakerDelta.removed.length ? 'flash-in' : ''}">${speakers}</div>
        ` : `
          <div class="missing-note">This session was not listed in this snapshot.</div>
        `}
      </section>
      <section class="card">
        <div class="card-label">What changed here</div>
        <ul class="change-list">${changes.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
      </section>
    </div>
    <section class="card">
      <div class="card-label">Title timeline</div>
      <ul class="title-history">${titleMoments}</ul>
    </section>
  `;
  els.snapshotLabel.textContent = snapshot.label;
  if (els.playbackHint) {
    if (!prev) els.playbackHint.textContent = 'First tracked appearance';
    else if (changes[0] === 'No visible change from prior appearance') els.playbackHint.textContent = 'This frame is steady';
    else els.playbackHint.textContent = changes.join(' · ');
  }
  els.snapshotSlider.max = String(state.data.snapshots.length - 1);
  els.snapshotSlider.value = String(state.snapshotIndex);
  renderFilmstrip(session);
}

function render() {
  renderList();
  renderViewer();
}

function applyFilters() {
  const query = state.query.trim().toLowerCase();
  let items = state.data.sessions.filter((session) => {
    if (state.changedOnly && sessionChurn(session) === 0) return false;
    if (!query) return true;
    return session.search.includes(query);
  });
  state.filtered = sortSessions(items);
  if (!state.filtered.some((session) => session.id === state.selectedId)) {
    state.selectedId = state.filtered[0]?.id || null;
  }
}

function startAutoplay() {
  stopAutoplay();
  state.timer = window.setInterval(() => {
    const session = currentSession();
    let nextIndex = (state.snapshotIndex + 1) % state.data.snapshots.length;
    if (session) {
      for (let hops = 0; hops < state.data.snapshots.length; hops += 1) {
        const candidate = (state.snapshotIndex + 1 + hops) % state.data.snapshots.length;
        const prev = session.timeline[Math.max(0, candidate - 1)] || previousEntry({ timeline: session.timeline.slice(0, candidate + 1) });
        const next = session.timeline[candidate] || null;
        const changed = diffSummary(prev, next)[0] !== 'No visible change from prior appearance';
        if (changed || hops === state.data.snapshots.length - 1) {
          nextIndex = candidate;
          break;
        }
      }
    }
    state.snapshotIndex = nextIndex;
    renderViewer();
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
    query: byId('query'),
    sort: byId('sort'),
    changedOnly: byId('changed-only'),
    sessionList: byId('session-list'),
    resultsCount: byId('results-count'),
    viewer: byId('viewer'),
    snapshotSlider: byId('snapshot-slider'),
    snapshotLabel: byId('snapshot-label'),
    playBtn: byId('play-btn'),
    filmstrip: byId('filmstrip'),
    playbackHint: byId('playback-hint'),
  });

  const response = await fetch(DATA_URL);
  state.data = await response.json();
  state.snapshotIndex = state.data.snapshots.length - 1;
  applyFilters();
  render();

  els.query.addEventListener('input', (event) => {
    state.query = event.target.value;
    applyFilters();
    render();
  });
  els.sort.addEventListener('change', (event) => {
    state.sort = event.target.value;
    applyFilters();
    render();
  });
  els.changedOnly.addEventListener('change', (event) => {
    state.changedOnly = event.target.checked;
    applyFilters();
    render();
  });
  els.snapshotSlider.addEventListener('input', (event) => {
    state.snapshotIndex = Number(event.target.value);
    renderViewer();
  });
  els.playBtn.addEventListener('click', () => {
    if (state.timer) stopAutoplay();
    else startAutoplay();
  });
}

init().catch((error) => {
  console.error(error);
  byId('viewer').innerHTML = `<div class="empty-state">Failed to load session history: ${esc(error.message)}</div>`;
});
