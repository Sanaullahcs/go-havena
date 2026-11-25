#!/usr/bin/env bash
# Stop API, web, queue, and Metro started for local development.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for port in 8081 3000 8000; do
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "[dev-stop] :$port -> kill $pids"
    kill -9 $pids 2>/dev/null || true
  fi
done
pkill -f "dev-persistent.sh|dev-frontend.sh|dev-backend.sh|expo/bin/cli|artisan serve|artisan queue:work|next/dist/bin/next" 2>/dev/null || true
echo "[dev-stop] done"