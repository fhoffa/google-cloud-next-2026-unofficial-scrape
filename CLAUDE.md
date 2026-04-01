# CLAUDE.md — Project context for Claude Code

## What this project is

An unofficial scrape and analysis of the Google Cloud Next 2026 session catalog.
The main deliverable is `insights.html` — a data-driven analysis page surfacing
the shape of the conference (AI vs not-AI, themes, audiences, top companies, vocabulary).

## How insights.html is generated

1. Session data lives in `sessions/classified_sessions.json`
2. The generator script reads the data and a template, then writes the output:
   ```
   node scripts/generate_insights.mjs
   ```
3. Dynamic copy (lede, observations, company text, slice descriptions) lives in
   `scripts/generate_insights.mjs` → `buildSummary()`
4. Static copy (section headers, kicker labels, Sankey description) lives in
   `templates/insights.template.html`
5. Both `insights.html` and `media/insights-summary.json` are regenerated together

**Always regenerate after changing the script or template.**

## Copy and writing style

### Voice
- Lead with the number or finding, not the label
- Interpretive, not just descriptive — say what the data means, not just what it is
- Opinionated but grounded: every claim should be traceable to the data
- Conversational and direct; no jargon, no corporate hedging

### Patterns to avoid
- "it's not just X, it's Y" — this construction is banned
- "not just X" in general — lead with what it is, not what it isn't
- "makes this section useful as a quick read on..." — meta-commentary about the page itself
- Ending a sentence with "as well" or "too" when the sentence could just lead with the point
- Listing features in the lede ("surfaces X, Y, Z, and W") — lead with the story instead

### Tone check
Read the copy aloud. If it sounds like a dashboard tooltip, rewrite it.
If it sounds like something worth forwarding to a colleague, it's right.

## Word rules

`config/word-rules.json` controls what appears in the word clouds:
- `stopWords` — excluded entirely (includes format artifacts like "breakout")
- `normalization` — plural/variant forms collapsed to a canonical key
- `displayLabels` — how the canonical key is shown in the UI

When a word in the cloud is clearly a session-format artifact rather than a content
signal, add it to `stopWords`.

## Company section guidelines

The top companies list is a ranked list of non-Google speakers by session count.
When writing the observation text, look for:
- **Clusters**: consulting firms (Accenture, McKinsey, etc.) often add up to more
  than any individual company — call that out
- **Unexpected names**: consumer or retail companies in a cloud conference are worth noting
- **Strategic relationships**: partners like NVIDIA (AI compute) or Anthropic (AI models)
  have a story behind their presence
- **Acquisitions**: recently-acquired companies may still appear as "non-Google" —
  worth noting if their count is significant
