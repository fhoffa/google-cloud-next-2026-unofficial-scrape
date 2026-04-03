# Google Cloud Next 2025 company extraction handoff

## Goal

Build a **fair-enough comparison between Google Cloud Next 2025 and 2026 company presence**, especially:
- which non-Google companies were visibly presenting
- which companies were most prominent
- whether 2026 shifted toward different kinds of partners/vendors

More specifically:
- **2026** company counts should come from the same source the insights page uses:
  - `sessions/classified_sessions.json`
  - `session.speakers[].company`
- **2025** should ideally be extracted from real session detail speaker/company data too, not just title mentions

---

## Current hypothesis / possible better direction

Maybe the right move is to **scrape 2025 more like the 2026 session pipeline**:
- collect the full session set
- extract/store a proper per-session JSON object
- preserve rich speaker/company/session metadata in the saved dataset
- then run comparisons from structured saved data rather than repeatedly reparsing UI text

In other words: instead of treating 2025 as a one-off browser scrape, consider building a lightweight `sessions/`-style dataset for 2025, even if there is no website build step.

This may be more work up front, but it could be less wasteful than repeatedly reparsing modal text.

---

## What didn’t work

### 1) Long scrape before validating extraction shape
Repeated expensive crawls were done before proving that the saved output was actually parseable for speaker/company extraction.

Failure mode:
- lots of coverage
- wrong saved shape
- late discovery

Lesson:
- validate on a tiny sample first

### 2) Using the wrong 2026 artifact for company conclusions
A degraded local 2026 insights artifact showed:
- `0 non-Google companies represented`

That was not the real comparison source.
The real 2026 source was the richer repo data:
- `/root/.openclaw/workspace/google-cloud-next-2026-unofficial-scrape/sessions/classified_sessions.json`

### 3) Flat text extraction from 2025 session detail pages
Saving rough `body.innerText()` slices from `?session=<CODE>#all` was too brittle.

Failure mode:
- got page shell / list text
- got partial session detail
- missed speaker blocks
- polluted parse with junk like:
  - `Session Library`
  - `Check out the full list of sessions.`
  - `Powered by Vertex AI`

### 4) Scaling parser work before proving edge cases
Work widened before fully validating:
- multi-speaker sessions
- duplicated-name lines
- metadata-only sessions masquerading as speaker blocks

This created wasted time.

### 5) Treating “next step identified” like “progress”
Too many turns were spent restating the next fix instead of landing it.

---

## What might work

### A) Best current path: modal-based extraction
This is the most promising technical path.

What works:
- the session detail modal is real and contains the needed data
- Playwright locators can see it
- known good selector family:
  - `[role="dialog"]`
  - `.modal`
  - `[aria-modal="true"]`

Known good examples:
- `CT2-28`
- `BRK1-096`
- `SPTL212`
- `SOL303`

What the modal contains:
- session code
- title
- speaker names
- roles
- companies
- optional affiliation label:
  - `Customer`
  - `Partner`
  - `Googler`

### B) Parse from the actual modal speaker-block pattern
Verified raw line pattern after `Share`:

Example `BRK1-096`:
- Matt Bell
- VP of Product Research
- Anthropic
- Customer
- Francis deSouza
- COO, Google Cloud
- Google Cloud
- Googler

Example `SOL303`:
- Chandu Bhuman
- Senior Manager, Data Strategy, Cloud and Engineering
- Virgin Media 02
- Customer
- Pedro Esteves
- EMEA Data Analytics Solution Lead
- Google Cloud
- Googler
- Suda Srinivasan
- Group Product Manager
- Google Cloud
- Googler

So the parser should do:
1. find `Share`
2. parse repeated blocks of:
   - name
   - role
   - company
   - optional affiliation
3. stop at:
   - long abstract prose
   - `playlist_add`
   - `Add to playlist`
   - `RESOURCES`
   - `Related sessions`
   - other post-speaker metadata

### C) Use checkpointed modal shards, not restart from zero
Current modal extraction already produced checkpoint files like:
- `sessions_25_modal.part*.json`

These should be reused if possible, but only if parsing logic can be re-applied to saved modal text cleanly.
If not, the scraper should still reuse:
- session code list
- shard strategy
- smaller-batch execution

### D) Good-enough fallback if perfection keeps blocking delivery
If exact apples-to-apples company ranking is still too costly:
- use 2025 title/card/company mention counts
- use real 2026 speaker-company rankings
- clearly label the comparison as asymmetric

This is worse analytically, but better than getting stuck forever.

---

## What the tests of correctness are

### 1) Known-session speaker correctness
These are the most important tests.

#### `BRK1-096`
Must include:
- Matt Bell → Anthropic
- Francis deSouza → Google Cloud

If Francis is missing, parser is still wrong.

#### `SOL303`
Must include:
- Chandu Bhuman → Virgin Media 02
- Pedro Esteves → Google Cloud
- Suda Srinivasan → Google Cloud

If Chandu is missing, parser is still wrong.

#### `CT2-28`
Must include:
- Vivek Menon → Digital Turbine
- Ajay Singh → Databricks

If Ajay is missing, parser is still wrong.

### 2) Metadata-only sessions should not invent speakers
Examples that should **not** produce fake speaker rows from taxonomy/audience metadata:
- `IND-113`
- `AIN-106`
- `DAI-101`
- `IND-109`

Correct behavior:
- either real speakers
- or `speakers: []`
- but **never** fake rows like:
  - `App Dev`
  - `Database Professionals`
  - `Google Agentspace`

### 3) No page-shell junk in parsed companies
The parser is wrong if any company list contains junk like:
- `Session Library`
- `Check out the full list of sessions.`
- `Powered by Vertex AI`
- `Clear Filters`

### 4) Repeated speaker blocks should be fully consumed
The parser must not stop after the first speaker in a multi-speaker modal.

A correct parser should walk:
- first speaker
- second speaker
- third speaker
- until stop markers

### 5) Output should be structurally useful for ranking
For each session, output should look like:

```json
{
  "code": "BRK1-096",
  "title": "A conversation with Anthropic: How AI is shaping the future for startups",
  "speakers": [
    {
      "name": "Matt Bell",
      "role": "VP of Product Research",
      "company": "Anthropic",
      "affiliation": "Customer"
    },
    {
      "name": "Francis deSouza",
      "role": "COO, Google Cloud",
      "company": "Google Cloud",
      "affiliation": "Googler"
    }
  ]
}
```

If the output can’t reliably look like that, it’s not ready for company ranking.

---

## Real 2026 source of truth
Use:
- `/root/.openclaw/workspace/google-cloud-next-2026-unofficial-scrape/sessions/classified_sessions.json`

Already extracted top non-Google companies from there included:
- Palo Alto Networks — 16
- NVIDIA — 14
- Accenture — 10
- Insight — 9
- Anthropic — 9
- McKinsey & Company — 8
- Shopify — 8
- Salesforce — 7
- Snap — 6
- PwC — 6
- Wiz — 6

That side is basically solved.

---

## Real 2025 status
What is solved:
- 2025 session library extraction path exists
- around 977 session cards were extracted
- session detail modal exists and contains speaker/company data
- session code coverage is known
- modal speaker block structure is known
- checkpointed modal extraction shards exist

What is not solved:
- robust multi-speaker parser from the modal content
- deciding whether to continue DOM/modal parsing or switch to a more 2026-like structured session dataset approach

---

## Existing artifacts / files

### 2025 folder
- `/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25.json`
- `/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25_detail.json`
- `/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25_structured.json`
- `/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25_modal.part0.json`
- `/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25_modal.part1.json`
- `/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25_modal.part2.json`
- `/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25_modal.part3.json`
- `/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25_modal.part4.json`
- `/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25_modal.part5.json`
- `/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25_modal.part6.json`
- `/root/.openclaw/workspace/gcp-next-2025-insights/sessions_25_modal.part7.json`

### Scripts created during this work
- `extract_2025_companies.mjs`
- `extract_2025_structured.mjs`
- `extract_2025_structured_shard.mjs`
- `extract_2025_modal_structured_shard.mjs`
- `dump_known_modal_lines_2025.mjs`
- `revalidate_known_sessions_2025.mjs`
- `find_detail_dom_2025.mjs`
- `inspect_modal_dom_2025.mjs`
- `validate_modal_extract_2025_v2.mjs`

Not all of these are good/final. Treat them as experiments, not canon.

---

## Short bottom line
- **Goal:** fair 2025 vs 2026 company-presenter comparison
- **Didn’t work:** long crawls before validating shape; brittle flat-text parsing
- **Might work:** modal-only extraction with repeated speaker-block parser, or a more 2026-like structured session dataset for 2025
- **Correctness tests:** known sessions must recover exact speakers/companies; metadata-only sessions must not invent speakers
