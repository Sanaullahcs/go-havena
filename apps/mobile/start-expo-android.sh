#!/usr/bin/env bash
# Havena — Expo Go on Android (SDK 56)
set -euo pipefail
cd "$(dirname "$0")"

IP="$(
  ipconfig getifaddr en0 2>/dev/null ||
  ipconfig getifaddr en1 2>/dev/null ||
  ifconfig | awk '/inet / && $2 != "127.0.0.1" { print $2; exit }'
)"

echo ""
echo "=== Havena mobile (Expo SDK 56) ==="
echo ""
echo "IMPORTANT — Android Expo Go must match SDK 56."
echo "The Play Store app is often too old and will fail to load this project."
echo ""
echo "On your Android phone, install Expo Go 56.0.0:"
echo "  https://expo.dev/go?sdkVersion=56&platform=android"
echo "  (or APK: https://github.com/expo/expo-go-releases/releases/tag/Expo-Go-56.0.0)"
echo ""
echo "Then connect phone + Mac to the same Wi-Fi and scan the QR below."
echo ""

if [[ -n "${IP:-}" ]]; then
  EXP_URL="exp://${IP}:8081"
  API_URL="http://${IP}:8000/api/v1"
  echo "Metro URL:  ${EXP_URL}"
  echo "API URL:    ${API_URL}"
  echo ""

  if command -v node >/dev/null 2>&1; then
    node - <<'NODE' "$EXP_URL"
const q = require("qrcode");
const url = process.argv[1];
Promise.all([
  q.toFile("../../expo-qr.png", url, { width: 512, margin: 2 }),
  q.toFile("expo-qr.png", url, { width: 512, margin: 2 }),
]).then(() => console.log("QR saved: expo-qr.png"));
NODE
  fi
fi

echo ""
echo "Starting Metro on LAN (port 8081)..."
lsof -ti :8081 | xargs kill -9 2>/dev/null || true
exec npx expo start --host lan -c
