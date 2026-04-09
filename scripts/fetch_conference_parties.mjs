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
    .slice(0, 1000);
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
      rationale: 'The listing or landing page suggests the event is already full or no longer openly taking registrations.',
    };
  }

  if (/\bvip\b|executive|founder|ciso|roundtable|register to see address|register to unlock location|private address/.test(raw)) {
    return {
      openness: 'Curated guest list',
      exclusivity: 'High',
      rationale: 'Language like VIP, executive, founder, private-address, or roundtable suggests a deliberately screened guest list.',
    };
  }

  if (/request an invite|request invite|invite only|apply|approval/.test(raw)) {
    return {
      openness: 'Request invite',
      exclusivity: 'Medium',
      rationale: 'The page uses invite-style language, so this is not fully open even if many people may still get approved.',
    };
  }

  if (/eventbrite|ticket|register now|save your spot|register here/.test(raw)) {
    return {
      openness: 'Open RSVP',
      exclusivity: 'Low',
      rationale: 'The RSVP flow looks closer to normal public registration than a screened guest-list flow.',
    };
  }

  if (/luma\.com/.test(raw)) {
    return {
      openness: 'Likely open RSVP',
      exclusivity: 'Low-medium',
      rationale: 'Luma links are often fairly open, though approval can still happen case by case.',
    };
  }

  if (fetched.status === 403) {
    return {
      openness: 'Probably curated',
      exclusivity: 'Medium-high',
      rationale: 'The landing page is behind some gating/anti-bot layer, which often correlates with a more controlled RSVP flow, but this is not definitive.',
    };
  }

  return {
    openness: 'Unclear',
    exclusivity: 'Unclear',
    rationale: 'Not enough signal from the listing and landing page to confidently classify the RSVP flow.',
  };
}

function classifyAudience(event, fetched = {}) {
  const raw = [event.title, event.sponsor, event.location, fetched.page_title, fetched.page_excerpt]
    .filter(Boolean)
    .join(' \n ')
    .toLowerCase();

  const rules = [
    {
      match: /\bciso\b|security pros|security leader|cybersecurity leader|secops|threat intel|wiz|crowdstrike|fortinet|sentinelone|netskope|zscaler|menlo security|xm cyber|infoblox/,
      label: 'Security leaders / practitioners',
      rationale: 'Security-specific language and hosts suggest this is aimed at security buyers, leaders, or operators rather than a general conference crowd.',
    },
    {
      match: /women in tech|innovathers|veterans|career transition|community celebration|meetup/,
      label: 'Community / affinity group',
      rationale: 'The event framing looks community-oriented rather than purely executive or sales-led.',
    },
    {
      match: /developer|devops|kube|platform engineering|mcp|github|baseten|chronosphere|dagster|langchain|mongodb|confluent|redis|clickhouse|neo4j|yugabyte/,
      label: 'Technical builders',
      rationale: 'The wording and hosts point toward developers, platform engineers, or hands-on technical attendees.',
    },
    {
      match: /finops|finout|nops|prosperops|cloud cost|doit/,
      label: 'FinOps / cloud economics',
      rationale: 'The event language is centered on cloud spend, optimization, or financial operations.',
    },
    {
      match: /founder|saas startup|startup|venture|executive|vip|leader|leaders|roundtable|dinner|private|exclusive/,
      label: 'Executives / curated buyers',
      rationale: 'The wording suggests an executive-leaning or curated-business audience more than a broad drop-in crowd.',
    },
    {
      match: /happy hour|house party|after party|welcome party|reception|drinks|social|sushi social/,
      label: 'Broad networking crowd',
      rationale: 'This reads like a general networking/social event rather than a tightly filtered niche audience.',
    },
  ];

  for (const rule of rules) {
    if (rule.match.test(raw)) return { label: rule.label, rationale: rule.rationale };
  }

  return {
    label: 'General conference crowd',
    rationale: 'Nothing strongly signals a narrower audience, so this looks like a general conference-side networking event.',
  };
}

function describeFood(event, fetched = {}) {
  const raw = [event.title, event.location, fetched.page_title, fetched.page_excerpt]
    .filter(Boolean)
    .join(' \n ');
  const lower = compact(raw).toLowerCase();

  const explicitEntries = [
    {
      match: /\bdinner\b|wine & dine|sunset dinner|executive dinner|roundtable dinner|steakhouse/,
      label: 'Dinner likely',
      note: 'The invite language explicitly suggests dinner, so this is more likely to include a real meal than a typical standing reception.'
    },
    {
      match: /breakfast/,
      label: 'Breakfast likely',
      note: 'The event is explicitly framed as breakfast, so expect morning food rather than just coffee.'
    },
    {
      match: /lunch|lunch & learn|cto lunch/,
      label: 'Lunch likely',
      note: 'The invite explicitly says lunch, which is a much stronger signal than the venue name.'
    },
    {
      match: /sushi/,
      label: 'Sushi / Japanese food likely',
      note: 'The invite itself mentions sushi, which is stronger evidence than the venue alone.'
    },
    {
      match: /aperitifs|martinis|cocktail|cocktail reception|happy hour|drinks|after party|house party|reception/,
      label: 'Drinks-first, food secondary',
      note: 'The wording sounds drinks-led, so food may be passed appetizers or light bites rather than a dependable meal.'
    },
  ];

  for (const entry of explicitEntries) {
    if (entry.match.test(lower)) return entry;
  }

  const venueFallbacks = [
    {
      match: /kumi/,
      label: 'Japanese / sushi likely',
      note: 'Venue suggests Japanese food, but this still does not guarantee a full meal; many conference parties there will be more reception-style than seated dinner.'
    },
    {
      match: /bourbon steak|stripsteak|tender steakhouse/,
      label: 'Dinner maybe, but not guaranteed',
      note: 'Steakhouse venue improves the odds of substantial food, but conference events there can still be standing receptions or appetizer-heavy formats unless the invite explicitly says dinner.'
    },
    {
      match: /border grill/,
      label: 'Mexican / shared plates likely',
      note: 'Venue suggests Mexican / shared-plate food, but likely still in event format rather than a guaranteed sit-down meal.'
    },
    {
      match: /libertine social/,
      label: 'Gastropub / cocktail bites likely',
      note: 'Expect upscale bar food, cocktails, and passed bites more than a formal seated meal.'
    },
    {
      match: /house of blues/,
      label: 'Bar food / comfort food maybe',
      note: 'House of Blues points toward drinks plus comfort-food territory, but the actual format may still skew reception-style.'
    },
    {
      match: /hakkasan|marquee nightclub|chandelier bar|clique|hazel lounge|skyfall lounge/,
      label: 'Drinks-first, food unclear',
      note: 'This reads more like cocktails and nightlife than a reliable dinner plan. Eat beforehand unless the invite explicitly promises food.'
    },
    {
      match: /swingers|topgolf|play playground|f1 arcade|f1 grand prix plaza|tailgate beach club/,
      label: 'Snacks / party food likely',
      note: 'Activity venues usually mean drinks plus snackable event food, not a memorable meal.'
    },
    {
      match: /eiffel tower restaurant|cascata golf club/,
      label: 'Dinner maybe, stronger odds',
      note: 'These venues make a fuller meal more plausible than a random happy hour, but the invite wording still matters more than the location name.'
    },
    {
      match: /1923 prohibition bar/,
      label: 'Cocktails first, light bites maybe',
      note: 'Speakeasy-style venues usually lead with drinks and atmosphere; food is often secondary unless the invite says dinner.'
    },
    {
      match: /register to see address|register to unlock location/,
      label: 'Food unknown until approved',
      note: 'Private-address events are opaque by design, so you should not assume a meal standard from the listing alone.'
    },
  ];

  for (const entry of venueFallbacks) {
    if (entry.match.test(lower)) return entry;
  }

  return {
    label: 'Food unclear',
    note: 'This is a best-effort guess from event wording plus venue context; if the invite does not promise a meal, do not assume one.'
  };
}

function describeVenue(location = '') {
  const raw = compact(location);
  const lower = raw.toLowerCase();

  const entries = [
    {
      match: /hakkasan night?club|hakkasan/,
      vibe: 'Big Vegas flex',
      note: 'Hakkasan is a classic mega-club flex: flashy, loud, expensive-looking, and very Vegas. Cool if you want spectacle; bad if you want easy conversation.',
    },
    {
      match: /marquee nightclub/,
      vibe: 'Big Vegas flex',
      note: 'Marquee is another obvious status venue: strong wow factor, but not the place for low-key networking.',
    },
    {
      match: /chandelier bar/,
      vibe: 'Stylish Vegas',
      note: 'The Chandelier Bar is visually memorable and very Vegas-chic, which makes it a good “cool photo” venue even if it is not super private.',
    },
    {
      match: /eiffel tower restaurant/,
      vibe: 'Fancy destination dinner',
      note: 'The Eiffel Tower Restaurant wins on novelty and skyline views. Feels more special than a random hotel bar, but it is also a more curated dinner-style pick.',
    },
    {
      match: /f1 arcade|f1 grand prix plaza|swingers|topgolf|play playground|dream racing/,
      vibe: 'Activity venue',
      note: 'Activity venues are good because they give people something to do and remember. The tradeoff is less intimate conversation and more event-production energy.',
    },
    {
      match: /cascata golf club/,
      vibe: 'Fancy off-site dinner',
      note: 'Cascata feels more special than another casino restaurant because it is a destination-style off-site club setting. Nice if you want a polished executive dinner, less spontaneous because of the travel overhead.',
    },
    {
      match: /house of blues courtyard/,
      vibe: 'Outdoor concert-adjacent',
      note: 'The courtyard gets some of the House of Blues energy without being just another windowless hotel room. Better atmosphere than a generic reception, though still very conference-adjacent.',
    },
    {
      match: /house of blues/,
      vibe: 'Lively and scalable',
      note: 'House of Blues is a recognizable live-music venue with enough personality to feel like an actual night out, not just conference overflow.',
    },
    {
      match: /1923 prohibition bar|clique|hazel lounge|bourbon steak|stripsteak|border grill|libertine social|kumi/,
      vibe: 'Nice hotel venue',
      note: 'This is a solid upscale hotel restaurant/lounge pick: convenient and respectable, though not as distinctive as the more destination-style Vegas venues.',
    },
    {
      match: /skyfall lounge/,
      vibe: 'Great views',
      note: 'Skyfall is cool mostly for the views. Better backdrop than a generic bar, and more memorable for a happy hour.',
    },
    {
      match: /tailgate beach club/,
      vibe: 'Playful outdoor-ish',
      note: 'Tailgate Beach Club is more playful and casual than a boardroom dinner, which can make it feel friendlier than the usual executive reception formula.',
    },
    {
      match: /industrial/,
      vibe: 'Off-strip scene',
      note: 'An off-strip warehouse/event-space vibe can feel cooler and more intentional than another casino bar, but it is less convenient for casual drop-ins.',
    },
    {
      match: /register to see address|register to unlock location/,
      vibe: 'Hidden / curated',
      note: 'A hidden address usually signals either exclusivity or a small private venue. That can feel cool if you are in, but inaccessible if you are not.',
    },
  ];

  for (const entry of entries) {
    if (entry.match.test(lower)) return entry;
  }

  if (/mandalay bay|luxor|cosmopolitan|mgm grand|paris hotel|caesars palace/.test(lower)) {
    return {
      vibe: 'Convenient hotel spot',
      note: 'Being inside or right next to a conference hotel is convenient and easy to attend, but usually less distinctive than an off-property destination venue.',
    };
  }

  return {
    vibe: 'Unknown vibe',
    note: 'Venue is not in the current note map yet; check the original listing for the exact draw.',
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
    const excerpt = sanitizeExcerpt(metaDescription || stripTags(text));
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
