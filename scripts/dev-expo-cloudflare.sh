#!/usr/bin/env bash
# Start Metro with Expo's official --tunnel (*.exp.direct) so Expo Go on a phone
# can load the app. Cloudflare quick tunnels are kept for API/admin only —
# trycloudflare.com is often blocked on phones (DNS / Private Relay), which
# shows "Could not connect to the server" in Expo Go.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
METRO_PORT="${METRO_PORT:-8081}"
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

wait_for_metro() {
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null -H "Expo-Platform: ios" "http://127.0.0.1:${METRO_PORT}/"; then
      return 0
    fi
    sleep 2
  done
  echo "[expo-tunnel] Metro did not start on :${METRO_PORT}" >&2
  tail -30 "$EXPO_LOG" >&2 || true
  return 1
}

host_uri_from_metro() {
  curl -sf -H "Expo-Platform: ios" -H "Accept: application/expo+json,application/json" \
    "http://127.0.0.1:${METRO_PORT}/" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('extra') or {}).get('expoClient',{}).get('hostUri') or '')"
}

API_URL="${EXPO_PUBLIC_API_URL:-$(backend_url)}"
ADMIN_URL="${EXPO_PUBLIC_ADMIN_URL:-$(frontend_url)}"

if [[ -z "$API_URL" ]]; then
  echo "[expo-tunnel] Set EXPO_PUBLIC_API_URL or start backend Cloudflare tunnel first." >&2
  exit 1
fi
API_URL="${API_URL%/}/api/v1"
API_URL="${API_URL/\/api\/v1\/api\/v1/\/api\/v1}"

cat > "$MOBILE/.env" <<EOF
EXPO_PUBLIC_API_URL=${API_URL}
EXPO_PUBLIC_ADMIN_URL=${ADMIN_URL:-http://localhost:3000}
EOF

# Optional local proxy (used if a Cloudflare Metro tunnel is also running).
PROXY_PORT="${EXPO_PROXY_PORT:-8082}"
PROXY_LOG="/tmp/metro-proxy.log"
if $TMUX has-session -t "=metro-proxy" 2>/dev/null; then
  $TMUX kill-session -t metro-proxy 2>/dev/null || true
fi
$TMUX new-session -d -s metro-proxy -c "$ROOT" -- \
  "bash -lc 'EXPO_PROXY_PORT=${PROXY_PORT} EXPO_PROXY_TARGET_PORT=${METRO_PORT} node ${ROOT}/scripts/expo-manifest-proxy.js 2>&1 | tee ${PROXY_LOG}'"

if $TMUX has-session -t "=mobile-expo-dev" 2>/dev/null; then
  $TMUX kill-session -t mobile-expo-dev 2>/dev/null || true
fi

# Expo official tunnel → *.exp.direct (do not set EXPO_PACKAGER_PROXY_URL to Cloudflare).
$TMUX new-session -d -s mobile-expo-dev -c "$MOBILE" -- \
  "bash -lc 'unset CI EXPO_PACKAGER_PROXY_URL; export EXPO_PUBLIC_API_URL=${API_URL} EXPO_PUBLIC_ADMIN_URL=${ADMIN_URL:-http://localhost:3000}; npx expo start --port ${METRO_PORT} --tunnel --clear 2>&1 | tee ${EXPO_LOG}'"

wait_for_metro

HOST_URI=""
for _ in $(seq 1 30); do
  HOST_URI="$(host_uri_from_metro || true)"
  if [[ -n "$HOST_URI" && "$HOST_URI" == *exp.direct* ]]; then
    break
  fi
  sleep 2
done

if [[ -z "$HOST_URI" ]]; then
  echo "[expo-tunnel] Metro is up but no exp.direct hostUri yet." >&2
  tail -20 "$EXPO_LOG" >&2 || true
  exit 1
fi

# Expo's tunnel is HTTP. exp://host:80 matches what Expo Go expects.
EXPO_URL="exp://${HOST_URI}:80"
node -e "
  const qr = require('${ROOT}/frontend/node_modules/qrcode');
  qr.toFile('${ROOT}/expo-go-qr.png', process.argv[1], { width: 800, margin: 3, errorCorrectionLevel: 'M' }, (err) => {
    if (err) { console.error(err); process.exit(1); }
    console.log(process.argv[1]);
  });
" "$EXPO_URL"

cat > "$ROOT/dev-urls.txt" <<EOF
# Havena dev URLs — updated $(date -u +%Y-%m-%dT%H:%MZ)

## Mobile (Expo Go — scan QR or paste URL in Expo Go)
- Expo Go URL: ${EXPO_URL}
- Metro tunnel: http://${HOST_URI}
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
echo "[expo-tunnel] Metro host:  $HOST_URI"
echo "[expo-tunnel] Expo Go URL: $EXPO_URL"
echo "[expo-tunnel] API:         $API_URL"
echo "[expo-tunnel] QR saved:    $ROOT/expo-go-qr.png"
echo "[expo-tunnel] Logs:        tmux attach -t mobile-expo-dev"
echo "[expo-tunnel] Install Expo Go SDK 56 if the app fails to load."
