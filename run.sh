#!/bin/bash
# ECTLogger — consolidated operational script
#
# Usage:
#   ./run                          Interactive startup (prompts to check for updates)
#   ./run --service                Service mode startup (skips update prompt, for systemd)
#   ./run -u | --update            Check/apply updates, then exit — does NOT start the app
#   ./run -m on  | --maintenance on|true|1   Enable server-side maintenance mode, then exit
#   ./run -m off | --maintenance off|false|0 Disable server-side maintenance mode, then exit
#
# Server-side maintenance mode flags:
#   --message "text"    Custom message written to maintenance.json (optional)
#   --eta     "text"    ETA string written to maintenance.json (optional)
#
# Examples:
#   ./run --maintenance on --message "Deploying update" --eta "20:00 UTC"
#   ./run -m off
#   ./run -u

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Parse arguments ───────────────────────────────────────────────────────────

SERVICE_MODE=false
UPDATE_ONLY=false
MAINTENANCE_ACTION=""   # "on" or "off"
MAINTENANCE_MESSAGE=""
MAINTENANCE_ETA=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --service)
      SERVICE_MODE=true
      shift
      ;;
    -u|--update)
      UPDATE_ONLY=true
      shift
      ;;
    -m|--maintenance)
      [[ $# -lt 2 ]] && { echo "Error: --maintenance requires on|off argument" >&2; exit 1; }
      case "${2,,}" in
        on|true|1)   MAINTENANCE_ACTION="on" ;;
        off|false|0) MAINTENANCE_ACTION="off" ;;
        *) echo "Error: --maintenance value must be on|true|1 or off|false|0" >&2; exit 1 ;;
      esac
      shift 2
      ;;
    --message)
      [[ $# -lt 2 ]] && { echo "Error: --message requires a value" >&2; exit 1; }
      MAINTENANCE_MESSAGE="$2"
      shift 2
      ;;
    --eta)
      [[ $# -lt 2 ]] && { echo "Error: --eta requires a value" >&2; exit 1; }
      MAINTENANCE_ETA="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--service] [-u|--update] [-m|--maintenance on|off] [--message TEXT] [--eta TEXT]" >&2
      exit 1
      ;;
  esac
done

# ── Action: maintenance mode ─────────────────────────────────────────────────

if [[ -n "$MAINTENANCE_ACTION" ]]; then
  # Resolve INSTALL_DIR from .env if present; fall back to script location
  INSTALL_DIR="$SCRIPT_DIR"
  if [[ -f "$SCRIPT_DIR/backend/.env" ]]; then
    _env_dir=$(grep "^INSTALL_DIR=" "$SCRIPT_DIR/backend/.env" 2>/dev/null | cut -d'=' -f2-)
    [[ -n "$_env_dir" ]] && INSTALL_DIR="$_env_dir"
  fi

  FLAG_FILE="$INSTALL_DIR/maintenance.flag"
  JSON_FILE="$INSTALL_DIR/maintenance.json"

  if [[ "$MAINTENANCE_ACTION" == "on" ]]; then
    touch "$FLAG_FILE"
    echo "Maintenance flag written: $FLAG_FILE"

    # Write JSON sidecar if message or ETA was provided
    if [[ -n "$MAINTENANCE_MESSAGE" || -n "$MAINTENANCE_ETA" ]]; then
      printf '{\n  "message": %s,\n  "eta": %s\n}\n' \
        "$(printf '%s' "${MAINTENANCE_MESSAGE:-}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
        "$(printf '%s' "${MAINTENANCE_ETA:-}"     | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
        > "$JSON_FILE"
      echo "Maintenance JSON written: $JSON_FILE"
    fi

    # Reload Caddy if available
    if command -v caddy &>/dev/null; then
      caddy reload --config /etc/caddy/Caddyfile 2>/dev/null \
        && echo "Caddy reloaded." \
        || echo "Warning: caddy reload failed (manual reload may be needed)."
    elif command -v systemctl &>/dev/null && systemctl is-active --quiet caddy 2>/dev/null; then
      sudo systemctl reload caddy 2>/dev/null \
        && echo "Caddy reloaded via systemctl." \
        || echo "Warning: caddy reload failed (manual reload may be needed)."
    fi

    echo "Maintenance mode: ON"

  else  # off
    rm -f "$FLAG_FILE" "$JSON_FILE"
    echo "Maintenance flag removed."

    # Reload Caddy if available
    if command -v caddy &>/dev/null; then
      caddy reload --config /etc/caddy/Caddyfile 2>/dev/null \
        && echo "Caddy reloaded." \
        || echo "Warning: caddy reload failed (manual reload may be needed)."
    elif command -v systemctl &>/dev/null && systemctl is-active --quiet caddy 2>/dev/null; then
      sudo systemctl reload caddy 2>/dev/null \
        && echo "Caddy reloaded via systemctl." \
        || echo "Warning: caddy reload failed (manual reload may be needed)."
    fi

    echo "Maintenance mode: OFF"
  fi

  exit 0
fi

# ── Action: update only ───────────────────────────────────────────────────────

if [[ "$UPDATE_ONLY" == true ]]; then
  exec "$SCRIPT_DIR/update.sh" "$@"
fi

# ── Action: start ─────────────────────────────────────────────────────────────
# Everything below mirrors the existing start.sh behavior.

# Check if systemd service is available
SERVICE_INSTALLED=false
if command -v systemctl &>/dev/null && systemctl list-unit-files ectlogger.service &>/dev/null; then
  SERVICE_INSTALLED=true
fi

# If service is installed and not in service mode, offer to use systemd
if [[ "$SERVICE_INSTALLED" == true && "$SERVICE_MODE" == false ]]; then
  echo "ECTLogger systemd service detected"
  echo ""
  echo "Would you like to:"
  echo "  1) Start via systemd service (recommended)"
  echo "  2) Run directly in this terminal"
  echo ""
  read -p "Choose option (1/2): " -n 1 -r
  echo ""

  if [[ $REPLY =~ ^[1]$ ]]; then
    echo "Starting ECTLogger service..."
    sudo systemctl start ectlogger
    sleep 2
    sudo systemctl status ectlogger --no-pager
    echo ""
    echo "ECTLogger service started!"
    echo ""
    echo "Frontend: http://localhost:3000"
    echo "Backend:  http://localhost:8000"
    echo "API Docs: http://localhost:8000/docs"
    echo ""
    echo "Service commands:"
    echo "  Stop:    sudo systemctl stop ectlogger"
    echo "  Restart: sudo systemctl restart ectlogger"
    echo "  Status:  sudo systemctl status ectlogger"
    echo "  Logs:    sudo journalctl -u ectlogger -f"
    echo ""
    exit 0
  fi
fi

echo "Starting ECTLogger..."
echo ""

# Update check (skip in service mode or outside a git repo)
if [[ "$SERVICE_MODE" == false ]]; then
  if command -v git &>/dev/null && git -C "$SCRIPT_DIR" rev-parse --git-dir &>/dev/null; then
    read -t 5 -p "Check for updates? (y/N - auto-continues in 5s): " -n 1 -r REPLY || true
    echo ""
    if [[ "$REPLY" =~ ^[Yy]$ ]]; then
      echo "Checking for updates..."
      CURRENT_COMMIT=$(git -C "$SCRIPT_DIR" rev-parse HEAD 2>/dev/null)
      git -C "$SCRIPT_DIR" fetch origin "$(git -C "$SCRIPT_DIR" rev-parse --abbrev-ref HEAD)" --quiet 2>/dev/null
      REMOTE_COMMIT=$(git -C "$SCRIPT_DIR" rev-parse "origin/$(git -C "$SCRIPT_DIR" rev-parse --abbrev-ref HEAD)" 2>/dev/null)
      if [[ "$CURRENT_COMMIT" != "$REMOTE_COMMIT" && -n "$REMOTE_COMMIT" ]]; then
        echo "Update available!"
        echo ""
        "$SCRIPT_DIR/update.sh"
        echo ""
        echo "Update complete! Restarting..."
        echo ""
        exec "$SCRIPT_DIR/run.sh"
      else
        echo "Already running the latest version."
        echo ""
      fi
    else
      echo "Skipping update check."
      echo ""
    fi
  fi
fi

# Python check
if command -v python3 &>/dev/null; then
  echo "Python found: $(python3 --version)"
else
  echo "Python3 not found. Please install Python 3.9 or higher." >&2
  exit 1
fi

# Node.js check
if command -v node &>/dev/null; then
  echo "Node.js found: $(node --version)"
else
  echo "Node.js not found. Please install Node.js 18 or higher." >&2
  exit 1
fi

echo ""
echo "Checking backend dependencies..."

cd "$SCRIPT_DIR"

if [[ ! -d "backend/venv" ]]; then
  echo "Creating Python virtual environment..."
  cd backend && python3 -m venv venv && cd ..
  echo "Virtual environment created"
fi

cd backend && . venv/bin/activate && pip install -r requirements.txt -q && cd ..

echo ""
echo "Checking frontend dependencies..."

if [[ ! -d "frontend/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  cd frontend && npm install && cd ..
  echo "Frontend dependencies installed"
fi

echo ""
echo "Checking configuration..."

if [[ ! -f "backend/.env" ]]; then
  echo "Warning: backend/.env file not found!"
  echo "  Please copy .env.example to backend/.env and configure it."
  echo "  Press Ctrl+C to exit and configure, or Enter to continue..."
  read
fi

echo ""
echo "Starting servers..."
echo ""

# Get backend port from .env (default: 8000)
BACKEND_PORT=8000
if [[ -f "backend/.env" ]]; then
  _cfg_port=$(grep "^BACKEND_PORT=" backend/.env 2>/dev/null | cut -d'=' -f2)
  [[ -n "$_cfg_port" ]] && BACKEND_PORT="$_cfg_port"
fi

export VITE_BACKEND_PORT=$BACKEND_PORT

# Start backend
echo "Starting backend server on http://localhost:$BACKEND_PORT"
cd backend && . venv/bin/activate
if [[ "$SERVICE_MODE" == true ]]; then
  uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" &
else
  uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT" &
fi
BACKEND_PID=$!
cd ..

sleep 3

# Determine whether to run Vite dev server
SKIP_VITE=false
if [[ "$SERVICE_MODE" == true && -f "backend/.env" ]]; then
  _env_skip=$(grep "^SKIP_VITE=" backend/.env 2>/dev/null | cut -d'=' -f2)
  [[ "$_env_skip" == "true" ]] && SKIP_VITE=true
fi

if [[ "$SKIP_VITE" == true ]]; then
  echo "Frontend served from static build (frontend/dist)"
  FRONTEND_PID=""
else
  echo "Starting frontend dev server on http://localhost:3000"
  cd frontend && npm run dev -- --host 0.0.0.0 &
  FRONTEND_PID=$!
  cd ..
fi

echo ""
echo "ECTLogger is starting!"
echo ""
if [[ "$SERVICE_MODE" == false ]]; then
  echo "Frontend: http://localhost:3000"
fi
echo "Backend:  http://localhost:$BACKEND_PORT"
echo "API Docs: http://localhost:$BACKEND_PORT/docs"
echo ""

if [[ -f "backend/.env" ]]; then
  _configured_url=$(grep "^FRONTEND_URL=" backend/.env 2>/dev/null | cut -d'=' -f2-)
  if [[ -n "$_configured_url" && "$_configured_url" != "http://localhost:3000" ]]; then
    echo "Production URL: $_configured_url"
    echo ""
  fi
fi

cleanup() {
  echo ""
  echo "Stopping servers..."
  kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "${FRONTEND_PID:-}" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  exit 0
}

if [[ "$SERVICE_MODE" == true ]]; then
  echo "Running in service mode..."
  wait
else
  echo "Press Ctrl+C to stop both servers."
  trap cleanup INT
  wait
fi
