# Google Cloud Next 2025 data

Captured session and speaker data from Google Cloud Next 2025 (April 9–11, Las Vegas).

## Files

| File | Description |
|---|---|
| `sessions_25_summary.json` | Summary JSON — mirrors `media/insights-summary.json` from 2026 |
| `sessions_25_speakers.json` | Per-session speaker/company data for 62 sessions |
| `parse_2025_speakers.mjs` | Re-parses `experimental/sessions_25_modal.part*.json` to produce the speakers file |
| `generate_2025_summary.mjs` | Reads card + speaker data and writes `sessions_25_summary.json` |

To regenerate:
```
node next2025/parse_2025_speakers.mjs
node next2025/generate_2025_summary.mjs
```

## Coverage

- **977 sessions** in the catalog (from session card listing)
- **62 sessions** with parsed speaker/company data (~6%), from modal extraction
- Speaker data is **partial** — company rankings are illustrative, not definitive

## Key numbers (2025 vs 2026)

| | 2025 | 2026 |
|---|---|---|
| Total sessions | 977 | 1,054 |
| AI share | 32% (product tag) | 89% (LLM-classified) |
| Largest format | Breakouts (488) | Breakouts (442) |
| Top product tag | AI (315) | — |

> The AI share difference is largely methodological: 2025 uses raw product tags
> (a session must explicitly carry the "AI" tag), while 2026 uses LLM classification
> that catches AI content regardless of tagging.

## experimental/

Raw captured data and process documentation.

| File | Description |
|---|---|
| `sessions_25.json` | 977 session cards scraped from the session library |
| `sessions_25_modal.part0-7.json` | Raw modal text from 62 found sessions (8 shards) |
| `load_all_year_sessions.mjs` | Playwright script used to capture `sessions_25.json` |
| `2025-company-extraction-handoff.md` | What was tried, what failed, and what worked |
