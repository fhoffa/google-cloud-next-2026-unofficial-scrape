#!/usr/bin/env python3
"""
Classify Google Cloud Next sessions using Claude, session by session.

Usage:
    python3 scripts/classify_sessions_llm.py
    python3 scripts/classify_sessions_llm.py --concurrency 5
    python3 scripts/classify_sessions_llm.py --input sessions/latest.json
    python3 scripts/classify_sessions_llm.py --output sessions/classified_sessions.json

Re-running resumes from where it left off (already-classified sessions are skipped).

Requires:
    pip install anthropic
    export ANTHROPIC_API_KEY=...
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

import anthropic

MODEL = "claude-opus-4-6"

SYSTEM_PROMPT = """\
You are a technical program analyst for Google Cloud Next 2026, a major cloud computing conference.

Classify the given session JSON into EXACTLY these structured fields.

### ai_focus
Return "AI" if the session is substantially about AI, ML, LLMs, agents, GenAI, Vertex AI,
Gemini, ML ops, AI infrastructure, or AI-powered products.
Return "Not AI" if AI is incidental or absent.

---

### theme
The primary technical/business theme. Choose the single BEST fit:
- "Security"   — identity, IAM, threat detection, compliance, zero trust, cyber, guardrails
- "Data"       — databases, analytics, BigQuery, data engineering, warehousing, Looker, BI
- "Infra"      — infrastructure, networking, Kubernetes, serverless, compute, storage, SRE,
                 DevOps, migration, multicloud, architecture
- "App dev"    — application development, APIs, SDKs, Firebase, mobile, web, developer tools,
                 builder sessions, coding workshops, open source
- "Business"   — strategy, leadership, customer stories, partner ecosystem, industry
                 transformation, executive sessions

**Theme hard overrides (apply first, before anything else):**
- Topic tag `Developer Meetups` OR room contains "Developer Meetup" → MUST be "App dev"
- Topic tag `Application Developers` without other conflicting technical tags → strong "App dev"
- Topic tag `Architecture` OR `Infrastructure Architects & Admins` → strong "Infra"
- Topic tags `Security` OR `Security Professionals` → strong "Security"
- Topic tag `Databases` → strong "Data"

**Startup Hub / Lounge tag inflation warning:**
Many hub/lounge sessions carry the same boilerplate tag list regardless of actual content:
[DevOps, IT Ops, Platform Engineers, SREs, Infrastructure Architects & Admins,
IT Managers & Business Leaders, Startup, Technology & Leadership]
When you see 6+ of these tags together, DO NOT use the infra tags for theme scoring.
Instead classify theme primarily from the title, description, and any specific tags
(e.g. Applied AI, Gemini, Application Developers).

**Scoring order:** hard overrides → specific topic tags (6pts each) → title keywords (3pts) → description (1pt).

---

### audience
The primary intended audience. Choose the single BEST fit:
- "Developers"  — application developers, builders, coders, API users
- "Data pros"   — data engineers, data analysts, data scientists, database professionals
- "Infra/Ops"   — platform engineers, SREs, IT ops, infrastructure architects, admins
- "Sec pros"    — security professionals, security operations
- "Leaders"     — IT managers, business leaders, executives, decision makers, C-suite
- "General"     — mixed, unclear, or too many conflicting signals

**Audience hard overrides (apply first):**
- Title contains "Developer Meetup" OR "Developers Meetup" OR topic tag is `Developer Meetups`
  OR room contains "Developer Meetup" → MUST be "Developers"
- Title contains "for developers" → MUST be "Developers"
- Title contains "for leaders" → MUST be "Leaders"

**When audience tags conflict:**
- `Security Professionals` tag → Sec pros (not Infra/Ops, even if infra tags are also present)
- `Application Developers` tag → Developers (not Infra/Ops)
- `Data Engineers` / `Data Analysts` / `Data Scientists` → Data pros
- Infra tags (Platform Engineers, SREs, IT Ops, Infrastructure Architects & Admins) → Infra/Ops
  UNLESS a more specific tag also applies (Security Professionals, Application Developers, etc.)
- `IT Managers & Business Leaders` / `Executive` → Leaders
- When 5+ audience tags are present and they span multiple categories, prefer "General"
  UNLESS a hard override applies or one category is clearly dominant (4+ tags from same bucket)

**Startup Hub / theme-audience consistency:**
When theme is "Business" (innovation, startup, strategy), infra audience tags are likely
hub defaults — use title/description to judge actual audience instead.

### reasoning
One sentence (max 25 words) explaining the classification choices.

Respond with ONLY valid JSON matching this schema:
{
  "ai_focus": "AI" | "Not AI",
  "theme": "Security" | "Data" | "Infra" | "App dev" | "Business",
  "audience": "Developers" | "Data pros" | "Infra/Ops" | "Sec pros" | "Leaders" | "General",
  "reasoning": "<string>"
}"""


def session_prompt(session: dict) -> str:
    return json.dumps({
        "title": session.get("title", ""),
        "description": (session.get("description") or "")[:800],
        "topics": session.get("topics") or [],
        "room": session.get("room", ""),
        "speakers": [
            {"name": s.get("name", ""), "company": s.get("company", "")}
            for s in (session.get("speakers") or [])
        ],
    }, ensure_ascii=False)


async def classify_one(
    session: dict,
    client: anthropic.AsyncAnthropic,
    semaphore: asyncio.Semaphore,
    index: int,
    total: int,
) -> dict | None:
    async with semaphore:
        try:
            response = await client.messages.create(
                model=MODEL,
                max_tokens=256,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": session_prompt(session)}],
            )
            text = next((b.text for b in response.content if b.type == "text"), None)
            if not text:
                print(f"  [{index+1}/{total}] WARN: empty response for '{session.get('title', '')[:50]}'", file=sys.stderr)
                return None
            result = json.loads(text)
            print(f"  [{index+1}/{total}] {result['ai_focus']:6s} | {result['theme']:8s} | {result['audience']:10s} | {session.get('title', '')[:55]}")
            return result
        except json.JSONDecodeError as exc:
            print(f"  [{index+1}/{total}] WARN: JSON parse error: {exc}", file=sys.stderr)
            return None
        except Exception as exc:
            print(f"  [{index+1}/{total}] ERROR: {exc}", file=sys.stderr)
            return None


async def run(
    sessions: list[dict],
    output_path: Path,
    concurrency: int,
) -> None:
    # Load existing results to support resume
    existing: dict[str, dict] = {}
    if output_path.exists():
        try:
            data = json.loads(output_path.read_text())
            for s in data.get("sessions", []):
                if s.get("llm") and s.get("url"):
                    existing[s["url"]] = s["llm"]
            print(f"Resuming: {len(existing)} sessions already classified, skipping them.")
        except Exception:
            pass

    pending_indices = [i for i, s in enumerate(sessions) if s.get("url") not in existing]
    print(f"Sessions to classify: {len(pending_indices)} / {len(sessions)}")

    client = anthropic.AsyncAnthropic()
    semaphore = asyncio.Semaphore(concurrency)

    results: dict[int, dict | None] = {}

    async def task(i: int) -> None:
        results[i] = await classify_one(sessions[i], client, semaphore, i, len(sessions))

    await asyncio.gather(*[task(i) for i in pending_indices])

    # Merge new results with existing
    classified = []
    errors = 0
    for i, session in enumerate(sessions):
        url = session.get("url", "")
        llm = results.get(i) if i in results else existing.get(url)
        if llm:
            classified.append({**session, "llm": llm})
        else:
            classified.append({**session, "llm": None})
            if i in pending_indices:
                errors += 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps({"model": MODEL, "sessions": classified}, indent=2),
        encoding="utf-8",
    )
    done = sum(1 for s in classified if s.get("llm"))
    print(f"\nDone. {done}/{len(classified)} classified ({errors} errors) → {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="LLM-classify Google Cloud Next sessions")
    parser.add_argument("--input", default="sessions/latest.json")
    parser.add_argument("--output", default="sessions/classified_sessions.json")
    parser.add_argument("--concurrency", type=int, default=8, help="Parallel API calls (default: 8)")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.is_absolute():
        input_path = Path.cwd() / input_path
    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = Path.cwd() / output_path

    data = json.loads(input_path.read_text())
    sessions = data["sessions"] if isinstance(data, dict) and "sessions" in data else data
    print(f"Loaded {len(sessions)} sessions from {input_path}")

    asyncio.run(run(sessions, output_path, args.concurrency))


if __name__ == "__main__":
    main()
