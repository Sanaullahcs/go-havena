#!/usr/bin/env bash
# Start Expo Metro with a Cloudflare quick tunnel for Expo Go on physical devices.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${EXPO_PORT:-8081}"
CLOUDFLARED="${CLOUDFLARED:-$(command -v cloudflared || true)}"
if [[ -z "$CLOUDFLARED" ]]; then
  CLOUDFLARED="$(find "$HOME/.npm/_npx" -path '*/node_modules/.bin/cloudflared' 2>/dev/null | head -1 || true)"
fi
if [[ -z "$CLOUDFLARED" || ! -x "$CLOUDFLARED" ]]; then
  echo "cloudflared not found. Install with: npx --yes cloudflared --version"
  exit 1
fi

lsof -ti :"$PORT" | xargs -r kill -9 2>/dev/null || true
sleep 1

LOG="$(mktemp)"
"$CLOUDFLARED" tunnel --url "http://127.0.0.1:$PORT" >"$LOG" 2>&1 &
CF_PID=$!
trap 'kill $CF_PID 2>/dev/null || true' EXIT

TUNNEL_HOST=""
for _ in $(seq 1 30); do
  TUNNEL_HOST=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | tail -1 | sed 's|https://||')
  [[ -n "$TUNNEL_HOST" ]] && break
  sleep 1
done
if [[ -z "$TUNNEL_HOST" ]]; then
  echo "Failed to obtain Cloudflare tunnel URL:"
  cat "$LOG"
  exit 1
fi

export EXPO_PACKAGER_PROXY_URL="http://${TUNNEL_HOST}"
export REACT_NATIVE_PACKAGER_HOSTNAME="${TUNNEL_HOST}"
EXP_URL="exp://${TUNNEL_HOST}:80"

# Optional: start a backend API tunnel on port 8000 when BACKEND_TUNNEL=1
if [[ "${BACKEND_TUNNEL:-1}" == "1" ]]; then
  lsof -ti :8000 >/dev/null 2>&1 || echo "Warning: backend not listening on :8000 — start with: npm run backend"
  API_LOG="$(mktemp)"
  "$CLOUDFLARED" tunnel --url "http://127.0.0.1:8000" >"$API_LOG" 2>&1 &
  API_CF_PID=$!
  API_TUNNEL_HOST=""
  for _ in $(seq 1 20); do
    API_TUNNEL_HOST=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$API_LOG" | tail -1 | sed 's|https://||')
    [[ -n "$API_TUNNEL_HOST" ]] && break
    sleep 1
  done
  if [[ -n "$API_TUNNEL_HOST" ]]; then
    export EXPO_PUBLIC_API_URL="http://${API_TUNNEL_HOST}/api/v1"
    echo "API tunnel: http://${API_TUNNEL_HOST}/api/v1"
  fi
fi

echo ""
echo "=== Havena Expo (Cloudflare tunnel) ==="
echo "Expo Go URL:  ${EXP_URL}"
echo "Loading page: https://${TUNNEL_HOST}/_expo/loading?platform=ios"
echo "Metro tunnel: https://${TUNNEL_HOST}"
echo ""
echo "IMPORTANT — this project uses Expo SDK 56."
echo "App Store / Play Store Expo Go is SDK 54 and will fail with"
echo "'Failed to parse manifest JSON'. Install Expo Go SDK 56 first:"
echo "  iPhone:  https://sign.expo.dev  (select SDK 56)"
echo "  Android: https://expo.dev/go?sdkVersion=56&platform=android"
echo ""
echo "Scan QR or enter URL manually in Expo Go SDK 56."
echo ""

if command -v python3 >/dev/null 2>&1 && python3 -c 'import qrcode' 2>/dev/null; then
  python3 - <<PY
import qrcode
qrcode.make("${EXP_URL}", box_size=12, border=2).save("expo-qr.png")
print("QR saved: expo-qr.png")
PY
fi

exec npx expo start --port "$PORT" --lan
