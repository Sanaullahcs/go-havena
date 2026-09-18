#!/bin/bash
set -euo pipefail
export PATH="/root/.nvm/versions/node/v22.22.3/bin:/usr/local/bin:/usr/bin:$PATH"
PHP_BIN="${PHP_BIN:-/usr/local/bin/php}"
command -v "$PHP_BIN" >/dev/null 2>&1 || PHP_BIN=php
NPM_BIN="$(command -v npm)"
API=/home/gohvena/public_html/prod_apis
FE=/home/gohvena/public_html/prod_frontend
STAGE=/tmp/gohavena-stage
PORT=3020

echo "==> extract"
rm -rf "$STAGE"
mkdir -p "$STAGE"
tar -xzf /tmp/havena-backend.tgz -C "$STAGE"
tar -xzf /tmp/havena-frontend.tgz -C "$STAGE"
test -d "$STAGE/backend"
test -d "$STAGE/frontend"

echo "==> API rsync"
if [ -f "$API/.env" ]; then
  cp -a "$API/.env" /tmp/gohavena_prod_api.env.bak
fi
rsync -a --delete \
  --exclude '.env' \
  --exclude 'vendor/' \
  --exclude 'storage/app/' \
  --exclude 'storage/logs/' \
  --exclude 'storage/framework/' \
  --exclude 'bootstrap/cache/*.php' \
  "$STAGE/backend/" "$API/"
if [ -f /tmp/gohavena_prod_api.env.bak ]; then
  cp -a /tmp/gohavena_prod_api.env.bak "$API/.env"
fi
mkdir -p "$API/storage/framework/"{cache/data,sessions,views} "$API/storage/logs" "$API/bootstrap/cache"
chown -R gohvena:gohvena "$API"

echo "==> composer"
cd "$API"
if [ -f composer.phar ]; then
  sudo -u gohvena "$PHP_BIN" composer.phar install --no-dev --optimize-autoloader --no-interaction
else
  COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --optimize-autoloader --no-interaction
fi

echo "==> migrate --force"
sudo -u gohvena "$PHP_BIN" artisan migrate --force --no-ansi
echo "==> geography sync"
sudo -u gohvena "$PHP_BIN" artisan geography:sync-locations --no-ansi || true
echo "==> migrate status"
sudo -u gohvena "$PHP_BIN" artisan migrate:status --no-ansi | tail -n 25 || true

echo "==> laravel cache"
sudo -u gohvena "$PHP_BIN" artisan storage:link --force 2>/dev/null || true
sudo -u gohvena "$PHP_BIN" artisan optimize:clear
sudo -u gohvena "$PHP_BIN" artisan config:cache
sudo -u gohvena "$PHP_BIN" artisan route:cache || true
find "$API" -type d -exec chmod 755 {} \;
find "$API" -type f -exec chmod 644 {} \;
chmod -R 775 "$API/storage" "$API/bootstrap/cache"
chown -R gohvena:gohvena "$API"

echo "==> frontend rsync"
rsync -a --delete \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude '.htaccess' \
  --exclude '.env.production.local' \
  --exclude '.env.local' \
  "$STAGE/frontend/" "$FE/"
sed -i '/"go-havena": "file:\.\.",/d' "$FE/package.json" || true
if [ ! -f "$FE/.env.production.local" ]; then
  cat >"$FE/.env.production.local" <<'EOF'
NEXT_PUBLIC_API_BASE_URL=https://apis.gohavena.com/api/v1
NEXT_PUBLIC_API_URL=https://apis.gohavena.com/api
EOF
fi
chown -R gohvena:gohvena "$FE"

echo "==> npm install + build"
cd "$FE"
rm -rf .next
env PATH="$PATH" "$NPM_BIN" install --no-audit --no-fund
env PATH="$PATH" "$NPM_BIN" run build
chown -R gohvena:gohvena "$FE"

echo "==> pm2 restart"
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe havena-prod >/dev/null 2>&1; then
    pm2 restart havena-prod
  else
    pm2 start "$NPM_BIN" --name havena-prod --cwd "$FE" -- run start -- -p "$PORT" -H 127.0.0.1
  fi
  pm2 save || true
fi
sleep 5

echo "==> health"
curl -sS -o /dev/null -w "api:%{http_code}\n" https://apis.gohavena.com/api/v1/health
curl -sS -o /dev/null -w "web:%{http_code}\n" https://gohavena.com/
curl -sS -o /dev/null -w "feed:%{http_code}\n" https://gohavena.com/admin/feed
echo DONE
