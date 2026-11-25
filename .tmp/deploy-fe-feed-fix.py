import os
import subprocess
from pathlib import Path

os.environ["PYTHONUNBUFFERED"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

root = Path(r"D:\wamp64-330\www\go-havena")
env = {}
for line in (root / ".deploy" / "local.env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value

host = f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}"
fe = env.get("DEPLOY_PATH_FRONTEND_APP") or "/home/gohvena/public_html/prod_frontend"
common = [
    "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
]
pscp = [r"C:\Program Files\PuTTY\pscp.exe", *common]
plink = [r"C:\Program Files\PuTTY\plink.exe", "-ssh", *common, host]

files = [
    (
        root / "frontend" / "src" / "app" / "(admin)" / "admin" / "feed" / "page.tsx",
        "/tmp/havena-feed-page.tsx",
    ),
    (
        root / "frontend" / "src" / "app" / "(admin)" / "layout.tsx",
        "/tmp/havena-admin-layout.tsx",
    ),
]
for local, remote in files:
    print("upload", local.name, flush=True)
    subprocess.check_call(pscp + [str(local), f"{host}:{remote}"])

remote = f"""
set -e
export PATH="/root/.nvm/versions/node/v22.22.3/bin:$PATH"
FE={fe}
mkdir -p "$FE/src/app/(admin)/admin/feed"
cp /tmp/havena-feed-page.tsx "$FE/src/app/(admin)/admin/feed/page.tsx"
cp /tmp/havena-admin-layout.tsx "$FE/src/app/(admin)/layout.tsx"
chown gohvena:gohvena "$FE/src/app/(admin)/admin/feed/page.tsx" "$FE/src/app/(admin)/layout.tsx"
# Fast path: patch already-built client bundles so the demo works during rebuild.
python3 - <<'PY'
from pathlib import Path
root = Path("{fe}")
needles = [
    "from\\"react\\";",
    "from 'react';",
    'from"react";',
]
changed = 0
for path in root.glob(".next/**/*.js"):
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        continue
    if "useRef(" not in text or "Feed moderation" not in text and "prevFilterKey" not in text:
        if "prevFilterKey" not in text:
            continue
    if "useRef" in text and "useRef" not in text.split("useRef(", 1)[0][-80:]:
        pass
    old = text
    text = text.replace(
        "useCallback, useEffect, useMemo, useState",
        "useCallback, useEffect, useMemo, useRef, useState",
    )
    if text != old:
        path.write_text(text, encoding="utf-8")
        changed += 1
        print("patched", path)
print("patched_files", changed)
PY
cd "$FE"
if [ -f package.json ]; then
  echo BUILD
  sudo -u gohvena -H bash -lc "export PATH=/root/.nvm/versions/node/v22.22.3/bin:\\$PATH; cd '$FE' && npm run build"
fi
pm2 restart havena-prod || pm2 restart all
sleep 2
curl -sS -o /dev/null -w "feed:%{{http_code}}\\n" https://gohavena.com/admin/feed
echo DONE
"""
out = subprocess.check_output(plink + [remote], stderr=subprocess.STDOUT, timeout=420)
print(out.decode("utf-8", "replace"), flush=True)
