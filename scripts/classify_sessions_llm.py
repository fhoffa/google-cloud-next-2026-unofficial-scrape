#!/usr/bin/env python3
"""
Classify Google Cloud Next sessions using Claude via the Batches API.

Usage:
    python3 scripts/classify_sessions_llm.py --submit
    python3 scripts/classify_sessions_llm.py --poll <batch_id>
    python3 scripts/classify_sessions_llm.py --fetch <batch_id>

Or run all steps in one go:
    python3 scripts/classify_sessions_llm.py --run

State files are written to tmp/ so interrupted runs can be resumed.
Outputs sessions/classified_sessions.json.

Requires:
    pip install anthropic
    export ANTHROPIC_API_KEY=...
"""

import argparse
import json
import sys
import time
from pathlib import Path

import anthropic

MODEL = "claude-opus-4-6"

SYSTEM_PROMPT = """\
You are a technical program analyst for Google Cloud Next 2026, a major cloud computing conference.

Classify the given session JSON into EXACTLY these structured fields.

### ai_focus
Is this session primarily about AI/ML?
Return "AI" if the session is substantially about artificial intelligence, machine learning,
generative AI, LLMs, agents, ML ops, AI infrastructure, or AI-powered products.
Return "Not AI" if AI is incidental or absent.

### theme
The primary technical/business theme. Choose the single BEST fit:
- "Security"   — identity, IAM, threat detection, compliance, zero trust, cyber, guardrails
- "Data"       — databases, analytics, BigQuery, data engineering, warehousing, Looker, BI
- "Infra"      — infrastructure, networking, Kubernetes, serverless, compute, storage, SRE,
                 DevOps, migration, multicloud, architecture
- "App dev"    — application development, APIs, SDKs, Firebase, mobile, web, developer tools,
                 builder sessions, open source
- "Business"   — strategy, leadership, customer stories, partner ecosystem, industry
                 transformation, executive sessions

Use scoring: weigh the official topic tags heavily, then title, then description.
When topics clearly signal a category (e.g. "Application Developers" tag → App dev),
prefer that over broad business language in the description.

### audience
The primary intended audience. Choose the single BEST fit:
- "Developers"  — application developers, builders, coders, API users
- "Data pros"   — data engineers, data analysts, data scientists, database professionals
- "Infra/Ops"   — platform engineers, SREs, IT ops, infrastructure architects, admins
- "Sec pros"    — security professionals, security operations
- "Leaders"     — IT managers, business leaders, executives, decision makers, C-suite
- "General"     — mixed / unclear audience

Use official audience topic tags first when present.
Hard overrides: title contains "for developers" → Developers; "for leaders" → Leaders.

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


def build_batch_requests(sessions: list[dict]) -> list[dict]:
    requests = []
    for i, session in enumerate(sessions):
        requests.append({
            "custom_id": str(i),
            "params": {
                "model": MODEL,
                "max_tokens": 256,
                "system": SYSTEM_PROMPT,
                "messages": [
                    {"role": "user", "content": session_prompt(session)}
                ],
            },
        })
    return requests


def submit(sessions: list[dict], client: anthropic.Anthropic) -> str:
    requests = build_batch_requests(sessions)
    print(f"Submitting batch of {len(requests)} requests …", flush=True)
    batch = client.messages.batches.create(requests=requests)
    print(f"Batch ID: {batch.id}  status: {batch.processing_status}")
    return batch.id


def poll(batch_id: str, client: anthropic.Anthropic, interval: int = 30) -> None:
    print(f"Polling batch {batch_id} …", flush=True)
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        counts = batch.request_counts
        print(
            f"  status={batch.processing_status}  "
            f"processing={counts.processing}  "
            f"succeeded={counts.succeeded}  "
            f"errored={counts.errored}",
            flush=True,
        )
        if batch.processing_status == "ended":
            break
        time.sleep(interval)
    print("Batch complete.")


def fetch_and_write(
    batch_id: str,
    sessions: list[dict],
    output_path: Path,
    client: anthropic.Anthropic,
) -> None:
    print(f"Fetching results for batch {batch_id} …", flush=True)
    results_by_id: dict[str, dict] = {}
    errors = 0
    for result in client.messages.batches.results(batch_id):
        if result.result.type == "succeeded":
            raw = result.result.message.content
            text = next((b.text for b in raw if b.type == "text"), None)
            if text:
                try:
                    parsed = json.loads(text)
                    results_by_id[result.custom_id] = parsed
                except json.JSONDecodeError as exc:
                    print(f"  [WARN] JSON parse error for id {result.custom_id}: {exc}", file=sys.stderr)
                    errors += 1
        else:
            print(
                f"  [WARN] id {result.custom_id} failed: {result.result.type}",
                file=sys.stderr,
            )
            errors += 1

    classified = []
    for i, session in enumerate(sessions):
        classification = results_by_id.get(str(i))
        if classification:
            classified.append({**session, "llm": classification})
        else:
            classified.append({**session, "llm": None})

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps({"batch_id": batch_id, "model": MODEL, "sessions": classified}, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {len(classified)} sessions → {output_path}  ({errors} errors)")


def load_sessions(input_path: Path) -> list[dict]:
    data = json.loads(input_path.read_text())
    return data["sessions"] if isinstance(data, dict) and "sessions" in data else data


def main() -> None:
    parser = argparse.ArgumentParser(description="LLM-classify Google Cloud Next sessions")
    parser.add_argument("--input", default="sessions/latest.json", help="Sessions JSON")
    parser.add_argument("--output", default="sessions/classified_sessions.json", help="Output JSON")
    parser.add_argument("--state", default="tmp/batch_id.txt", help="File to persist batch ID")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--submit", action="store_true", help="Submit the batch and write batch ID to --state")
    group.add_argument("--poll", metavar="BATCH_ID", help="Poll until batch is done")
    group.add_argument("--fetch", metavar="BATCH_ID", help="Fetch results and write output")
    group.add_argument("--run", action="store_true", help="Submit, poll, and fetch in one step")
    args = parser.parse_args()

    client = anthropic.Anthropic()
    input_path = Path(args.input)
    output_path = Path(args.output)
    state_path = Path(args.state)

    sessions = load_sessions(input_path)
    print(f"Loaded {len(sessions)} sessions from {input_path}")

    if args.submit:
        batch_id = submit(sessions, client)
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(batch_id)
        print(f"Batch ID saved to {state_path}")
        print(f"\nNext step:\n  python3 scripts/classify_sessions_llm.py --poll {batch_id}")

    elif args.poll:
        poll(args.poll, client)
        print(f"\nNext step:\n  python3 scripts/classify_sessions_llm.py --fetch {args.poll}")

    elif args.fetch:
        fetch_and_write(args.fetch, sessions, output_path, client)

    elif args.run:
        batch_id = submit(sessions, client)
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(batch_id)
        poll(batch_id, client)
        fetch_and_write(batch_id, sessions, output_path, client)


if __name__ == "__main__":
    main()
