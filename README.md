# Google Cloud Next 2026 unofficial scrape

Unofficial scraper/exporter for the Google Cloud Next 2026 session library.

## Source

- Google Cloud Next 2026 session library:
  <https://www.googlecloudevents.com/next-vegas/session-library>

This project is unofficial and not affiliated with Google.

## What it does

It crawls the paginated session library, fetches individual session pages, and writes:

- current canonical exports:
  - `sessions/latest.json`
  - `sessions/latest.yaml`
- timestamped snapshots:
  - `sessions/snapshots/<scraped_at>.json`
  - `sessions/snapshots/<scraped_at>.yaml`
- local HTML cache:
  - `sessions/cache/`

## Why snapshots exist

Snapshots make it possible to compare changes over time, including:

- newly added sessions
- removed sessions
- title/description changes
- schedule or room changes
- speaker changes

## Session fields

Each session record includes:

- `title`
- `description`
- `url`
- `start_at`
- `end_at`
- `date_time`
- `date_text`
- `start_time_text`
- `end_time_text`
- `room`
- `topics`
- `speakers`

Top-level metadata includes:

- `scraped_at`
- `source_url`
- `library_pages`
- `count`

## Usage

```bash
npm run scrape
```

Useful options:

```bash
MAX_SESSIONS=10 npm run scrape
FORCE_REFRESH=1 npm run scrape
MIN_DELAY_MS=2000 MAX_DELAY_MS=5000 npm run scrape
```

Run tests:

```bash
npm test
```

## Notes

- This scraper is intentionally conservative: caching, retries, backoff, and one-at-a-time requests.
- Some session types expose less metadata than others.
- Parser behavior is covered by regression tests in `tests/`.
