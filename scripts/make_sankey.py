#!/usr/bin/env python3
import argparse
import json
import os
import re
from collections import defaultdict
from datetime import datetime
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
    'Data pros': {'Data Engineers', 'Data Analysts', 'Data Scientists', 'Database Professionals'},
    'Infra/Ops': {'Platform Engineers', 'SREs', 'IT Ops', 'Infrastructure Architects & Admins'},
    'Sec pros': {'Security Professionals'},
    'Leaders': {'IT Managers & Business Leaders', 'Executive', 'Small IT Teams'},
}

COLORS = {
    'root': '#202124', 'AI': '#4285F4', 'Not AI': '#34A853',
    'Data': '#00ACC1', 'Security': '#43A047', 'Infra': '#FB8C00',
    'Business': '#F9AB00', 'App dev': '#F28B82', 'Other': '#DADCE0',
    'Leaders': '#C62828', 'Infra/Ops': '#EF6C00', 'Developers': '#6A1B9A',
    'Data pros': '#00ACC1', 'Sec pros': '#43A047',
}

THEME_ORDER = ['App dev', 'Security', 'Data', 'Business', 'Infra', 'Other']
AUDIENCE_ORDER = ['Leaders', 'Sec pros', 'Infra/Ops', 'Data pros', 'Developers']
BAR_WIDTH = 0.022


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
    llm = session.get('llm')
    if llm and llm.get('ai_focus') in ('AI', 'Not AI'):
        return llm['ai_focus']
    hay = session_haystack(session)
    return 'AI' if any(matches_term(hay, term) for term in keywords) else 'Not AI'


def theme(session: dict) -> str:
    llm = session.get('llm')
    if llm and llm.get('theme') in ('Security', 'Data', 'Infra', 'App dev', 'Business'):
        return llm['theme']
    hay = session_haystack(session)
    for label, pattern in THEME_RULES:
        if re.search(pattern, hay):
            return label
    return 'Other'


def inferred_with_confidence(session: dict):
    hay = session_haystack(session)
    scores = defaultdict(int)
    if re.search(r'\b(executive|executives|leader|leaders|manager|managers|business leaders?|decision makers?|cio|cto|ceo|vp|director|leadership)\b', hay): scores['Leaders'] += 3
    if re.search(r'\b(security|iam|identity|threat|cyber|compliance|sovereignty|guardrail|guardrails|trust)\b', hay): scores['Sec pros'] += 3
    if re.search(r'\b(platform|platform engineers?|sre|sres|it ops|infra|infrastructure|architect|architects|admins?|kubernetes|serverless|networking|migration|multicloud|compute|storage|devops)\b', hay): scores['Infra/Ops'] += 3
    if re.search(r'\b(data engineers?|data analysts?|data scientists?|database professionals?|bigquery|analytics|looker|warehouse|database|databases)\b', hay): scores['Data pros'] += 3
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
    llm = session.get('llm')
    if llm and llm.get('audience') in ('Developers', 'Data pros', 'Infra/Ops', 'Sec pros', 'Leaders'):
        return llm['audience']
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
    top_counts = defaultdict(int)
    third_counts = defaultdict(int)
    fourth_counts = defaultdict(lambda: defaultdict(int))
    for session in sessions:
        top = ai_class(session, keywords)
        th = theme(session)
        aud = audience(session)
        top_counts[top] += 1
        third_counts[(top, th)] += 1
        if aud != 'General':
            fourth_counts[(top, th)][aud] += 1

    mid = sorted(
        [(label, top_counts[label]) for label in ('AI', 'Not AI') if top_counts[label] > 0],
        key=lambda item: (-item[1], item[0]),
    )

    third = {}
    for top, _ in mid:
        items = [(label, third_counts[(top, label)]) for label in THEME_ORDER if third_counts.get((top, label), 0) > 0]
        third[top] = sorted(items, key=lambda item: (-item[1], THEME_ORDER.index(item[0])))

    fourth = {}
    for key, counts in fourth_counts.items():
        items = [(label, counts[label]) for label in AUDIENCE_ORDER if counts.get(label, 0) > 0]
        ordered = sorted(items, key=lambda item: (-item[1], AUDIENCE_ORDER.index(item[0])))
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


def draw_multiline_label(ax, x, y_center, lines, *, x_offset=0.008, linespacing=1.0, color='#202124', fontweight='bold'):
    line_heights = [line['fontsize'] * 0.00112 * linespacing for line in lines]
    total_height = sum(line_heights)
    y = y_center + total_height / 2
    for line, height in zip(lines, line_heights):
        ax.text(
            x - x_offset,
            y - height / 2,
            line['text'],
            ha='right',
            va='center',
            fontsize=line['fontsize'],
            color=color,
            fontweight=line.get('fontweight', fontweight),
        )
        y -= height


def draw_bar(ax, x, y0, y1, color, label, value, fontsize=9, *, show_label=True, label_lines=None, x_offset=0.008, linespacing=1.0):
    ax.add_patch(Rectangle((x, y0), BAR_WIDTH, y1 - y0, facecolor=color, edgecolor='white', linewidth=1.0))
    if show_label:
        if label_lines:
            draw_multiline_label(ax, x, (y0 + y1) / 2, label_lines, x_offset=x_offset, linespacing=linespacing)
        else:
            ax.text(x - x_offset, (y0 + y1) / 2, f'{label} {value}', ha='right', va='center', fontsize=fontsize, color='#202124', fontweight='bold')


def ribbon(ax, xa, xb, ya0, ya1, yb0, yb1, color, alpha=0.34):
    c = (xb - xa) * 0.40
    verts = [
        (xa + BAR_WIDTH, ya1), (xa + BAR_WIDTH + c, ya1), (xb - c, yb1), (xb, yb1),
        (xb, yb0), (xb - c, yb0), (xa + BAR_WIDTH + c, ya0), (xa + BAR_WIDTH, ya0), (xa + BAR_WIDTH, ya1),
    ]
    codes = [MplPath.MOVETO, MplPath.CURVE4, MplPath.CURVE4, MplPath.CURVE4, MplPath.LINETO, MplPath.CURVE4, MplPath.CURVE4, MplPath.CURVE4, MplPath.CLOSEPOLY]
    ax.add_patch(PathPatch(MplPath(verts, codes), facecolor=color, edgecolor='none', alpha=alpha))


def render_sankey(
    sessions,
    output_path: Path,
    *,
    llm_classified: int = 0,
    fig_width: float = 24,
    x_positions=(0.08, 0.34, 0.64, 0.93),
    min_theme_label: int = 12,
    min_audience_label: int = 10,
):
    mid, third, fourth = build_chart_data(sessions)
    fig, ax = plt.subplots(figsize=(fig_width, 30), dpi=220)
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis('off')

    x0, x1, x2, x3 = x_positions
    top_margin, bottom_margin = 0.038, 0.038
    usable_h = 1 - top_margin - bottom_margin
    scale = usable_h / len(sessions)

    root = (bottom_margin, bottom_margin + len(sessions) * scale)
    mid_pos = stack_within(*root, mid, scale=scale, gap=0.038)
    third_pos = {parent: stack_within(*mid_pos[parent], items, scale=scale, gap=0.0075) for parent, items in third.items()}
    fourth_pos = {key: stack_within(*third_pos[key[0]][key[1]], items, scale=scale, gap=0.0038) for key, items in fourth.items()}

    draw_bar(
        ax,
        x0,
        *root,
        COLORS['root'],
        'GCP Next',
        len(sessions),
        show_label=True,
        label_lines=[
            {'text': 'Total:', 'fontsize': 34},
            {'text': str(len(sessions)), 'fontsize': 34},
            {'text': 'sessions', 'fontsize': 24},
        ],
        x_offset=0.014,
        linespacing=0.62,
    )
    for label, value in mid:
        label_size = 54 if value >= 500 else 46 if value >= 250 else 38
        count_size = max(28, label_size - 10)
        draw_bar(
            ax,
            x1,
            *mid_pos[label],
            COLORS[label],
            label,
            value,
            show_label=True,
            label_lines=[
                {'text': f'{label}:', 'fontsize': label_size},
                {'text': f'{value} sessions', 'fontsize': count_size},
            ],
            x_offset=0.012,
            linespacing=0.68,
        )
    for parent, items in third.items():
        for label, value in items:
            draw_bar(
                ax,
                x2,
                *third_pos[parent][label],
                COLORS.get(label, '#ccc'),
                label,
                value,
                fontsize=34 if value >= 220 else 28 if value >= 160 else 23 if value >= 110 else 17 if value >= 70 else 14,
                show_label=value >= min_theme_label,
            )
    for key, items in fourth.items():
        for label, value in items:
            draw_bar(
                ax,
                x3,
                *fourth_pos[key][label],
                COLORS.get(label, '#bbb'),
                label,
                value,
                fontsize=26 if value >= 150 else 21 if value >= 110 else 17 if value >= 70 else 13 if value >= 45 else 11,
                show_label=value >= min_audience_label,
            )

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

    ax.text(0.03, 0.988, 'Google Cloud Next 2026 sessions', fontsize=52, fontweight='bold', color='#202124', ha='left')
    ax.text(0.03, 0.968, 'fhoffa.github.io/google-cloud-next-2026-unofficial-scrape', fontsize=24, color='#3c4043', ha='left')
    ax.text(0.012, 0.005, 'by Felipe Hoffa\nlinkedin.com/in/hoffa', fontsize=24, color='#5f6368', ha='left', va='bottom')

    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, bbox_inches='tight', dpi=220)


def infer_publish_stamp(input_path: Path, sessions) -> str:
    candidates = []
    if input_path.exists():
        candidates.append(datetime.utcfromtimestamp(input_path.stat().st_mtime))
    for session in sessions:
        for key in ('startTime', 'start_time', 'updated', 'updatedAt', 'date'):
            value = session.get(key)
            if not value or not isinstance(value, str):
                continue
            cleaned = value.replace('Z', '+00:00')
            try:
                candidates.append(datetime.fromisoformat(cleaned))
                break
            except ValueError:
                continue
    if not candidates:
        return datetime.utcnow().strftime('%Y%m%d')
    latest = max(candidates)
    return latest.strftime('%Y%m%d')


def main():
    parser = argparse.ArgumentParser(description='Generate the Google Cloud Next AI Sankey chart.')
    parser.add_argument('--input', default=None, help='Path to sessions JSON file (default: classified_sessions.json if present, else latest.json)')
    parser.add_argument('--output', default='tmp/gcp-next-sankey-not-ai-maxi.png', help='Path to output PNG')
    parser.add_argument('--publish', action='store_true', help='Write to repo media/ using the dated published filename convention.')
    parser.add_argument('--publish-date', default=None, help='Override publish date suffix YYYYMMDD for --publish output.')
    parser.add_argument('--fig-width', default=24, type=float, help='Figure width in inches (height remains 30).')
    parser.add_argument('--x-positions', default='0.08,0.34,0.64,0.93', help='Comma-separated x positions for columns: root,ai/theme,audience.')
    parser.add_argument('--min-theme-label', default=12, type=int, help='Hide theme labels below this session count.')
    parser.add_argument('--min-audience-label', default=10, type=int, help='Hide audience labels below this session count.')
    args = parser.parse_args()

    cwd = Path.cwd()
    if args.input:
        input_path = Path(args.input)
        if not input_path.is_absolute():
            input_path = cwd / input_path
    else:
        classified = cwd / 'sessions/classified_sessions.json'
        input_path = classified if classified.exists() else cwd / 'sessions/latest.json'

    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = cwd / output_path

    data = json.loads(input_path.read_text())
    sessions = data['sessions'] if isinstance(data, dict) and 'sessions' in data else data

    if args.publish:
        stamp = args.publish_date or infer_publish_stamp(input_path, sessions)
        output_path = cwd / 'media' / f'fhoffa.github.io_google-cloud-next-2026-unofficial-scrape_sankey_{stamp}.png'

    llm_classified = sum(1 for s in sessions if s.get('llm'))
    source_label = 'LLM' if llm_classified else 'rule-based'
    print(f"Input: {input_path}  ({llm_classified}/{len(sessions)} sessions with LLM classification — {source_label})")

    x_positions = tuple(float(value.strip()) for value in args.x_positions.split(','))
    if len(x_positions) != 4:
        raise ValueError('--x-positions must contain exactly 4 comma-separated values')

    render_sankey(
        sessions,
        output_path,
        llm_classified=llm_classified,
        fig_width=args.fig_width,
        x_positions=x_positions,
        min_theme_label=args.min_theme_label,
        min_audience_label=args.min_audience_label,
    )
    print(output_path)


if __name__ == '__main__':
    main()
