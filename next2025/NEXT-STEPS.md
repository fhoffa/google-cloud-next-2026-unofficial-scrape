# Next steps for 2025 insights

The hard part — extracting structured 2025 session data — is now mostly solved via Nuxt state.

## Current state

| What | Status |
|---|---|
| Structured 2025 sessions from Nuxt state | ✅ `next2025/sessions_25_full.json` |
| Session titles + summaries | ✅ |
| Speaker names + companies + roles + affiliations | ✅ for 776 sessions |
| Older modal-based partial extraction | legacy / fallback |
| LLM classification | not run yet |
| 2025 insights page / summary aligned to 2026 pipeline | next step |

## Recommended path

### Step 1 — treat `sessions_25_full.json` as the 2025 base dataset

Regenerate if needed with:

```bash
node next2025/extract_2025_from_nuxt_state.mjs
```

This extraction reads from:
- `window.__NUXT__.state.sessions`
- `window.__NUXT__.state.speakers`

and avoids the older modal-text scraping path.

### Step 2 — classify the 2025 sessions like 2026

Run the same LLM classification used for the 2026 pipeline:

```bash
python3 scripts/classify_sessions_llm.py \
  --input next2025/sessions_25_full.json \
  --output next2025/sessions_25_classified.json \
  --concurrency 5
```

Goal: assign the same fields used in 2026, including:
- `ai_focus`
- `theme`
- `audience`

### Step 3 — generate 2025 insights outputs

Use the existing generator with the 2025 classified input:

```bash
node scripts/generate_insights.mjs \
  --input next2025/sessions_25_classified.json \
  --output-html next2025/insights-2025.html \
  --output-summary next2025/insights-2025-summary.json
```

## Validation checks

These sessions should remain correct in the extracted dataset:

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

## Notes

- The older modal-based files under `next2025/experimental/` remain useful as audit/debug artifacts, but they are no longer the preferred extraction source.
- If needed, a later cleanup pass can remove obsolete helper scripts and temporary `.tmp-*` files once the Nuxt-state extraction path is committed and stable.
