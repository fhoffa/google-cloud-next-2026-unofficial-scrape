# Google Cloud Next 2026 unofficial scrape

Unofficial scraper/exporter for the Google Cloud Next 2026 session library — plus a fast browseable website for actually exploring the sessions.

## What this project does

This repo now has **two useful layers**:

1. **Scraper/exporter**
   - crawls the paginated session library
   - fetches individual session pages
   - exports structured JSON/YAML snapshots

2. **Website UI**
   - lets you browse, filter, favorite, share, and explore sessions in a much nicer way than the source site

## Website features

## Preview

![Google Cloud Next 2026 Session Search preview](./media/reddit-preview.jpg)


Current site features include:

- full-text session search
- speaker search
- day filtering
- topic filtering
- sort by time or title
- favorites stored locally in the browser
- compact shareable favorites links via `sessionids=...`
- `Copy link to my favorites`
- clickable speaker filters from session cards
- clickable company filters from session cards
- clickable topic tags from session cards
- quick-clear `×` buttons for session and speaker filters
- active filter pills with per-filter clear
- time filtering with a visual **start/end range slider** (15-minute increments)
- tabs for:
  - **Sessions**
  - **Top speakers**
  - **Top words**
- Top speakers view with:
  - speakers appearing in multiple sessions
  - clickable speaker names to pivot back into the main sessions view
  - clickable session links to open the Google event page
- Top words view with:
  - more non-stop-word terms
  - clickable words to pivot back into the main sessions view
- expandable long descriptions
- unscheduled sessions sorted after scheduled ones
- visible footer version stamp for deploy/debug checks
- calendar-style favicon

## Scraper outputs

The scraper exports:

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

### Scrape data

```bash
npm run scrape
```

Useful options:

```bash
MAX_SESSIONS=10 npm run scrape
FORCE_REFRESH=1 npm run scrape
MIN_DELAY_MS=2000 MAX_DELAY_MS=5000 npm run scrape
BUCKET=2026-04-22 npm run scrape                     # scrape one day only
npm run merge                                        # merge by-day/ files into latest.*
```

### Preview the website locally

Use any simple static server from the repo root, for example:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Notes

- This is unofficial and based on publicly available event pages.
- The scraper is intentionally conservative: caching, retries, backoff, and one-at-a-time requests.
- Some session types expose less metadata than others.
- Made by [Felipe Hoffa](https://www.linkedin.com/in/hoffa/) while walking, using OpenClaw ([my setup](https://www.linkedin.com/posts/hoffa_every-single-technology-company-now-has-activity-7439822998578294784-gyWA)), Claude Code, and Codex.

## Prior art & legal context

Community session trackers for cloud events have a complicated history. In October 2023, AWS sent cease & desist notices to third-party re:Invent session tracker developers — a situation that permanently destroyed one developer's work before AWS reversed course the same day.

See [PRIOR-ART.md](./PRIOR-ART.md) for the full story.
