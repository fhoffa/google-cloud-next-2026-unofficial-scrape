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
  const match = html.match(/<meta[^>]+(?:name=["']description["']|property=["']og:description["'])[^>]+content=["']([\s\S]*?)["'][^>]*>/i);
  return match ? stripTags(match[1]) : '';
}

function extractReadableBodyText(html = '') {
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ');
  return stripTags(cleaned);
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

function sanitizeExcerpt(text = '') {
  return compact(text)
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/window\[['"]ppConfig['"]\][\s\S]*/i, '')
    .replace(/window\.WIZ_global_data[\s\S]*/i, '')
    .slice(0, 1400);
}

function deriveInviteExcerpt(text = '', title = '') {
  let excerpt = compact(text);
  if (!excerpt) return '';
  const titleCompact = compact(title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (titleCompact) {
    excerpt = excerpt.replace(new RegExp(`^${titleCompact}[:\-–—\s]*`, 'i'), '');
  }
  excerpt = excerpt
    .replace(/^(google cloud next 2026:|striim rsvp -|why prosperops|products|solutions|resources)\s*/i, '')
    .replace(/\b(request a free savings analysis|sign up|resources)\b[\s\S]*$/i, '')
    .trim();
  return excerpt.slice(0, 280).trim();
}

function classifyAccess(event, fetched = {}) {
  const raw = [event.title, event.location, fetched.page_title, fetched.page_excerpt, fetched.final_url]
    .filter(Boolean)
    .join(' \n ')
    .toLowerCase();

  if (/at capacity|sold out|waitlist only|fully booked|no longer accepting/i.test(raw)) {
    return {
      openness: 'Full / closed',
      exclusivity: 'N/A',
      rationale: 'Looks full or no longer taking registrations.',
    };
  }

  if (/\bvip\b|executive|founder|ciso|roundtable|register to see address|register to unlock location|private address/.test(raw)
      && !/drop in anytime|free play mode|all are welcome|everyone welcome|open to all|before hotel check-in|early arrivals/.test(raw)) {
    return {
      openness: 'Curated guest list',
      exclusivity: 'High',
      rationale: 'VIP / executive / private-address signals a screened guest list.',
    };
  }

  if (/request an invite|request invite|invite only|apply|approval/.test(raw)
      && !/drop in anytime|free play mode|all are welcome|everyone welcome|open to all|before hotel check-in|early arrivals/.test(raw)) {
    return {
      openness: 'Request invite',
      exclusivity: 'Medium',
      rationale: 'Invite-style flow: not fully open, but not ultra-exclusive either.',
    };
  }

  if (/drop in anytime|free play mode|all are welcome|everyone welcome|open to all|before hotel check-in|early arrivals/.test(raw)) {
    return {
      openness: 'Open RSVP',
      exclusivity: 'Low',
      rationale: 'Very inclusive language: feels easy to drop into rather than screened.',
    };
  }

  if (/eventbrite|ticket|register now|save your spot|register here/.test(raw)) {
    return {
      openness: 'Open RSVP',
      exclusivity: 'Low',
      rationale: 'Looks like normal public registration.',
    };
  }

  if (/luma\.com/.test(raw)) {
    return {
      openness: 'Likely open RSVP',
      exclusivity: 'Low-medium',
      rationale: 'Usually fairly open, though approval can still happen case by case.',
    };
  }

  if (fetched.status === 403) {
    return {
      openness: 'Probably curated',
      exclusivity: 'Medium-high',
      rationale: 'Seems somewhat gated, so approval is probably more controlled.',
    };
  }

  return {
    openness: 'Unclear',
    exclusivity: 'Unclear',
    rationale: 'Not enough signal to classify confidently.',
  };
}

function classifyAudience(event, fetched = {}) {
  const raw = [event.title, event.sponsor, event.location, fetched.page_title, fetched.page_excerpt]
    .filter(Boolean)
    .join(' \n ')
    .toLowerCase();

  if (/sres?|platform engineers?|google cloud experts?|builders?/.test(raw)) {
    return {
      label: 'Broad technical / cloud practitioners',
      rationale: 'The invite explicitly calls out builders and cloud practitioners.',
    };
  }

  const rules = [
    {
      match: /\bciso\b|security pros|security leader|cybersecurity leader|secops|threat intel|wiz|crowdstrike|fortinet|sentinelone|netskope|zscaler|menlo security|xm cyber|infoblox/,
      label: 'Security leaders / practitioners',
      rationale: 'Security-heavy hosts and language point to security buyers, leaders, or operators.',
    },
    {
      match: /sre|platform engineers?|google cloud experts?|developers?|devops|kube|mcp|baseten|chronosphere|dagster|langchain|mongodb|confluent|redis|clickhouse|neo4j|yugabyte/,
      label: 'Broad technical / cloud practitioners',
      rationale: 'The invite calls out builders and cloud practitioners more than buyers or executives.',
    },
    {
      match: /finops|finout|nops|prosperops|cloud cost|doit/,
      label: 'FinOps / cloud economics',
      rationale: 'Centered on cloud spend, optimization, or financial operations.',
    },
    {
      match: /women in tech|innovathers|veterans|career transition|meetup/,
      label: 'Community / affinity group',
      rationale: 'Reads as community / affinity-group oriented.',
    },
    {
      match: /founder|saas startup|startup|venture|executive|vip|leader|leaders|roundtable|dinner|private|exclusive/,
      label: 'Executives / curated buyers',
      rationale: 'Skews executive / buyer / curated-business rather than broad drop-in traffic.',
    },
    {
      match: /happy hour|house party|after party|welcome party|reception|drinks|social|sushi social/,
      label: 'Broad networking crowd',
      rationale: 'Feels like broad networking rather than a narrow niche crowd.',
    },
    {
      match: /drop in anytime|free play mode|all are welcome|everyone welcome|before hotel check-in|early arrivals/,
      label: 'Broad / inclusive conference crowd',
      rationale: 'The language is notably inclusive and drop-in friendly, not selective.',
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
  const raw = [event.title, event.location, fetched.page_title, fetched.page_excerpt]
    .filter(Boolean)
    .join(' \n ');
  const lower = compact(raw).toLowerCase();

  const explicitEntries = [
    {
      match: /coffee[^a-z]|coffee\s*\+|coffee •|snacks|lunch on us|happy hour.*drinks|drinks, music|coffee \+ arrival|power-up lunch/,
      label: 'Food and drinks clearly provided',
      note: 'The invite explicitly promises coffee, snacks, lunch, drinks, or happy hour through the event.',
    },
    {
      match: /\bdinner\b|wine & dine|sunset dinner|executive dinner|roundtable dinner|steakhouse/,
      label: 'Dinner likely',
      note: 'The invite explicitly says dinner, so odds of a real meal are much better than usual.'
    },
    {
      match: /breakfast/,
      label: 'Breakfast likely',
      note: 'Explicit breakfast event, not just coffee.'
    },
    {
      match: /lunch|lunch & learn|cto lunch/,
      label: 'Lunch likely',
      note: 'Explicit lunch signal, which matters more than the venue name.'
    },
    {
      match: /sushi/,
      label: 'Sushi / Japanese food likely',
      note: 'The invite itself mentions sushi, which is stronger evidence than the venue alone.'
    },
    {
      match: /aperitifs|martinis|cocktail|cocktail reception|happy hour|drinks|after party|house party|reception/,
      label: 'Drinks-first, food secondary',
      note: 'Sounds drinks-led, so expect light bites or passed food more than a dependable meal.'
    },
  ];

  for (const entry of explicitEntries) {
    if (entry.match.test(lower)) return entry;
  }

  const venueFallbacks = [
    {
      match: /kumi/,
      label: 'Japanese / sushi likely',
      note: 'Japanese food is plausible, but still not a guaranteed full meal; many events there stay reception-style.'
    },
    {
      match: /bourbon steak|stripsteak|tender steakhouse/,
      label: 'Dinner maybe, but not guaranteed',
      note: 'Better dinner odds than average, but still could be standing reception food unless the invite explicitly says dinner.'
    },
    {
      match: /border grill/,
      label: 'Mexican / shared plates likely',
      note: 'Mexican / shared-plate food is plausible, but still likely event-style rather than guaranteed sit-down dinner.'
    },
    {
      match: /libertine social/,
      label: 'Gastropub / cocktail bites likely',
      note: 'Expect cocktails and passed bites more than a formal seated meal.'
    },
    {
      match: /house of blues/,
      label: 'Bar food / comfort food maybe',
      note: 'More bar-food territory than fine dining, but still probably reception-style.'
    },
    {
      match: /hakkasan|marquee nightclub|chandelier bar|clique|hazel lounge|skyfall lounge/,
      label: 'Drinks-first, food unclear',
      note: 'More nightlife than dinner plan. Eat beforehand unless the invite explicitly promises food.'
    },
    {
      match: /swingers|topgolf|play playground|f1 arcade|f1 grand prix plaza|tailgate beach club/,
      label: 'Snacks / party food likely',
      note: 'Usually drinks plus snackable event food, not a memorable meal.'
    },
    {
      match: /eiffel tower restaurant|cascata golf club/,
      label: 'Dinner maybe, stronger odds',
      note: 'A fuller meal is more plausible here, but the invite wording still matters more than the location name.'
    },
    {
      match: /1923 prohibition bar/,
      label: 'Cocktails first, light bites maybe',
      note: 'Drinks and atmosphere first; food is secondary unless the invite says dinner.'
    },
    {
      match: /register to see address|register to unlock location/,
      label: 'Food unknown until approved',
      note: 'Private-address events are opaque, so don’t assume a meal standard from the listing alone.'
    },
  ];

  for (const entry of venueFallbacks) {
    if (entry.match.test(lower)) return entry;
  }

  return {
    label: 'Food unclear',
    note: 'Best-effort guess from invite wording plus venue context; if the invite does not promise a meal, don’t assume one.'
  };
}

function describeVenue(location = '') {
  const raw = compact(location);
  const lower = raw.toLowerCase();

  const entries = [
    {
      match: /hakkasan night?club|hakkasan/,
      vibe: 'Big Vegas flex',
      note: 'Classic mega-club flex: flashy, loud, expensive-looking, and very Vegas. Great for spectacle, bad for easy conversation.',
    },
    {
      match: /marquee nightclub/,
      vibe: 'Big Vegas flex',
      note: 'Obvious status venue with wow factor, but not a low-key networking spot.',
    },
    {
      match: /chandelier bar/,
      vibe: 'Stylish Vegas',
      note: 'Visually memorable and very Vegas-chic: good for “cool photo” energy even if it is not very private.',
    },
    {
      match: /eiffel tower restaurant/,
      vibe: 'Fancy destination dinner',
      note: 'Wins on novelty and skyline views. More special than a random hotel bar, but also more curated and dinner-ish.',
    },
    {
      match: /f1 arcade|f1 grand prix plaza|swingers|topgolf|play playground|dream racing/,
      vibe: 'Activity venue',
      note: 'Good for memorable activity energy; worse for intimate conversation.',
    },
    {
      match: /cascata golf club/,
      vibe: 'Fancy off-site dinner',
      note: 'Feels more special than another casino restaurant: polished, off-site, and executive-dinner friendly, but less spontaneous.',
    },
    {
      match: /house of blues courtyard/,
      vibe: 'Outdoor concert-adjacent',
      note: 'Gets some of the House of Blues energy without feeling like another windowless hotel room. Better atmosphere than a generic reception.',
    },
    {
      match: /house of blues/,
      vibe: 'Lively and scalable',
      note: 'Recognizable live-music venue with enough personality to feel like an actual night out, not just conference overflow.',
    },
    {
      match: /1923 prohibition bar|clique|hazel lounge|bourbon steak|stripsteak|border grill|libertine social|kumi/,
      vibe: 'Nice hotel venue',
      note: 'Solid upscale hotel restaurant/lounge pick: convenient and respectable, though not especially distinctive.',
    },
    {
      match: /skyfall lounge/,
      vibe: 'Great views',
      note: 'Mostly about the views. Better backdrop than a generic bar, and more memorable for a happy hour.',
    },
    {
      match: /tailgate beach club/,
      vibe: 'Playful outdoor-ish',
      note: 'More playful and casual than a boardroom dinner, which makes it feel friendlier than the usual executive reception formula.',
    },
    {
      match: /industrial/,
      vibe: 'Off-strip scene',
      note: 'Off-strip warehouse/event-space vibe: cooler and more intentional than another casino bar, but less convenient.',
    },
    {
      match: /register to see address|register to unlock location/,
      vibe: 'Hidden / curated',
      note: 'Hidden address usually means exclusivity or a small private venue: cool if you are in, inaccessible if you are not.',
    },
  ];

  for (const entry of entries) {
    if (entry.match.test(lower)) return entry;
  }

  if (/mandalay bay|luxor|cosmopolitan|mgm grand|paris hotel|caesars palace/.test(lower)) {
    return {
      vibe: 'Convenient hotel spot',
      note: 'Convenient and easy to attend, but usually less distinctive than an off-property destination venue.',
    };
  }

  return {
    vibe: 'Unknown vibe',
    note: 'Not in the current venue-note map yet; check the original listing for the exact draw.',
  };
}

async function fetchLandingMeta(url) {
  if (!url) return { status: null, final_url: '', page_title: '', page_excerpt: '' };
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; GoogleNextPartiesIndexer/1.1; +https://github.com/fhoffa/google-cloud-next-2026-unofficial-scrape)',
      },
    });
    const text = await response.text();
    const title = extractTitle(text);
    const metaDescription = extractMetaDescription(text);
    const readableBody = extractReadableBodyText(text);
    const excerpt = sanitizeExcerpt([metaDescription, readableBody].filter(Boolean).join(' '));
    return {
      status: response.status,
      final_url: sanitizeUrl(response.url),
      page_title: title,
      page_excerpt: excerpt,
    };
  } catch (error) {
    return {
      status: null,
      final_url: url,
      page_title: '',
      page_excerpt: '',
      fetch_error: error.message,
    };
  }
}

async function enrichEvent(event) {
  const fetched = await fetchLandingMeta(event.url);
  const access = classifyAccess(event, fetched);
  const audience = classifyAudience(event, fetched);
  const food = describeFood(event, fetched);
  const venue = describeVenue(event.location);
  return {
    ...event,
    access,
    audience,
    food,
    venue,
    invite_excerpt: deriveInviteExcerpt(fetched.page_excerpt, event.title),
    link_meta: fetched,
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
      'user-agent': 'Mozilla/5.0 (compatible; GoogleNextPartiesIndexer/1.1; +https://github.com/fhoffa/google-cloud-next-2026-unofficial-scrape)',
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
