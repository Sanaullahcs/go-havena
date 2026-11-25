#!/usr/bin/env bash
# Metro for Expo Go on the same Wi‑Fi (LAN). Node 22+ required; tunnel needs Node + ws fix.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
LOG="${EXPO_LOG:-$ROOT/.tmp-expo.log}"
METRO_PORT="${METRO_PORT:-8081}"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || nvm use 20 >/dev/null 2>&1 || true
fi

NODE_BIN="$(command -v node)"
LAN="$(
  ipconfig getifaddr en0 2>/dev/null ||
  ipconfig getifaddr en1 2>/dev/null ||
  ifconfig | awk '/inet / && $2 != "127.0.0.1" { print $2; exit }'
)"
if [[ -z "${LAN:-}" ]]; then
  echo "[dev-expo-lan] No LAN IP found — connect Wi‑Fi and retry." >&2
  exit 1
fi

export REACT_NATIVE_PACKAGER_HOSTNAME="$LAN"
export EXPO_DEVTOOLS_LISTEN_ADDRESS="0.0.0.0"
export EXPO_PUBLIC_API_URL="http://${LAN}:8000/api/v1"

printf 'EXPO_PUBLIC_API_URL=%s\n' "$EXPO_PUBLIC_API_URL" > "$MOBILE/.env"

lsof -nP -iTCP:"$METRO_PORT" -sTCP:LISTEN -t 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -f "start-with-go-identity.cjs start" 2>/dev/null || true
sleep 1

echo "[dev-expo-lan] LAN IP:     $LAN"
echo "[dev-expo-lan] Metro:      exp://${LAN}:${METRO_PORT}"
echo "[dev-expo-lan] API:        $EXPO_PUBLIC_API_URL"
echo "[dev-expo-lan] Node:       $($NODE_BIN -v) ($NODE_BIN)"
echo "[dev-expo-lan] Log:        $LOG"

cd "$MOBILE"
export HAVENA_GO_SESSION="${HAVENA_GO_SESSION:-$(uuidgen | tr '[:upper:]' '[:lower:]')}"
export HAVENA_GO_SLUG="${HAVENA_GO_SLUG:-havena-go-$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-' | cut -c1-12)}"
export EXPO_NO_UPDATES="${EXPO_NO_UPDATES:-1}"
"$NODE_BIN" ./scripts/patch-expo-go-manifest.cjs >/dev/null 2>&1 || true
"$NODE_BIN" ./scripts/patch-expo-go-reload.cjs >/dev/null 2>&1 || true
"$NODE_BIN" -e "require('./scripts/expo-go-manifest-identity.cjs').identity(process.cwd())"
WS_POLY="$MOBILE/scripts/expo-ws-polyfill.cjs"
EXPO_CLI="$MOBILE/node_modules/expo/bin/cli"
CLEAR_FLAG=""
if [[ -n "${EXPO_CLEAR:-}" ]]; then CLEAR_FLAG="--clear"; fi
nohup env REACT_NATIVE_PACKAGER_HOSTNAME="$LAN" EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0 \
  EXPO_PUBLIC_API_URL="$EXPO_PUBLIC_API_URL" HAVENA_GO_SESSION="$HAVENA_GO_SESSION" HAVENA_GO_SLUG="$HAVENA_GO_SLUG" \
  EXPO_NO_UPDATES="$EXPO_NO_UPDATES" HAVENA_LOCAL_EXPO=1 \
  NODE_OPTIONS="-r ${WS_POLY}" \
  "$NODE_BIN" "$EXPO_CLI" start --host lan $CLEAR_FLAG >>"$LOG" 2>&1 &
echo "[dev-expo-lan] Metro PID:  $!"

for _ in $(seq 1 45); do
  if curl -sf -m 2 "http://127.0.0.1:${METRO_PORT}/status" | grep -q running; then
    EXPO_URL="exp://${LAN}:${METRO_PORT}"
    if [[ -d "$ROOT/frontend/node_modules/qrcode" ]]; then
      (cd "$ROOT/frontend" && "$NODE_BIN" -e "
        const qr = require('qrcode');
        const url = process.argv[1];
        const root = process.argv[2];
        Promise.all([
          qr.toFile(root + '/expo-go-qr.png', url, { width: 800, margin: 3, errorCorrectionLevel: 'M' }),
          qr.toFile(root + '/apps/mobile/expo-go-qr.png', url, { width: 800, margin: 3, errorCorrectionLevel: 'M' }),
        ]).then(() => console.log('[dev-expo-lan] QR saved: ' + root + '/expo-go-qr.png'));
      " "$EXPO_URL" "$ROOT")
    fi
    echo "[dev-expo-lan] Metro is running."
    exit 0
  fi
  sleep 2
done

echo "[dev-expo-lan] Metro did not become ready. Tail log:" >&2
tail -40 "$LOG" >&2 || true
exit 1