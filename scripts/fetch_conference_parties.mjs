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
  return match ? decodeHtmlEntities(match[1]) : '';
}

function normalizeDayHeading(text = '') {
  return text.replace(/\s+-\s+/g, ' - ').replace(/\s{2,}/g, ' ').trim();
}

function extractTitle(html = '') {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : '';
}

function compact(text = '') {
  return text.replace(/\s+/g, ' ').trim();
}

function classifyAccess(event, fetched = {}) {
  const raw = [event.title, event.location, fetched.page_title, fetched.page_excerpt, fetched.final_url]
    .filter(Boolean)
    .join(' \n ')
    .toLowerCase();

  if (/at capacity|sold out|waitlist only|fully booked|no longer accepting/i.test(raw)) {
    return {
      label: 'Closed / full',
      rationale: 'The listing or landing page suggests the event is already full or no longer openly taking registrations.',
    };
  }

  const exclusiveSignals = [
    /\bvip\b/,
    /executive/,
    /founder/,
    /ciso/,
    /leaders? /,
    /roundtable/,
    /dinner/,
    /request an invite/,
    /request invite/,
    /register to see address/,
    /register to unlock location/,
    /approval/,
    /apply to join/,
  ];

  const inviteSignals = [
    /request an invite/,
    /request invite/,
    /invite only/,
    /apply/,
    /approval/,
    /register to see address/,
    /register to unlock location/,
    /private address/,
  ];

  const openSignals = [
    /eventbrite/,
    /ticket/,
    /register now/,
    /save your spot/,
    /join us/,
    /register here/,
    /luma\.com/,
  ];

  if (exclusiveSignals.some((re) => re.test(raw))) {
    const isSuperExclusive = /\bvip\b|executive|founder|ciso|roundtable|register to see address|register to unlock location/.test(raw);
    return {
      label: isSuperExclusive ? 'Curated / exclusive' : 'Request / invite',
      rationale: isSuperExclusive
        ? 'Language like VIP, executive, founder, private-address, or roundtable suggests a curated guest list rather than a broad public RSVP.'
        : 'The page uses invite-style language, so this looks more curated than fully open registration.',
    };
  }

  if (openSignals.some((re) => re.test(raw))) {
    return {
      label: 'Open registration',
      rationale: 'The RSVP flow looks like a normal public registration page rather than a screened guest-list flow.',
    };
  }

  if (fetched.status === 403) {
    return {
      label: 'Probably curated',
      rationale: 'The landing page is behind some gating/anti-bot layer, which often correlates with a more controlled RSVP flow, but this is not definitive.',
    };
  }

  return {
    label: 'Unclear',
    rationale: 'Not enough signal from the listing and landing page to confidently classify the RSVP flow.',
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
    const excerpt = compact(stripTags(text)).slice(0, 2500);
    return {
      status: response.status,
      final_url: response.url,
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
  const venue = describeVenue(event.location);
  return {
    ...event,
    access,
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
