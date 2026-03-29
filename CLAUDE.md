# CLAUDE.md — Project Guide

Unofficial session explorer for Google Cloud Next 2026 (Las Vegas, April 21–24, 2026).
Scrapes the official session library, stores structured data, and serves a static single-page app.

## Architecture Overview

```
scrape_google_next.mjs   → sessions/by-day/YYYY-MM-DD.json   (per-bucket scrape output)
merge_buckets.mjs        → sessions/latest.json + snapshots/ (merged, complete dataset)
generate_changelog.mjs   → sessions/changelog.json           (diffs between complete scrapes)
index.html               → loads website/session-search.mjs  (SPA frontend)
```

## Key Commands

```bash
# Scrape all sessions (all days)
node scrape_google_next.mjs

# Scrape a single day bucket
BUCKET=2026-04-22 node scrape_google_next.mjs

# Merge all day buckets into latest.json + create snapshot
node merge_buckets.mjs

# Diff consecutive complete snapshots → sessions/changelog.json
node generate_changelog.mjs

# Run tests
npm test

# Serve locally (required to load sessions/latest.json via fetch)
npx serve .
```

## Session Data Format

Each session in `sessions/latest.json` has:
- `title`, `description`, `url` — identity fields
- `start_at`, `end_at` — ISO 8601 datetimes
- `date_text`, `start_time_text`, `end_time_text` — human-readable display values
- `room` — venue room name
- `topics` — string array of topic/audience/level tags
- `speakers` — array of `{ name, company }`

Session ID is extracted from the URL: `/session/3922022/` → `"3922022"`.

## Scraper Notes

- Polite delays: 1.2–2.6 s between requests (configurable via `MIN_DELAY_MS`, `MAX_DELAY_MS`)
- Raw HTML cached in `sessions/cache/` to avoid re-fetching; set `FORCE_REFRESH=1` to bypass
- `MAX_SESSIONS=N` limits to N sessions (useful for testing)
- Retries 4× with exponential backoff on network errors

## Changelog System

`generate_changelog.mjs` only diffs **complete** snapshots (those with a `buckets` field,
produced by `merge_buckets.mjs`). Per-bucket incremental scraper snapshots are skipped to
avoid false removals. The output `sessions/changelog.json` is loaded by the website's
Changelog tab and shows modified/removed/added sessions across scrape runs.

Typical workflow after updating:
```bash
node scrape_google_next.mjs   # or per-bucket scrapes
node merge_buckets.mjs        # creates complete snapshot
node generate_changelog.mjs   # updates changelog.json
```

## Frontend Structure

- `index.html` — full SPA shell (CSS, HTML, imports `session-search.mjs`)
- `website/session-search.mjs` — all frontend logic (filters, rendering, tabs, favorites)

Views: **Sessions** | **Top speakers** | **Top companies** | **Top words** | **Changelog**

URL state is preserved via query params (`?q=`, `?view=changelog`, etc.) for shareability.
Favorites persist in `localStorage` and can be shared via a link (`?view=favorites&sessionids=…`).

## Testing

```bash
npm test
```

- `tests/parser.test.mjs` — scraper HTML parsing
- `tests/website.test.mjs` — frontend filter/sort/render logic with mock DOM

Tests use the real `sessions/latest.json` dataset.

## File Sizes (approx)

| File | Size |
|------|------|
| `sessions/latest.json` | ~1.5 MB, 1037 sessions |
| `sessions/changelog.json` | small (grows over time) |
| `website/session-search.mjs` | ~700 lines |
| `index.html` | ~750 lines |
