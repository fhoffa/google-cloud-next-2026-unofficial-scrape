# Google Cloud Next AI Sankey

This documents the exact code path and chart policy used to generate the Sankey for the Google Cloud Next 2026 session explorer.

## Input

- Data source: `sessions/latest.json`
- Count used in the chart: 1,037 sessions

## Top-level split

Sessions are split into:

- `AI`
- `Not AI`

using this keyword list:

- `ai`
- `gemini`
- `agent`
- `agents`
- `llm`
- `ml`
- `machine learning`
- `genai`
- `generative`
- `vertex`
- `prompt`
- `rag`
- `inference`
- `model`
- `models`
- `foundation`
- `agentic`
- `agentspace`
- `notebooklm`
- `deepmind`
- `tensorflow`
- `gemma`
- `mcp`

Quoted phrases are preserved as single filter terms.
Single words use whole-word matching.

## Theme layer

Themes are assigned with regex buckets in this order:

1. `Security`
2. `Data`
3. `Infra`
4. `App dev`
5. `Business`
6. `Other`

## Audience layer

Audience assignment rule:

1. Use official audience tags first
2. If no official audience tag exists, use a high-confidence inferred guess
3. If inference confidence is too low, do not render a last-layer audience node for that branch

Rendered audience buckets:

- `Leaders`
- `Security`
- `Infra/Ops`
- `Data`
- `Developers`

## Rendering choices

- Tall canvas
- Left-side labels
- Large `AI` / `Not AI` labels
- No `General` node shown
- Branches can end early instead of forcing a final `Other` audience node

## Exact script

- `scripts/make_sankey.py`

## Example usage

From the repo root:

```bash
python3 scripts/make_sankey.py \
  --input sessions/latest.json \
  --output tmp/gcp-next-sankey-not-ai-maxi.png
```

If you need matplotlib in an isolated env:

```bash
python3 -m venv tmp/sankey-venv
./tmp/sankey-venv/bin/pip install matplotlib
./tmp/sankey-venv/bin/python scripts/make_sankey.py \
  --input sessions/latest.json \
  --output tmp/gcp-next-sankey-not-ai-maxi.png
```


## Latest classifier refinements (2026-03-30)

These refinements were validated interactively and should be treated as the latest intent for future implementation work.

### Theme classification

- Theme should use weighted scoring, not first-match regex.
- Official site topic tags should have strong weight.
- `Business` should not easily steal sessions from `App dev`, `Infra`, or `Security` just because of broad tags like `Technology & Leadership`, `Startup`, or `Customer Story`.
- Examples like Gemini CLI / builder / ADK / app-builder talks should usually land in `App dev` when the site tags support that.

### Audience classification

- Use official audience tags first when present.
- Hard title overrides:
  - `for developers` → `Developers`
  - `developer meetup` / `developers meetup` → `Developers`
  - `for leaders` → `Leaders`
- If official tags include both leadership and developer-ish signals, title framing should be allowed to beat the more generic executive/leadership tags for obviously builder-focused sessions.
- If confidence is low, prefer ending the branch instead of inventing a misleading audience bucket.

### Room as signal

Room should be treated as a weak secondary/tie-break signal only, not a primary classifier.

Observed room clustering examples:
- `Security Hub`, `Mandalay Bay D`, `Mandalay Bay L` → strongly security-skewed
- `Customer Theater`, `Expo Theater 1`, `Expo Theater 2` → business / leaders skew
- `Developer Theater`, `Mandalay Bay E` → more developer / app-dev skew
- `Mandalay Bay F`, `Jasmine A`, `South Seas H` → infra-skewed

Use room only when title/topics/description are close between categories.

### Current persisted outputs

- Exact generated chart code: `scripts/make_sankey.py`
- Methodology note: `docs/google-next-ai-sankey.md`
- Classified dataset for review: `sessions/classified_sessions.json`
