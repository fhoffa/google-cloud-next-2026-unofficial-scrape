# Repository Review (2026-03-27)

## Scope

Reviewed the scraper, merge flow, static website search UI, and automated tests.

## What looks strong

- Clear split between data collection (`scrape_google_next.mjs`) and presentation (`website/session-search.mjs`).
- Good scraper hygiene: configurable delay/retry/timeout, cache support, and bounded pagination.
- Test suite is broad and catches many UI and parser regressions (`tests/parser.test.mjs`, `tests/website.test.mjs`).
- Data outputs support both reproducibility (snapshots) and practical consumption (`latest.*`, `by-day/*`).

## Main risks and recommendations

### 1) Brittle parser sentinel in library-page extraction

`extractSessionRecordsFromLibrary` depends on the hardcoded substring `'}, 19,1106,'` to find the JSON boundary.

**Risk:** a minor upstream template change can silently produce empty/incomplete records.

**Recommendation:** parse the function call more defensively by balancing braces from `GoogleAgendaBuilder.show_sessions(` until the first complete JSON object closes, rather than relying on one fixed trailer token.

### 2) Date parsing depends on platform string parsing behavior

`parseDateText` uses `new Date(`${value} UTC`)` with natural-language dates like `Wednesday, April 22, 2026`.

**Risk:** this can be implementation-dependent across runtimes/locales.

**Recommendation:** parse month/day/year explicitly (e.g., regex + month map) and construct UTC date via `Date.UTC(...)` for deterministic results.

### 3) No explicit schema validation before publishing output

The scraper writes JSON/YAML directly from parsed fields with minimal structural checks.

**Risk:** upstream HTML changes can degrade data quality without failing fast.

**Recommendation:** add a lightweight validation step (required fields, type checks, date/time format checks), then fail the run or emit warnings with counts.

## Nice-to-have improvements

- Add CI workflow that runs `npm test` on PRs.
- Add a small fixture-driven regression test for malformed/changed `show_sessions(...)` payloads.
- Consider precomputing exclude regex tokens once per filter change in the UI for larger datasets.

## Overall assessment

The repo is in good shape and already has unusually strong tests for a personal scraper + static UI project. The top priority is hardening the library JSON extraction logic to reduce fragility to source-site markup changes.
