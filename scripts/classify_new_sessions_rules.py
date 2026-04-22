#!/usr/bin/env python3
"""
Classify sessions that are missing from classified_sessions.json using
deterministic rules that mirror the LLM prompt logic.

Used when the LLM classifier cannot be run (no API key) but the current live
dataset still needs deterministic fallback labels.

Usage:
    python3 scripts/classify_new_sessions_rules.py
    python3 scripts/classify_new_sessions_rules.py --dry-run
    python3 scripts/classify_new_sessions_rules.py --input sessions/latest.json
"""

import argparse
import json
import re
from pathlib import Path

REPO = Path(__file__).parent.parent

AGENT_KW = ["agent", "agentic", "chatbot", "voice agent"]
AI_KW = [
    "ai", " ml ", "llm", "gemini", "vertex", "genai", "gen ai",
    "agent", "agentic", "inference", "model", "neural", "aiops",
    "tpu", "gpu", "generative", "sovereign ai", "hypercomputer",
    "neurocontext", "veo", "deepmind",
]
AI_RECLASSIFY_EVIDENCE_REGEX = re.compile(
    r"\b(ai|gemini|agent|agents|agentic|llm|ml|machine learning|genai|generative|vertex|prompt|rag|agentspace|notebooklm|deepmind|tensorflow|gemma|mcp)\b",
    re.IGNORECASE,
)


def has_agent_kw(title: str) -> bool:
    tl = title.lower()
    return any(kw in tl for kw in AGENT_KW)


def ai_focus(session: dict) -> str:
    text = " ".join([
        session.get("title") or "",
        session.get("description") or "",
        " ".join(session.get("topics") or []),
    ]).lower()
    return "AI" if any(kw in text for kw in AI_KW) else "Not AI"


def has_explicit_ai_evidence(session: dict) -> bool:
    text = " ".join([
        session.get("title") or "",
        session.get("description") or "",
        " ".join(session.get("topics") or []),
    ])
    return bool(AI_RECLASSIFY_EVIDENCE_REGEX.search(text))


def theme(session: dict) -> str:
    topics = set(session.get("topics") or [])
    title = (session.get("title") or "").lower()
    desc = (session.get("description") or "").lower()

    has_appdev_tag = "App Dev" in topics
    has_applied_ai_tag = "Applied AI" in topics
    has_agents_tag = "Agents" in topics
    has_agent_kw = has_agent_kw_fn(title)
    has_kubernetes = "Kubernetes" in topics
    has_security = "Security" in topics or "Security Professionals" in topics
    has_ciso = "CISO Connect" in topics

    # --- Infra first (before security, to prevent Kubernetes → Security) ---
    if has_kubernetes:
        return "Infra"
    if any(kw in title for kw in ["gke ", " gke", "cluster director", "hypercomputer",
                                    "tpu", "gpu", " vm ", "workload-optimized vm",
                                    "sovereign ai", "cloud run"]) and not has_agent_kw:
        return "Infra"
    if any(t in topics for t in ["Compute"]) and any(
            t in topics for t in ["Infrastructure Architects & Admins", "Platform Engineers", "SREs"]):
        if not has_agent_kw and not has_applied_ai_tag:
            return "Infra"

    # --- Security (after Infra guard) ---
    if has_ciso:
        return "Security"
    if has_security and not has_appdev_tag:
        # Don't override Applied AI / agent sessions with Security tag
        if not (has_agent_kw and (has_applied_ai_tag or has_agents_tag)):
            return "Security"

    # --- Data (Databases tag is a strong signal) ---
    if "Databases" in topics and not has_appdev_tag:
        return "Data"

    # --- App Dev explicit tag ---
    if has_appdev_tag:
        return "App dev"

    # --- Applied AI ---
    if has_applied_ai_tag or has_agents_tag:
        if has_agent_kw:
            return "Applied AI"
        if has_applied_ai_tag:
            # Applied AI tag alone (no agent keyword) → still Applied AI
            return "Applied AI"

    # --- Remaining infra signals ---
    if any(kw in title for kw in ["inference", "aiops", "networking", "migration",
                                    "kubernetes", "cloud run", "cluster", "scaling"]):
        if not has_agent_kw and not has_applied_ai_tag:
            return "Infra"

    # --- Data (softer signals) ---
    if any(t in topics for t in ["Data Analytics"]) and not has_agent_kw:
        return "Data"
    if any(t in topics for t in ["Data Engineers", "Data Scientists", "Data Analysts",
                                   "Database Professionals"]) and not has_agent_kw:
        return "Data"

    # --- Title-based fallback for minimal-tag sessions ---
    if has_agent_kw:
        return "Applied AI"
    if any(kw in title for kw in ["security", "owasp", "threat", "compliance", "zero trust"]):
        return "Security"
    if any(kw in title for kw in ["data", "analytics", "bigquery", "database", "spark",
                                    "warehouse", "looker"]):
        return "Data"
    if any(kw in title for kw in ["develop", "build ", "code", "sdk", "api ", "firebase",
                                    "flutter", "mobile", "deploy app", "gemini cli"]):
        return "App dev"

    return "Business"


def has_agent_kw_fn(title: str) -> bool:
    tl = title.lower()
    return any(kw in tl for kw in AGENT_KW)


# Alias used in theme()
has_agent_kw_fn.__name__ = "has_agent_kw_fn"
_orig_theme = theme


def theme(session: dict) -> str:  # noqa: F811 (intentional redefinition)
    # Patch: route has_agent_kw to standalone fn
    topics = set(session.get("topics") or [])
    title = (session.get("title") or "").lower()
    desc = (session.get("description") or "").lower()

    has_appdev_tag = "App Dev" in topics
    has_applied_ai_tag = "Applied AI" in topics
    has_agents_tag = "Agents" in topics
    has_agent_kw = has_agent_kw_fn(title)
    has_kubernetes = "Kubernetes" in topics
    has_security = "Security" in topics or "Security Professionals" in topics
    has_ciso = "CISO Connect" in topics

    # Infra first — Kubernetes in topic or title always wins
    if has_kubernetes or "kubernetes" in title:
        return "Infra"
    # Other strong infra title signals (hypercomputer / tpu / gpu / sovereign ai override agent kw)
    if any(kw in title for kw in ["hypercomputer", "tpu", "gpu", "sovereign ai",
                                    "cluster director", "workload-optimized"]):
        return "Infra"
    if any(kw in title for kw in ["gke", " vm ", "cloud run"]) and not has_agent_kw:
        return "Infra"
    if "Compute" in topics and any(
            t in topics for t in ["Infrastructure Architects & Admins", "Platform Engineers", "SREs"]):
        if not has_agent_kw and not has_applied_ai_tag:
            return "Infra"

    # Security (guarded: don't override explicit App Dev or clear agent sessions)
    if has_ciso:
        return "Security"
    if has_security and not has_appdev_tag:
        if not (has_agent_kw and (has_applied_ai_tag or has_agents_tag)):
            return "Security"

    # Databases → Data
    if "Databases" in topics and not has_appdev_tag:
        return "Data"

    # Explicit App Dev tag
    if has_appdev_tag:
        return "App dev"

    # Applied AI: either explicit tag or Agents tag qualifies (no agent keyword required)
    if has_applied_ai_tag:
        return "Applied AI"
    if has_agents_tag:
        return "Applied AI"

    # Remaining Infra signals
    if not has_agent_kw:
        if any(kw in title for kw in ["inference", "aiops", "cloud run", "migration",
                                       "networking", "cluster", "price-performance"]):
            return "Infra"

    # Data soft signals
    data_audience = {"Data Engineers", "Data Scientists", "Data Analysts", "Database Professionals"}
    if not has_agent_kw:
        if "Data Analytics" in topics:
            if "Customer Story" not in topics:
                return "Data"
        if topics & data_audience and "Customer Story" not in topics:
            return "Data"

    # Title-based fallback
    if has_agent_kw:
        return "Applied AI"
    if any(kw in title for kw in ["security", "owasp", "threat", "compliance", "ciso"]):
        return "Security"
    if any(kw in title for kw in [" data ", "analytics", "spark", "database", "bigquery"]):
        return "Data"
    if any(kw in title for kw in ["flutter", "gemini cli", "build app", "deploy app",
                                    "mobile", "firebase", "open source"]):
        return "App dev"

    return "Business"


def audience(session: dict) -> str:
    topics = set(session.get("topics") or [])
    title = (session.get("title") or "").lower()

    if "Developer Meetup" in title or "Developer Meetups" in topics:
        return "Developers"
    if "for developers" in title:
        return "Developers"
    if "for leaders" in title:
        return "Leaders"
    if "CISO Connect" in topics:
        return "Sec pros"
    # Security Professionals → Sec pros, but not if Application Developers is also present
    if "Security Professionals" in topics and "Application Developers" not in topics:
        return "Sec pros"

    dev_tags = {"Application Developers"}
    data_tags = {"Data Engineers", "Data Analysts", "Data Scientists", "Database Professionals"}
    infra_tags = {"Platform Engineers", "SREs", "IT Ops", "Infrastructure Architects & Admins", "DevOps"}
    leader_tags = {"Executive", "IT Managers & Business Leaders"}

    scores = {
        "Developers": len(dev_tags & topics),
        "Data pros": len(data_tags & topics),
        "Infra/Ops": len(infra_tags & topics),
        "Leaders": len(leader_tags & topics),
    }

    total = sum(scores.values())
    contested = sum(1 for v in scores.values() if v > 0)
    if total >= 5 and contested >= 3:
        return "General"

    best = max(scores, key=scores.get)
    if scores[best] == 0:
        return "General"

    if scores["Developers"] > 0 and scores["Developers"] >= scores[best]:
        return "Developers"

    return best


def classify(session: dict) -> dict:
    t = theme(session)
    return {
        "ai_focus": ai_focus(session),
        "theme": t,
        "audience": audience(session),
        "reasoning": "Rule-based classification (no LLM); based on topic tags and title keywords.",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", "--latest", dest="input", default="sessions/latest.json")
    parser.add_argument("--classified", default="sessions/classified_sessions.json")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    input_path = REPO / args.input
    classified_path = REPO / args.classified

    input_data = json.loads(input_path.read_text())
    live_sessions = input_data["sessions"] if isinstance(input_data, dict) else input_data

    if classified_path.exists():
        classified_data = json.loads(classified_path.read_text())
    else:
        classified_data = {"sessions": []}
    existing_classified_sessions = classified_data.get("sessions", []) if isinstance(classified_data, dict) else []
    existing_urls = {s["url"] for s in existing_classified_sessions if s.get("llm")}

    new_sessions = [s for s in live_sessions if s.get("url") not in existing_urls]
    print(f"New sessions to classify: {len(new_sessions)}")

    for s in new_sessions:
        result = classify(s)
        print(f"  {result['ai_focus']:6s} | {result['theme']:10s} | {result['audience']:10s} | {s.get('title','')[:55]}")

    if args.dry_run:
        print("\nDry run — no changes written.")
        return

    existing_llm_by_url = {
        session["url"]: session["llm"]
        for session in existing_classified_sessions
        if session.get("url") and session.get("llm")
    }
    classified_sessions = []
    reused = 0
    reclassified = 0
    for session in live_sessions:
        llm = existing_llm_by_url.get(session.get("url"))
        if llm and not (llm.get("ai_focus") == "Not AI" and has_explicit_ai_evidence(session)):
            reused += 1
        else:
            llm = classify(session)
            if session.get("url") in existing_llm_by_url:
                reclassified += 1
        classified_sessions.append({**session, "llm": llm})

    output_data = dict(input_data) if isinstance(input_data, dict) else {"sessions": live_sessions}
    output_data["sessions"] = classified_sessions
    output_data["count"] = len(classified_sessions)
    classified_path.write_text(json.dumps(output_data, indent=2), encoding="utf-8")
    print(f"\nUpdated classified_sessions.json: {len(classified_sessions)} sessions")
    print(f"Reused existing classifications: {reused}")
    print(f"Reclassified existing live sessions: {reclassified}")
    print(f"Rule-classified current live sessions: {len(classified_sessions) - reused}")


if __name__ == "__main__":
    main()
