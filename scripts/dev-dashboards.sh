#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

backend_up() {
  curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/v1/health 2>/dev/null | grep -q '^200$'
}

frontend_up() {
  curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>/dev/null | grep -qE '^(200|307|308)$'
}

if backend_up; then
  echo "[dashboards] Backend already running on :8000"
else
  echo "[dashboards] Starting backend..."
  bash "$ROOT/scripts/dev-backend.sh" &
fi

if frontend_up; then
  echo "[dashboards] Frontend already running on :3000"
else
  echo "[dashboards] Starting frontend..."
  bash "$ROOT/scripts/dev-frontend.sh" &
fi

echo ""
echo "Community admin: http://localhost:3000/login"
echo "System admin:    http://localhost:3000/system-login"
echo "API health:      http://localhost:8000/api/v1/health"
echo ""
echo "Press Ctrl+C to stop. Child processes run in background."

wait
