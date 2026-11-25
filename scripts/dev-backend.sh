#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

echo "[dev-backend] Running pending migrations..."
php artisan migrate --force --no-interaction 2>/dev/null || true

echo "[dev-backend] Starting Laravel API on http://0.0.0.0:8000"
# Homebrew PHP defaults to 2M uploads; raise for phone photos/attachments.
exec php -d upload_max_filesize=40M -d post_max_size=48M artisan serve --host=0.0.0.0 --port=8000
