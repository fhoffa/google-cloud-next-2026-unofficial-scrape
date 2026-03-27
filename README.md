# Google Cloud Next 2026 unofficial scrape

Unofficial scraper/exporter for the Google Cloud Next 2026 session library.

## What it does

It crawls the paginated session library, fetches individual session pages, and exports:

- `sessions/latest.json` / `sessions/latest.yaml` — full dataset, latest run
- `sessions/by-day/YYYY-MM-DD.json` / `.yaml` — sessions partitioned by date
- `sessions/by-day/unscheduled.json` / `.yaml` — sessions with no date yet
- `sessions/snapshots/` — timestamped archive of every run

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
BUCKET="Wednesday, April 22, 2026" npm run scrape   # scrape one day only
npm run merge                                        # merge by-day/ files into latest.*
```

## Notes

- This is unofficial and based on publicly available event pages.
- The scraper is intentionally conservative: caching, retries, backoff, and one-at-a-time requests.
- Some session types expose less metadata than others.

## Prior art & legal context

Community session trackers for cloud events have a complicated history. In October 2023, AWS sent cease & desist notices to third-party re:Invent session tracker developers — a situation that permanently destroyed one developer's work before AWS reversed course the same day.

See [PRIOR-ART.md](./PRIOR-ART.md) for the full story.
