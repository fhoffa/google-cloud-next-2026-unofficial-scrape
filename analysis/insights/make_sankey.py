#!/usr/bin/env python3
import argparse
import json
import os
import re
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, PathPatch
from matplotlib.path import Path as MplPath

AI_KEYWORDS = [
    'ai', 'gemini', 'agent', 'agents', 'llm', 'ml', 'machine learning', 'genai',
    'generative', 'vertex', 'prompt', 'rag', 'inference', 'model', 'models',
    'foundation', 'agentic', 'agentspace', 'notebooklm', 'deepmind', 'tensorflow',
    'gemma', 'mcp',
]

THEME_RULES = [
    ('Security', r'\b(security|iam|identity|threat|cyber|compliance|sovereignty|guardrail|trust)\b'),
    ('Data', r'\b(data|database|bigquery|analytics|looker|warehouse)\b'),
    ('Infra', r'\b(infrastructure|network|networking|kubernetes|serverless|migration|multicloud|compute|storage|platform|sre|devops|architecture|architect)\b'),
    ('App dev', r'\b(developer|developers|application|applications|app|api|apis|firebase|mobile|web)\b'),
    ('Business', r'\b(business|industry|partner|leadership|leader|leaders|manager|managers|executive|customer|enterprise|innovation|startup)\b'),
]

OFFICIAL_AUDIENCE_TAGS = {
    'Developers': {'Application Developers'},
    'Data': {'Data Engineers', 'Data Analysts', 'Data Scientists', 'Database Professionals'},
    'Infra/Ops': {'Platform Engineers', 'SREs', 'IT Ops', 'Infrastructure Architects & Admins'},
    'Security': {'Security Professionals'},
    'Leaders': {'IT Managers & Business Leaders', 'Executive', 'Small IT Teams'},
}

COLORS = {
    'root': '#202124', 'AI': '#4285F4', 'Not AI': '#34A853',
    'Data': '#00ACC1', 'Security': '#43A047', 'Infra': '#FB8C00',
    'Business': '#F9AB00', 'App dev': '#F28B82', 'Other': '#DADCE0',
    'Leaders': '#C62828', 'Infra/Ops': '#EF6C00', 'Developers': '#6A1B9A'
}

THIRD_ORDER = {
    'AI': [('Data', 298), ('Security', 272), ('Infra', 193), ('Business', 80), ('App dev', 78), ('Other', 7)],
    'Not AI': [('Security', 43), ('Data', 23), ('Infra', 19), ('App dev', 13), ('Business', 11)],
}


def split_filter_terms(value: str):
    return [re.sub(r"^['\"]|['\"]$", '', part).strip().lower() for part in re.findall(r'"[^"]+"|\'[^\']+\'|\S+', value) if part.strip()]


def matches_term(haystack: str, term: str) -> bool:
    return (term in haystack) if re.search(r'\s', term) else bool(re.search(rf'\b{re.escape(term)}\b', haystack))


def session_haystack(session: dict) -> str:
    return ' '.join([
        session.get('title') or '',
        session.get('description') or '',
        session.get('room') or '',
        *(session.get('topics') or []),
        *[x for item in (session.get('speakers') or []) for x in [item.get('name') or '', item.get('company') or '']],
    ]).lower()


def ai_class(session: dict, keywords):
    hay = session_haystack(session)
    return 'AI' if any(matches_term(hay, term) for term in keywords) else 'Not AI'


def theme(session: dict) -> str:
    hay = session_haystack(session)
    for label, pattern in THEME_RULES:
        if re.search(pattern, hay):
            return label
    return 'Other'


def inferred_with_confidence(session: dict):
    hay = session_haystack(session)
    scores = defaultdict(int)
    if re.search(r'\b(executive|executives|leader|leaders|manager|managers|business leaders?|decision makers?|cio|cto|ceo|vp|director|leadership)\b', hay): scores['Leaders'] += 3
    if re.search(r'\b(security|iam|identity|threat|cyber|compliance|sovereignty|guardrail|guardrails|trust)\b', hay): scores['Security'] += 3
    if re.search(r'\b(platform|platform engineers?|sre|sres|it ops|infra|infrastructure|architect|architects|admins?|kubernetes|serverless|networking|migration|multicloud|compute|storage|devops)\b', hay): scores['Infra/Ops'] += 3
    if re.search(r'\b(data engineers?|data analysts?|data scientists?|database professionals?|bigquery|analytics|looker|warehouse|database|databases)\b', hay): scores['Data'] += 3
    if re.search(r'\b(application developers?|developer meetup|developers?\b|app development|api\b|apis\b|firebase|mobile|web|code|coding|builder-to-builder)\b', hay): scores['Developers'] += 3
    if re.search(r'\bfor developers\b', hay): scores['Developers'] += 2
    if re.search(r'\bfor leaders\b', hay): scores['Leaders'] += 2
    if re.search(r'\bmeetup\b', hay): scores['Developers'] += 1
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    if not ranked:
        return 'General', 0
    label, score = ranked[0]
    second = ranked[1][1] if len(ranked) > 1 else 0
    return label, score - second


def audience(session: dict) -> str:
    topics = set(session.get('topics') or [])
    for label, topicset in OFFICIAL_AUDIENCE_TAGS.items():
        if topics & topicset:
            return label
    label, confidence = inferred_with_confidence(session)
    if confidence >= 2 and label != 'General':
        return label
    return 'General'


def build_chart_data(sessions):
    keywords = AI_KEYWORDS
    mid = [('AI', 0), ('Not AI', 0)]
    third_counts = defaultdict(int)
    fourth_counts = defaultdict(lambda: defaultdict(int))
    for session in sessions:
        top = ai_class(session, keywords)
        th = theme(session)
        aud = audience(session)
        if top == 'AI':
            mid[0] = ('AI', mid[0][1] + 1)
        else:
            mid[1] = ('Not AI', mid[1][1] + 1)
        third_counts[(top, th)] += 1
        if aud != 'General':
            fourth_counts[(top, th)][aud] += 1
    third = {
        'AI': [(label, third_counts.get(('AI', label), 0)) for label, _ in THIRD_ORDER['AI'] if third_counts.get(('AI', label), 0) > 0],
        'Not AI': [(label, third_counts.get(('Not AI', label), 0)) for label, _ in THIRD_ORDER['Not AI'] if third_counts.get(('Not AI', label), 0) > 0],
    }
    fourth = {}
    audience_order = ['Leaders', 'Security', 'Infra/Ops', 'Data', 'Developers']
    for key, counts in fourth_counts.items():
        ordered = [(label, counts[label]) for label in audience_order if counts.get(label, 0) > 0]
        if ordered:
            fourth[key] = ordered
    return mid, third, fourth


def stack_within(y0, y1, items, scale, gap=0.005):
    available = y1 - y0
    total_h = sum(v * scale for _, v in items)
    total_gap = gap * (len(items) - 1)
    start = y1 - (available - total_h - total_gap) / 2
    out = {}
    y = start
    for label, value in items:
        h = value * scale
        out[label] = (y - h, y)
        y -= h + gap
    return out


def draw_bar(ax, x, y0, y1, color, label, value, fontsize=9):
    bar_w = 0.028
    ax.add_patch(Rectangle((x, y0), bar_w, y1 - y0, facecolor=color, edgecolor='white', linewidth=1.0))
    ax.text(x - 0.008, (y0 + y1) / 2, f'{label} {value}', ha='right', va='center', fontsize=fontsize, color='#202124', fontweight='bold')


def ribbon(ax, xa, xb, ya0, ya1, yb0, yb1, color, alpha=0.34):
    bar_w = 0.028
    c = (xb - xa) * 0.40
    verts = [
        (xa + bar_w, ya1), (xa + bar_w + c, ya1), (xb - c, yb1), (xb, yb1),
        (xb, yb0), (xb - c, yb0), (xa + bar_w + c, ya0), (xa + bar_w, ya0), (xa + bar_w, ya1),
    ]
    codes = [MplPath.MOVETO, MplPath.CURVE4, MplPath.CURVE4, MplPath.CURVE4, MplPath.LINETO, MplPath.CURVE4, MplPath.CURVE4, MplPath.CURVE4, MplPath.CLOSEPOLY]
    ax.add_patch(PathPatch(MplPath(verts, codes), facecolor=color, edgecolor='none', alpha=alpha))


def render_sankey(sessions, output_path: Path):
    mid, third, fourth = build_chart_data(sessions)
    fig, ax = plt.subplots(figsize=(18, 24), dpi=220)
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis('off')

    x0, x1, x2, x3 = 0.14, 0.40, 0.63, 0.88
    top_margin, bottom_margin = 0.038, 0.038
    usable_h = 1 - top_margin - bottom_margin
    scale = usable_h / len(sessions)

    root = (bottom_margin, bottom_margin + len(sessions) * scale)
    mid_pos = stack_within(*root, mid, scale=scale, gap=0.038)
    third_pos = {parent: stack_within(*mid_pos[parent], items, scale=scale, gap=0.0075) for parent, items in third.items()}
    fourth_pos = {key: stack_within(*third_pos[key[0]][key[1]], items, scale=scale, gap=0.0038) for key, items in fourth.items()}

    draw_bar(ax, x0, *root, COLORS['root'], 'GCP Next', len(sessions), fontsize=13.2)
    for label, value in mid:
        draw_bar(ax, x1, *mid_pos[label], COLORS[label], label, value, fontsize=28.5)
    for parent, items in third.items():
        for label, value in items:
            draw_bar(ax, x2, *third_pos[parent][label], COLORS.get(label, '#ccc'), label, value, fontsize=11.2)
    for key, items in fourth.items():
        for label, value in items:
            draw_bar(ax, x3, *fourth_pos[key][label], COLORS.get(label, '#bbb'), label, value, fontsize=8.8)

    cursor = root[1]
    for label, value in mid:
        h = value * scale
        ribbon(ax, x0, x1, cursor - h, cursor, *mid_pos[label], COLORS[label], alpha=0.26)
        cursor -= h
    for parent, items in third.items():
        cursor = mid_pos[parent][1]
        for label, value in items:
            h = value * scale
            ribbon(ax, x1, x2, cursor - h, cursor, *third_pos[parent][label], COLORS.get(label, COLORS[parent]), alpha=0.36)
            cursor -= h
    for key, items in fourth.items():
        cursor = third_pos[key[0]][key[1]][1]
        for label, value in items:
            h = value * scale
            ribbon(ax, x2, x3, cursor - h, cursor, *fourth_pos[key][label], COLORS.get(label, '#bbb'), alpha=0.44)
            cursor -= h

    ax.text(0.06, 0.986, 'Google Cloud Next 2026 sessions', fontsize=24, fontweight='bold', color='#202124', ha='left')
    ax.text(0.06, 0.965, 'GCP Next → AI vs Not AI → theme → audience', fontsize=12.6, color='#5f6368', ha='left')
    ax.text(0.06, 0.948, 'Audience uses official tags first; confident guesses fill gaps. Branches end early instead of showing General.', fontsize=10.1, color='#5f6368', ha='left')

    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, bbox_inches='tight', dpi=220)


def main():
    parser = argparse.ArgumentParser(description='Generate the Google Cloud Next AI Sankey chart.')
    parser.add_argument('--input', default='sessions/latest.json', help='Path to sessions JSON file')
    parser.add_argument('--output', default='tmp/gcp-next-sankey-not-ai-maxi.png', help='Path to output PNG')
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.is_absolute():
        input_path = Path.cwd() / input_path
    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = Path.cwd() / output_path

    data = json.loads(input_path.read_text())
    sessions = data['sessions'] if isinstance(data, dict) and 'sessions' in data else data
    render_sankey(sessions, output_path)
    print(output_path)


if __name__ == '__main__':
    main()
