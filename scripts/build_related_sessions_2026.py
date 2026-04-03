#!/usr/bin/env python3
import json
import math
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'sessions' / 'classified_sessions.json'
EMBEDDINGS = ROOT / 'media' / 'cluster-audit' / 'session-embeddings-v2.jsonl'
OUTPUT = ROOT / 'media' / 'related-sessions-2026-embeddings.json'
TOP_K = 5
TITLE_TOKEN_RE = re.compile(r'[a-z0-9][a-z0-9+.#/-]*')
STOPWORDS = {
    'the', 'and', 'for', 'with', 'from', 'into', 'your', 'you', 'how', 'why', 'what', 'using', 'use', 'build',
    'google', 'cloud', 'next', 'session', 'talk', 'lab', 'workshop', 'breakout', 'keynote', 'demo', 'summit',
}


def clean(value):
    return ' '.join(str(value or '').split())


def session_key(session):
    raw_id = clean(session.get('id'))
    match = re.search(r'/session/(\d+)(?:/|$)', raw_id) or re.search(r'^(\d+)$', raw_id)
    if match:
        return match.group(1)
    url = clean(session.get('url'))
    match = re.search(r'/session/(\d+)(?:/|$)', url)
    if match:
        return match.group(1)
    return raw_id or url


def normalize_title(value):
    return re.sub(r'\s+', ' ', clean(value).lower())


def tokenize(*parts):
    text = ' '.join(clean(part).lower() for part in parts if clean(part))
    return {token for token in TITLE_TOKEN_RE.findall(text) if len(token) > 2 and token not in STOPWORDS}


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def norm(vec):
    return math.sqrt(sum(x * x for x in vec))


def cosine(a, b, na=None, nb=None):
    na = na if na is not None else norm(a)
    nb = nb if nb is not None else norm(b)
    if not na or not nb:
        return 0.0
    return dot(a, b) / (na * nb)


def topic_jaccard(left, right):
    if not left or not right:
        return 0.0
    left_set = {clean(item).lower() for item in left if clean(item)}
    right_set = {clean(item).lower() for item in right if clean(item)}
    if not left_set or not right_set:
        return 0.0
    return len(left_set & right_set) / len(left_set | right_set)


def token_overlap_ratio(left, right):
    if not left or not right:
        return 0.0
    overlap = len(left & right)
    if overlap <= 0:
        return 0.0
    return overlap / max(len(left), len(right))


def load_embeddings():
    by_key = {}
    for line in EMBEDDINGS.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        key = session_key({'id': row.get('url', ''), 'url': row.get('url', '')})
        by_key[key] = row
    return by_key


def main():
    sessions = json.loads(INPUT.read_text())['sessions']
    embeddings = load_embeddings()

    enriched = []
    missing_embeddings = []
    for session in sessions:
        key = session_key(session)
        embedding_row = embeddings.get(key)
        vector = embedding_row['embedding'] if embedding_row else []
        if not embedding_row:
            missing_embeddings.append({'sessionId': key, 'title': session.get('title', '')})
        enriched.append({
            'session': session,
            'key': key,
            'normalized_title': normalize_title(session.get('title')),
            'title_tokens': tokenize(session.get('title')),
            'tokens': tokenize(session.get('title'), session.get('description'), ' '.join(session.get('topics') or [])),
            'vector': vector,
            'vector_norm': norm(vector),
        })

    token_index = defaultdict(set)
    ai_focus_index = defaultdict(set)
    theme_index = defaultdict(set)
    audience_index = defaultdict(set)
    topic_index = defaultdict(set)
    category_index = defaultdict(set)

    for idx, item in enumerate(enriched):
        llm = item['session'].get('llm') or {}
        for token in item['title_tokens']:
            token_index[token].add(idx)
        if llm.get('ai_focus'):
            ai_focus_index[llm['ai_focus']].add(idx)
        if llm.get('theme'):
            theme_index[llm['theme']].add(idx)
        if llm.get('audience'):
            audience_index[llm['audience']].add(idx)
        for topic in item['session'].get('topics') or []:
            topic_index[clean(topic).lower()].add(idx)
        if clean(item['session'].get('session_category')):
            category_index[clean(item['session']['session_category']).lower()].add(idx)

    lookup = {}
    for current_idx, current in enumerate(enriched):
        if current_idx and current_idx % 100 == 0:
            print(f'processed={current_idx}/{len(enriched)}', flush=True)
        current_session = current['session']
        current_llm = current_session.get('llm') or {}
        candidate_ids = set()
        for token in current['title_tokens']:
            candidate_ids.update(token_index.get(token, set()))
        if len(candidate_ids) < TOP_K * 10:
            for token in current['tokens']:
                candidate_ids.update(token_index.get(token, set()))
            for topic in current_session.get('topics') or []:
                candidate_ids.update(topic_index.get(clean(topic).lower(), set()))
            if clean(current_session.get('session_category')):
                candidate_ids.update(category_index.get(clean(current_session['session_category']).lower(), set()))
            candidate_ids.update(ai_focus_index.get(current_llm.get('ai_focus'), set()))
            candidate_ids.update(theme_index.get(current_llm.get('theme'), set()))
            candidate_ids.update(audience_index.get(current_llm.get('audience'), set()))
        candidate_ids.discard(current_idx)

        scored = []
        for candidate_idx in candidate_ids:
            candidate = enriched[candidate_idx]
            if candidate['key'] == current['key']:
                continue
            if candidate['normalized_title'] == current['normalized_title']:
                continue

            candidate_session = candidate['session']
            candidate_llm = candidate_session.get('llm') or {}
            if current_llm.get('ai_focus') != candidate_llm.get('ai_focus') and not (current['tokens'] & candidate['tokens']):
                continue

            embedding_score = cosine(current['vector'], candidate['vector'], current['vector_norm'], candidate['vector_norm']) if current['vector'] and candidate['vector'] else 0.0
            if embedding_score <= 0.45 and not (current['tokens'] & candidate['tokens']):
                continue

            topic_score = topic_jaccard(current_session.get('topics') or [], candidate_session.get('topics') or [])
            token_score = token_overlap_ratio(current['tokens'], candidate['tokens'])
            score = embedding_score
            if current_llm.get('ai_focus') and current_llm.get('ai_focus') == candidate_llm.get('ai_focus'):
                score += 0.03
            if current_llm.get('theme') and current_llm.get('theme') == candidate_llm.get('theme'):
                score += 0.03
            if current_llm.get('audience') and current_llm.get('audience') == candidate_llm.get('audience'):
                score += 0.02
            score += topic_score * 0.06
            score += token_score * 0.05
            if clean(current_session.get('session_category')) and clean(current_session.get('session_category')).lower() == clean(candidate_session.get('session_category')).lower():
                score += 0.015

            scored.append({
                'sessionId': candidate['key'],
                'title': candidate_session.get('title', ''),
                'url': candidate_session.get('url', ''),
                'score': round(score, 4),
                'embeddingScore': round(embedding_score, 4),
                'signals': {
                    'aiFocus': current_llm.get('ai_focus') == candidate_llm.get('ai_focus'),
                    'theme': current_llm.get('theme') == candidate_llm.get('theme'),
                    'audience': current_llm.get('audience') == candidate_llm.get('audience'),
                    'topicJaccard': round(topic_score, 4),
                    'tokenOverlap': round(token_score, 4),
                    'sessionCategory': clean(current_session.get('session_category')).lower() == clean(candidate_session.get('session_category')).lower(),
                    'usedEmbedding': bool(current['vector'] and candidate['vector']),
                },
            })

        scored.sort(key=lambda item: (-item['score'], -item['embeddingScore'], item['title'].lower(), item['sessionId']))
        lookup[current['key']] = {
            'sessionId': current['key'],
            'related': scored[:TOP_K],
        }

    payload = {
        'meta': {
            'source': str(INPUT.relative_to(ROOT)),
            'embeddingSource': str(EMBEDDINGS.relative_to(ROOT)),
            'output': str(OUTPUT.relative_to(ROOT)),
            'topK': TOP_K,
            'method': 'Rank 2026 sessions against nearby 2026 candidates using cosine similarity on precomputed session embeddings, then add small boosts for matching ai/theme/audience labels, topic overlap, token overlap, and shared session category.',
            'missingEmbeddingCount': len(missing_embeddings),
            'missingEmbeddings': missing_embeddings,
        },
        'sessions': lookup,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    print(OUTPUT)
    print(f'sessions={len(lookup)} topK={TOP_K}')


if __name__ == '__main__':
    main()
