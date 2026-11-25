#!/usr/bin/env bash
# Keeps Metro on :8081; restarts if it stops (run once in a terminal).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INTERVAL="${METRO_KEEPALIVE_SEC:-20}"
LOG="$ROOT/.tmp-metro-keepalive.log"

echo "[metro-keepalive] Watching port 8081 every ${INTERVAL}s (log: $LOG)"
while true; do
  if ! curl -sf -m 2 http://127.0.0.1:8081/status 2>/dev/null | grep -q running; then
    echo "[metro-keepalive] $(date) Metro down — restarting…" | tee -a "$LOG"
    bash "$ROOT/scripts/dev-expo-lan.sh" >>"$LOG" 2>&1 || true
  fi
  sleep "$INTERVAL"
done