#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import duckdb

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOTS_DIR = ROOT / 'sessions' / 'snapshots'
DEFAULT_DB = ROOT / 'tmp' / 'snapshots.duckdb'


@dataclass
class SnapshotRecord:
    order_index: int
    file_name: str
    snapshot_ts: datetime
    session_id: str
    title: str | None
    url: str | None
    capacity: int | None
    remaining_capacity: int | None
    registrant_count: int | None
    room: str | None
    date_text: str | None
    start_time_text: str | None


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc)


def maybe_int(value):
    if value in (None, ''):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def load_snapshot_rows() -> tuple[list[tuple], list[SnapshotRecord], list[Path]]:
    snapshot_paths = sorted(SNAPSHOTS_DIR.glob('*.json'))
    snapshot_rows: list[tuple] = []
    records: list[SnapshotRecord] = []
    for index, path in enumerate(snapshot_paths):
        payload = json.loads(path.read_text())
        snapshot_ts = parse_ts(payload['scraped_at'])
        snapshot_rows.append((index, path.name, snapshot_ts))
        for session in payload['sessions']:
            session_id = str(session.get('id') or '')
            if not session_id:
                continue
            records.append(
                SnapshotRecord(
                    order_index=index,
                    file_name=path.name,
                    snapshot_ts=snapshot_ts,
                    session_id=session_id,
                    title=session.get('title'),
                    url=session.get('url'),
                    capacity=maybe_int(session.get('capacity')),
                    remaining_capacity=maybe_int(session.get('remaining_capacity')),
                    registrant_count=maybe_int(session.get('registrant_count')),
                    room=session.get('room'),
                    date_text=session.get('date_text'),
                    start_time_text=session.get('start_time_text'),
                )
            )
    return snapshot_rows, records, snapshot_paths


def build_summary_rows(records: list[SnapshotRecord], snapshot_count: int) -> list[tuple]:
    by_session: dict[str, list[SnapshotRecord]] = {}
    for record in records:
        by_session.setdefault(record.session_id, []).append(record)

    summary_rows: list[tuple] = []
    for session_id, items in by_session.items():
        items.sort(key=lambda item: item.order_index)
        first = items[0]
        last = items[-1]
        present_indices = {item.order_index for item in items}
        transition_count = 0
        prev_present = False
        for index in range(snapshot_count):
            present = index in present_indices
            if index > 0 and present != prev_present:
                transition_count += 1
            prev_present = present

        registrants = [item.registrant_count for item in items if item.registrant_count is not None]
        remaining = [item.remaining_capacity for item in items if item.remaining_capacity is not None]
        capacities = [item.capacity for item in items if item.capacity is not None and item.capacity > 0]
        first_reg = next((item.registrant_count for item in items if item.registrant_count is not None), None)
        last_reg = next((item.registrant_count for item in reversed(items) if item.registrant_count is not None), None)
        first_remaining = next((item.remaining_capacity for item in items if item.remaining_capacity is not None), None)
        last_remaining = next((item.remaining_capacity for item in reversed(items) if item.remaining_capacity is not None), None)
        first_capacity = next((item.capacity for item in items if item.capacity is not None and item.capacity > 0), None)
        latest_fill_ratio = None
        max_fill_ratio = None
        if capacities and last_reg is not None:
            latest_fill_ratio = last_reg / capacities[-1]
        fill_ratios = [item.registrant_count / item.capacity for item in items if item.capacity and item.registrant_count is not None]
        if fill_ratios:
            max_fill_ratio = max(fill_ratios)

        days_observed = max((last.snapshot_ts - first.snapshot_ts).total_seconds() / 86400, 0.0)
        registrant_growth = (last_reg - first_reg) if first_reg is not None and last_reg is not None else None
        remaining_drop = (first_remaining - last_remaining) if first_remaining is not None and last_remaining is not None else None
        growth_per_day = None
        remaining_drop_per_day = None
        if days_observed > 0:
            if registrant_growth is not None:
                growth_per_day = registrant_growth / days_observed
            if remaining_drop is not None:
                remaining_drop_per_day = remaining_drop / days_observed

        summary_rows.append(
            (
                session_id,
                last.title,
                last.url,
                first.snapshot_ts,
                last.snapshot_ts,
                len(items),
                snapshot_count,
                transition_count,
                first_reg,
                last_reg,
                max(registrants) if registrants else None,
                first_remaining,
                last_remaining,
                min(remaining) if remaining else None,
                first_capacity,
                registrant_growth,
                remaining_drop,
                days_observed,
                growth_per_day,
                remaining_drop_per_day,
                latest_fill_ratio,
                max_fill_ratio,
                last.room,
                last.date_text,
                last.start_time_text,
            )
        )
    return summary_rows


def init_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    snapshot_rows, records, snapshot_paths = load_snapshot_rows()
    summary_rows = build_summary_rows(records, len(snapshot_rows))

    con = duckdb.connect(str(db_path))
    con.execute('DROP TABLE IF EXISTS snapshot_index')
    con.execute('DROP TABLE IF EXISTS snapshot_sessions')
    con.execute('DROP TABLE IF EXISTS session_summary')
    con.execute(
        '''
        CREATE TABLE snapshot_index (
          order_index INTEGER,
          file_name VARCHAR,
          snapshot_ts TIMESTAMP
        )
        '''
    )
    con.execute(
        '''
        CREATE TABLE snapshot_sessions (
          order_index INTEGER,
          file_name VARCHAR,
          snapshot_ts TIMESTAMP,
          session_id VARCHAR,
          title VARCHAR,
          url VARCHAR,
          capacity INTEGER,
          remaining_capacity INTEGER,
          registrant_count INTEGER,
          room VARCHAR,
          date_text VARCHAR,
          start_time_text VARCHAR
        )
        '''
    )
    con.execute(
        '''
        CREATE TABLE session_summary (
          session_id VARCHAR,
          title VARCHAR,
          url VARCHAR,
          first_seen_ts TIMESTAMP,
          last_seen_ts TIMESTAMP,
          presence_count INTEGER,
          snapshot_count INTEGER,
          transition_count INTEGER,
          first_registrants INTEGER,
          last_registrants INTEGER,
          max_registrants INTEGER,
          first_remaining INTEGER,
          last_remaining INTEGER,
          min_remaining INTEGER,
          capacity INTEGER,
          registrant_growth INTEGER,
          remaining_drop INTEGER,
          days_observed DOUBLE,
          registrants_per_day DOUBLE,
          seats_taken_per_day DOUBLE,
          latest_fill_ratio DOUBLE,
          max_fill_ratio DOUBLE,
          room VARCHAR,
          date_text VARCHAR,
          start_time_text VARCHAR
        )
        '''
    )
    con.executemany('INSERT INTO snapshot_index VALUES (?, ?, ?)', snapshot_rows)
    con.executemany(
        'INSERT INTO snapshot_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            (
                r.order_index,
                r.file_name,
                r.snapshot_ts,
                r.session_id,
                r.title,
                r.url,
                r.capacity,
                r.remaining_capacity,
                r.registrant_count,
                r.room,
                r.date_text,
                r.start_time_text,
            )
            for r in records
        ],
    )
    con.executemany('INSERT INTO session_summary VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', summary_rows)
    con.execute(
        '''
        CREATE OR REPLACE VIEW fast_fill_candidates AS
        SELECT
          *,
          CASE
            WHEN capacity IS NULL OR capacity <= 0 OR last_registrants IS NULL THEN NULL
            ELSE ROUND(100.0 * last_registrants / capacity, 1)
          END AS latest_fill_pct,
          CASE
            WHEN capacity IS NULL OR capacity <= 0 OR first_registrants IS NULL THEN NULL
            ELSE ROUND(100.0 * first_registrants / capacity, 1)
          END AS first_fill_pct,
          ROUND(
            COALESCE(registrants_per_day, 0) * 0.55 +
            COALESCE(100.0 * max_fill_ratio, 0) * 0.20 +
            COALESCE(registrant_growth, 0) * 0.15 +
            COALESCE(seats_taken_per_day, 0) * 0.10 -
            COALESCE(transition_count, 0) * 8,
            2
          ) AS fast_fill_score
        FROM session_summary
        '''
    )
    con.close()
    print(f'Loaded {len(snapshot_paths)} snapshots into {db_path}')
    print(f'Loaded {len(records)} session-snapshot rows and {len(summary_rows)} session summaries')


TOP_FILLERS_SQL = '''
SELECT
  session_id,
  title,
  fast_fill_score,
  first_registrants,
  last_registrants,
  registrant_growth,
  ROUND(registrants_per_day, 1) AS registrants_per_day,
  ROUND(seats_taken_per_day, 1) AS seats_taken_per_day,
  latest_fill_pct,
  presence_count,
  transition_count,
  date_text,
  start_time_text,
  room
FROM fast_fill_candidates
WHERE capacity IS NOT NULL
  AND last_registrants IS NOT NULL
  AND presence_count >= ?
ORDER BY fast_fill_score DESC, registrant_growth DESC, last_registrants DESC
LIMIT ?
'''

FLAPPY_SQL = '''
SELECT
  session_id,
  title,
  presence_count,
  snapshot_count,
  transition_count,
  first_seen_ts,
  last_seen_ts,
  first_registrants,
  last_registrants,
  room
FROM session_summary
WHERE transition_count >= ?
ORDER BY transition_count DESC, presence_count ASC, title ASC
LIMIT ?
'''

HISTORY_SQL = '''
SELECT
  file_name,
  snapshot_ts,
  registrant_count,
  remaining_capacity,
  capacity,
  date_text,
  start_time_text,
  room,
  title
FROM snapshot_sessions
WHERE session_id = ?
ORDER BY snapshot_ts
'''


def ensure_db(db_path: Path) -> None:
    if not db_path.exists():
        init_db(db_path)


def print_rows(rows: Iterable[tuple], headers: list[str]) -> None:
    rows = list(rows)
    if not rows:
        print('No rows')
        return
    widths = [len(h) for h in headers]
    for row in rows:
        for i, value in enumerate(row):
            widths[i] = max(widths[i], len('' if value is None else str(value)))
    header_line = ' | '.join(h.ljust(widths[i]) for i, h in enumerate(headers))
    print(header_line)
    print('-+-'.join('-' * w for w in widths))
    for row in rows:
        print(' | '.join(('' if value is None else str(value)).ljust(widths[i]) for i, value in enumerate(row)))


def run_top_fillers(db_path: Path, limit: int, min_presence: int) -> None:
    ensure_db(db_path)
    con = duckdb.connect(str(db_path), read_only=True)
    rows = con.execute(TOP_FILLERS_SQL, [min_presence, limit]).fetchall()
    headers = [d[0] for d in con.description]
    con.close()
    print_rows(rows, headers)


def run_flappy(db_path: Path, limit: int, min_transitions: int) -> None:
    ensure_db(db_path)
    con = duckdb.connect(str(db_path), read_only=True)
    rows = con.execute(FLAPPY_SQL, [min_transitions, limit]).fetchall()
    headers = [d[0] for d in con.description]
    con.close()
    print_rows(rows, headers)


def run_history(db_path: Path, session_id: str) -> None:
    ensure_db(db_path)
    con = duckdb.connect(str(db_path), read_only=True)
    rows = con.execute(HISTORY_SQL, [session_id]).fetchall()
    headers = [d[0] for d in con.description]
    con.close()
    print_rows(rows, headers)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='DuckDB-backed analytics over Google Next snapshot history')
    parser.add_argument('--db', type=Path, default=DEFAULT_DB, help='Path to DuckDB file (default: tmp/snapshots.duckdb)')
    sub = parser.add_subparsers(dest='command', required=True)

    sub.add_parser('init', help='Load all JSON snapshots into DuckDB tables and views')

    top = sub.add_parser('top-fillers', help='Rank sessions that filled seats quickly across snapshot history')
    top.add_argument('--limit', type=int, default=20)
    top.add_argument('--min-presence', type=int, default=2)

    flappy = sub.add_parser('flappy', help='List sessions with repeated present/absent transitions')
    flappy.add_argument('--limit', type=int, default=20)
    flappy.add_argument('--min-transitions', type=int, default=2)

    history = sub.add_parser('history', help='Show snapshot-by-snapshot history for one session id')
    history.add_argument('session_id')

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.command == 'init':
        init_db(args.db)
    elif args.command == 'top-fillers':
        run_top_fillers(args.db, args.limit, args.min_presence)
    elif args.command == 'flappy':
        run_flappy(args.db, args.limit, args.min_transitions)
    elif args.command == 'history':
        run_history(args.db, args.session_id)
    else:
        parser.error(f'Unknown command: {args.command}')


if __name__ == '__main__':
    main()
