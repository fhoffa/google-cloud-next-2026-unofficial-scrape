#!/usr/bin/env python3
"""
Apply deterministic post-processing rules to classified_sessions.json to fix
known classification gaps without re-running the LLM:

Rule A — Applied AI:
  App dev sessions with `Applied AI` topic tag, no `App Dev` tag, and
  agent/agentic/voice/chatbot keywords in the title → "Applied AI" theme.

Rule B — Infra:
  App dev sessions with Infra/Ops audience, no `App Dev` tag, and
  Kubernetes or Infrastructure Architects & Admins topic tags → "Infra" theme.

These rules reflect the classification guidelines added to classify_sessions_llm.py
and are safe to re-run (idempotent after the first pass).

Usage:
    python3 scripts/reclassify_rules.py
    python3 scripts/reclassify_rules.py --input sessions/classified_sessions.json
    python3 scripts/reclassify_rules.py --dry-run
"""

import argparse
import json
from pathlib import Path

AGENT_KEYWORDS = ["agent", "agentic", "voice", "chatbot"]


def should_be_applied_ai(session: dict) -> bool:
    llm = session.get("llm") or {}
    if llm.get("theme") != "App dev":
        return False
    topics = session.get("topics") or []
    if "Applied AI" not in topics:
        return False
    if "App Dev" in topics:
        return False
    title = (session.get("title") or "").lower()
    return any(kw in title for kw in AGENT_KEYWORDS)


def should_be_infra(session: dict) -> bool:
    llm = session.get("llm") or {}
    if llm.get("theme") != "App dev":
        return False
    if llm.get("audience") != "Infra/Ops":
        return False
    topics = session.get("topics") or []
    if "App Dev" in topics:
        return False
    return any(t in topics for t in ["Kubernetes", "Infrastructure Architects & Admins"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Rule-based reclassification pass")
    parser.add_argument("--input", default="sessions/classified_sessions.json")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.is_absolute():
        input_path = Path.cwd() / input_path

    data = json.loads(input_path.read_text())
    sessions = data["sessions"]

    applied_ai_changes = []
    infra_changes = []

    for session in sessions:
        if should_be_applied_ai(session):
            applied_ai_changes.append(session["title"])
            if not args.dry_run:
                session["llm"]["theme"] = "Applied AI"
                session["llm"]["reasoning"] = (
                    "AI focus; Applied AI theme — agent/voice/chatbot use case with Applied AI tag, no App Dev tag."
                )
        elif should_be_infra(session):
            infra_changes.append(session["title"])
            if not args.dry_run:
                session["llm"]["theme"] = "Infra"
                session["llm"]["reasoning"] = (
                    "AI focus; Infra theme — Kubernetes/infra-heavy session with Infra/Ops audience, no App Dev tag."
                )

    print(f"Applied AI reclassifications: {len(applied_ai_changes)}")
    for t in applied_ai_changes:
        print(f"  → Applied AI: {t}")

    print(f"\nInfra reclassifications: {len(infra_changes)}")
    for t in infra_changes:
        print(f"  → Infra: {t}")

    if args.dry_run:
        print("\nDry run — no changes written.")
        return

    input_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    total = len(applied_ai_changes) + len(infra_changes)
    print(f"\nWrote {total} reclassifications → {input_path}")


if __name__ == "__main__":
    main()
