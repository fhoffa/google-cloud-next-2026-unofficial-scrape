import { canonicalCompanyName, companyMatchesFilter } from '../lib/company-identity.mjs';
import { availabilityBand, mergeAvailabilityIntoSessions, normalizeNumber } from '../lib/session-availability-core.mjs';
import { collectWordStatItems } from '../lib/word-stats.mjs';

const DEFAULT_SORT = 'time';
const VALID_SORTS = new Set([DEFAULT_SORT, 'title']);
const CHANGELOG_SUMMARY_URL = 'media/changelog-summary.json';
const FAVORITES_STORAGE_KEY = 'next2026:favorites';
const DEFAULT_VIEW = 'sessions';
const VALID_VIEWS = new Set([DEFAULT_VIEW, 'speakers', 'companies', 'words']);
const MAX_NEW_PRIORITY = 6;
function sessionKey(session) {
  const explicitId = String(session?.id || '').trim();
  const explicitMatch = explicitId.match(/\/session\/(\d+)(?:\/|$)/) || explicitId.match(/^(\d+)$/);
  if (explicitMatch) return explicitMatch[1];
  const url = String(session?.url || '').trim();
  const match = url.match(/\/session\/(\d+)(?:\/|$)/);
  if (match) return match[1];
  return explicitId || url;
}

const TIME_STEP_MINUTES = 15;
const MAX_TIME_INDEX = 95;
const MIN_TIME_INDEX = 0;

function timeIndexToLabel(index) {
  const totalMinutes = Number(index) * TIME_STEP_MINUTES;
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = ((hours24 + 11) % 12) + 1;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function timeIndexToValue(index) {
  const totalMinutes = Number(index) * TIME_STEP_MINUTES;
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function timeTextToIndex(value, fallback) {
  const text = String(value || '').trim();
  if (!text) return fallback;
  const match = text.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return fallback;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = (match[3] || '').toUpperCase();
  if (suffix) {
    if (hours === 12) hours = 0;
    if (suffix === 'PM') hours += 12;
  }
  return Math.max(MIN_TIME_INDEX, Math.min(MAX_TIME_INDEX, Math.round(((hours * 60) + minutes) / TIME_STEP_MINUTES)));
}

function parseTimeToIndex(value, { rounding = 'nearest' } = {}) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const rawIndex = ((hours * 60) + minutes) / TIME_STEP_MINUTES;
  if (rounding === 'floor') return Math.floor(rawIndex);
  if (rounding === 'ceil') return Math.ceil(rawIndex);
  return Math.round(rawIndex);
}

function deriveTimeBounds(sessions) {
  let minIndex = MAX_TIME_INDEX;
  let maxIndex = MIN_TIME_INDEX;
  let foundAny = false;
  for (const session of sessions) {
    const startIndex = parseTimeToIndex(session.start_at?.slice(11, 16) || '', { rounding: 'floor' });
    if (startIndex !== null) {
      foundAny = true;
      minIndex = Math.min(minIndex, startIndex);
      maxIndex = Math.max(maxIndex, startIndex);
    }
    const endIndex = parseTimeToIndex(session.end_at?.slice(11, 16) || '', { rounding: 'ceil' });
    if (endIndex !== null) {
      foundAny = true;
      maxIndex = Math.max(maxIndex, endIndex);
    }
  }
  if (!foundAny) return { min: MIN_TIME_INDEX, max: MAX_TIME_INDEX };
  return {
    min: Math.max(MIN_TIME_INDEX, Math.min(MAX_TIME_INDEX, minIndex)),
    max: Math.max(MIN_TIME_INDEX, Math.min(MAX_TIME_INDEX, maxIndex)),
  };
}

function renderFilterPills(filters) {
  const pills = [];
  if (filters.q) pills.push({ key: 'q', label: `search: ${filters.q}` });
  if (filters.exclude) pills.push({ key: 'exclude', label: `exclude: ${filters.exclude}` });
  if (filters.speaker) pills.push({ key: 'speaker', label: `speaker: ${filters.speaker}` });
  if (filters.company) pills.push({ key: 'company', label: `company: ${filters.company}` });
  if (filters.topic) pills.push({ key: 'topic', label: `topic: ${filters.topic}` });
  if (filters.day) pills.push({ key: 'day', label: filters.day.replace(', 2026', '') });
  if (filters.start_after || filters.start_before) pills.push({ key: 'time', label: `time: ${filters.start_after || 'start'} – ${filters.start_before || 'end'}` });
  if (filters.view === 'favorites') pills.push({ key: 'favorites', label: 'favorites' });
  if (filters.sessionids && filters.view !== 'favorites') pills.push({ key: 'sessionids', label: 'selected session' });
  if (filters.ai_focus) pills.push({ key: 'ai_focus', label: `AI focus: ${filters.ai_focus}` });
  if (filters.theme) pills.push({ key: 'theme', label: `theme: ${filters.theme}` });
  if (filters.audience) pills.push({ key: 'audience', label: `audience: ${filters.audience}` });
  if (filters.availability) pills.push({ key: 'availability', label: `availability: ${filters.availability}` });
  return pills.map((pill) => `<button class="filter-pill" type="button" data-clear-filter="${pill.key}">${escHtml(pill.label)} ×</button>`).join('');
}

function splitFilterTerms(value) {
  return String(value || '').match(/"[^"]+"|'[^']+'|\S+/g)?.map((part) => part.replace(/^['"]|['"]$/g, '').trim().toLowerCase()).filter(Boolean) || [];
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesFilterTerm(haystack, term) {
  if (!term) return false;
  if (/\s/.test(term)) return haystack.includes(term);
  return new RegExp(`\\b${escapeRegExp(term)}\\b`).test(haystack);
}

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
    exclude: params.get('exclude') || '',
    speaker: params.get('speaker') || '',
    topic: params.get('topic') || '',
    day: params.get('day') || '',
    sort: VALID_SORTS.has(params.get('sort')) ? params.get('sort') : DEFAULT_SORT,
    start_after: params.get('start_after') || '',
    start_before: params.get('start_before') || '',
    sessionids: params.get('sessionids') || params.get('favorites') || '',
    company: params.get('company') || '',
    ai_focus: params.get('ai_focus') || '',
    theme: params.get('theme') || '',
    audience: params.get('audience') || '',
    availability: params.get('availability') || '',
    view: VALID_VIEWS.has(params.get('view')) ? params.get('view') : (params.get('view') === 'favorites' ? 'favorites' : DEFAULT_VIEW),
  };
}

export function buildSearchFromFilters(filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.exclude) params.set('exclude', filters.exclude);
  if (filters.speaker) params.set('speaker', filters.speaker);
  if (filters.topic) params.set('topic', filters.topic);
  if (filters.day) params.set('day', filters.day);
  if (filters.sort && filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort);
  if (filters.start_after) params.set('start_after', filters.start_after);
  if (filters.start_before) params.set('start_before', filters.start_before);
  if (filters.company) params.set('company', filters.company);
  if (filters.ai_focus) params.set('ai_focus', filters.ai_focus);
  if (filters.theme) params.set('theme', filters.theme);
  if (filters.audience) params.set('audience', filters.audience);
  if (filters.availability) params.set('availability', filters.availability);
  if (filters.view && filters.view !== DEFAULT_VIEW) params.set('view', filters.view);
  if (filters.sessionids) params.set('sessionids', filters.sessionids);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function filterSessions(sessions, filters) {
  const favoriteIds = new Set(String(filters.sessionids || '').split(',').map((v) => v.trim()).filter(Boolean));
  const q = filters.q.trim().toLowerCase();
  const exclude = filters.exclude.trim().toLowerCase();
  const speaker = filters.speaker.trim().toLowerCase();
  const company = (filters.company || '').trim().toLowerCase();
  const aiFocus = String(filters.ai_focus || '').trim();
  const theme = String(filters.theme || '').trim();
  const audience = String(filters.audience || '').trim();
  const availability = String(filters.availability || '').trim();
  const topic = filters.topic;
  const day = filters.day;
  const startAfter = filters.start_after || '';
  const startBefore = filters.start_before || '';

  return sessions.filter((session) => {
    if (favoriteIds.size && !favoriteIds.has(sessionKey(session))) return false;
    if (filters.view === 'favorites' && !favoriteIds.size) return false;
    if (day && session.date_text !== day) return false;
    if (topic && !(session.topics || []).includes(topic)) return false;
    const startTime = session.start_at ? session.start_at.slice(11, 16) : '';
    if (startAfter && (!startTime || startTime < startAfter)) return false;
    if (startBefore && (!startTime || startTime > startBefore)) return false;
    if (company) {
      const foundCompany = (session.speakers || []).some((item) => companyMatchesFilter(item.company || '', company));
      if (!foundCompany) return false;
    }
    const llm = session.llm || {};
    if (aiFocus && llm.ai_focus !== aiFocus) return false;
    if (theme && llm.theme !== theme) return false;
    if (audience && llm.audience !== audience) return false;
    const band = availabilityBand(session);
    if (availability === 'full' && band !== 'full') return false;
    if (availability === 'not-full' && band !== 'not-full') return false;
    if (speaker) {
      const foundSpeaker = (session.speakers || []).some((item) => {
        const name = (item.name || '').toLowerCase();
        const maybeCompany = (item.company || '').toLowerCase();
        return name.includes(speaker) || maybeCompany.includes(speaker);
      });
      if (!foundSpeaker) return false;
    }
    const haystack = [session.title, session.description, session.room || '', ...(session.topics || []), ...(session.speakers || []).flatMap((item) => [item.name || '', item.company || ''])].join(' ').toLowerCase();
    if (q) {
      if (!splitFilterTerms(q).every((term) => matchesFilterTerm(haystack, term))) return false;
    }
    if (exclude) {
      if (splitFilterTerms(exclude).some((term) => matchesFilterTerm(haystack, term))) return false;
    }
    return true;
  });
}

export function sortSessions(sessions, sort, { prioritizedNewSessionIds = new Set(), prioritizeNew = false } = {}) {
  const items = [...sessions];
  if (sort === 'title') {
    items.sort((a, b) => a.title.localeCompare(b.title));
    return items;
  }
  items.sort((a, b) => {
    if (prioritizeNew) {
      const leftNew = prioritizedNewSessionIds.has(sessionKey(a));
      const rightNew = prioritizedNewSessionIds.has(sessionKey(b));
      if (leftNew && !rightNew) return -1;
      if (!leftNew && rightNew) return 1;
    }
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

function latestNewSessionIds(changelogSummary) {
  const ids = new Set();
  const latestUpdate = changelogSummary?.updates?.[0];
  for (const item of latestUpdate?.added || []) {
    const id = sessionKey({ id: item?.id || '', url: item?.url || '' });
    if (id) ids.add(id);
  }
  return ids;
}

function shouldPrioritizeNew(filters, timeBounds) {
  return !filters.q
    && !filters.exclude
    && !filters.speaker
    && !filters.topic
    && !filters.day
    && !filters.company
    && !filters.ai_focus
    && !filters.theme
    && !filters.audience
    && !filters.availability
    && !filters.sessionids
    && filters.view === DEFAULT_VIEW
    && filters.sort === DEFAULT_SORT
    && !filters.start_after
    && !filters.start_before;
}

function prioritizedNewSessions(sessions, newSessionIds) {
  return sessions
    .filter((session) => newSessionIds.has(sessionKey(session)) && availabilityBand(session) === 'not-full')
    .sort((a, b) => {
      const left = a.start_at || a.date_text || '';
      const right = b.start_at || b.date_text || '';
      return left.localeCompare(right);
    })
    .slice(0, MAX_NEW_PRIORITY);
}

function escHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function highlight(text, term) {
  if (!term) return escHtml(text);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escHtml(text).replace(new RegExp(`(${escaped})`, 'gi'), '<mark style="background:#fff3cd;border-radius:2px">$1</mark>');
}

function initials(name) {
  return String(name || '').split(/\s+/).map((part) => part[0] || '').join('').slice(0, 2).toUpperCase();
}

function avatarColor(name) {
  const colors = ['#1a73e8', '#34a853', '#ea4335', '#fbbc04', '#9c27b0', '#ff5722', '#00bcd4', '#607d8b'];
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function companyStats(sessions) {
  const byCompany = new Map();
  for (const session of sessions) {
    const seen = new Set();
    for (const speaker of (session.speakers || [])) {
      const company = canonicalCompanyName(speaker.company);
      if (!company || seen.has(company)) continue;
      seen.add(company);
      if (!byCompany.has(company)) byCompany.set(company, { company, count: 0, sessions: [] });
      const entry = byCompany.get(company);
      entry.count += 1;
      entry.sessions.push({ title: session.title, url: session.url || '', id: sessionKey(session) });
    }
  }
  return [...byCompany.values()].filter((item) => item.count > 1).sort((a, b) => b.count - a.count || a.company.localeCompare(b.company));
}

function speakerStats(sessions) {
  const bySpeaker = new Map();
  for (const session of sessions) {
    for (const speaker of (session.speakers || [])) {
      const name = String(speaker.name || '').trim();
      if (!name) continue;
      if (!bySpeaker.has(name)) bySpeaker.set(name, { name, company: speaker.company || '', count: 0, sessions: [] });
      const entry = bySpeaker.get(name);
      entry.count += 1;
      entry.sessions.push({ title: session.title, url: session.url || '', id: sessionKey(session) });
      if (!entry.company && speaker.company) entry.company = canonicalCompanyName(speaker.company);
    }
  }
  return [...bySpeaker.values()].filter((item) => item.count > 1).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function wordStats(sessions) {
  return collectWordStatItems(sessions, { limit: 96, getSessionId: (session) => sessionKey(session) || session.url || session.title });
}

function renderTabs(activeView) {
  const tabs = [
    { id: 'sessions', label: 'Sessions' },
    { id: 'speakers', label: 'Top speakers' },
    { id: 'companies', label: 'Top companies' },
    { id: 'words', label: 'Top words' },
  ];
  return `<div class="tabs" role="tablist" aria-label="Views">${tabs.map((tab) => `<button class="tab-btn${tab.id === activeView ? ' active' : ''}" type="button" data-view="${tab.id}" role="tab" aria-selected="${tab.id === activeView ? 'true' : 'false'}">${tab.label}</button>`).join('')}</div>`;
}

function renderRelatedSessions(sessionId, relatedItems, visible) {
  if (!Array.isArray(relatedItems) || !relatedItems.length) return '';
  return `<div class="related-sessions"><div class="related-sessions-label">Related sessions</div><div class="related-sessions-list">${relatedItems.map((item) => `<button class="related-session-link" type="button" data-related-session-id="${escHtml(item.sessionId || '')}" title="Show ${escHtml(item.title || '')}">${escHtml(item.title || '')}</button>`).join('')}</div></div>`;
}

function seatFillData(session) {
  const capacity = normalizeNumber(session?.capacity);
  const registrants = normalizeNumber(session?.registrant_count);
  if (capacity == null || registrants == null || capacity <= 0) return null;
  const rawPct = (registrants / capacity) * 100;
  const pct = Math.max(0, Math.min(100, rawPct));
  return {
    capacity,
    registrants,
    pct,
    isOverbooked: registrants > capacity,
  };
}

function renderSeatFill(session) {
  const fill = seatFillData(session);
  if (!fill) return '';
  const label = `${fill.registrants.toLocaleString()} / ${fill.capacity.toLocaleString()} seats`;
  const pctLabel = `${Math.round(fill.pct)}% full`;
  return `<div class="seat-fill" aria-label="${escHtml(label)}, ${escHtml(pctLabel)}"><div class="seat-fill-row"><span class="seat-fill-label">${escHtml(label)}</span><span class="seat-fill-value">${escHtml(pctLabel)}${fill.isOverbooked ? ' +' : ''}</span></div><div class="seat-fill-bar" aria-hidden="true"><div class="seat-fill-bar-fill${fill.isOverbooked ? ' overbooked' : ''}" style="width:${fill.pct.toFixed(1)}%"></div></div></div>`;
}

function renderCards(sessions, q, favoriteIds, expandedIds, relatedLookup = {}, visibleRelatedIds = new Set(), selectedSessionIds = new Set(), prioritizedNewSessionIds = new Set()) {
  return sessions.map((session) => {
    const sessionId = sessionKey(session);
    const isFavorite = favoriteIds.has(sessionId);
    const isExpanded = expandedIds.has(sessionId);
    const relatedItems = relatedLookup?.[sessionId]?.related || [];
    const relatedVisible = true;
    const speakers = (session.speakers || []).map((speaker) => `
      <span class="speaker-chip">
        <span class="speaker-avatar" style="background:${avatarColor(speaker.name || '')}">${escHtml(initials(speaker.name || ''))}</span>
        <button class="speaker-link" type="button" data-speaker-name="${escHtml(speaker.name || '')}">${escHtml(speaker.name || '')}</button>${speaker.company ? ` <span style="opacity:.65;font-size:.72rem">· </span><button class="company-link" type="button" data-company-name="${escHtml(speaker.company)}">${escHtml(speaker.company)}</button>` : ''}
      </span>
    `).join('');
    const topics = (session.topics || []).slice(0, 5).map((topic) => `<button class="topic-tag topic-link" type="button" data-topic-name="${escHtml(topic)}">${escHtml(topic)}</button>`).join('');
    const timeStr = session.start_time_text && session.end_time_text ? `${session.start_time_text}-${session.end_time_text}` : (session.start_time_text || '');
    const dateShort = session.date_text ? session.date_text.replace(', 2026', '').replace('day,', '') : '';
    const isNew = prioritizedNewSessionIds.has(sessionId);
    const statusBadge = `${isNew ? '<span class="status-badge new">*new</span>' : ''}${availabilityBand(session) === 'full' ? '<span class="status-badge full">Full</span>' : ''}`;
    return `<div class="card" id="session-${escHtml(sessionId)}" data-session-id="${escHtml(sessionId)}">
      <div class="card-title" style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <span>${session.url ? `<a href="${escHtml(session.url)}" target="_blank" rel="noopener">${highlight(session.title, q)} <span aria-hidden="true" title="Opens in a new tab">↗</span></a>` : highlight(session.title, q)}</span><button class="favorite-btn" type="button" data-session-id="${escHtml(sessionId)}" aria-pressed="${isFavorite ? 'true' : 'false'}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">${isFavorite ? '★' : '☆'}</button></div>
      <div class="card-meta">
        ${statusBadge}
        ${dateShort ? `<span class="meta-icon">${escHtml(dateShort)}</span>` : ''}
        ${timeStr ? `<span class="dot meta-icon">${escHtml(timeStr)}</span>` : ''}
        ${session.room ? `<span class="dot meta-icon">${escHtml(session.room)}</span>` : ''}
      </div>
      ${renderSeatFill(session)}
      ${session.description ? `<div class="card-desc${isExpanded ? ' expanded' : ''}">${highlight(session.description, q)}</div>${session.description.length > 220 ? ` <button class="see-more-btn" type="button" data-session-id="${escHtml(sessionId)}">${isExpanded ? 'See less' : 'See more'}</button>` : ''}` : ''}
      ${speakers ? `<div class="card-speakers">${speakers}</div>` : ''}
      ${topics ? `<div class="card-topics">${topics}</div>` : ''}
      ${renderRelatedSessions(sessionId, relatedItems, relatedVisible)}
      ${session.url ? `<div class="reserve-seat-note">Note: the \u201cReserve a Seat\u201d button is broken on individual session pages. To reserve, search for this session by name in the <a href="https://www.googlecloudevents.com/next-vegas/session-library" target="_blank" rel="noopener">Session Library</a> instead.</div>` : ''}
    </div>`;
  }).join('');
}

function renderSpeakersView(sessions) {
  const speakers = speakerStats(sessions);
  return `<div class="grid">${speakers.map((speaker) => `<div class="card speaker-summary-card"><div class="card-title"><button class="speaker-summary-link" type="button" data-speaker-name="${escHtml(speaker.name)}">${escHtml(speaker.name)}</button></div><div class="card-meta">${speaker.company ? `<span class="meta-icon">${escHtml(speaker.company)}</span>` : ''}<span class="dot meta-icon">${speaker.count} sessions</span></div><div class="card-desc expanded">${speaker.sessions.slice(0, 6).map((session) => `• ${session.url ? `<a class="speaker-session-link" href="${escHtml(session.url)}" target="_blank" rel="noopener">${escHtml(session.title)} ↗</a>` : escHtml(session.title)}`).join('<br>')}</div></div>`).join('')}</div>`;
}

function renderCompaniesView(sessions) {
  const companies = companyStats(sessions);
  return `<div class="grid">${companies.map((item) => `<div class="card company-summary-card"><div class="card-title"><button class="company-summary-link" type="button" data-company-name="${escHtml(item.company)}">${escHtml(item.company)}</button></div><div class="card-meta"><span class="meta-icon">${item.count} sessions</span></div><div class="card-desc expanded">${item.sessions.slice(0, 6).map((session) => `• ${session.url ? `<a class="company-session-link" href="${escHtml(session.url)}" target="_blank" rel="noopener">${escHtml(session.title)} ↗</a>` : escHtml(session.title)}`).join('<br>')}</div></div>`).join('')}</div>`;
}

function renderWordsView(sessions) {
  const words = wordStats(sessions);
  return `<div class="word-cloud">${words.map((item) => `<button class="word-chip word-link word-size-${Math.min(5, Math.max(1, Math.ceil(item.count / 3)))}" type="button" data-word="${escHtml(item.word)}" title="${escHtml(`${item.count} mentions across ${item.sessionCount} sessions`)}">${escHtml(item.label)} <small>${item.count} / ${item.sessionCount}</small></button>`).join('')}</div>`;
}

function applyDaySelection(dayPills, day) {
  dayPills.forEach((pill) => { if (pill.dataset.day === day) pill.classList.add('active'); else pill.classList.remove('active'); });
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

export async function initSessionSearch({ document = globalThis.document, fetchImpl = globalThis.fetch, location = globalThis.location, history = globalThis.history, setTimeoutImpl = globalThis.setTimeout, clearTimeoutImpl = globalThis.clearTimeout, dataUrl = 'sessions/latest.json', availabilityUrl = 'media/session-availability.json', relatedSessionsUrl = '', changelogSummaryUrl = CHANGELOG_SUMMARY_URL, storage = globalThis.localStorage } = {}) {
  const app = document.getElementById('app');
  const qInput = document.getElementById('q');
  const speakerInput = document.getElementById('speaker');
  const topicSelect = document.getElementById('topic-filter');
  const availabilitySelect = document.getElementById('availability-filter');
  const activeFilters = document.getElementById('active-filters');
  const timeRangeStart = document.getElementById('time-range-start');
  const timeRangeEnd = document.getElementById('time-range-end');
  const timeRangeLabel = document.getElementById('time-range-label');
  const timeRangeFill = document.getElementById('time-range-fill');
  const excludeInput = document.getElementById('exclude');
  const excludeClearBtn = document.getElementById('exclude-clear');
  const qClearBtn = document.getElementById('q-clear');
  const speakerClearBtn = document.getElementById('speaker-clear');
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
  let companyFilter = state.company || '';
  const classificationFilters = { ai_focus: state.ai_focus || '', theme: state.theme || '', audience: state.audience || '' };
  const storedFavorites = new Set((() => { try { return JSON.parse(storage?.getItem(FAVORITES_STORAGE_KEY) || '[]'); } catch { return []; } })().map((value) => sessionKey({ id: value, url: value })));
  const incomingSessionIds = String(state.sessionids || '').split(',').map((v) => sessionKey({ id: v.trim(), url: v.trim() })).filter(Boolean);
  const sharedFavorites = state.view === 'favorites' ? incomingSessionIds : [];
  const favoriteIds = new Set(sharedFavorites.length ? sharedFavorites : [...storedFavorites]);
  try { storage?.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...storedFavorites])); } catch {}
  qInput.value = state.q;
  if (excludeInput) excludeInput.value = state.exclude;
  speakerInput.value = state.speaker;
  sortSelect.value = state.sort;
  if (availabilitySelect) availabilitySelect.value = state.availability || '';
  if (startAfterInput) startAfterInput.value = state.start_after;
  if (startBeforeInput) startBeforeInput.value = state.start_before;
  if (timeRangeStart) timeRangeStart.value = String(timeTextToIndex(state.start_after, 0));
  if (timeRangeEnd) timeRangeEnd.value = String(timeTextToIndex(state.start_before, MAX_TIME_INDEX));
  if (favoriteToggle) favoriteToggle.checked = state.view === 'favorites';
  applyDaySelection(dayPills, state.day);

  let sessions = [];
  let debounceId;
  let activeView = VALID_VIEWS.has(state.view) ? state.view : DEFAULT_VIEW;
  const expandedIds = new Set();
  const visibleRelatedIds = new Set();
  let selectedSessionIds = new Set(state.view === 'favorites' ? [] : incomingSessionIds);
  let timeBounds = { min: MIN_TIME_INDEX, max: MAX_TIME_INDEX };
  let relatedLookup = {};
  let newSessionIds = new Set();
  let prioritizedNewSessionIds = new Set();

  function currentFilters() {
    return {
      q: qInput.value.trim(),
      exclude: excludeInput ? excludeInput.value.trim() : '',
      speaker: speakerInput.value.trim(),
      topic: topicSelect.value,
      day: dayPills.find((pill) => pill.classList.contains('active'))?.dataset.day || '',
      sort: VALID_SORTS.has(sortSelect.value) ? sortSelect.value : DEFAULT_SORT,
      start_after: timeRangeStart && Number(timeRangeStart.value) > timeBounds.min ? timeIndexToValue(timeRangeStart.value) : '',
      start_before: timeRangeEnd && Number(timeRangeEnd.value) < timeBounds.max ? timeIndexToValue(timeRangeEnd.value) : '',
      view: favoriteToggle?.checked ? 'favorites' : activeView,
      sessionids: favoriteToggle?.checked ? [...favoriteIds].join(',') : [...selectedSessionIds].join(','),
      company: companyFilter,
      ai_focus: classificationFilters.ai_focus,
      theme: classificationFilters.theme,
      audience: classificationFilters.audience,
      availability: availabilitySelect?.value || '',
    };
  }

  function syncUrl() {
    const nextSearch = buildSearchFromFilters(currentFilters());
    const nextUrl = new URL(location.href);
    nextUrl.search = nextSearch;
    history.replaceState(null, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }

  function syncInputClearButtons() {
    if (qClearBtn) qClearBtn.classList[qInput.value ? 'add' : 'remove']('visible');
    if (excludeInput && excludeClearBtn) excludeClearBtn.classList[excludeInput.value ? 'add' : 'remove']('visible');
    if (speakerClearBtn) speakerClearBtn.classList[speakerInput.value ? 'add' : 'remove']('visible');
    if (timeRangeLabel) {
      const start = Number(timeRangeStart?.value || timeBounds.min);
      const end = Number(timeRangeEnd?.value || timeBounds.max);
      timeRangeLabel.textContent = (start === timeBounds.min && end === timeBounds.max) ? 'All times' : `${timeIndexToLabel(start)} – ${timeIndexToLabel(end)}`;
      if (timeRangeFill) {
        const span = Math.max(1, timeBounds.max - timeBounds.min);
        timeRangeFill.style.left = `${((start - timeBounds.min) / span) * 100}%`;
        timeRangeFill.style.width = `${((end - start) / span) * 100}%`;
      }
    }
  }

  function render() {
    const filters = currentFilters();
    const prioritizeNew = shouldPrioritizeNew(filters, timeBounds);
    const filteredSource = filterSessions(sessions, filters);
    prioritizedNewSessionIds = prioritizeNew ? new Set(prioritizedNewSessions(filteredSource, newSessionIds).map((session) => sessionKey(session))) : new Set();
    const filtered = sortSessions(filteredSource, filters.sort, { prioritizedNewSessionIds, prioritizeNew });
    syncInputClearButtons();
    if (activeFilters) activeFilters.innerHTML = renderFilterPills(filters);
    syncUrl();
    if (activeView === 'sessions' || filters.view === 'favorites') {
      resultCount.textContent = `${filtered.length.toLocaleString()} of ${sessions.length.toLocaleString()} sessions`;
      app.innerHTML = `${renderTabs(activeView)}${filtered.length ? `<div class="grid">${renderCards(filtered, filters.q.toLowerCase(), favoriteIds, expandedIds, relatedLookup, visibleRelatedIds, selectedSessionIds, prioritizedNewSessionIds)}</div>` : `<div class="no-results"><p>No sessions match your filters.</p></div>`}`;
    } else if (activeView === 'speakers') {
      const stats = speakerStats(filtered);
      resultCount.textContent = `${stats.length.toLocaleString()} speakers with multiple sessions`;
      app.innerHTML = `${renderTabs(activeView)}${renderSpeakersView(filtered)}`;
    } else if (activeView === 'companies') {
      const stats = companyStats(filtered);
      resultCount.textContent = `${stats.length.toLocaleString()} companies with multiple sessions`;
      app.innerHTML = `${renderTabs(activeView)}${renderCompaniesView(filtered)}`;
    } else {
      const stats = wordStats(filtered);
      resultCount.textContent = `${stats.length.toLocaleString()} top words`;
      app.innerHTML = `${renderTabs(activeView)}${renderWordsView(filtered)}`;
    }

    for (const tab of app.querySelectorAll ? app.querySelectorAll('.tab-btn') : []) {
      tab.addEventListener('click', () => {
        activeView = tab.dataset.view || DEFAULT_VIEW;
        if (favoriteToggle) favoriteToggle.checked = false;
        render();
      });
    }
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
        selectedSessionIds = new Set();
        qInput.value = '';
        speakerInput.value = button.dataset.speakerName || '';
        topicSelect.value = '';
        sortSelect.value = DEFAULT_SORT;
        if (timeRangeStart) timeRangeStart.value = String(timeBounds.min);
        if (timeRangeEnd) timeRangeEnd.value = String(timeBounds.max);
        if (favoriteToggle) favoriteToggle.checked = false;
        activeView = DEFAULT_VIEW;
        applyDaySelection(dayPills, '');
        render();
      });
    }
    for (const button of app.querySelectorAll ? app.querySelectorAll('.speaker-summary-link') : []) {
      button.addEventListener('click', () => {
        selectedSessionIds = new Set();
        qInput.value = '';
        speakerInput.value = button.dataset.speakerName || '';
        topicSelect.value = '';
        sortSelect.value = DEFAULT_SORT;
        if (timeRangeStart) timeRangeStart.value = String(timeBounds.min);
        if (timeRangeEnd) timeRangeEnd.value = String(timeBounds.max);
        if (favoriteToggle) favoriteToggle.checked = false;
        activeView = DEFAULT_VIEW;
        applyDaySelection(dayPills, '');
        render();
      });
    }
    for (const button of app.querySelectorAll ? app.querySelectorAll('.topic-link') : []) {
      button.addEventListener('click', () => {
        selectedSessionIds = new Set();
        topicSelect.value = button.dataset.topicName || '';
        activeView = DEFAULT_VIEW;
        render();
      });
    }
    for (const button of app.querySelectorAll ? app.querySelectorAll('.company-link') : []) {
      button.addEventListener('click', () => {
        selectedSessionIds = new Set();
        qInput.value = '';
        speakerInput.value = '';
        topicSelect.value = '';
        sortSelect.value = DEFAULT_SORT;
        if (timeRangeStart) timeRangeStart.value = String(timeBounds.min);
        if (timeRangeEnd) timeRangeEnd.value = String(timeBounds.max);
        if (favoriteToggle) favoriteToggle.checked = false;
        activeView = DEFAULT_VIEW;
        applyDaySelection(dayPills, '');
        companyFilter = button.dataset.companyName || '';
        history.replaceState(null, '', buildSearchFromFilters({ q: '', speaker: '', topic: '', day: '', sort: DEFAULT_SORT, start_after: '', start_before: '', view: DEFAULT_VIEW, sessionids: '', company: companyFilter }));
        render();
      });
    }
    for (const button of app.querySelectorAll ? app.querySelectorAll('.company-summary-link') : []) {
      button.addEventListener('click', () => {
        selectedSessionIds = new Set();
        qInput.value = '';
        speakerInput.value = '';
        topicSelect.value = '';
        sortSelect.value = DEFAULT_SORT;
        if (timeRangeStart) timeRangeStart.value = String(timeBounds.min);
        if (timeRangeEnd) timeRangeEnd.value = String(timeBounds.max);
        if (favoriteToggle) favoriteToggle.checked = false;
        activeView = DEFAULT_VIEW;
        applyDaySelection(dayPills, '');
        companyFilter = button.dataset.companyName || '';
        history.replaceState(null, '', buildSearchFromFilters({ q: '', speaker: '', topic: '', day: '', sort: DEFAULT_SORT, start_after: '', start_before: '', view: DEFAULT_VIEW, sessionids: '', company: companyFilter }));
        render();
      });
    }
    for (const button of app.querySelectorAll ? app.querySelectorAll('.word-link') : []) {
      button.addEventListener('click', () => {
        selectedSessionIds = new Set();
        qInput.value = button.dataset.word || '';
        speakerInput.value = '';
        topicSelect.value = '';
        sortSelect.value = DEFAULT_SORT;
        if (timeRangeStart) timeRangeStart.value = String(timeBounds.min);
        if (timeRangeEnd) timeRangeEnd.value = String(timeBounds.max);
        if (favoriteToggle) favoriteToggle.checked = false;
        activeView = DEFAULT_VIEW;
        applyDaySelection(dayPills, '');
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
    for (const button of app.querySelectorAll ? app.querySelectorAll('.related-session-link') : []) {
      button.addEventListener('click', () => {
        const relatedSessionId = button.dataset.relatedSessionId;
        qInput.value = '';
        if (excludeInput) excludeInput.value = '';
        speakerInput.value = '';
        topicSelect.value = '';
        sortSelect.value = DEFAULT_SORT;
        if (availabilitySelect) availabilitySelect.value = '';
        if (timeRangeStart) timeRangeStart.value = String(timeBounds.min);
        if (timeRangeEnd) timeRangeEnd.value = String(timeBounds.max);
        if (startAfterInput) startAfterInput.value = '';
        if (startBeforeInput) startBeforeInput.value = '';
        if (favoriteToggle) favoriteToggle.checked = false;
        companyFilter = '';
        classificationFilters.ai_focus = '';
        classificationFilters.theme = '';
        classificationFilters.audience = '';
        activeView = DEFAULT_VIEW;
        applyDaySelection(dayPills, '');
        selectedSessionIds = new Set(relatedSessionId ? [relatedSessionId] : []);
        render();
      });
    }
    return filtered;
  }

  try {
    const [response, availabilityResponse, relatedSessionsResponse, changelogSummaryResponse] = await Promise.all([
      fetchImpl(dataUrl),
      availabilityUrl ? fetchImpl(availabilityUrl).catch(() => null) : Promise.resolve(null),
      relatedSessionsUrl ? fetchImpl(relatedSessionsUrl).catch(() => null) : Promise.resolve(null),
      changelogSummaryUrl ? fetchImpl(changelogSummaryUrl).catch(() => null) : Promise.resolve(null),
    ]);
    const data = await response.json();
    const availabilityData = availabilityResponse ? await availabilityResponse.json().catch(() => null) : null;
    const relatedSessionsData = relatedSessionsResponse ? await relatedSessionsResponse.json().catch(() => null) : null;
    const changelogSummaryData = changelogSummaryResponse ? await changelogSummaryResponse.json().catch(() => null) : null;
    const baseSessions = data.sessions || [];
    sessions = Array.isArray(availabilityData?.records)
      ? mergeAvailabilityIntoSessions(baseSessions, availabilityData.records)
      : baseSessions;
    relatedLookup = relatedSessionsData?.sessions || {};
    newSessionIds = latestNewSessionIds(changelogSummaryData);
    timeBounds = deriveTimeBounds(sessions);
    if (timeRangeStart) {
      timeRangeStart.min = String(timeBounds.min);
      timeRangeStart.max = String(timeBounds.max);
      const nextStart = Math.max(timeBounds.min, Math.min(timeBounds.max, timeTextToIndex(state.start_after, timeBounds.min)));
      timeRangeStart.value = String(nextStart);
    }
    if (timeRangeEnd) {
      timeRangeEnd.min = String(timeBounds.min);
      timeRangeEnd.max = String(timeBounds.max);
      const nextEnd = Math.max(timeBounds.min, Math.min(timeBounds.max, timeTextToIndex(state.start_before, timeBounds.max)));
      timeRangeEnd.value = String(nextEnd);
    }
    if (timeRangeStart && timeRangeEnd && Number(timeRangeStart.value) > Number(timeRangeEnd.value)) {
      timeRangeStart.value = timeRangeEnd.value;
    }
    if (startAfterInput && Number(timeRangeStart?.value || timeBounds.min) > timeBounds.min) startAfterInput.value = timeIndexToLabel(timeRangeStart.value);
    if (startBeforeInput && Number(timeRangeEnd?.value || timeBounds.max) < timeBounds.max) startBeforeInput.value = timeIndexToLabel(timeRangeEnd.value);
    headerCount.textContent = sessions.length.toLocaleString();
    populateTopicFilter(topicSelect, sessions);
    if (state.topic) topicSelect.value = state.topic;
    render();
  } catch (error) {
    app.innerHTML = '<div class="no-results"><p>Failed to load sessions. Run a local server to preview.</p></div>';
    return { render };
  }

  dayPills.forEach((pill) => pill.addEventListener('click', () => { selectedSessionIds = new Set(); applyDaySelection(dayPills, pill.dataset.day || ''); render(); }));
  [qInput, speakerInput, excludeInput].filter(Boolean).forEach((input) => input.addEventListener('input', () => { selectedSessionIds = new Set(); clearTimeoutImpl(debounceId); debounceId = setTimeoutImpl(() => { render(); }, 120); }));
  [topicSelect, sortSelect, startAfterInput, startBeforeInput, availabilitySelect, favoriteToggle].filter(Boolean).forEach((input) => input.addEventListener('change', () => { if (input !== favoriteToggle) selectedSessionIds = new Set(); if (input === favoriteToggle && favoriteToggle.checked) activeView = DEFAULT_VIEW; render(); }));
  [timeRangeStart, timeRangeEnd].filter(Boolean).forEach((input) => input.addEventListener('input', () => {
    selectedSessionIds = new Set();
    let start = Number(timeRangeStart.value);
    let end = Number(timeRangeEnd.value);
    start = Math.max(timeBounds.min, Math.min(timeBounds.max, start));
    end = Math.max(timeBounds.min, Math.min(timeBounds.max, end));
    if (start > end) {
      if (input === timeRangeStart) end = start; else start = end;
    }
    timeRangeStart.value = String(start);
    timeRangeEnd.value = String(end);
    if (startAfterInput) startAfterInput.value = start === timeBounds.min ? '' : timeIndexToLabel(start);
    if (startBeforeInput) startBeforeInput.value = end === timeBounds.max ? '' : timeIndexToLabel(end);
    render();
  }));
  activeFilters?.addEventListener('click', (event) => {
    const key = event?.target?.dataset?.clearFilter;
    if (!key) return;
    if (key === 'q') qInput.value = '';
    if (key === 'exclude' && excludeInput) excludeInput.value = '';
    if (key === 'speaker') speakerInput.value = '';
    if (key === 'company') companyFilter = '';
    if (key === 'topic') topicSelect.value = '';
    if (key === 'day') applyDaySelection(dayPills, '');
    if (key === 'time') { if (timeRangeStart) timeRangeStart.value = String(timeBounds.min); if (timeRangeEnd) timeRangeEnd.value = String(timeBounds.max); if (startAfterInput) startAfterInput.value = ''; if (startBeforeInput) startBeforeInput.value = ''; }
    if (key === 'favorites' && favoriteToggle) favoriteToggle.checked = false;
    if (key === 'sessionids') selectedSessionIds = new Set();
    if (key === 'ai_focus') classificationFilters.ai_focus = '';
    if (key === 'theme') classificationFilters.theme = '';
    if (key === 'audience') classificationFilters.audience = '';
    if (key === 'availability' && availabilitySelect) availabilitySelect.value = '';
    render();
  });

  qClearBtn?.addEventListener('click', () => {
    selectedSessionIds = new Set();
    qInput.value = '';
    render();
  });
  excludeClearBtn?.addEventListener('click', () => {
    selectedSessionIds = new Set();
    if (excludeInput) excludeInput.value = '';
    render();
  });
  speakerClearBtn?.addEventListener('click', () => {
    selectedSessionIds = new Set();
    speakerInput.value = '';
    render();
  });

  clearBtn?.addEventListener('click', () => {
    qInput.value = '';
    if (excludeInput) excludeInput.value = '';
    speakerInput.value = '';
    companyFilter = '';
    topicSelect.value = '';
    sortSelect.value = DEFAULT_SORT;
    if (availabilitySelect) availabilitySelect.value = '';
    if (timeRangeStart) timeRangeStart.value = String(timeBounds.min);
    if (timeRangeEnd) timeRangeEnd.value = String(timeBounds.max);
    if (favoriteToggle) favoriteToggle.checked = false;
    selectedSessionIds = new Set();
    classificationFilters.ai_focus = '';
    classificationFilters.theme = '';
    classificationFilters.audience = '';
    activeView = DEFAULT_VIEW;
    applyDaySelection(dayPills, '');
    history.replaceState(null, '', location.pathname);
    render();
  });
  copyFavoritesBtn?.addEventListener('click', async () => {
    const url = new URL(location.href);
    url.search = buildSearchFromFilters({ q: '', speaker: '', topic: '', day: '', sort: DEFAULT_SORT, start_after: '', start_before: '', company: '', view: 'favorites', sessionids: [...favoriteIds].map((id) => sessionKey({ id, url: id })).join(',') });
    const text = url.toString();
    try { if (globalThis.navigator?.clipboard?.writeText) await globalThis.navigator.clipboard.writeText(text); } catch {}
  });

  return { render };
}
