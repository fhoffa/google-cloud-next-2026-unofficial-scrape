# Google Cloud Next 2026 unofficial scrape

Unofficial scraper/exporter for the Google Cloud Next 2026 session library.

## What it does

It crawls the paginated session library, fetches individual session pages, and exports:

- `sessions/sessions.json`
- `sessions/sessions.yaml`

## Fields

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

## Notes

- This is unofficial and based on publicly available event pages.
- The scraper is intentionally conservative: caching, retries, backoff, and one-at-a-time requests.
- Some session types expose less metadata than others.
