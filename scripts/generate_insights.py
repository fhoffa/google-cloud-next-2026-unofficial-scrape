#!/usr/bin/env python3
import argparse
import json
import re
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from urllib.parse import urlencode


STOP_WORDS = {
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'from', 'into',
    'your', 'you', 'our', 'their', 'this', 'that', 'these', 'those', 'is', 'are', 'be', 'as', 'it',
    'its', 'how', 'why', 'what', 'when', 'where', 'who', 'will', 'can', 'all', 'more', 'new', 'using',
    'use', 'build', 'building', 'through', 'across', 'after', 'before', 'about', 'cloud', 'google',
    'next', 'session', 'sessions', 'learn', 'join', 'explore', 'discover', 'talks', 'relevant',
    'attending', 'shared', 'contact', 'may', 'they',
}
SHORT_WORD_ALLOWLIST = {'ai', 'ml', 'go'}
WORD_NORMALIZATION = {
    'llms': 'llm',
    'models': 'model',
    'meetups': 'meetup',
    'agents': 'agent',
    'databases': 'database',
    'developers': 'developer',
    'leaders': 'leader',
    'scientists': 'scientist',
    'analysts': 'analyst',
    'managers': 'manager',
    'architects': 'architect',
    'teams': 'team',
    'services': 'service',
    'workshops': 'workshop',
    'breakouts': 'breakout',
    'groups': 'group',
    'applications': 'application',
}
WORD_DISPLAY = {
    'llm': 'LLM/LLMs',
    'model': 'model/models',
    'meetup': 'meetup/meetups',
    'agent': 'agent/agents',
    'database': 'database/databases',
    'developer': 'developer/developers',
    'leader': 'leader/leaders',
    'scientist': 'scientist/scientists',
    'analyst': 'analyst/analysts',
    'manager': 'manager/managers',
    'architect': 'architect/architects',
    'team': 'team/teams',
    'service': 'service/services',
    'workshop': 'workshop/workshops',
    'breakout': 'breakout/breakouts',
    'group': 'group/groups',
    'application': 'application/applications',
}


def esc(text):
    return escape(str(text or ''), quote=True)


def html_join(parts):
    return ''.join(part for part in parts if part)


def make_href(params):
    return f"./index.html?{urlencode(params)}"


def counts(key, subset):
    mapped = {}
    for session in subset:
        value = ((session.get('llm') or {}).get(key))
        if not value or (key == 'audience' and value == 'General'):
            continue
        mapped[value] = mapped.get(value, 0) + 1
    return sorted(mapped.items(), key=lambda item: (-item[1], item[0]))


def word_stats(subset):
    counts_map = {}
    session_sets = {}
    for session in subset:
        session_id = session.get('url') or session.get('title') or ''
        text = ' '.join(
            str(value)
            for value in [
                session.get('title'),
                session.get('description'),
                *(session.get('topics') or []),
                *[(speaker.get('company') or '') for speaker in (session.get('speakers') or [])],
            ]
            if value
        ).lower()
        for raw_word in re.findall(r'[a-z][a-z0-9+.-]*', text):
            cleaned = re.sub(r'^[^a-z0-9+#+]+|[^a-z0-9+#+]+$', '', raw_word)
            word = WORD_NORMALIZATION.get(cleaned, cleaned)
            if not word:
                continue
            if (len(word) < 3 and word not in SHORT_WORD_ALLOWLIST) or word in STOP_WORDS:
                continue
            counts_map[word] = counts_map.get(word, 0) + 1
            session_sets.setdefault(word, set()).add(session_id)
    items = [
        {
            'word': word,
            'count': count,
            'sessionCount': len(session_sets.get(word, set())),
            'label': WORD_DISPLAY.get(word, word),
        }
        for word, count in counts_map.items()
    ]
    items.sort(key=lambda item: (-item['count'], item['word']))
    return items[:18]


def company_counts(subset, exclude_google=False):
    mapped = {}
    for session in subset:
        seen = set()
        for speaker in session.get('speakers') or []:
            company = str(speaker.get('company') or '').strip()
            if not company or company in seen:
                continue
            seen.add(company)
            if exclude_google and re.match(r'^google( cloud)?$', company, re.I):
                continue
            mapped[company] = mapped.get(company, 0) + 1
    items = sorted(mapped.items(), key=lambda item: (-item[1], item[0]))
    return [(name, count) for name, count in items if count >= 2][:120]


def rank_items_html(items, color, params_for):
    max_count = items[0][1] if items else 1
    html = []
    for name, count in items:
        width = (count / max_count) * 100 if max_count else 0
        html.append(
            f'<a class="rank-row" href="{esc(make_href(params_for(name)))}" style="text-decoration:none;color:inherit">'
            f'<div class="rank-main"><div class="rank-name">{esc(name)}</div>'
            f'<div class="rank-bar"><div class="rank-fill" style="width:{width:.6f}%;background:{color}"></div></div></div>'
            f'<div class="rank-count">{count}</div></a>'
        )
    return ''.join(html)


def word_items_html(items, extra_params=None):
    extra_params = extra_params or {}
    html = []
    for item in items:
        params = {'q': item['word'], **extra_params}
        html.append(
            f'<a class="word-chip" href="{esc(make_href(params))}">{esc(item["label"])} <small>{item["count"]}</small></a>'
        )
    return ''.join(html)


def chip_items_html(items, key):
    return ''.join(
        f'<a class="chip" href="{esc(make_href({key: name}))}">{esc(name)} ({count})</a>'
        for name, count in items
    )


def stats_cards_html(cards):
    html = []
    for card in cards:
        sub = f'<div class="stat-sub">{card["sub"]}</div>' if card.get('sub') else ''
        html.append(
            f'<div class="card"><div class="stat-value">{esc(card["value"])}</div>'
            f'<div class="stat-label">{esc(card["label"])}</div>{sub}</div>'
        )
    return ''.join(html)


def observation_list_html(items):
    return ''.join(f'<li>{item}</li>' for item in items)


def slices_html(items):
    html = []
    for item in items:
        html.append(
            f'<a class="slice-link" href="{esc(make_href(item["params"]))}">'
            f'<strong>{esc(item["title"])}</strong><span>{esc(item["desc"])}</span></a>'
        )
    return ''.join(html)


def build_summary(sessions, sankey_latest, generated_at):
    with_llm = [session for session in sessions if session.get('llm')]
    ai = counts('ai_focus', with_llm)
    themes = counts('theme', with_llm)
    audiences = counts('audience', with_llm)
    ai_sessions = [session for session in with_llm if (session.get('llm') or {}).get('ai_focus') == 'AI']
    not_ai_sessions = [session for session in with_llm if (session.get('llm') or {}).get('ai_focus') == 'Not AI']
    ai_themes = counts('theme', ai_sessions)
    not_ai_themes = counts('theme', not_ai_sessions)
    total = len(sessions)
    ai_count = next((count for name, count in ai if name == 'AI'), 0)
    not_ai_count = next((count for name, count in ai if name == 'Not AI'), 0)
    non_google_company_count = len({
        str(speaker.get('company') or '').strip()
        for session in with_llm
        for speaker in (session.get('speakers') or [])
        if str(speaker.get('company') or '').strip() and not re.match(r'^google( cloud)?$', str(speaker.get('company') or '').strip(), re.I)
    })

    top_non_google = company_counts(with_llm, exclude_google=True)
    top_company = top_non_google[0] if top_non_google else None
    second_company = top_non_google[1] if len(top_non_google) > 1 else None
    geotab = next(((name, count) for name, count in top_non_google if name == 'Geotab'), None)

    company_observation_parts = []
    if top_company:
        company_observation_parts.append(
            f'The strongest outside voice in this catalog is <strong>{esc(top_company[0])}</strong>, with <strong>{top_company[1]}</strong> sessions — a signal that this company is showing up repeatedly, not just making a single cameo.'
        )
    if top_company and second_company:
        company_observation_parts.append(
            f'{esc(top_company[0])} and {esc(second_company[0])} set the pace near the top, which makes this section useful as a quick read on which partners, customers, and ecosystem names Google is putting on stage over and over.'
        )
    if geotab:
        company_observation_parts.append(
            f'<strong>Geotab</strong> makes the recurring-speaker list too, with <strong>{geotab[1]}</strong> sessions, so it should be visible here rather than disappearing into the long tail.'
        )
    company_observation_parts.append(
        'Read this less as a popularity contest and more as a map of repeated external presence: who appears once can be incidental; who appears again and again is part of the conference narrative.'
    )
    company_observations_html = ' '.join(company_observation_parts)

    leader_share = next((count for name, count in audiences if name == 'Leaders'), 0)
    dev_share = next((count for name, count in audiences if name == 'Developers'), 0)
    top_ai_theme = ai_themes[0] if ai_themes else ('n/a', 0)
    top_not_ai_theme = not_ai_themes[0] if not_ai_themes else ('n/a', 0)
    observations_html = [
        f'AI now represents <strong>{(ai_count / max(1, total)) * 100:.1f}%</strong> of the full conference catalog ({ai_count}/{total}).',
        f'The largest overall theme is <strong>{esc(themes[0][0] if themes else "n/a")}</strong> with <strong>{themes[0][1] if themes else 0}</strong> sessions.',
        f'Inside AI, the biggest theme is <strong>{esc(top_ai_theme[0])}</strong> ({top_ai_theme[1]} sessions).',
        f'Outside AI, the biggest theme is <strong>{esc(top_not_ai_theme[0])}</strong> ({top_not_ai_theme[1]} sessions).',
        f'The audience split suggests more content for <strong>{"leaders" if leader_share >= dev_share else "developers"}</strong> than for the other group ({max(leader_share, dev_share)} vs {min(leader_share, dev_share)} sessions).',
    ]

    summary = {
        'meta': {
            'generatedAt': generated_at,
            'source': 'sessions/classified_sessions.json',
            'template': 'templates/insights.template.html',
            'outputHtml': 'insights.html',
            'sankeyLatest': sankey_latest,
        },
        'lede': 'What is Google Cloud Next 2026 actually about? This page surfaces the shape of the conference — AI vs not AI, dominant themes, intended audiences, standout companies, and the most interesting paths through the catalog.',
        'stats': [
            {'value': f'{total:,}', 'label': 'Total sessions'},
            {'value': f'{(ai_count / max(1, total)) * 100:.0f}%', 'label': 'AI share of the conference', 'sub': f'{ai_count:,} AI · {not_ai_count:,} not AI'},
            {'value': themes[0][0] if themes else 'n/a', 'label': 'Largest theme', 'sub': f'{themes[0][1] if themes else 0} sessions'},
            {'value': audiences[0][0] if audiences else 'n/a', 'label': 'Largest audience', 'sub': f'{audiences[0][1] if audiences else 0} sessions'},
            {'value': f'{non_google_company_count:,}', 'label': 'Non-Google companies represented'},
        ],
        'quickPivots': {
            'aiFocus': [{'name': name, 'count': count, 'href': make_href({'ai_focus': name})} for name, count in ai],
            'themes': [{'name': name, 'count': count, 'href': make_href({'theme': name})} for name, count in themes[:8]],
            'audiences': [{'name': name, 'count': count, 'href': make_href({'audience': name})} for name, count in audiences[:8]],
        },
        'observations': observations_html,
        'rankings': {
            'topThemes': [{'name': name, 'count': count, 'href': make_href({'theme': name})} for name, count in themes[:8]],
            'topAudiences': [{'name': name, 'count': count, 'href': make_href({'audience': name})} for name, count in audiences[:8]],
            'topAiThemes': [{'name': name, 'count': count, 'href': make_href({'ai_focus': 'AI', 'theme': name})} for name, count in ai_themes[:8]],
            'topNotAiThemes': [{'name': name, 'count': count, 'href': make_href({'ai_focus': 'Not AI', 'theme': name})} for name, count in not_ai_themes[:8]],
        },
        'topWords': {
            'all': [{'word': item['word'], 'label': item['label'], 'count': item['count'], 'sessionCount': item['sessionCount'], 'href': make_href({'q': item['word']})} for item in word_stats(with_llm)],
            'ai': [{'word': item['word'], 'label': item['label'], 'count': item['count'], 'sessionCount': item['sessionCount'], 'href': make_href({'q': item['word'], 'ai_focus': 'AI'})} for item in word_stats(ai_sessions)],
            'notAi': [{'word': item['word'], 'label': item['label'], 'count': item['count'], 'sessionCount': item['sessionCount'], 'href': make_href({'q': item['word'], 'ai_focus': 'Not AI'})} for item in word_stats(not_ai_sessions)],
        },
        'companies': {
            'observationHtml': company_observations_html,
            'topNonGoogle': [{'name': name, 'count': count, 'href': make_href({'company': name})} for name, count in top_non_google],
            'minimumCount': 2,
            'limit': 120,
        },
        'interestingSlices': [
            {'title': 'AI for Leaders', 'desc': 'Strategic and executive-facing AI sessions', 'params': {'ai_focus': 'AI', 'audience': 'Leaders'}},
            {'title': 'AI for Developers', 'desc': 'Builder-focused AI sessions', 'params': {'ai_focus': 'AI', 'audience': 'Developers'}},
            {'title': 'AI Infrastructure', 'desc': 'Where AI meets platforms and ops', 'params': {'ai_focus': 'AI', 'theme': 'Infra'}},
            {'title': 'Not AI Security', 'desc': 'Security sessions outside the AI bucket', 'params': {'ai_focus': 'Not AI', 'theme': 'Security'}},
            {'title': 'Data pros', 'desc': 'Sessions explicitly aimed at data practitioners', 'params': {'audience': 'Data pros'}},
            {'title': 'Business for Leaders', 'desc': 'Executive/business-oriented conference framing', 'params': {'theme': 'Business', 'audience': 'Leaders'}},
        ],
    }
    return summary


def render_html(summary, template_text):
    ai_focus_counts = [(item['name'], item['count']) for item in summary['quickPivots']['aiFocus']]
    theme_counts = [(item['name'], item['count']) for item in summary['quickPivots']['themes']]
    audience_counts = [(item['name'], item['count']) for item in summary['quickPivots']['audiences']]
    top_themes = [(item['name'], item['count']) for item in summary['rankings']['topThemes']]
    top_audiences = [(item['name'], item['count']) for item in summary['rankings']['topAudiences']]
    top_ai_themes = [(item['name'], item['count']) for item in summary['rankings']['topAiThemes']]
    top_not_ai_themes = [(item['name'], item['count']) for item in summary['rankings']['topNotAiThemes']]
    top_non_google = [(item['name'], item['count']) for item in summary['companies']['topNonGoogle']]

    replacements = {
        '__OG_IMAGE__': esc(summary['meta']['sankeyLatest']),
        '__GENERATED_ON__': esc(summary['meta']['generatedAt']),
        '__LEDE__': esc(summary['lede']),
        '__DEFAULT_SANKEY__': esc(summary['meta']['sankeyLatest']),
        '__STATS_HTML__': stats_cards_html(summary['stats']),
        '__OBSERVATIONS_HTML__': observation_list_html(summary['observations']),
        '__AI_FOCUS_LINKS_HTML__': chip_items_html(ai_focus_counts, 'ai_focus'),
        '__THEME_LINKS_HTML__': chip_items_html(theme_counts, 'theme'),
        '__AUDIENCE_LINKS_HTML__': chip_items_html(audience_counts, 'audience'),
        '__TOP_THEMES_HTML__': rank_items_html(top_themes, '#4285f4', lambda name: {'theme': name}),
        '__TOP_AUDIENCES_HTML__': rank_items_html(top_audiences, '#34a853', lambda name: {'audience': name}),
        '__TOP_AI_THEMES_HTML__': rank_items_html(top_ai_themes, '#c62828', lambda name: {'ai_focus': 'AI', 'theme': name}),
        '__TOP_NOT_AI_THEMES_HTML__': rank_items_html(top_not_ai_themes, '#ef6c00', lambda name: {'ai_focus': 'Not AI', 'theme': name}),
        '__TOP_WORDS_ALL_HTML__': word_items_html(summary['topWords']['all']),
        '__TOP_WORDS_AI_HTML__': word_items_html(summary['topWords']['ai'], {'ai_focus': 'AI'}),
        '__TOP_WORDS_NOT_AI_HTML__': word_items_html(summary['topWords']['notAi'], {'ai_focus': 'Not AI'}),
        '__COMPANY_OBSERVATIONS_HTML__': summary['companies']['observationHtml'],
        '__TOP_NON_GOOGLE_COMPANIES_HTML__': rank_items_html(top_non_google, '#6a1b9a', lambda name: {'company': name}),
        '__INTERESTING_SLICES_HTML__': slices_html(summary['interestingSlices']),
    }
    html = template_text
    for key, value in replacements.items():
        html = html.replace(key, value)
    return html


def main():
    parser = argparse.ArgumentParser(description='Generate the static insights summary artifact and HTML page.')
    parser.add_argument('--input', default='sessions/classified_sessions.json', help='Path to the classified sessions JSON.')
    parser.add_argument('--template', default='templates/insights.template.html', help='Path to the HTML template.')
    parser.add_argument('--output-html', default='insights.html', help='Path to write the generated insights HTML.')
    parser.add_argument('--output-summary', default='media/insights-summary.json', help='Path to write the summary JSON.')
    parser.add_argument('--sankey-index', default='media/sankey-index.json', help='Path to the sankey index manifest.')
    parser.add_argument('--generated-at', default=None, help='Override the generated timestamp written into the summary/html.')
    args = parser.parse_args()

    cwd = Path.cwd()
    input_path = cwd / args.input
    template_path = cwd / args.template
    output_html_path = cwd / args.output_html
    output_summary_path = cwd / args.output_summary
    sankey_index_path = cwd / args.sankey_index

    sessions_payload = json.loads(input_path.read_text())
    sessions = sessions_payload['sessions'] if isinstance(sessions_payload, dict) and 'sessions' in sessions_payload else sessions_payload
    sankey_latest = ''
    if sankey_index_path.exists():
        sankey_latest = json.loads(sankey_index_path.read_text()).get('latest', '')
    if not sankey_latest:
        sankey_latest = './media/fhoffa.github.io_google-cloud-next-2026-unofficial-scrape_sankey_20260331.png'

    generated_at = args.generated_at or datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    summary = build_summary(sessions, sankey_latest, generated_at)
    html = render_html(summary, template_path.read_text())

    output_summary_path.parent.mkdir(parents=True, exist_ok=True)
    output_summary_path.write_text(json.dumps(summary, indent=2) + '\n')
    output_html_path.write_text(html)

    print(output_summary_path)
    print(output_html_path)


if __name__ == '__main__':
    main()
