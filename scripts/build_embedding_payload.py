#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'sessions' / 'classified_sessions.json'
OUTPUT = ROOT / 'media' / 'cluster-audit' / 'embedding-payload.jsonl'


def clean(value):
    return ' '.join(str(value or '').split())


def session_text(session):
    title = clean(session.get('title'))
    description = clean(session.get('description'))
    topics = [clean(t) for t in (session.get('topics') or []) if clean(t)]
    category = clean(session.get('session_category'))
    llm = session.get('llm') or {}
    parts = []
    if title:
        parts.append(f"Title: {title}")
    if description:
        parts.append(f"Description: {description}")
    if topics:
        parts.append(f"Topics: {', '.join(topics)}")
    if category:
        parts.append(f"Session category: {category}")
    if llm:
        ai_focus = clean(llm.get('ai_focus'))
        theme = clean(llm.get('theme'))
        audience = clean(llm.get('audience'))
        reasoning = clean(llm.get('reasoning'))
        if ai_focus or theme or audience:
            parts.append(f"Current labels: ai_focus={ai_focus or 'unknown'}; theme={theme or 'unknown'}; audience={audience or 'unknown'}")
        if reasoning:
            parts.append(f"Current reasoning: {reasoning}")
    return '\n'.join(parts)


def main():
    data = json.loads(INPUT.read_text())
    sessions = data['sessions']
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open('w', encoding='utf-8') as f:
        for idx, session in enumerate(sessions):
            row = {
                'row_id': idx,
                'title': session.get('title'),
                'url': session.get('url'),
                'text': session_text(session),
                'labels': session.get('llm') or {},
                'topics': session.get('topics') or [],
            }
            f.write(json.dumps(row, ensure_ascii=False) + '\n')
    print(OUTPUT)
    print(f'rows={len(sessions)}')


if __name__ == '__main__':
    main()
