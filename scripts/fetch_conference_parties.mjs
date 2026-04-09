import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://conferenceparties.com/next26/';
const SOURCE_NAME = 'ConferenceParties.com';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'media', 'conference-parties-next26.json');

function decodeHtmlEntities(text = '') {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripTags(html = '') {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .replace(/[ \t]+/g, ' ')
  ).trim();
}

function extractFirstHref(html = '') {
  const match = html.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  return match ? sanitizeUrl(decodeHtmlEntities(match[1])) : '';
}

function normalizeDayHeading(text = '') {
  return text.replace(/\s+-\s+/g, ' - ').replace(/\s{2,}/g, ' ').trim();
}

function extractTitle(html = '') {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : '';
}

function extractMetaDescription(html = '') {
  const matches = [...html.matchAll(/<meta[^>]+(?:name=["']description["']|property=["']og:description["'])[^>]+content=["']([\s\S]*?)["'][^>]*>/gi)];
  return matches.map((m) => stripTags(m[1])).filter(Boolean)[0] || '';
}

function compact(text = '') {
  return text.replace(/\s+/g, ' ').trim();
}

function sanitizeUrl(raw = '') {
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return raw.split('?')[0].split('#')[0];
  }
}

function normalizeLine(text = '') {
  return compact(text)
    .replace(/^\W+|\W+$/g, '')
    .replace(/[•·▪◦]+/g, ' • ')
    .replace(/\s*•\s*/g, ' • ')
    .trim();
}

function extractReadableBodyTextFallback(html = '') {
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ');
  return stripTags(cleaned);
}

function sanitizeExcerpt(text = '') {
  return stripBoilerplate(compact(text))
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/window\[['"]ppConfig['"]\][\s\S]*/i, '')
    .replace(/window\.WIZ_global_data[\s\S]*/i, '')
    .slice(0, 1800);
}

function stripBoilerplate(text = '') {
  return compact(text)
    .replace(/please enable js and disable any ad blocker/gi, '')
    .replace(/(?:explore events|sign in|contact the host|report event|discover pricing help host your event with luma)[\s\S]*$/i, '')
    .replace(/(?:products|solutions|resources|company|platform|pricing|docs|blog|support|careers)(?:\s+[A-Z][A-Za-z&/+'’-]+){6,}/g, '')
    .replace(/(?:copyright|privacy policy|terms of use|all rights reserved)[\s\S]*$/i, '')
    .replace(/\b(register now|get a demo|book a demo|try it free|request a demo|learn more|request your free savings analysis)\b[\s\S]*$/i, '')
    .trim();
}

function isLikelyBoilerplate(line = '') {
  const lower = line.toLowerCase();
  if (!lower) return true;
  if (lower.length < 24) return true;
  if (/^(products|solutions|resources|company|support|docs|pricing|careers|contact us|sign in|login|menu|search)$/.test(lower)) return true;
  if (/^(explore events|discover pricing help|host your event with luma|view all|book a demo)$/.test(lower)) return true;
  if (/privacy policy|all rights reserved|cookie|skip to content|open search|open menu/.test(lower)) return true;
  if (/request your free savings analysis|book a demo|get a demo|try it free|request a demo/.test(lower)) return true;
  if ((line.match(/[|>]/g) || []).length >= 4) return true;
  if ((line.match(/\b(products|solutions|resources|platform|pricing|docs|blog|company)\b/gi) || []).length >= 4) return true;
  return false;
}

function scoreBlock(text = '') {
  const line = normalizeLine(stripBoilerplate(text));
  if (!line || isLikelyBoilerplate(line)) return 0;
  const len = line.length;
  const punctuation = (line.match(/[.!?;:]/g) || []).length;
  const keywords = (line.match(/\b(join|invite|event|party|reception|network|networking|happy hour|dinner|lunch|breakfast|drinks|cocktails|food|cloud|google next|register|rsvp|builders|leaders|community|founders|engineers)\b/gi) || []).length;
  const penalties = (line.match(/\b(products|solutions|resources|pricing|blog|docs|support|careers|platform overview)\b/gi) || []).length;
  return Math.min(len, 500) + punctuation * 30 + keywords * 45 - penalties * 80;
}

function extractReadableBlocks(html = '') {
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, ' ')
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ');

  const rawBlocks = [];
  const blockRegex = /<(main|article|section|div|p|li|h1|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of cleaned.matchAll(blockRegex)) {
    const text = normalizeLine(stripTags(match[2]));
    if (!text) continue;
    rawBlocks.push(text);
  }

  const unique = [];
  const seen = new Set();
  for (const block of rawBlocks) {
    const key = block.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(block);
  }

  return unique
    .map((text) => ({ text: stripBoilerplate(text), score: scoreBlock(text) }))
    .filter((entry) => entry.text && entry.score > 80)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function splitSentences(text = '') {
  return compact(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function cleanSentence(sentence = '', title = '') {
  let value = compact(stripBoilerplate(sentence))
    .replace(/^about event\s*/i, '')
    .replace(/^summary\s*-\s*/i, '')
    .replace(/^(register|request to join|welcome!?)\s*/i, '')
    .replace(/\bsubmit the form to request your free cloud savings analysis\b/gi, '')
    .trim();
  if (title) {
    const escaped = compact(title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    value = value.replace(new RegExp(`^${escaped}[\s:–—-]*`, 'i'), '').trim();
  }
  return value;
}

function chooseInviteExcerpt(content = {}, event = {}) {
  const candidates = [
    content.metaDescription,
    ...content.blocks.map((b) => b.text),
    content.pageText,
    content.legacy_excerpt,
  ];

  for (const candidate of candidates) {
    const cleaned = cleanSentence(candidate, event.title);
    if (!cleaned || cleaned.length < 80) continue;
    if (isLikelyBoilerplate(cleaned)) continue;
    return cleaned.slice(0, 360).trim();
  }

  return '';
}

function summarizeEvent(event, fetched = {}) {
  const sentences = [
    ...splitSentences(fetched.metaDescription || ''),
    ...fetched.blocks.flatMap((block) => splitSentences(block.text)),
    ...splitSentences(fetched.pageText || ''),
    ...splitSentences(fetched.legacy_excerpt || ''),
  ].map((sentence) => cleanSentence(sentence, event.title));

  const selected = [];
  const seen = new Set();

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (!sentence || sentence.length < 35 || sentence.length > 220) continue;
    if (isLikelyBoilerplate(sentence)) continue;
    if (seen.has(lower)) continue;
    if (selected.some((existing) => existing.toLowerCase().includes(lower) || lower.includes(existing.toLowerCase()))) continue;
    seen.add(lower);

    const hasSignal = /\b(join|welcome|network|networking|meet|connect|conversation|community|builders|leaders|engineers|founders|drinks|cocktails|bites|food|dinner|lunch|breakfast|music|racing|simulators|golf|after party|happy hour|reception|roundtable|summit|sushi|executive|security|finops|cloud native|kubernetes)\b/i.test(sentence);
    if (!hasSignal && selected.length === 0) continue;
    selected.push(sentence);
    if (selected.length === 2) break;
  }

  const summary = selected.join(' ').trim();
  if (/developer documentation|open source pricing|case studies|support professional services|events upcoming events|customer stories about resources|buffalo sabres|dallas stars|lightning vs\.|hockey night/i.test(summary)) {
    const titleFallback = cleanSentence(fetched.page_title || '', event.title);
    return titleFallback || chooseInviteExcerpt(fetched, event);
  }
  return summary || chooseInviteExcerpt(fetched, event);
}

function classifyAccess(event, fetched = {}) {
  const raw = [event.title, event.location, fetched.page_title, fetched.invite_excerpt, fetched.summary, fetched.pageText, fetched.final_url]
    .filter(Boolean)
    .join(' \n ')
    .toLowerCase();

  if (/at capacity|sold out|waitlist only|fully booked|no longer accepting|space is limited and full/.test(raw)) {
    return {
      openness: 'Full / closed',
      exclusivity: 'N/A',
      rationale: 'Looks full or no longer taking registrations.',
    };
  }

  if (/approval required|invite-only|strictly limited capacity|manually reviewed|select group|private event/.test(raw)) {
    return {
      openness: 'Curated guest list',
      exclusivity: 'High',
      rationale: 'The page explicitly says approval, invite-only, or a small curated guest list.',
    };
  }

  if (/request an invite|request invite|request to join|request an invitation|apply/.test(raw)) {
    return {
      openness: 'Request invite',
      exclusivity: 'Medium',
      rationale: 'There is an invite/request flow rather than instant registration.',
    };
  }

  if (/drop in anytime|free play mode|all are welcome|everyone welcome|open to all|save your spot today|register below|register now|register today|rsvp today|public event/.test(raw)) {
    return {
      openness: 'Open RSVP',
      exclusivity: 'Low',
      rationale: 'The page reads like normal registration, not approval-only screening.',
    };
  }

  if (/luma\.com/.test(raw)) {
    return {
      openness: 'Likely open RSVP',
      exclusivity: 'Low-medium',
      rationale: 'The Luma page is public and does not clearly say approval is required.',
    };
  }

  if (/eventbrite|ticket|register here/.test(raw)) {
    return {
      openness: 'Open RSVP',
      exclusivity: 'Low',
      rationale: 'Looks like a standard public registration flow.',
    };
  }

  if (fetched.status === 403) {
    return {
      openness: 'Probably curated',
      exclusivity: 'Medium-high',
      rationale: 'The landing page is gated, so details are limited and registration may be more controlled.',
    };
  }

  return {
    openness: 'Unclear',
    exclusivity: 'Unclear',
    rationale: 'Not enough signal to classify confidently.',
  };
}

function classifyAudience(event, fetched = {}) {
  const raw = [event.title, event.sponsor, event.location, fetched.summary, fetched.invite_excerpt, fetched.page_title]
    .filter(Boolean)
    .join(' \n ')
    .toLowerCase();

  const rules = [
    {
      match: /women in tech|innovathers|veterans|career transition|meetup|community legends/,
      label: 'Community / affinity group',
      rationale: 'Reads as a community or affinity-group meetup more than a generic mixer.',
    },
    {
      match: /ciso|security pros|security leader|cybersecurity|secops|threat|fortinet|crowdstrike|sentinelone|netskope|zscaler|menlo security|xm cyber|infoblox|wiz/,
      label: 'Security leaders / practitioners',
      rationale: 'Security-heavy hosts and wording point to security teams, leaders, or buyers.',
    },
    {
      match: /finops|cloud economics|cloud spend|cost optimization|prosperops|finout|nops|doit|archera/,
      label: 'FinOps / cloud economics',
      rationale: 'The event language is centered on cloud cost, savings, or FinOps people.',
    },
    {
      match: /kube|kubernetes|platform engineers?|cloud architects?|developers?|devops|sre|builders?|engineers?|cloud native|langchain|confluent|mongodb|redis|clickhouse|neo4j|dagster|baseten|chronosphere|yugabyte|mcp/,
      label: 'Broad technical / cloud practitioners',
      rationale: 'This reads like a technical cloud crowd rather than a pure exec or sales room.',
    },
    {
      match: /founder|cto|executive|leaders?|buyers?|roundtable|dinner|private event|select group|smbs|retail leaders/,
      label: 'Executives / curated buyers',
      rationale: 'The wording skews toward executives, founders, or a smaller buyer-style audience.',
    },
    {
      match: /happy hour|after party|reception|cocktails|social|drinks|networking|welcome party|house party/,
      label: 'Broad networking crowd',
      rationale: 'This sounds like a general networking mixer rather than a tightly defined niche audience.',
    },
  ];

  for (const rule of rules) {
    if (rule.match.test(raw)) return { label: rule.label, rationale: rule.rationale };
  }

  return {
    label: 'General conference crowd',
    rationale: 'Looks like a general conference-side networking event.',
  };
}

function describeFood(event, fetched = {}) {
  const raw = [event.title, event.location, fetched.summary, fetched.invite_excerpt, fetched.page_title, fetched.pageText]
    .filter(Boolean)
    .join(' \n ');
  const lower = compact(raw).toLowerCase();

  const explicitEntries = [
    {
      match: /coffee|snacks|lunch on us|open bar|free drinks|appetizers|refreshments|great food|delicious food/,
      label: 'Food and drinks clearly provided',
      note: 'The page explicitly promises food, drinks, or both.',
    },
    {
      match: /\bdinner\b|wine & dine|sunset dinner|executive dinner|roundtable dinner/,
      label: 'Dinner likely',
      note: 'The event explicitly says dinner, so meal odds are much better than average.',
    },
    {
      match: /breakfast/,
      label: 'Breakfast likely',
      note: 'Explicit breakfast event, not just coffee.',
    },
    {
      match: /lunch|lunch & learn|cto lunch/,
      label: 'Lunch likely',
      note: 'Explicit lunch signal, which matters more than the venue name.',
    },
    {
      match: /sushi|japanese restaurant/,
      label: 'Sushi / Japanese food likely',
      note: 'Sushi or Japanese food is explicitly part of the pitch.',
    },
    {
      match: /bites|passed bites|cocktails|martinis|aperitifs|happy hour|drinks|after party|reception/,
      label: 'Drinks-first, food secondary',
      note: 'Reads like a drinks-led reception; food is probably lighter than a real meal.',
    },
  ];

  for (const entry of explicitEntries) {
    if (entry.match.test(lower)) return entry;
  }

  const venueFallbacks = [
    {
      match: /kumi/,
      label: 'Japanese / sushi likely',
      note: 'Japanese food is plausible, but still may be reception-style rather than a full dinner.',
    },
    {
      match: /bourbon steak|stripsteak|tender steakhouse/,
      label: 'Dinner maybe, but not guaranteed',
      note: 'Better dinner odds than average, but many conference events there are still standing receptions.',
    },
    {
      match: /border grill/,
      label: 'Mexican / shared plates likely',
      note: 'Mexican food is plausible here, though still not guaranteed to be a full sit-down meal.',
    },
    {
      match: /libertine social/,
      label: 'Gastropub / cocktail bites likely',
      note: 'Expect cocktails and event-style bites more than a formal dinner.',
    },
    {
      match: /house of blues/,
      label: 'Bar food / comfort food maybe',
      note: 'More bar-food territory than fine dining, but still probably reception-style.',
    },
    {
      match: /hakkasan|marquee nightclub|chandelier bar|clique|hazel lounge|skyfall lounge/,
      label: 'Drinks-first, food unclear',
      note: 'These skew nightlife-first, so food is secondary unless the page explicitly promises it.',
    },
    {
      match: /swingers|topgolf|play playground|f1 arcade|f1 grand prix plaza|tailgate beach club|dream racing/,
      label: 'Snacks / party food likely',
      note: 'Usually drinks plus snackable event food, not a meal worth planning around.',
    },
  ];

  for (const entry of venueFallbacks) {
    if (entry.match.test(lower)) return entry;
  }

  return {
    label: 'Food unclear',
    note: 'The page does not make the food situation clear enough to rely on.',
  };
}

function describeVenue(location = '') {
  const raw = compact(location);
  const lower = raw.toLowerCase();

  const entries = [
    { match: /hakkasan|marquee nightclub/, vibe: 'Big Vegas flex', note: 'Flashy, loud, high-spectacle Vegas venue; great for buzz, worse for easy conversation.' },
    { match: /chandelier bar/, vibe: 'Stylish Vegas', note: 'Memorable Vegas-chic backdrop, more stylish than private.' },
    { match: /eiffel tower restaurant/, vibe: 'Fancy destination dinner', note: 'Novelty/views make it feel more special than a generic hotel bar.' },
    { match: /f1 arcade|f1 grand prix plaza|swingers|topgolf|play playground|dream racing/, vibe: 'Activity venue', note: 'Memorable activity energy, but not ideal for quiet conversation.' },
    { match: /cascata golf club/, vibe: 'Fancy off-site dinner', note: 'Polished off-site setting that feels more intentional than another casino venue.' },
    { match: /house of blues courtyard/, vibe: 'Outdoor concert-adjacent', note: 'Better atmosphere than a generic ballroom or hotel lounge.' },
    { match: /house of blues/, vibe: 'Lively and scalable', note: 'Recognizable live-music venue with actual night-out energy.' },
    { match: /1923 prohibition bar|clique|hazel lounge|bourbon steak|stripsteak|border grill|libertine social|kumi/, vibe: 'Nice hotel venue', note: 'Solid upscale hotel restaurant/lounge pick: easy and respectable, not wildly distinctive.' },
    { match: /skyfall lounge/, vibe: 'Great views', note: 'Mostly about the views; more memorable than a generic bar.' },
    { match: /tailgate beach club/, vibe: 'Playful outdoor-ish', note: 'Casual, playful energy instead of boardroom-dinner formality.' },
    { match: /industrial/, vibe: 'Off-strip scene', note: 'Off-strip warehouse/event-space vibe: cooler and more intentional than another casino bar.' },
    { match: /register to see address|register to unlock location/, vibe: 'Hidden / curated', note: 'Hidden address usually means either exclusivity or a small private venue.' },
  ];

  for (const entry of entries) {
    if (entry.match.test(lower)) return entry;
  }

  if (/mandalay bay|luxor|cosmopolitan|mgm grand|paris hotel|caesars palace|w hotel/.test(lower)) {
    return {
      vibe: 'Convenient hotel spot',
      note: 'Easy to attend, but usually less distinctive than an off-property destination.',
    };
  }

  return {
    vibe: 'Unknown vibe',
    note: 'Not enough location signal for a better venue note yet.',
  };
}

async function fetchLandingMeta(url) {
  if (!url) return { status: null, final_url: '', page_title: '', metaDescription: '', blocks: [], pageText: '' };
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; GoogleNextPartiesIndexer/1.2; +https://github.com/fhoffa/google-cloud-next-2026-unofficial-scrape)',
      },
    });
    const html = await response.text();
    const title = extractTitle(html);
    const metaDescription = extractMetaDescription(html);
    const blocks = extractReadableBlocks(html);
    const fallbackText = sanitizeExcerpt(extractReadableBodyTextFallback(html));
    const pageText = stripBoilerplate(compact((blocks.length ? blocks.map((b) => b.text).join(' ') : fallbackText))).slice(0, 2500);
    const legacy_excerpt = sanitizeExcerpt([metaDescription, fallbackText].filter(Boolean).join(' '));
    return {
      status: response.status,
      final_url: sanitizeUrl(response.url),
      page_title: title,
      metaDescription,
      blocks,
      pageText,
      legacy_excerpt,
    };
  } catch (error) {
    return {
      status: null,
      final_url: url,
      page_title: '',
      metaDescription: '',
      blocks: [],
      pageText: '',
      legacy_excerpt: '',
      fetch_error: error.message,
    };
  }
}

async function enrichEvent(event) {
  const fetched = await fetchLandingMeta(event.url);
  const invite_excerpt = chooseInviteExcerpt(fetched, event);
  const summary = summarizeEvent(event, { ...fetched, invite_excerpt });
  const access = classifyAccess(event, { ...fetched, invite_excerpt, summary });
  const audience = classifyAudience(event, { ...fetched, invite_excerpt, summary });
  const food = describeFood(event, { ...fetched, invite_excerpt, summary });
  const venue = describeVenue(event.location);

  return {
    ...event,
    summary,
    invite_excerpt,
    access,
    audience,
    food,
    venue,
    link_meta: {
      status: fetched.status,
      final_url: fetched.final_url,
      page_title: fetched.page_title,
      page_excerpt: fetched.pageText,
      top_blocks: fetched.blocks.map(({ text, score }) => ({ text: text.slice(0, 320), score })),
      fetch_error: fetched.fetch_error,
    },
  };
}

function parseConferenceParties(html) {
  const tableMatch = html.match(/<table\b[^>]*id=["']tablepress-1["'][^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) throw new Error('Could not find conference parties table (tablepress-1).');

  const tableHtml = tableMatch[1];
  const rows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  const days = [];
  let currentDay = null;

  for (const rowHtml of rows) {
    const headingMatch = rowHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (headingMatch) {
      currentDay = {
        label: normalizeDayHeading(stripTags(headingMatch[1])),
        events: [],
      };
      days.push(currentDay);
      continue;
    }

    const cells = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => m[1]);
    if (cells.length !== 5 || !currentDay) continue;

    const [timeHtml, sponsorHtml, eventHtml, locationHtml, listedHtml] = cells;
    const time = stripTags(timeHtml);
    const sponsor = stripTags(sponsorHtml);
    const title = stripTags(eventHtml);
    const location = stripTags(locationHtml);
    const listed = stripTags(listedHtml);
    const url = extractFirstHref(eventHtml);

    if (!time || /^time$/i.test(time) || !title) continue;

    currentDay.events.push({
      time,
      sponsor,
      title,
      url,
      location,
      listed,
      source: SOURCE_NAME,
      sourceUrl: SOURCE_URL,
    });
  }

  return days;
}

async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; GoogleNextPartiesIndexer/1.2; +https://github.com/fhoffa/google-cloud-next-2026-unofficial-scrape)',
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${SOURCE_URL}: ${response.status}`);
  const html = await response.text();
  const parsedDays = parseConferenceParties(html);

  const days = [];
  for (const day of parsedDays) {
    const events = [];
    for (const event of day.events) {
      events.push(await enrichEvent(event));
    }
    days.push({ ...day, events });
  }

  const totalEvents = days.reduce((sum, day) => sum + day.events.length, 0);
  const output = {
    source: {
      name: SOURCE_NAME,
      url: SOURCE_URL,
      credit: `Party listings indexed from ${SOURCE_NAME}`,
    },
    fetched_at: new Date().toISOString(),
    total_days: days.length,
    total_events: totalEvents,
    days,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`Days: ${output.total_days}`);
  console.log(`Events: ${output.total_events}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
