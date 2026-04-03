import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const code = process.env.CODE || 'BRK1-096';
const url = `https://cloud.withgoogle.com/next/25/session-library?session=${code}#all`;
const out = 'next2025/sessions_25_full.json';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await page.waitForTimeout(5000);

const state = await page.evaluate(() => {
  const st = window.__NUXT__?.state || {};
  return {
    sessions: st.sessions || null,
    speakers: st.speakers || null,
  };
});
await browser.close();

if (!state.sessions?.sessionsByIdCode) throw new Error('sessionsByIdCode missing');
if (!state.speakers?.speakersById) throw new Error('speakersById missing');

const speakersById = state.speakers.speakersById;
function mapSpeaker(id) {
  const sp = speakersById[String(id)] || speakersById[id];
  if (!sp) return { id: String(id), missing: true };
  return {
    id: String(sp.id ?? id),
    name: sp.fullName || sp.name || '',
    role: sp.job_title || sp.title || sp.jobTitle || sp.role || '',
    company: sp.company || sp.companyName || sp.organization || '',
    affiliation: Array.isArray(sp.type) ? (sp.type[0] || '') : (sp.attendeeType || sp.attendee_type || sp.affiliation || ''),
  };
}

const sessions = Object.entries(state.sessions.sessionsByIdCode).map(([codeKey, s]) => ({
  code: s.id_code || codeKey.toUpperCase(),
  codeKey,
  id: s.id || '',
  title: s.title || '',
  summary: s.summary || '',
  category: s.category?.label || s.category?.value || '',
  type: s.type || '',
  topics: Array.isArray(s.topics) ? s.topics.map(t => t.label || t.value || t).filter(Boolean) : [],
  tags: Array.isArray(s.tags) ? s.tags : [],
  permissions: s.permissions || {},
  speakers: Array.isArray(s.speakers) ? s.speakers.map(mapSpeaker) : [],
  rawSpeakerIds: Array.isArray(s.speakers) ? s.speakers : [],
  media: Array.isArray(s.media) ? s.media : [],
  related: s.related || {},
  location: s.location || '',
  time_start: s.time_start || '',
  time_end: s.time_end || '',
  time_duration_mins: s.time_duration_mins || null,
}));

await fs.writeFile(out, JSON.stringify(sessions, null, 2));
console.log(`wrote ${sessions.length} sessions to ${out}`);
console.log(`with speakers ${sessions.filter(s => s.speakers.length).length}`);
for (const code of ['BRK1-096','SOL303','CT2-28','IND-113']) {
  const s = sessions.find(x => x.code === code);
  console.log('\nCODE', code, !!s);
  if (s) console.log(JSON.stringify({title:s.title, speakers:s.speakers}, null, 2));
}
