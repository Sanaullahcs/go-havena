#!/usr/bin/env bash
# Expo Go over the internet when LAN / Wi‑Fi isolation blocks the phone.
# Requires a free ngrok authtoken: https://dashboard.ngrok.com/get-started/your-authtoken
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
LOG="${EXPO_LOG:-$ROOT/.tmp-expo-tunnel.log}"
METRO_PORT="${METRO_PORT:-8081}"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || true
fi
NODE_BIN="$(command -v node)"

TOKEN="${NGROK_AUTHTOKEN:-}"
if [[ -z "$TOKEN" && -f "$MOBILE/.ngrok-token" ]]; then
  TOKEN="$(tr -d '[:space:]' < "$MOBILE/.ngrok-token")"
fi
if [[ -z "$TOKEN" ]]; then
  echo "[dev-expo-tunnel] Missing ngrok authtoken." >&2
  echo "[dev-expo-tunnel] 1) Get one: https://dashboard.ngrok.com/get-started/your-authtoken" >&2
  echo "[dev-expo-tunnel] 2) Save it: echo 'YOUR_TOKEN' > apps/mobile/.ngrok-token" >&2
  echo "[dev-expo-tunnel] Or run: export NGROK_AUTHTOKEN=YOUR_TOKEN" >&2
  exit 1
fi

LAN="$(
  ipconfig getifaddr en0 2>/dev/null ||
  ipconfig getifaddr en1 2>/dev/null ||
  echo "127.0.0.1"
)"
export NGROK_AUTHTOKEN="$TOKEN"
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://${LAN}:8000/api/v1}"
export EXPO_TUNNEL_SUBDOMAIN=""
printf 'EXPO_PUBLIC_API_URL=%s\n' "$EXPO_PUBLIC_API_URL" > "$MOBILE/.env"

lsof -nP -iTCP:"$METRO_PORT" -sTCP:LISTEN -t 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -f "start-with-go-identity.cjs start" 2>/dev/null || true
sleep 1

echo "[dev-expo-tunnel] Starting Metro with ngrok tunnel (log: $LOG)…"
cd "$MOBILE"
nohup env HAVENA_EXPO_DAEMON=1 NGROK_AUTHTOKEN="$TOKEN" EXPO_PUBLIC_API_URL="$EXPO_PUBLIC_API_URL" \
  "$NODE_BIN" ./scripts/start-with-go-identity.cjs start --tunnel ngrok --host tunnel --clear >>"$LOG" 2>&1 &
echo "[dev-expo-tunnel] PID $!"

EXPO_URL=""
for _ in $(seq 1 60); do
  if curl -sf -m 2 "http://127.0.0.1:${METRO_PORT}/status" | grep -q running; then
    EXPO_URL="$(
      curl -sf -H "Expo-Platform: ios" -H "Accept: application/expo+json" \
        "http://127.0.0.1:${METRO_PORT}/" \
        | python3 -c "import sys,json; d=json.load(sys.stdin); c=(d.get('extra') or {}).get('expoClient',{}); h=c.get('hostUri') or ''; print('exp://'+h if h and not h.startswith('exp://') else h)" 2>/dev/null \
        || true
    )"
    if [[ -n "$EXPO_URL" && "$EXPO_URL" != exp:// ]]; then
      break
    fi
  fi
  sleep 2
done

if [[ -z "$EXPO_URL" || "$EXPO_URL" == "exp://" ]]; then
  EXPO_URL="$(grep -Eo 'exp://[^[:space:]]+' "$LOG" | tail -1 || true)"
fi

if [[ -z "$EXPO_URL" ]]; then
  echo "[dev-expo-tunnel] Tunnel did not publish a URL. Log:" >&2
  tail -40 "$LOG" >&2 || true
  exit 1
fi

(cd "$ROOT/frontend" && "$NODE_BIN" -e "
  const qr = require('qrcode');
  const url = process.argv[1];
  const root = process.argv[2];
  Promise.all([
    qr.toFile(root + '/expo-go-qr.png', url, { width: 800, margin: 3 }),
    qr.toFile(root + '/apps/mobile/expo-go-qr.png', url, { width: 800, margin: 3 }),
  ]).then(() => console.log('[dev-expo-tunnel] QR saved for', url));
" "$EXPO_URL" "$ROOT")

echo "[dev-expo-tunnel] Scan URL: $EXPO_URL"
echo "[dev-expo-tunnel] QR:       $ROOT/expo-go-qr.png"