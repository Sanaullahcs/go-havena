#!/usr/bin/env bash
# Run all Havena dev servers in THIS terminal until Ctrl+C.
# Background nohup from short-lived shells (e.g. Cursor agent) loses API/Web/Metro when the parent exits.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROOT/.dev-pids"
MOBILE="$ROOT/apps/mobile"
METRO_PORT="${METRO_PORT:-8081}"
mkdir -p "$PID_DIR"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || nvm use 20 >/dev/null 2>&1 || true
fi
NODE_BIN="$(command -v node)"

stop_port() {
  local port="$1"
  local pids
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "[dev-persistent] stop :$port ($pids)"
    kill -9 $pids 2>/dev/null || true
  fi
}

listener_pid() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1 || true
}

cleanup() {
  echo ""
  echo "[dev-persistent] Shutting down…"
  jobs -p 2>/dev/null | xargs kill 2>/dev/null || true
  stop_port 8081
  stop_port 3000
  stop_port 8000
  pkill -f "artisan queue:work" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "[dev-persistent] $(date)"
for port in 8081 3000 8000; do stop_port "$port"; done
pkill -f "expo/bin/cli|artisan serve|queue:work|next/dist/bin/next" 2>/dev/null || true
sleep 1

LAN="$(
  ipconfig getifaddr en0 2>/dev/null ||
  ipconfig getifaddr en1 2>/dev/null ||
  ifconfig | awk '/inet / && $2 != "127.0.0.1" { print $2; exit }'
)"
LAN="${LAN:-127.0.0.1}"

bash "$ROOT/scripts/dev-backend.sh" >>"$ROOT/.tmp-backend.log" 2>&1 &
BACK_WRAP=$!
bash "$ROOT/scripts/dev-frontend.sh" >>"$ROOT/.tmp-frontend.log" 2>&1 &
FRONT_WRAP=$!
php "$ROOT/backend/artisan" queue:work --tries=3 --timeout=60 >>"$ROOT/.tmp-queue.log" 2>&1 &
QUEUE_WRAP=$!

export REACT_NATIVE_PACKAGER_HOSTNAME="$LAN"
export EXPO_DEVTOOLS_LISTEN_ADDRESS="0.0.0.0"
export EXPO_PUBLIC_API_URL="http://${LAN}:8000/api/v1"
export EXPO_NO_UPDATES="${EXPO_NO_UPDATES:-1}"
export HAVENA_GO_SESSION="${HAVENA_GO_SESSION:-$(uuidgen | tr '[:upper:]' '[:lower:]')}"
export HAVENA_GO_SLUG="${HAVENA_GO_SLUG:-havena-go-$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-' | cut -c1-12)}"
printf 'EXPO_PUBLIC_API_URL=%s\n' "$EXPO_PUBLIC_API_URL" >"$MOBILE/.env"
"$NODE_BIN" "$MOBILE/scripts/patch-expo-go-manifest.cjs" >/dev/null 2>&1 || true
"$NODE_BIN" "$MOBILE/scripts/patch-expo-go-reload.cjs" >/dev/null 2>&1 || true
"$NODE_BIN" -e "require('$MOBILE/scripts/expo-go-manifest-identity.cjs').identity('$MOBILE')"
WS_POLY="$MOBILE/scripts/expo-ws-polyfill.cjs"
EXPO_CLI="$MOBILE/node_modules/expo/bin/cli"
CLEAR_FLAG=""
if [[ -n "${EXPO_CLEAR:-}" ]]; then CLEAR_FLAG="--clear"; fi

(
  cd "$MOBILE"
  exec env REACT_NATIVE_PACKAGER_HOSTNAME="$LAN" EXPO_DEVTOOLS_LISTEN_ADDRESS="$EXPO_DEVTOOLS_LISTEN_ADDRESS" \
    EXPO_PUBLIC_API_URL="$EXPO_PUBLIC_API_URL" HAVENA_GO_SESSION="$HAVENA_GO_SESSION" HAVENA_GO_SLUG="$HAVENA_GO_SLUG" \
    EXPO_NO_UPDATES="$EXPO_NO_UPDATES" HAVENA_LOCAL_EXPO=1 \
    NODE_OPTIONS="-r ${WS_POLY}" \
    "$NODE_BIN" "$EXPO_CLI" start --host lan $CLEAR_FLAG
) >>"$ROOT/.tmp-expo.log" 2>&1 &
METRO_WRAP=$!

echo "[dev-persistent] wrapper pids: backend=$BACK_WRAP frontend=$FRONT_WRAP queue=$QUEUE_WRAP metro=$METRO_WRAP"
echo "[dev-persistent] Waiting for ports (leave this terminal open)…"

ready=0
for _ in $(seq 1 90); do
  b=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/v1/health 2>/dev/null || echo 000)
  f=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ 2>/dev/null || echo 000)
  p=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/v1/health 2>/dev/null || echo 000)
  m=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${METRO_PORT}/status 2>/dev/null || echo 000)
  if [[ "$b" == "200" && "$f" == "200" && "$p" == "200" && "$m" == "200" ]]; then
    ready=1
    break
  fi
  sleep 2
done

if [[ "$ready" -ne 1 ]]; then
  echo "[dev-persistent] timeout — web=$f api=$b proxy=$p metro=$m" >&2
  tail -15 "$ROOT/.tmp-frontend.log" >&2 || true
  tail -15 "$ROOT/.tmp-backend.log" >&2 || true
  exit 1
fi

listener_pid 8000 >"$PID_DIR/backend.pid"
listener_pid 3000 >"$PID_DIR/frontend.pid"
listener_pid "$METRO_PORT" >"$PID_DIR/metro.pid"
echo "$QUEUE_WRAP" >"$PID_DIR/queue.pid"

if [[ -d "$ROOT/frontend/node_modules/qrcode" ]]; then
  EXPO_URL="exp://${LAN}:${METRO_PORT}"
  HOST="$(scutil --get LocalHostName 2>/dev/null).local"
  (cd "$ROOT/frontend" && "$NODE_BIN" -e "
    const qr=require('qrcode');
    const r='..';
    const u1=process.argv[1], u2=process.argv[2];
    Promise.all([
      qr.toFile(r+'/expo-go-qr.png',u1,{width:800,margin:3}),
      qr.toFile(r+'/expo-go-qr-bonjour.png',u2,{width:800,margin:3}),
    ]).then(()=>console.log('[dev-persistent] QR',u1));
  " "$EXPO_URL" "exp://${HOST}:${METRO_PORT}")
fi

echo "[dev-persistent] ready (supervisor stays attached — do not close this terminal)"
echo "  Web:    http://localhost:3000"
echo "  API:    http://localhost:8000"
echo "  Proxy:  http://localhost:3000/api/v1/health"
echo "  Metro:  exp://${LAN}:${METRO_PORT}"
echo "  Listeners: :8000=$(cat "$PID_DIR/backend.pid") :3000=$(cat "$PID_DIR/frontend.pid") :8081=$(cat "$PID_DIR/metro.pid")"

# Keep this shell alive so job-control does not reap child processes.
wait "$BACK_WRAP" "$FRONT_WRAP" "$QUEUE_WRAP" "$METRO_WRAP" 2>/dev/null || wait