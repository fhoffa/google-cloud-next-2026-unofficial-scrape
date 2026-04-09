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

  const totalEvents = days.reduce((sum, day) => sum + day.events.length, 0);
  return {
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
}

async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; GoogleNextPartiesIndexer/1.0; +https://github.com/fhoffa/google-cloud-next-2026-unofficial-scrape)',
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${SOURCE_URL}: ${response.status}`);
  const html = await response.text();
  const parsed = parseConferenceParties(html);
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(parsed, null, 2) + '\n');
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`Days: ${parsed.total_days}`);
  console.log(`Events: ${parsed.total_events}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
