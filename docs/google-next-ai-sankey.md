# Google Cloud Next AI Sankey

Documents the classification approach and chart policy for the Sankey visualization of Google Cloud Next 2026 sessions.

## How classification works

Sessions are classified by an LLM (Claude) reading each session's title, description, topic tags, room, and speakers. No keyword lists or regex rules — the model uses its own judgment with topic tags weighted most heavily.

Classification is pre-computed and stored in `sessions/classified_sessions.json` (an `llm` field on each session). `scripts/make_sankey.py` falls back to rule-based logic for any session without an `llm` field.

To re-classify:

```bash
python3 scripts/classify_sessions_llm.py
```

## Layers

### Layer 1 — AI focus

- `AI` — substantially about AI, ML, LLMs, agents, GenAI, Vertex AI, Gemini, ML ops, or AI-powered products
- `Not AI` — AI is incidental or absent

### Layer 2 — Theme (what the session covers)

- `Security` — IAM, threat detection, compliance, zero trust, cyber, guardrails
- `Data` — databases, analytics, BigQuery, data engineering, warehousing, Looker, BI
- `Infra` — infrastructure, networking, Kubernetes, serverless, compute, storage, SRE, DevOps, migration, multicloud
- `App dev` — application development, APIs, SDKs, Firebase, mobile, web, developer tools, builder sessions
- `Business` — strategy, leadership, customer stories, partner ecosystem, executive sessions

### Layer 3 — Audience (who it's for)

Audience labels are deliberately different from theme labels to avoid visual confusion in the Sankey.

- `Developers` — application developers, builders, coders, API users
- `Data pros` — data engineers, data analysts, data scientists, database professionals
- `Infra/Ops` — platform engineers, SREs, IT ops, infrastructure architects, admins
- `Sec pros` — security professionals, security operations
- `Leaders` — IT managers, business leaders, executives, decision makers, C-suite
- `General` — mixed or unclear (not shown in chart)

Official audience topic tags take priority. Hard overrides: title contains "for developers" → Developers; "for leaders" → Leaders.

## Review standards

Before accepting a classifier change, check:

1. **Example review** — spot-check representative sessions in key buckets:
   - `AI > App dev > Developers`
   - `AI > Business > Leaders`
   - `AI > Infra > Infra/Ops`
   - `Not AI > Security > Sec pros`
   - `Not AI > Data > Data pros`

2. **Site-tag alignment** — prefer the conference's own tags over inferred classification when available

3. **Conservative inference** — use inference only when official tags are missing or ambiguous

4. **Room as weak prior only** — room can be a tie-break, not a primary signal:
   - `Security Hub`, `Mandalay Bay D/L` → security-skewed
   - `Customer Theater`, `Expo Theater 1/2` → business / leaders skew
   - `Developer Theater`, `Mandalay Bay E` → developer / app dev skew

5. **Visual review** — check the chart for label redundancy, whether the audience layer adds a new dimension, and whether it communicates something interesting

## Rendering choices

- Tall canvas, left-side labels
- Large `AI` / `Not AI` labels
- `General` audience not shown — branches end early rather than forcing a generic bucket

## Usage

```bash
python3 scripts/make_sankey.py --output tmp/gcp-next-sankey.png
```

Auto-selects `sessions/classified_sessions.json` when present, otherwise falls back to `sessions/latest.json` with rule-based classification.

```bash
python3 -m venv tmp/sankey-venv
./tmp/sankey-venv/bin/pip install matplotlib
./tmp/sankey-venv/bin/python scripts/make_sankey.py --output tmp/gcp-next-sankey.png
```

## Product direction

- Main page: session explorer
- Separate `/insights` page for the Sankey (shareable, social preview)
- Sankey segments should link back to filtered session views
