# How to build a full 2025 insights page

This document describes what's needed to take the current partial 2025 dataset
to a complete `insights.html` — with all sessions, speakers, descriptions,
themes, and audiences — matching what the 2026 pipeline produces.

## Current state

| What | Status |
|---|---|
| 977 session codes + titles + product tags | ✅ `experimental/sessions_25.json` |
| 62 sessions with speakers + descriptions | ✅ `sessions_25_speakers.json` |
| 915 sessions missing speaker/description data | ❌ modal scrape incomplete |
| Theme / audience classification | ❌ not run |

---

## Step 1 — Re-scrape all 977 session modals

Requires: Node.js + Playwright (`npm install playwright`)

The 2025 session library is still live at:
`https://cloud.withgoogle.com/next/25/session-library`

Each session modal contains title, description, and speaker blocks (name, role,
company, affiliation). The original scrape only captured 62 sessions because
many modals didn't render within the 4-second timeout.

**What to do:**

Write a scraper based on `experimental/extract_2025_modal_structured_shard.mjs`
(which is now deleted — use `parse_2025_speakers.mjs` as the fixed parser logic)
with these improvements:
- Increase per-session wait to **8–10 seconds**
- Try `page.waitForSelector('[role="dialog"]', { timeout: 10000 })` instead of a
  fixed sleep
- Retry once on empty result before marking `found: false`
- Checkpoint after every session (already in original design)

Run across all 977 codes from `experimental/sessions_25.json`.

**Target output** — one file `sessions_25_full.json`, each record shaped like
`sessions/classified_sessions.json` in the 2026 repo:

```json
{
  "code": "BRK1-096",
  "title": "A conversation with Anthropic: How AI is shaping the future for startups",
  "description": "Join Matt Bell, VP of Product Research at Anthropic...",
  "session_category": "Breakouts",
  "topics": ["AI", "GEMINI", "VERTEX AI"],
  "speakers": [
    { "name": "Matt Bell", "company": "Anthropic" },
    { "name": "Francis deSouza", "company": "Google Cloud" }
  ]
}
```

**Correctness checks** (same as `parse_2025_speakers.mjs` validation):
- `BRK1-096` must have Matt Bell → Anthropic AND Francis deSouza → Google Cloud
- `SOL303` must have Chandu Bhuman → Virgin Media O2
- `IND-113`, `AIN-106`, `DAI-101` must have `speakers: []` (no fake rows)

---

## Step 2 — LLM classification

Once all sessions have `title` + `description`, classify each one with Claude
using the same prompt the 2026 pipeline uses.

Find the prompt in `scripts/generate_insights.mjs` (search for `buildLlmPrompt`
or the classification call). Apply it to the 2025 session list to assign:

| Field | Values |
|---|---|
| `ai_focus` | `"AI"` / `"Not AI"` |
| `theme` | `"Security"` / `"App dev"` / `"Business"` / `"Data"` / `"Infra"` / `"Applied AI"` |
| `audience` | `"Leaders"` / `"Developers"` / `"Sec pros"` / `"Infra/Ops"` / `"Data pros"` |

Store the result in the `llm` field of each session record, matching 2026:

```json
"llm": {
  "ai_focus": "AI",
  "theme": "Security",
  "audience": "Sec pros",
  "reasoning": "..."
}
```

---

## Step 3 — Adapt generate_insights.mjs

With a classified `sessions_25_full.json` in hand, the 2026 generator needs
only minor changes:

1. Point `SOURCE_FILE` at `next2025/sessions_25_full.json`
2. Update the lede and observation copy in `buildSummary()` to reflect 2025 numbers
3. Update year/branding references in `templates/insights.template.html`
4. Run: `node scripts/generate_insights.mjs`

The Sankey diagram, word clouds, company rankings, and theme/audience charts
will all work without further changes — they read from the classified session
data generically.

---

## Reference numbers (2025 vs 2026)

| | 2025 | 2026 |
|---|---|---|
| Total sessions | 977 | 1,054 |
| AI share (product tag) | 32% | — |
| AI share (LLM-classified) | unknown | 89% |
| Largest format | Breakouts (488) | Breakouts (442) |
| Top non-Google company (partial) | several tied at 2 | Palo Alto Networks (16) |

The AI share difference between years is partly methodological: 2025's 32%
uses raw product tags (explicit "AI" tag only), while 2026's 89% uses LLM
classification that catches AI content regardless of tagging. Expect the
LLM-classified 2025 number to be significantly higher than 32%.
