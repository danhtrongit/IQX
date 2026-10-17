#!/usr/bin/env bash
# Local Học viện v3.2 stack: backend API on :3001 + Vite dev server, against a SEPARATE local database.
#
#   backend/scripts/dev-academy-v32.sh start    # create DB if missing, build, migrate, start both in background
#   backend/scripts/dev-academy-v32.sh seed     # create a fresh user + a "content review" user (all ch1-5 passed)
#   backend/scripts/dev-academy-v32.sh status
#   backend/scripts/dev-academy-v32.sh stop
#   backend/scripts/dev-academy-v32.sh system-test [spec filters...]   # default: academy-v32 team-lead-team
#     Runs `npm run test:system` without Docker: a throwaway redis-server on :16380 and the local
#     database iqx_v2_system_v32 (the harness truncates it; it never touches other databases).
#
# Logs and pid files live in backend/.dev-logs (gitignored). Needs local Postgres and Redis.
# Overridable: DEV_DB_NAME (must match iqx_v2_*), DEV_PG_URL_BASE, DEV_API_PORT, DEV_WEB_PORT, DEV_REDIS_URL.
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$(cd "$BACKEND_DIR/../frontend" && pwd)"
LOG_DIR="$BACKEND_DIR/.dev-logs"
mkdir -p "$LOG_DIR"

DB_NAME="${DEV_DB_NAME:-iqx_v2_v32_e2e}"
PG_URL_BASE="${DEV_PG_URL_BASE:-postgres://$(whoami)@127.0.0.1:5432}"
DATABASE_URL="$PG_URL_BASE/$DB_NAME"
API_PORT="${DEV_API_PORT:-3001}"
WEB_PORT="${DEV_WEB_PORT:-5173}"
REDIS_URL="${DEV_REDIS_URL:-redis://127.0.0.1:6379/14}"

if [[ ! "$DB_NAME" =~ ^iqx_v2_[a-z0-9_]+$ ]]; then
  echo "DEV_DB_NAME must match iqx_v2_* (got $DB_NAME)" >&2
  exit 1
fi

api_env() {
  # Local-only secrets: never reuse these anywhere else.
  exec env \
    APP_ENV=development HOST=127.0.0.1 PORT="$API_PORT" LOG_LEVEL=info \
    DATABASE_URL="$DATABASE_URL" DB_STATEMENT_TIMEOUT_MS=10000 \
    REDIS_ENABLED=true REDIS_URL="$REDIS_URL" QUEUE_ENABLED=false MARKET_INGEST_ENABLED=false \
    RATE_LIMIT_MAX=100000 LOOKUP_RATE_LIMIT_MAX=100000 \
    CORS_ORIGINS="http://localhost:$WEB_PORT,http://127.0.0.1:$WEB_PORT,http://127.0.0.1:4173" \
    API_DOCS_ENABLED=true APP_PUBLIC_URL="http://localhost:$WEB_PORT" API_PUBLIC_URL="http://127.0.0.1:$API_PORT" \
    JWT_SECRET_KEY=dev-academy-v32-access-secret-0123456789abcdef \
    JWT_REFRESH_SECRET_KEY=dev-academy-v32-refresh-secret-0123456789abcdef \
    MEDIA_ROOT="$LOG_DIR/media" MEDIA_SIGNING_SECRET=dev-academy-v32-media-secret-0123456789abcdef \
    ACADEMY_ENABLED=true EMAIL_ENABLED=false ALERT_SCAN_ENABLED=false \
    "$@"
}

running() { [[ -f "$LOG_DIR/$1.pid" ]] && kill -0 "$(cat "$LOG_DIR/$1.pid")" 2>/dev/null; }

wait_for() {
  local url="$1" name="$2"
  for _ in $(seq 1 90); do
    if curl -fsS -o /dev/null "$url" 2>/dev/null; then return 0; fi
    sleep 1
  done
  echo "$name did not come up at $url; see $LOG_DIR/$name.log" >&2
  return 1
}

start() {
  if ! psql "$PG_URL_BASE/postgres" -Atc "select 1 from pg_database where datname='$DB_NAME'" | grep -q 1; then
    echo "creating database $DB_NAME"
    createdb -d "$PG_URL_BASE/postgres" "$DB_NAME" 2>/dev/null || psql "$PG_URL_BASE/postgres" -c "create database $DB_NAME"
  fi
  echo "building backend"
  (cd "$BACKEND_DIR" && npm run build >"$LOG_DIR/build.log" 2>&1) || { echo "build failed; see $LOG_DIR/build.log" >&2; exit 1; }
  echo "migrating $DB_NAME"
  (cd "$BACKEND_DIR" && V2_MIGRATIONS_ALLOWED=true DATABASE_URL="$DATABASE_URL" node dist/scripts/migrate.js) | tail -3

  if running api; then
    echo "api already running (pid $(cat "$LOG_DIR/api.pid"))"
  else
    cd "$BACKEND_DIR"
    api_env node dist/src/bootstrap/api.js >"$LOG_DIR/api.log" 2>&1 </dev/null &
    echo $! >"$LOG_DIR/api.pid"
    disown || true
  fi
  if running web; then
    echo "web already running (pid $(cat "$LOG_DIR/web.pid"))"
  else
    cd "$FRONTEND_DIR"
    VITE_API_URL=/api/v2 VITE_WS_URL=/api/v2/market-data/ws API_PROXY_TARGET="http://127.0.0.1:$API_PORT" \
      node node_modules/vite/bin/vite.js --host 127.0.0.1 --port "$WEB_PORT" --strictPort >"$LOG_DIR/web.log" 2>&1 </dev/null &
    echo $! >"$LOG_DIR/web.pid"
    disown || true
  fi
  wait_for "http://127.0.0.1:$API_PORT/health/ready" api || { tail -20 "$LOG_DIR/api.log" >&2; exit 1; }
  wait_for "http://127.0.0.1:$WEB_PORT/" web
  echo "API:      http://127.0.0.1:$API_PORT/api/v2   (log $LOG_DIR/api.log)"
  echo "Frontend: http://127.0.0.1:$WEB_PORT/demo-trading?view=academy   (log $LOG_DIR/web.log)"
  echo "Database: $DATABASE_URL"
}

stop_one() {
  if running "$1"; then
    local pid
    pid="$(cat "$LOG_DIR/$1.pid")"
    kill -TERM "$pid" 2>/dev/null || true
    echo "stopped $1 (pid $pid)"
  fi
  rm -f "$LOG_DIR/$1.pid"
  # Anything still holding the port (e.g. a pid file lost after a crash).
  local port="$2" leftover
  leftover="$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$leftover" ]]; then kill -TERM $leftover 2>/dev/null || true; echo "stopped listener on :$port"; fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop_one web "$WEB_PORT"; stop_one api "$API_PORT" ;;
  status)
    for name in api web; do
      if running "$name"; then echo "$name running (pid $(cat "$LOG_DIR/$name.pid"))"; else echo "$name stopped"; fi
    done
    ;;
  system-test)
    shift
    if [[ $# -eq 0 ]]; then set -- academy-v32 team-lead-team; fi
    SYS_DB="${DEV_SYSTEM_DB_NAME:-iqx_v2_system_v32}"
    psql "$PG_URL_BASE/postgres" -Atc "select 1 from pg_database where datname='$SYS_DB'" | grep -q 1 || createdb -d "$PG_URL_BASE/postgres" "$SYS_DB"
    mkdir -p "$LOG_DIR/redis-test"
    redis-server --port 16380 --save "" --appendonly no --dir "$LOG_DIR/redis-test" --daemonize yes \
      --pidfile "$LOG_DIR/redis-test.pid" --logfile "$LOG_DIR/redis-test.log"
    trap 'redis-cli -p 16380 shutdown nosave >/dev/null 2>&1 || true' EXIT
    sleep 1
    cd "$BACKEND_DIR"
    IQX_TEST_EXTERNAL_SERVICES=1 TEST_DATABASE_URL="$PG_URL_BASE/$SYS_DB" TEST_REDIS_URL=redis://127.0.0.1:16380/15 \
      npm run test:system -- "$@"
    ;;
  seed) API_BASE_URL="http://127.0.0.1:$API_PORT/api/v2" node "$BACKEND_DIR/dist/scripts/seed-academy-v32.js" ;;
  *) echo "usage: $0 {start|stop|status|seed|system-test}" >&2; exit 2 ;;
esac
