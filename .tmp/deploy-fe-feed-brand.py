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

uploads = [
    (root / "frontend/src/app/(admin)/admin/feed/page.tsx", "/tmp/havena-feed-page.tsx"),
    (root / "frontend/src/app/(admin)/layout.tsx", "/tmp/havena-admin-layout.tsx"),
    (root / "frontend/src/components/admin/sidebar.tsx", "/tmp/havena-admin-sidebar.tsx"),
    (root / "frontend/src/app/(admin)/admin/support/page.tsx", "/tmp/havena-admin-support.tsx"),
    (root / "frontend/src/app/(portal)/support/page.tsx", "/tmp/havena-portal-support.tsx"),
]
for local, remote in uploads:
    print("upload", local.name, flush=True)
    subprocess.check_call(pscp + [str(local), f"{host}:{remote}"])

remote = f"""
set -e
export PATH="/root/.nvm/versions/node/v22.22.3/bin:$PATH"
FE={fe}
mkdir -p "$FE/src/app/(admin)/admin/feed" "$FE/src/components/admin" "$FE/src/app/(admin)/admin/support" "$FE/src/app/(portal)/support"
cp /tmp/havena-feed-page.tsx "$FE/src/app/(admin)/admin/feed/page.tsx"
cp /tmp/havena-admin-layout.tsx "$FE/src/app/(admin)/layout.tsx"
cp /tmp/havena-admin-sidebar.tsx "$FE/src/components/admin/sidebar.tsx"
cp /tmp/havena-admin-support.tsx "$FE/src/app/(admin)/admin/support/page.tsx"
cp /tmp/havena-portal-support.tsx "$FE/src/app/(portal)/support/page.tsx"
chown -R gohvena:gohvena "$FE/src/app/(admin)" "$FE/src/components/admin" "$FE/src/app/(portal)/support"
# Immediate string patch so the demo sees the correct email before the rebuild finishes.
python3 - <<'PY'
from pathlib import Path
root = Path(r"{fe}")
repls = [
    ("v2.1.4 \\u00b7 support@havena.app", "gohavena.com \\u00b7 support@gohavena.com"),
    ("v2.1.4 · support@havena.app", "gohavena.com · support@gohavena.com"),
    ("support@havena.app", "support@gohavena.com"),
    ("billing@havena.app", "billing@gohavena.com"),
    ("residents@havena.app", "hello@gohavena.com"),
    ("status.havena.app", "gohavena.com"),
    ("useCallback, useEffect, useMemo, useState", "useCallback, useEffect, useMemo, useRef, useState"),
]
count = 0
for path in list(root.glob(".next/**/*.js")) + list(root.glob(".next/**/*.html")):
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        continue
    old = text
    for a, b in repls:
        if a in text:
            text = text.replace(a, b)
    if text != old:
        path.write_text(text, encoding="utf-8")
        count += 1
print("hotpatched", count)
PY
cd "$FE"
echo BUILD
sudo -u gohvena -H bash -lc "export PATH=/root/.nvm/versions/node/v22.22.3/bin:\\$PATH; cd '$FE' && npm run build"
pm2 restart havena-prod || true
sleep 3
curl -sS -o /dev/null -w "feed:%{{http_code}}\\n" https://gohavena.com/admin/feed
echo DONE
"""
out = subprocess.check_output(plink + [remote], stderr=subprocess.STDOUT, timeout=480)
print(out.decode("utf-8", "replace"), flush=True)
