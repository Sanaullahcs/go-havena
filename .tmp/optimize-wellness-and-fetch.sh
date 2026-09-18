#!/bin/bash
set -euo pipefail
API="${1:-/home/gohvena/public_html/prod_apis}"
SEED="$API/public/storage/seed"
THUMBS="$API/storage/app/public/wellness/thumbs"
BIZ="$API/storage/app/public/businesses/haly"
mkdir -p "$THUMBS" "$BIZ"

optimize_jpg() {
  local src="$1"
  local dest="$2"
  convert "$src" -auto-orient -strip -resize '800x800>' -sampling-factor 4:2:0 -quality 68 "$dest"
}

echo "=== optimize seed wellness ==="
shopt -s nullglob
for f in "$SEED"/course-*.jpg "$SEED"/wellness-*.jpg; do
  [ -f "$f" ] || continue
  before=$(stat -c%s "$f")
  tmp="${f}.opt.jpg"
  optimize_jpg "$f" "$tmp"
  after=$(stat -c%s "$tmp")
  if [ "$after" -gt 0 ] && [ "$after" -lt "$before" ]; then
    mv "$tmp" "$f"
    echo "ok $(basename "$f") $before -> $after"
  else
    rm -f "$tmp"
    echo "keep $(basename "$f") $before"
  fi
done

echo "=== cache youtube thumbs ==="
php -r '
$ids = [];
foreach (file("/tmp/yt-ids.txt") as $line) {
  $line = trim($line);
  if ($line !== "") $ids[] = $line;
}
echo count($ids);
' >/dev/null 2>&1 || true

while read -r yid; do
  [ -z "$yid" ] && continue
  dest="$THUMBS/${yid}.jpg"
  if [ ! -s "$dest" ]; then
    curl -fsSL --max-time 20 "https://img.youtube.com/vi/${yid}/mqdefault.jpg" -o "$dest.tmp" || true
    if [ -s "$dest.tmp" ]; then
      optimize_jpg "$dest.tmp" "$dest" || mv "$dest.tmp" "$dest"
      rm -f "$dest.tmp"
      echo "thumb $yid $(stat -c%s "$dest")"
    else
      rm -f "$dest.tmp"
      echo "fail $yid"
    fi
  else
    echo "have $yid"
  fi
done < /tmp/yt-ids.txt

if [ -d "$API/public/storage" ] && [ ! -e "$API/public/storage/wellness/thumbs" ]; then
  mkdir -p "$API/public/storage/wellness"
  ln -sfn "$THUMBS" "$API/public/storage/wellness/thumbs"
fi

HT="$API/public/storage/.htaccess"
if [ ! -f "$HT" ]; then
  cat > "$HT" <<'EOF'
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/jpeg "access plus 30 days"
  ExpiresByType image/png "access plus 30 days"
  ExpiresByType image/webp "access plus 30 days"
</IfModule>
<IfModule mod_headers.c>
  Header set Cache-Control "public, max-age=2592000, immutable"
</IfModule>
EOF
  echo "wrote storage cache headers"
fi

echo "done"
