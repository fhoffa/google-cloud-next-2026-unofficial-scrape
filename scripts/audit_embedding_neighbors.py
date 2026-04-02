#!/usr/bin/env python3
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EMBEDDINGS = ROOT / 'media' / 'cluster-audit' / 'session-embeddings.jsonl'
OUT = ROOT / 'media' / 'cluster-audit' / 'nearest-neighbor-audit.json'
TOP_K = 8
MIN_NEIGHBORS = 5


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def norm(v):
    return math.sqrt(sum(x * x for x in v))


def cosine(a, b, na, nb):
    if not na or not nb:
        return 0.0
    return dot(a, b) / (na * nb)


rows = [json.loads(line) for line in EMBEDDINGS.read_text().splitlines() if line.strip()]
for row in rows:
    row['_norm'] = norm(row['embedding'])

reports = []
for i, row in enumerate(rows):
    sims = []
    for j, other in enumerate(rows):
        if i == j:
            continue
        sim = cosine(row['embedding'], other['embedding'], row['_norm'], other['_norm'])
        sims.append((sim, other))
    sims.sort(key=lambda x: x[0], reverse=True)
    neighbors = sims[:TOP_K]
    ai_counts = Counter(n['labels'].get('ai_focus', 'unknown') for _, n in neighbors)
    theme_counts = Counter(n['labels'].get('theme', 'unknown') for _, n in neighbors)
    audience_counts = Counter(n['labels'].get('audience', 'unknown') for _, n in neighbors)

    row_ai = row['labels'].get('ai_focus', 'unknown')
    row_theme = row['labels'].get('theme', 'unknown')
    row_audience = row['labels'].get('audience', 'unknown')

    majority_ai, majority_ai_count = ai_counts.most_common(1)[0]
    majority_theme, majority_theme_count = theme_counts.most_common(1)[0]
    majority_audience, majority_audience_count = audience_counts.most_common(1)[0]

    disagreements = []
    if majority_ai != row_ai and majority_ai_count >= MIN_NEIGHBORS:
        disagreements.append('ai_focus')
    if majority_theme != row_theme and majority_theme_count >= MIN_NEIGHBORS:
        disagreements.append('theme')
    if majority_audience != row_audience and majority_audience_count >= MIN_NEIGHBORS:
        disagreements.append('audience')

    if disagreements:
        reports.append({
            'title': row['title'],
            'url': row['url'],
            'labels': row['labels'],
            'disagreements': disagreements,
            'neighbor_majority': {
                'ai_focus': {'label': majority_ai, 'count': majority_ai_count},
                'theme': {'label': majority_theme, 'count': majority_theme_count},
                'audience': {'label': majority_audience, 'count': majority_audience_count},
            },
            'neighbors': [
                {
                    'similarity': round(sim, 4),
                    'title': n['title'],
                    'url': n['url'],
                    'labels': n['labels'],
                }
                for sim, n in neighbors
            ],
        })

summary = {
    'rows': len(rows),
    'topK': TOP_K,
    'minMajority': MIN_NEIGHBORS,
    'flagged': len(reports),
    'byDisagreement': Counter(key for r in reports for key in r['disagreements']),
    'examples': reports[:50],
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(summary, indent=2))
print(OUT)
print('flagged', len(reports))
print('byDisagreement', dict(summary['byDisagreement']))
