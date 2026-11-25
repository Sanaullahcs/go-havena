#!/usr/bin/env bash
# Start API :8000, web :3000, queue worker, Metro :8081, and write expo-go-qr.png
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROOT/.dev-pids"
mkdir -p "$PID_DIR"

stop_port() {
  local port="$1"
  local pids
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "[dev-all] stop :$port ($pids)"
    kill -9 $pids 2>/dev/null || true
  fi
}

echo "[dev-all] $(date)"
for port in 8081 3000 8000; do stop_port "$port"; done
pkill -f "expo/bin/cli|artisan serve|queue:work|next/dist/bin/next" 2>/dev/null || true
sleep 2

nohup bash "$ROOT/scripts/dev-backend.sh" >>"$ROOT/.tmp-backend.log" 2>&1 &
echo $! >"$PID_DIR/backend.pid"
echo "[dev-all] backend pid $(cat "$PID_DIR/backend.pid")"

nohup bash "$ROOT/scripts/dev-frontend.sh" >>"$ROOT/.tmp-frontend.log" 2>&1 &
echo $! >"$PID_DIR/frontend.pid"
echo "[dev-all] frontend pid $(cat "$PID_DIR/frontend.pid")"

nohup php "$ROOT/backend/artisan" queue:work --tries=3 --timeout=60 >>"$ROOT/.tmp-queue.log" 2>&1 &
echo $! >"$PID_DIR/queue.pid"
echo "[dev-all] queue pid $(cat "$PID_DIR/queue.pid")"

EXPO_CLEAR="${EXPO_CLEAR:-}" bash "$ROOT/scripts/dev-expo-lan.sh"

for i in $(seq 1 60); do
  b=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/v1/health 2>/dev/null || echo 000)
  f=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ 2>/dev/null || echo 000)
  m=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/status 2>/dev/null || echo 000)
  if [[ "$b" == "200" && "$f" == "200" && "$m" == "200" ]]; then
    LAN=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")
    HOST="$(scutil --get LocalHostName 2>/dev/null).local"
    if [[ -d "$ROOT/frontend/node_modules/qrcode" ]]; then
      (cd "$ROOT/frontend" && node -e "
        const qr=require('qrcode');
        const r='..';
        const u1='exp://${LAN}:8081', u2='exp://${HOST}:8081';
        Promise.all([
          qr.toFile(r+'/expo-go-qr.png',u1,{width:800,margin:3}),
          qr.toFile(r+'/expo-go-qr-bonjour.png',u2,{width:800,margin:3}),
        ]).then(()=>console.log('[dev-all] QR',u1));
      ")
    fi
    echo "[dev-all] ready"
    echo "  Web:    http://localhost:3000"
    echo "  API:    http://localhost:8000"
    echo "  Metro:  exp://${LAN}:8081"
    echo "  QR:     $ROOT/expo-go-qr.png"
    exit 0
  fi
  sleep 2
done

echo "[dev-all] timeout — web=$f api=$b metro=$m" >&2
tail -20 "$ROOT/.tmp-frontend.log" >&2 || true
tail -20 "$ROOT/.tmp-backend.log" >&2 || true
exit 1