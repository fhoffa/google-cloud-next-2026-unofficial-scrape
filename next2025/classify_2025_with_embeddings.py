#!/usr/bin/env python3
import json
import math
import os
import re
import time
from pathlib import Path
from urllib import request

ROOT = Path(__file__).resolve().parents[1]
TRAIN_PATH = ROOT / 'sessions' / 'classified_sessions.json'
TARGET_PATH = ROOT / 'next2025' / 'sessions_25_classified.json'
OUT_PATH = ROOT / 'next2025' / 'sessions_25_classified_embeddings.json'
TRAIN_EMB_PATH = ROOT / 'next2025' / '.tmp-train-2026-embeddings.json'
TARGET_EMB_PATH = ROOT / 'next2025' / '.tmp-target-2025-embeddings.json'
MODEL = os.environ.get('EMBED_MODEL', 'text-embedding-3-small')
API_KEY = os.environ.get('OPENAI_API_KEY', '')
URL = 'https://api.openai.com/v1/embeddings'
BATCH = int(os.environ.get('EMBED_BATCH_SIZE', '64'))
TOP_K = int(os.environ.get('EMBED_K', '9'))
MAX_CANDIDATES = int(os.environ.get('EMBED_MAX_CANDIDATES', '180'))
STOP = {'the','and','for','with','from','into','your','you','how','why','what','using','use','build','google','cloud','next','session','talk','workshop','lab'}
AI_PATTERNS = [
    re.compile(r'\bai\b'),
    re.compile(r'\bgemini\b'),
    re.compile(r'\bagent(s|ic)?\b'),
    re.compile(r'\bllm(s)?\b'),
    re.compile(r'\bml\b'),
    re.compile(r'\bmachine learning\b'),
    re.compile(r'\bgenai\b|\bgen ai\b'),
    re.compile(r'\bgenerative\b'),
    re.compile(r'\bvertex\b'),
    re.compile(r'\bprompt(s|ing)?\b'),
    re.compile(r'\brag\b'),
    re.compile(r'\binference\b'),
    re.compile(r'\bmodel(s|ing)?\b'),
    re.compile(r'\bfoundation(al)?\b'),
    re.compile(r'\bagentspace\b'),
    re.compile(r'\bnotebooklm\b'),
    re.compile(r'\bdeepmind\b'),
    re.compile(r'\btensorflow\b'),
    re.compile(r'\bgemma\b'),
    re.compile(r'\bmcp\b'),
]


def clean(value):
    return ' '.join(str(value or '').split())


def tokenize(session):
    text = ' '.join([
        clean(session.get('title')),
        ' '.join(session.get('topics') or []),
        clean(session.get('session_category')),
    ]).lower()
    toks = set(re.findall(r'[a-z0-9][a-z0-9+.-]{1,}', text))
    return {t for t in toks if t not in STOP and len(t) > 2}


def session_text(session):
    title = clean(session.get('title'))
    description = clean(session.get('description'))
    topics = [clean(t) for t in (session.get('topics') or []) if clean(t)]
    category = clean(session.get('session_category'))
    speakers = [clean(s.get('company')) for s in (session.get('speakers') or []) if clean(s.get('company'))]
    parts = []
    if title:
        parts.append(f'Title: {title}')
    if description:
        parts.append(f'Description: {description[:1200]}')
    if topics:
        parts.append(f'Topics: {", ".join(topics)}')
    if category:
        parts.append(f'Session category: {category}')
    if speakers:
        parts.append(f'Speaker companies: {", ".join(speakers[:6])}')
    return '\n'.join(parts)


def has_ai_keyword(session):
    text = ' '.join([
        clean(session.get('title')).lower(),
        clean(session.get('description')).lower(),
        ' '.join((session.get('topics') or [])).lower(),
    ])
    return any(pattern.search(text) for pattern in AI_PATTERNS)


def chunks(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i+size]


def call_embeddings(texts):
    payload = json.dumps({'model': MODEL, 'input': texts}).encode('utf-8')
    req = request.Request(URL, data=payload, method='POST')
    req.add_header('Authorization', f'Bearer {API_KEY}')
    req.add_header('Content-Type', 'application/json')
    with request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode('utf-8'))


def embed_rows(rows, cache_path):
    if cache_path.exists():
        data = json.loads(cache_path.read_text())
        if len(data) == len(rows):
            print(f'using cache {cache_path.name} rows={len(data)}')
            return data
    vectors = []
    for batch in chunks(rows, BATCH):
        result = call_embeddings([r['text'] for r in batch])
        vectors.extend([d['embedding'] for d in result['data']])
        print(f'embedded {len(vectors)}/{len(rows)}', flush=True)
        time.sleep(0.2)
    cache_path.write_text(json.dumps(vectors), encoding='utf-8')
    return vectors


def norm(vec):
    return math.sqrt(sum(x * x for x in vec))


def cosine(a, b, an=None, bn=None):
    an = an or norm(a)
    bn = bn or norm(b)
    if not an or not bn:
        return 0.0
    return sum(x * y for x, y in zip(a, b)) / (an * bn)


def vote(neighbors, field):
    scores = {}
    for sim, row in neighbors:
        label = ((row.get('llm') or {}).get(field) or '').strip()
        if not label:
            continue
        scores[label] = scores.get(label, 0.0) + max(sim, 0) ** 4
    if not scores:
        return ''
    return max(scores.items(), key=lambda kv: (kv[1], kv[0]))[0]


def main():
    if not API_KEY:
        raise SystemExit('OPENAI_API_KEY missing')

    train_sessions = json.loads(TRAIN_PATH.read_text())['sessions']
    target_payload = json.loads(TARGET_PATH.read_text())
    target_sessions = target_payload['sessions']

    train_rows = [{'session': s, 'text': session_text(s), 'tokens': tokenize(s)} for s in train_sessions if s.get('llm')]
    target_rows = [{'session': s, 'text': session_text(s), 'tokens': tokenize(s)} for s in target_sessions]
    print(f'train={len(train_rows)} target={len(target_rows)} model={MODEL} k={TOP_K} max_candidates={MAX_CANDIDATES}')

    token_index = {}
    for i, row in enumerate(train_rows):
        for tok in row['tokens']:
            token_index.setdefault(tok, set()).add(i)

    train_vecs = embed_rows(train_rows, TRAIN_EMB_PATH)
    target_vecs = embed_rows(target_rows, TARGET_EMB_PATH)
    train_norms = [norm(v) for v in train_vecs]

    for idx, (session, vec, row) in enumerate(zip(target_sessions, target_vecs, target_rows), start=1):
        candidate_ids = set()
        for tok in row['tokens']:
            candidate_ids.update(token_index.get(tok, set()))
        if not candidate_ids:
            candidate_ids = set(range(len(train_rows)))
        if len(candidate_ids) > MAX_CANDIDATES:
            # keep candidates with most token overlap first
            scored = []
            for cid in candidate_ids:
                overlap = len(row['tokens'] & train_rows[cid]['tokens'])
                scored.append((overlap, cid))
            scored.sort(reverse=True)
            candidate_ids = {cid for _, cid in scored[:MAX_CANDIDATES]}

        sims = []
        for cid in candidate_ids:
            sims.append((cosine(vec, train_vecs[cid], None, train_norms[cid]), train_rows[cid]['session']))
        sims.sort(key=lambda x: x[0], reverse=True)
        nbrs = sims[:TOP_K]
        ai_focus = 'AI' if has_ai_keyword(session) else 'Not AI'
        session['llm'] = {
            'ai_focus': ai_focus,
            'theme': vote(nbrs, 'theme'),
            'audience': vote(nbrs, 'audience'),
            'reasoning': f"AI keyword gate => {ai_focus}; theme/audience from embedding kNN using nearest labeled 2026 sessions after token-overlap filtering.",
            'neighbor_titles': [n['title'] for _, n in nbrs[:3]],
            'neighbor_scores': [round(s, 4) for s, _ in nbrs[:3]],
        }
        if idx % 100 == 0 or idx == len(target_sessions):
            print(f'classified {idx}/{len(target_sessions)}', flush=True)

    OUT_PATH.write_text(json.dumps({'model': f'embedding-knn:{MODEL}', 'sessions': target_sessions}, indent=2), encoding='utf-8')
    print(OUT_PATH)


if __name__ == '__main__':
    main()
