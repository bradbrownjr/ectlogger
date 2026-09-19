#!/usr/bin/env bash
#
# Rebuilds the demo instance and captures the documentation screenshots.
#
#   scripts/docs-screenshots/run.sh                  everything
#   scripts/docs-screenshots/run.sh --section operators
#   scripts/docs-screenshots/run.sh --only check-in-dialog
#   scripts/docs-screenshots/run.sh --no-reseed      reuse the current database
#
# WHY THIS RE-SEEDS EVERY TIME
#
# Capturing is not read-only. A figure of the check-in dialog has to open the
# check-in dialog, a figure of a menu has to open the menu, and some of those
# actions write to the database. A run that stops halfway therefore leaves the
# demo instance in a state the next run did not expect, and the failure shows up
# as a screenshot of the wrong thing rather than as an error. Rebuilding first
# costs a few seconds and makes every run start from the same place.
#
# The backend has to be restarted along with it: the seeder replaces the SQLite
# file, and a running uvicorn holds a handle to the old one.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT_BACKEND=8100
PORT_FRONTEND=3100
DB="$REPO/backend/demo.db"
LOG="${TMPDIR:-/tmp}/ectlogger-demo-backend.log"

RESEED=1
CAPTURE_ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "--no-reseed" ]]; then RESEED=0; else CAPTURE_ARGS+=("$arg"); fi
done

# Port 8000 is beta's backend and 3000 is beta's frontend. Neither is ever
# touched by this script, and nothing here should ever be pointed at them.
if [[ "$PORT_BACKEND" == "8000" || "$PORT_FRONTEND" == "3000" ]]; then
  echo "Refusing to run against beta's ports." >&2
  exit 1
fi

backend_pid() {
  pgrep -f "uvicorn app.main:app .*--port $PORT_BACKEND" || true
}

if [[ "$RESEED" == "1" ]]; then
  echo "==> Stopping the demo backend"
  pid="$(backend_pid)"
  [[ -n "$pid" ]] && kill $pid 2>/dev/null || true
  sleep 2

  echo "==> Seeding $DB"
  "$REPO/backend/venv/bin/python" "$REPO/backend/scripts/seed_demo_data.py" \
    --db "$DB" --out "$REPO/backend/demo-seed.json"
fi

if [[ -z "$(backend_pid)" ]]; then
  echo "==> Starting the demo backend on :$PORT_BACKEND"
  (
    cd "$REPO/backend"
    DATABASE_URL="sqlite:///./demo.db" \
    FRONTEND_URL="http://10.6.26.3:$PORT_FRONTEND" \
    EMAIL_ENABLED=false SMTP_HOST=127.0.0.1 SMTP_USER=demo@example.com \
    SMTP_PASSWORD=demo SMTP_FROM_EMAIL=demo@example.com \
    SECRET_KEY=demo-only-not-a-real-secret APP_ENV=production \
    nohup venv/bin/python -m uvicorn app.main:app \
      --host 0.0.0.0 --port "$PORT_BACKEND" > "$LOG" 2>&1 &
  )
  for _ in $(seq 1 30); do
    if curl -sf -m 2 "http://127.0.0.1:$PORT_BACKEND/api/nets/" >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi

if ! curl -sf -m 5 "http://127.0.0.1:$PORT_BACKEND/api/nets/" >/dev/null; then
  echo "Demo backend did not come up. Last lines of $LOG:" >&2
  tail -20 "$LOG" >&2
  exit 1
fi

if ! curl -sf -m 5 "http://10.6.26.3:$PORT_FRONTEND/" >/dev/null; then
  cat >&2 <<EOF
Demo frontend is not answering on :$PORT_FRONTEND. Start it with:

  (cd $REPO/frontend && VITE_API_URL=http://10.6.26.3:$PORT_BACKEND/api \\
     VITE_ALLOWED_HOSTS=10.6.26.3,localhost,127.0.0.1 \\
     npx vite --host 0.0.0.0 --port $PORT_FRONTEND)
EOF
  exit 1
fi

echo "==> Capturing"
exec node "$REPO/scripts/docs-screenshots/capture.mjs" ${CAPTURE_ARGS+"${CAPTURE_ARGS[@]}"}
