#!/usr/bin/env bash
# Runs the database tests against a throwaway local PostgreSQL (no Docker needed).
# Requires: PostgreSQL 15+ server binaries, pgTAP, pg_prove.
# Usage: scripts/db/test-local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-$(pg_config --bindir 2>/dev/null || echo /usr/lib/postgresql/16/bin)}"
PORT="${PGTEST_PORT:-54329}"
WORK="$(mktemp -d)"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then RUN_AS=(runuser -u postgres --); chown postgres "$WORK"; fi

cleanup() { "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "create database rbms_test"
"${PSQL[@]}" -d rbms_test -c "alter database rbms_test set search_path = \"\$user\", public, extensions"
"${PSQL[@]}" -d rbms_test -f "$ROOT/scripts/db/supabase-shim.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate: $(basename "$f")"
  "${PSQL[@]}" -d rbms_test -f "$f"
done

echo "--- running database tests"
pg_prove -h "$WORK" -p "$PORT" -U postgres -d rbms_test --ext .sql -r "$ROOT/supabase/tests/database"
