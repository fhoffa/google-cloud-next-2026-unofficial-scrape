const DEFAULT_SORT = 'time';
const VALID_SORTS = new Set([DEFAULT_SORT, 'title']);
const FAVORITES_STORAGE_KEY = 'next2026:favorites';

const TOPIC_GROUPS = [
  { label: 'Session type', items: ['Keynotes', 'Breakouts', 'Workshops', 'Lightning Talks', 'Birds of a Feather', 'Demos', 'Spotlights', 'Solution Talks', 'Discussion Groups', 'Lounge Sessions', 'Capture the Flag', 'Developer Meetups', 'Expo Experiences', 'Partner Summit Breakouts', 'Partner Summit Lightning Talks'] },
  { label: 'Technology', items: ['Agents', 'Applied AI', 'Gemini', 'Vertex AI', 'Open Models', 'App Dev', 'APIs', 'Firebase', 'Mobile and Web', 'Data Analytics', 'Databases', 'Compute', 'Serverless', 'Cloud Runtimes', 'Kubernetes', 'Networking', 'Storage', 'Security', 'DevOps', 'CI/CD', 'Observability', 'Multicloud', 'Migration', 'Cost Optimization', 'Architecture'] },
  { label: 'Audience', items: ['Application Developers', 'Data Analysts', 'Data Engineers', 'Data Scientists', 'Database Professionals', 'Platform Engineers', 'SREs', 'IT Ops', 'Infrastructure Architects & Admins', 'IT Managers & Business Leaders', 'Security Professionals', 'Executive', 'Small IT Teams'] },
  { label: 'Industry', items: ['Financial Services', 'Healthcare & Life Sciences', 'Retail', 'Manufacturing', 'Media & Entertainment', 'Government', 'Telecommunications', 'Education', 'Energy', 'Consumer & Packaged Goods', 'Supply Chain & Logistics', 'Games', 'Public Sector', 'Startup', 'Sustainability'] },
  { label: 'Level', items: ['Introductory', 'Technical', 'Advanced Technical', 'General'] },
];

export function readFiltersFromSearch(search) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  return {
    q: params.get('q') || '',
    speaker: params.get('speaker') || '',
    topic: params.get('topic') || '',
    day: params.get('day') || '',
    sort: VALID_SORTS.has(params.get('sort')) ? params.get('sort') : DEFAULT_SORT,
    start_after: params.get('start_after') || '',
    start_before: params.get('start_before') || '',
    sessionids: params.get('sessionids') || params.get('favorites') || '',
    company: params.get('company') || '',
    view: params.get('view') || '',
  };
}

export function buildSearchFromFilters(filters) {
  const params = new URLSearchParams();

  if (filters.q) params.set('q', filters.q);
  if (filters.speaker) params.set('speaker', filters.speaker);
  if (filters.topic) params.set('topic', filters.topic);
  if (filters.day) params.set('day', filters.day);
  if (filters.sort && filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort);
  if (filters.start_after) params.set('start_after', filters.start_after);
  if (filters.start_before) params.set('start_before', filters.start_before);
  if (filters.company) params.set('company', filters.company);
  if (filters.view === 'favorites') params.set('view', 'favorites');
  if (filters.sessionids) params.set('sessionids', filters.sessionids);

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function filterSessions(sessions, filters) {
  const favoriteIds = new Set(String(filters.sessionids || '').split(',').map((v) => v.trim()).filter(Boolean));
  const q = filters.q.trim().toLowerCase();
  const speaker = filters.speaker.trim().toLowerCase();
  const company = (filters.company || '').trim().toLowerCase();
  const topic = filters.topic;
  const day = filters.day;
  const startAfter = filters.start_after || '';
  const startBefore = filters.start_before || '';

  return sessions.filter((session) => {
    if (filters.view === 'favorites' && !favoriteIds.has(String(session.id || session.url || ''))) return false;
    if (day && session.date_text !== day) return false;
    if (topic && !(session.topics || []).includes(topic)) return false;
    const startTime = session.start_time_text || '';
    if (startAfter && (!startTime || startTime < startAfter)) return false;
    if (startBefore && (!startTime || startTime > startBefore)) return false;
    if (company) {
      const foundCompany = (session.speakers || []).some((item) => ((item.company || '').toLowerCase().includes(company)));
      if (!foundCompany) return false;
    }
    if (speaker) {
      const foundSpeaker = (session.speakers || []).some((item) => {
        const name = (item.name || '').toLowerCase();
        const company = (item.company || '').toLowerCase();
        return name.includes(speaker) || company.includes(speaker);
      });
      if (!foundSpeaker) return false;
    }
    if (q) {
      const haystack = [
        session.title,
        session.description,
        session.room || '',
        ...(session.topics || []),
        ...(session.speakers || []).flatMap((item) => [item.name || '', item.company || '']),
      ].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
    }
    return true;
  });
}

export function sortSessions(sessions, sort) {
  const items = [...sessions];

  if (sort === 'title') {
    items.sort((a, b) => a.title.localeCompare(b.title));
    return items;
  }

  items.sort((a, b) => {
    const left = a.start_at || a.date_text || '';
    const right = b.start_at || b.date_text || '';
    const leftMissing = left === '';
    const rightMissing = right === '';
    if (leftMissing && !rightMissing) return 1;
    if (!leftMissing && rightMissing) return -1;
    return left.localeCompare(right);
  });
  return items;
}

function escHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlight(text, term) {
  if (!term) return escHtml(text);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escHtml(text).replace(new RegExp(`(${escaped})`, 'gi'), '<mark style="background:#fff3cd;border-radius:2px">$1</mark>');
}

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .map((part) => part[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function avatarColor(name) {
  const colors = ['#1a73e8', '#34a853', '#ea4335', '#fbbc04', '#9c27b0', '#ff5722', '#00bcd4', '#607d8b'];
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) & 0xffffffff;
  }
  return colors[Math.abs(hash) % colors.length];
}

function renderCards(sessions, q, favoriteIds, expandedIds) {
  return sessions.map((session) => {
    const sessionId = String(session.id || session.url || '');
    const isFavorite = favoriteIds.has(sessionId);
    const isExpanded = expandedIds.has(sessionId);
    const speakers = (session.speakers || []).map((speaker) => `
      <span class="speaker-chip">
        <span class="speaker-avatar" style="background:${avatarColor(speaker.name || '')}">${escHtml(initials(speaker.name || ''))}</span>
        <button class="speaker-link" type="button" data-speaker-name="${escHtml(speaker.name || '')}">${escHtml(speaker.name || '')}</button>${speaker.company ? ` <span style="opacity:.65;font-size:.72rem">· </span><button class="company-link" type="button" data-company-name="${escHtml(speaker.company)}">${escHtml(speaker.company)}</button>` : ''}
      </span>
    `).join('');

    const topics = (session.topics || []).slice(0, 5).map((topic) => `
      <span class="topic-tag">${escHtml(topic)}</span>
    `).join('');

    const timeStr = session.start_time_text && session.end_time_text
      ? `${session.start_time_text}-${session.end_time_text}`
      : (session.start_time_text || '');

    const dateShort = session.date_text
      ? session.date_text.replace(', 2026', '').replace('day,', '')
      : '';

    return `<div class="card" data-session-id="${escHtml(sessionId)}">
      <div class="card-title" style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <span>${session.url
        ? `<a href="${escHtml(session.url)}" target="_blank" rel="noopener">${highlight(session.title, q)} <span aria-hidden="true" title="Opens in a new tab">↗</span></a>`
        : highlight(session.title, q)
      }</span><button class="favorite-btn" type="button" data-session-id="${escHtml(sessionId)}" aria-pressed="${isFavorite ? 'true' : 'false'}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">${isFavorite ? '★' : '☆'}</button></div>
      <div class="card-meta">
        ${dateShort ? `<span class="meta-icon">${escHtml(dateShort)}</span>` : ''}
        ${timeStr ? `<span class="dot meta-icon">${escHtml(timeStr)}</span>` : ''}
        ${session.room ? `<span class="dot meta-icon">${escHtml(session.room)}</span>` : ''}
      </div>
      ${session.description ? `<div class="card-desc${isExpanded ? ' expanded' : ''}">${highlight(session.description, q)}</div>${session.description.length > 220 ? ` <button class="see-more-btn" type="button" data-session-id="${escHtml(sessionId)}">${isExpanded ? 'See less' : 'See more'}</button>` : ''}` : ''}
      ${speakers ? `<div class="card-speakers">${speakers}</div>` : ''}
      ${topics ? `<div class="card-topics">${topics}</div>` : ''}
    </div>`;
  }).join('');
}

function applyDaySelection(dayPills, day) {
  dayPills.forEach((pill) => {
    if (pill.dataset.day === day) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });
}

function populateTopicFilter(topicSelect, sessions) {
  const doc = topicSelect.ownerDocument || globalThis.document;
  const allTopics = [...new Set(sessions.flatMap((session) => session.topics || []))].sort();
  const categorized = new Set(TOPIC_GROUPS.flatMap((group) => group.items));

  for (const group of TOPIC_GROUPS) {
    const available = group.items.filter((topic) => allTopics.includes(topic));
    if (!available.length) continue;
    const optgroup = doc.createElement('optgroup');
    optgroup.label = group.label;
    for (const topic of available) {
      const option = doc.createElement('option');
      option.value = topic;
      option.textContent = topic;
      optgroup.appendChild(option);
    }
    topicSelect.appendChild(optgroup);
  }

  const otherTopics = allTopics.filter((topic) => !categorized.has(topic));
  if (!otherTopics.length) return;

  const optgroup = doc.createElement('optgroup');
  optgroup.label = 'Other';
  for (const topic of otherTopics) {
    const option = doc.createElement('option');
    option.value = topic;
    option.textContent = topic;
    optgroup.appendChild(option);
  }
  topicSelect.appendChild(optgroup);
}

export async function initSessionSearch({
  document = globalThis.document,
  fetchImpl = globalThis.fetch,
  location = globalThis.location,
  history = globalThis.history,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
  dataUrl = 'sessions/latest.json',
  storage = globalThis.localStorage,
} = {}) {
  const app = document.getElementById('app');
  const qInput = document.getElementById('q');
  const speakerInput = document.getElementById('speaker');
  const topicSelect = document.getElementById('topic-filter');
  const sortSelect = document.getElementById('sort-filter');
  const startAfterInput = document.getElementById('start-after');
  const startBeforeInput = document.getElementById('start-before');
  const resultCount = document.getElementById('result-count');
  const headerCount = document.getElementById('header-count');
  const clearBtn = document.getElementById('clear-btn');
  const favoriteToggle = document.getElementById('favorites-only');
  const copyFavoritesBtn = document.getElementById('copy-favorites-link');
  const dayPills = [...document.querySelectorAll('.pill[data-day]')];

  const state = readFiltersFromSearch(location.search);
  const storedFavorites = new Set((() => { try { return JSON.parse(storage?.getItem(FAVORITES_STORAGE_KEY) || '[]'); } catch { return []; } })().map(String));
  const sharedFavorites = String(state.sessionids || '').split(',').map((v) => v.trim()).filter(Boolean);
  const favoriteIds = new Set(sharedFavorites.length ? sharedFavorites : [...storedFavorites]);
  qInput.value = state.q;
  speakerInput.value = state.speaker;
  sortSelect.value = state.sort;
  if (startAfterInput) startAfterInput.value = state.start_after;
  if (startBeforeInput) startBeforeInput.value = state.start_before;
  if (favoriteToggle) favoriteToggle.checked = state.view === 'favorites';
  applyDaySelection(dayPills, state.day);

  let sessions = [];
  let debounceId;
  const expandedIds = new Set();

  function currentFilters() {
    return {
      q: qInput.value.trim(),
      speaker: speakerInput.value.trim(),
      topic: topicSelect.value,
      day: dayPills.find((pill) => pill.classList.contains('active'))?.dataset.day || '',
      sort: VALID_SORTS.has(sortSelect.value) ? sortSelect.value : DEFAULT_SORT,
      start_after: startAfterInput?.value || '',
      start_before: startBeforeInput?.value || '',
      view: favoriteToggle?.checked ? 'favorites' : '',
      sessionids: [...favoriteIds].join(','),
      company: '',
    };
  }

  function syncUrl() {
    const nextSearch = buildSearchFromFilters(currentFilters());
    const nextUrl = new URL(location.href);
    nextUrl.search = nextSearch;
    history.replaceState(null, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }

  function render() {
    const filters = currentFilters();
    const filtered = sortSessions(filterSessions(sessions, filters), filters.sort);

    syncUrl();
    resultCount.textContent = `${filtered.length.toLocaleString()} of ${sessions.length.toLocaleString()} sessions`;

    if (!filtered.length) {
      app.innerHTML = `<div class="no-results">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <p>No sessions match your filters.</p>
      </div>`;
      return filtered;
    }

    app.innerHTML = `<div class="grid">${renderCards(filtered, filters.q.toLowerCase(), favoriteIds, expandedIds)}</div>`;
    for (const button of app.querySelectorAll ? app.querySelectorAll('.favorite-btn') : []) {
      button.addEventListener('click', () => {
        const id = button.dataset.sessionId;
        if (favoriteIds.has(id)) favoriteIds.delete(id); else favoriteIds.add(id);
        try { storage?.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favoriteIds])); } catch {}
        render();
      });
    }
    for (const button of app.querySelectorAll ? app.querySelectorAll('.speaker-link') : []) {
      button.addEventListener('click', () => {
        qInput.value = '';
        speakerInput.value = button.dataset.speakerName || '';
        topicSelect.value = '';
        sortSelect.value = DEFAULT_SORT;
        if (startAfterInput) startAfterInput.value = '';
        if (startBeforeInput) startBeforeInput.value = '';
        if (favoriteToggle) favoriteToggle.checked = false;
        applyDaySelection(dayPills, '');
        render();
      });
    }
    for (const button of app.querySelectorAll ? app.querySelectorAll('.company-link') : []) {
      button.addEventListener('click', () => {
        qInput.value = '';
        speakerInput.value = '';
        topicSelect.value = '';
        sortSelect.value = DEFAULT_SORT;
        if (startAfterInput) startAfterInput.value = '';
        if (startBeforeInput) startBeforeInput.value = '';
        if (favoriteToggle) favoriteToggle.checked = false;
        applyDaySelection(dayPills, '');
        history.replaceState(null, '', buildSearchFromFilters({
          q: '',
          speaker: '',
          topic: '',
          day: '',
          sort: DEFAULT_SORT,
          start_after: '',
          start_before: '',
          view: '',
          sessionids: [...favoriteIds].join(','),
          company: button.dataset.companyName || '',
        }));
        render();
      });
    }
    for (const button of app.querySelectorAll ? app.querySelectorAll('.see-more-btn') : []) {
      button.addEventListener('click', () => {
        const id = button.dataset.sessionId;
        if (expandedIds.has(id)) expandedIds.delete(id); else expandedIds.add(id);
        render();
      });
    }
    return filtered;
  }

  try {
    const response = await fetchImpl(dataUrl);
    const data = await response.json();
    sessions = data.sessions || [];
    headerCount.textContent = sessions.length.toLocaleString();
    populateTopicFilter(topicSelect, sessions);
    if (state.topic) topicSelect.value = state.topic;
    render();
  } catch (error) {
    app.innerHTML = '<div class="no-results"><p>Failed to load sessions. Run a local server to preview.</p></div>';
    return { render };
  }

  dayPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      applyDaySelection(dayPills, pill.dataset.day || '');
      render();
    });
  });

  [qInput, speakerInput].forEach((input) => {
    input.addEventListener('input', () => {
      clearTimeoutImpl(debounceId);
      debounceId = setTimeoutImpl(() => {
        render();
      }, 120);
    });
  });

  topicSelect.addEventListener('change', () => {
    render();
  });

  sortSelect.addEventListener('change', () => {
    render();
  });

  [startAfterInput, startBeforeInput].filter(Boolean).forEach((input) => {
    input.addEventListener('input', () => {
      render();
    });
  });

  favoriteToggle?.addEventListener('change', () => {
    render();
  });

  copyFavoritesBtn?.addEventListener('click', async () => {
    const url = new URL(location.href);
    url.search = buildSearchFromFilters({ ...currentFilters(), view: 'favorites', sessionids: [...favoriteIds].join(',') });
    try {
      await globalThis.navigator?.clipboard?.writeText(url.toString());
      copyFavoritesBtn.textContent = 'Copied';
    } catch {}
  });

  clearBtn.addEventListener('click', () => {
    qInput.value = '';
    speakerInput.value = '';
    topicSelect.value = '';
    sortSelect.value = DEFAULT_SORT;
    applyDaySelection(dayPills, '');
    if (favoriteToggle) favoriteToggle.checked = false;
    if (startAfterInput) startAfterInput.value = '';
    if (startBeforeInput) startBeforeInput.value = '';
    render();
  });

  return { render };
}
