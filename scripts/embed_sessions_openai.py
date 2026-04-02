#!/usr/bin/env python3
import json
import os
import time
from pathlib import Path
from urllib import request

ROOT = Path(__file__).resolve().parents[1]
INPUT = Path(os.environ.get('EMBED_INPUT', ROOT / 'media' / 'cluster-audit' / 'embedding-payload.jsonl'))
OUTPUT = Path(os.environ.get('EMBED_OUTPUT', ROOT / 'media' / 'cluster-audit' / 'session-embeddings.jsonl'))
MODEL = os.environ.get('EMBED_MODEL', 'text-embedding-3-small')
API_KEY = os.environ.get('OPENAI_API_KEY', '')
URL = 'https://api.openai.com/v1/embeddings'
BATCH = int(os.environ.get('EMBED_BATCH_SIZE', '64'))
MAX_ROWS = int(os.environ.get('EMBED_MAX_ROWS', '0'))


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


def main():
    if not API_KEY:
        raise SystemExit('OPENAI_API_KEY missing')
    rows = [json.loads(line) for line in INPUT.read_text().splitlines() if line.strip()]
    if MAX_ROWS > 0:
        rows = rows[:MAX_ROWS]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open('w', encoding='utf-8') as out:
        for batch_num, batch in enumerate(chunks(rows, BATCH), start=1):
            texts = [row['text'] for row in batch]
            result = call_embeddings(texts)
            for row, emb in zip(batch, result['data']):
                out.write(json.dumps({
                    'row_id': row['row_id'],
                    'title': row['title'],
                    'url': row['url'],
                    'labels': row.get('labels', {}),
                    'topics': row.get('topics', []),
                    'model': MODEL,
                    'embedding': emb['embedding'],
                }) + '\n')
            print(f'batch={batch_num} rows={len(batch)} total_written={batch_num * BATCH if len(batch)==BATCH else (batch_num-1)*BATCH + len(batch)}', flush=True)
            time.sleep(0.2)
    print(OUTPUT)


if __name__ == '__main__':
    main()
