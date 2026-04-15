#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PYTHON="${PYTHON:-/root/.openclaw/workspace/.venv/bin/python}"
"$PYTHON" scripts/classify_new_sessions_rules.py
node scripts/generate_changelog.mjs
node scripts/generate_insights.mjs
node scripts/generate_hourly_overview.mjs
"$PYTHON" scripts/make_sankey.py
"$PYTHON" scripts/build_related_sessions_2026.py
node --test tests/parser.test.mjs tests/refresh-process.test.mjs tests/website.test.mjs tests/company-identity.test.mjs
