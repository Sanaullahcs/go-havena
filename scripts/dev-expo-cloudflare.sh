#!/usr/bin/env bash
# Start Metro (:8081) behind a Cloudflare quick tunnel so Expo Go on a phone can load the app.
# Requires backend/frontend tunnels for API (see dev-urls.txt or scripts/dev-ngrok.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
METRO_PORT="${METRO_PORT:-8081}"
METRO_LOG="/tmp/metro-tunnel.log"
EXPO_LOG="/tmp/expo-dev.log"
TMUX="${TMUX_BIN:-tmux -f /exec-daemon/tmux.portal.conf}"

backend_url() {
  if [[ -f /tmp/backend-tunnel.log ]]; then
    grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/backend-tunnel.log 2>/dev/null | head -1 || true
  fi
}

frontend_url() {
  if [[ -f /tmp/frontend-tunnel.log ]]; then
    grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/frontend-tunnel.log 2>/dev/null | head -1 || true
  fi
}

wait_for_tunnel() {
  local log="$1"
  local url=""
  for _ in $(seq 1 45); do
    url="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$log" 2>/dev/null | head -1 || true)"
    [[ -n "$url" ]] && { echo "$url"; return 0; }
    sleep 1
  done
  echo "[expo-cf] Timed out waiting for Cloudflare URL in $log" >&2
  tail -15 "$log" >&2 || true
  return 1
}

wait_for_metro() {
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "http://127.0.0.1:${METRO_PORT}/"; then
      return 0
    fi
    sleep 2
  done
  echo "[expo-cf] Metro did not start on :${METRO_PORT}" >&2
  tail -30 "$EXPO_LOG" >&2 || true
  return 1
}

API_URL="${EXPO_PUBLIC_API_URL:-$(backend_url)}"
ADMIN_URL="${EXPO_PUBLIC_ADMIN_URL:-$(frontend_url)}"

if [[ -z "$API_URL" ]]; then
  echo "[expo-cf] Set EXPO_PUBLIC_API_URL or start backend Cloudflare tunnel first." >&2
  exit 1
fi
API_URL="${API_URL%/}/api/v1"
API_URL="${API_URL/\/api\/v1\/api\/v1/\/api\/v1}"

# Persist mobile .env for Metro bundler (gitignored).
cat > "$MOBILE/.env" <<EOF
EXPO_PUBLIC_API_URL=${API_URL}
EXPO_PUBLIC_ADMIN_URL=${ADMIN_URL:-http://localhost:3000}
EOF

PROXY_PORT="${EXPO_PROXY_PORT:-8082}"
PROXY_LOG="/tmp/metro-proxy.log"

# Manifest proxy so Camera / Expo Go scans get JSON instead of web HTML
if $TMUX has-session -t "=metro-proxy" 2>/dev/null; then
  $TMUX kill-session -t metro-proxy 2>/dev/null || true
fi
$TMUX new-session -d -s metro-proxy -c "$ROOT" -- \
  "bash -lc 'EXPO_PROXY_PORT=${PROXY_PORT} EXPO_PROXY_TARGET_PORT=${METRO_PORT} node ${ROOT}/scripts/expo-manifest-proxy.js 2>&1 | tee ${PROXY_LOG}'"

# Cloudflare tunnel → proxy (not Metro directly)
if $TMUX has-session -t "=metro-tunnel" 2>/dev/null; then
  METRO_TUNNEL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$METRO_LOG" 2>/dev/null | head -1 || true)"
  if [[ -z "$METRO_TUNNEL" ]] || ! curl -sf -o /dev/null "$METRO_TUNNEL/"; then
    $TMUX kill-session -t metro-tunnel 2>/dev/null || true
    METRO_TUNNEL=""
  fi
fi

if [[ -z "${METRO_TUNNEL:-}" ]]; then
  rm -f "$METRO_LOG"
  $TMUX new-session -d -s metro-tunnel -c "$ROOT" -- \
    "bash -lc 'npx --yes cloudflared tunnel --protocol http2 --url http://127.0.0.1:${PROXY_PORT} 2>&1 | tee ${METRO_LOG}'"
  METRO_TUNNEL="$(wait_for_tunnel "$METRO_LOG")"
fi

# Expo with public packager proxy (manifest + bundle served via Cloudflare)
if $TMUX has-session -t "=mobile-expo-dev" 2>/dev/null; then
  $TMUX kill-session -t mobile-expo-dev 2>/dev/null || true
fi

$TMUX new-session -d -s mobile-expo-dev -c "$MOBILE" -- \
  "bash -lc 'export EXPO_PACKAGER_PROXY_URL=${METRO_TUNNEL} EXPO_PUBLIC_API_URL=${API_URL} EXPO_PUBLIC_ADMIN_URL=${ADMIN_URL:-http://localhost:3000}; npx expo start --port ${METRO_PORT} --lan --clear 2>&1 | tee ${EXPO_LOG}'"

wait_for_metro

EXPO_URL="exp://${METRO_TUNNEL#https://}"
node -e "
  const qr = require('${ROOT}/frontend/node_modules/qrcode');
  qr.toFile('${ROOT}/expo-go-qr.png', process.argv[1], { width: 400, margin: 2 }, (err) => {
    if (err) { console.error(err); process.exit(1); }
    console.log(process.argv[1]);
  });
" "$EXPO_URL"

cat > "$ROOT/dev-urls.txt" <<EOF
# Havena dev URLs — updated $(date -u +%Y-%m-%d)

## Mobile (Expo Go — scan QR or paste URL in Expo Go)
- Expo Go URL: ${EXPO_URL}
- Metro tunnel: ${METRO_TUNNEL}
- QR PNG: ${ROOT}/expo-go-qr.png
- Requires Expo Go SDK 56: https://expo.dev/go?sdkVersion=56

## Public web (Cloudflare)
- Frontend: ${ADMIN_URL:-http://localhost:3000}
- Backend API: ${API_URL}
- Login: ${ADMIN_URL:-http://localhost:3000}/login

## Test credentials (OTP 123456)
- Community admin: (555) 555-0200
- Resident (mobile): (555) 555-0100
EOF

echo ""
echo "[expo-cf] Metro tunnel:  $METRO_TUNNEL"
echo "[expo-cf] Expo Go URL:   $EXPO_URL"
echo "[expo-cf] API:           $API_URL"
echo "[expo-cf] QR saved:      $ROOT/expo-go-qr.png"
echo "[expo-cf] Logs:          tmux attach -t mobile-expo-dev"
echo "[expo-cf] Install Expo Go SDK 56 if the app fails to load."
