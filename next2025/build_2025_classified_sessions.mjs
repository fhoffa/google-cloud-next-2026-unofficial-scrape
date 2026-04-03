import fs from 'node:fs/promises';

const input = new URL('./sessions_25_full.json', import.meta.url);
const output = new URL('./sessions_25_classified.json', import.meta.url);

const raw = JSON.parse(await fs.readFile(input, 'utf8'));

function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function topicLabels(session) {
  const out = [];
  if (session.category) out.push(session.category);
  for (const t of session.topics || []) if (t && !out.includes(t)) out.push(t);
  for (const t of session.tags || []) if (t && !out.includes(t)) out.push(t);
  return out;
}

const sessions = raw.map((s) => ({
  id: s.id || s.code,
  title: s.title || '',
  description: stripHtml(s.summary || ''),
  url: s.code ? `https://cloud.withgoogle.com/next/25/session-library?session=${encodeURIComponent(s.code)}#all` : '',
  start_at: s.time_start || '',
  end_at: s.time_end || '',
  date_time: s.time_start && s.time_end ? `${s.time_start}/${s.time_end}` : '',
  date_text: '',
  start_time_text: '',
  end_time_text: '',
  room: s.location || '',
  topics: topicLabels(s),
  speakers: (s.speakers || []).map((sp) => ({
    name: sp.name || '',
    company: sp.company || '',
  })),
  session_category: s.category || '',
  capacity: null,
  remaining_capacity: null,
  registrant_count: null,
  agenda_status: '',
  disabled_class: '',
  llm: s.llm || null,
  code: s.code || '',
  raw_speaker_ids: s.rawSpeakerIds || [],
  speaker_details: s.speakers || [],
  source: 'nuxt-state',
}));

await fs.writeFile(output, JSON.stringify({ model: 'unclassified-2025', sessions }, null, 2));
console.log(`wrote ${sessions.length} sessions to ${output.pathname}`);
console.log(`with speakers ${sessions.filter(s => s.speakers.length > 0).length}`);
