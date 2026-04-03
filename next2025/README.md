# Google Cloud Next 2025 data

Structured extraction work for Google Cloud Next 2025 (April 9–11, Las Vegas).

## Current best source

The main 2025 extraction path is now the client-side Nuxt state on the live session-library page:

- `window.__NUXT__.state.sessions`
- `window.__NUXT__.state.speakers`

This is better than the older modal-text scrape because it already exposes structured session and speaker records.

## Main files

| File | Description |
|---|---|
| `sessions_25_full.json` | Full structured 2025 session export from Nuxt state |
| `extract_2025_from_nuxt_state.mjs` | Extracts sessions + speakers from `window.__NUXT__.state` |
| `sessions_25_classified.json` | 2025 sessions shaped similarly to `sessions/classified_sessions.json` |
| `build_2025_classified_sessions.mjs` | Converts the Nuxt-state export into 2026-like session JSON |
| `sessions_25_summary.json` | Summary JSON for 2025 |
| `generate_2025_summary.mjs` | Reads 2025 session data and writes `sessions_25_summary.json` |
| `parse_2025_speakers.mjs` | Legacy parser for older modal shard captures |

To regenerate the full dataset:

```bash
node next2025/extract_2025_from_nuxt_state.mjs
```

To build the 2026-like sessions JSON:

```bash
node next2025/build_2025_classified_sessions.mjs
```

To regenerate the summary:

```bash
node next2025/generate_2025_summary.mjs
```

## Current coverage

- **1109 sessions** in Nuxt state
- **776 sessions with speakers**
- `summary` is present for all extracted sessions
- speaker `role` / `company` / `affiliation` are resolved from `state.speakers.speakersById`

## Validation examples

These now resolve correctly from the state-backed extraction:

- `BRK1-096`
  - Matt Bell → Anthropic
  - Francis deSouza → Google Cloud
- `SOL303`
  - Chandu Bhuman → Virgin Media 02
  - Pedro Esteves → Google Cloud
  - Suda Srinivasan → Google Cloud
- `CT2-28`
  - Ajay Singh → Databricks
  - Vivek Menon → Digital Turbine
- `IND-113`
  - `speakers: []`

## experimental/

Contains earlier exploration and debugging artifacts, including:
- modal shard captures
- handoff notes
- network-inspection helpers
- older Playwright experiments
