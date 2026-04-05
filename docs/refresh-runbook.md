# Refresh runbook: live sessions → classifications → published outputs

Use this when asked to do a **full refresh** of the Google Cloud Next dataset and published artifacts.

## Goal

Perform one end-to-end refresh that:
1. fetches the latest live sessions
2. keeps classifications aligned to the current live snapshot
3. rebuilds changelog / insights / Sankey
4. verifies tests before opening a PR

## Two modes

### 1) Fast detection pass
Use this when the goal is just to detect whether the source changed enough to justify a full rebuild.

Library-page data is sufficient for:
- adds / removals
- timing / room / status drift
- availability / fullness monitoring

Do **not** assume this is enough for publication-quality insights.

### 2) Full publication pass
Use this when the goal is to refresh published artifacts or prepare a PR.

## Full publication pass: exact workflow

### Step 0 — start clean
- branch from current `main`
- make sure local working tree is clean before starting

### Step 1 — scrape latest live sessions
```bash
npm run scrape
```

This updates:
- `sessions/latest.json`
- `sessions/latest.yaml`
- `sessions/snapshots/<timestamp>.json`
- `sessions/snapshots/<timestamp>.yaml`

### Step 2 — compare against previous live snapshot
Run:

```bash
npm run refresh:verify
```

This is the canonical safety gate for a real refresh. It deterministically binds the run to:
- `sessions/latest.json`
- the snapshot whose `scraped_at` matches that latest payload
- the immediately previous live snapshot

It writes `media/refresh-sanity.json` and reports, at minimum:
- previous live count
- new live count
- added URLs
- removed URLs
- concrete `remaining_capacity` deltas
- concrete `registrant_count` deltas

Stop and investigate if it reports an error. Review warnings before publishing; warnings are where hidden availability drift shows up even if no session crossed the full/not-full boundary.

### Step 3 — rebuild `classified_sessions.json` from the current live dataset only
**Invariant:** `sessions/classified_sessions.json` must represent the current live `sessions/latest.json`, not an archive of all historically seen sessions.

Rules:
- keep classifications for URLs still present in `sessions/latest.json`
- classify newly added live sessions
- drop classified entries for URLs no longer present in the current live snapshot

### Step 4 — classify newly added sessions carefully
Preferred order:
1. reuse existing classification by exact URL when still live
2. decide `ai_focus` conservatively from explicit AI keyword evidence first
3. use direct human/agent judgment on newly added sessions
4. use embedding neighborhoods to help with transfer / audit work, not automatic truth
5. only use rule-based fallback when higher-quality classification is unavailable

For `ai_focus`, use a keyword-first gate before embeddings:
- check explicit AI terms in title / description / topics first
- use regex / word-boundary matching so terms like `AI-driven`, `AI-powered`, and `AI-first` are counted correctly
- if explicit AI keyword evidence is absent, do not let embeddings alone aggressively pull sessions into `AI`

Recommended explicit AI terms include:
- `AI`
- `Gemini`
- `agent` / `agents` / `agentic`
- `LLM`
- `ML` / `machine learning`
- `GenAI` / `generative`
- `Vertex`
- `prompt`
- `RAG`
- `inference`
- `model` / `models`
- `foundation`
- `AgentSpace`
- `NotebookLM`
- `DeepMind`
- `TensorFlow`
- `Gemma`
- `MCP`

When adapting this pipeline to a different but related conference dataset or event source:
- parameterize conference-specific branding/copy early (page title, OG text, lede assumptions)
- keep reusable publishing code generic and keep source-specific extraction/probe code separate
- convert the new source into the repo's canonical session shape as early as possible so downstream classification / insights / Sankey steps stay unchanged

When debugging extraction for a new source:
- inspect exposed client-side state / hydration payloads early before investing heavily in brittle modal scraping or low-level protocol decoding
- if structured client state already contains the session + speaker corpus, prefer that over UI scraping

If using rule-based fallback, manually review suspicious cases before rebuilding published artifacts.

Safe fallback command:

```bash
python3 scripts/classify_new_sessions_rules.py
```

This now uses `sessions/latest.json` by default and rewrites `sessions/classified_sessions.json` for the current live dataset only. It must not be used to merge an older snapshot into `latest.json`.

Common failure modes to watch for:
- overuse of `audience: General`
- business/customer-story sessions mislabeled as `Security`
- Gemini CLI sessions skewing too infra/security-heavy on audience
- database/platform sessions mislabeled as `App dev`
- embedding-transfer classification overcalling `ai_focus: AI` on a new dataset because the nearest labeled source conference was more AI-saturated

### Step 5 — rebuild published artifacts
```bash
node scripts/generate_changelog.mjs
node scripts/generate_insights.mjs
/root/.openclaw/workspace/.venv/bin/python scripts/make_sankey.py --publish
node --test tests/*.test.mjs
```

`generate_changelog.mjs` now fails fast if `sessions/latest.json` does not match the newest snapshot pair on disk, so the latest refresh cannot silently publish against a stale comparison window.

Important:
- the default Sankey output path is a temp file (`tmp/gcp-next-sankey-not-ai-maxi.png`)
- for any real refresh / publish workflow, use `--publish`
- that writes the dated repo artifact under `media/` and updates:
  - `media/sankey-index.json`
  - `media/sankey-click-map.json`

### Step 6 — sanity checks before PR
Verify at least these:
- `sessions/latest.json` count == `sessions/classified_sessions.json` count
- no missing `llm` classifications for current live sessions
- `insights.html` top-level totals match the current live count
- fullness section still uses percentage-based category reporting
- `media/refresh-sanity.json` points at the expected previous/current live snapshot pair
- changelog latest comparison reflects that same refresh window
- no unreplaced template placeholders in `insights.html` — grep for `__` to confirm:
  ```bash
  grep -c '__[A-Z_]\+__' insights.html   # must return 0
  ```
  Root cause if this fires: `generate_insights.mjs` uses `.replaceAll()` for template
  substitution — if you ever see `.replace()` there, it will silently miss duplicate
  placeholder occurrences (e.g. the same key in both a meta tag and a JS variable).

### Step 7 — open PR
PR description should mention:
- live dataset refresh
- number of added / removed sessions
- whether new sessions were manually reviewed
- whether rule-based fallback was used anywhere
- that `classified_sessions.json` was trimmed to current live sessions only

## Quick checklist

- [ ] clean branch from `main`
- [ ] run `npm run scrape`
- [ ] run `npm run refresh:verify`
- [ ] rebuild `classified_sessions.json` for current live only
- [ ] manually review/classify new sessions
- [ ] rebuild changelog
- [ ] rebuild insights
- [ ] rebuild Sankey
- [ ] run tests
- [ ] verify live/classified counts match
- [ ] grep insights.html for unreplaced `__PLACEHOLDER__` tokens (must be 0)
- [ ] open PR
