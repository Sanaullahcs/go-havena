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
plink = [r"C:\Program Files\PuTTY\plink.exe", "-ssh", *common, host]

remote = f"""
set -e
export PATH="/root/.nvm/versions/node/v22.22.3/bin:/usr/local/bin:/usr/bin:$PATH"
FE={fe}
test -f "$FE/src/app/(admin)/admin/feed/page.tsx"
grep -n useRef "$FE/src/app/(admin)/admin/feed/page.tsx" | head -3
grep -n gohavena.com "$FE/src/components/admin/sidebar.tsx" | head -5
# Hot-patch built assets so the sidebar email is correct immediately.
if [ -d "$FE/.next" ]; then
  grep -rl "support@havena.app" "$FE/.next" 2>/dev/null | while read -r f; do
    sed -i "s/support@havena.app/support@gohavena.com/g" "$f"
  done || true
  grep -rl "billing@havena.app" "$FE/.next" 2>/dev/null | while read -r f; do
    sed -i "s/billing@havena.app/billing@gohavena.com/g" "$f"
  done || true
  grep -rl "residents@havena.app" "$FE/.next" 2>/dev/null | while read -r f; do
    sed -i "s/residents@havena.app/hello@gohavena.com/g" "$f"
  done || true
  grep -rl "status.havena.app" "$FE/.next" 2>/dev/null | while read -r f; do
    sed -i "s/status.havena.app/gohavena.com/g" "$f"
  done || true
  grep -rl "v2.1.4" "$FE/.next" 2>/dev/null | while read -r f; do
    sed -i "s/v2.1.4 · support@gohavena.com/gohavena.com · support@gohavena.com/g" "$f"
    sed -i "s/v2.1.4 · support@havena.app/gohavena.com · support@gohavena.com/g" "$f"
  done || true
  echo HOTPATCH_OK
fi
if [ -d "$FE/.next/standalone" ]; then
  grep -rl "support@havena.app" "$FE/.next/standalone" 2>/dev/null | while read -r f; do
    sed -i "s/support@havena.app/support@gohavena.com/g" "$f"
  done || true
fi
pm2 restart havena-prod || true
echo BUILD
cd "$FE"
if id gohvena >/dev/null 2>&1; then
  sudo -u gohvena -H env PATH="$PATH" bash -lc "cd '$FE' && npm run build"
else
  npm run build
fi
pm2 restart havena-prod || true
sleep 2
curl -sS -o /dev/null -w "feed:%{{http_code}}\\n" https://gohavena.com/admin/feed
echo DONE
"""
out = subprocess.check_output(plink + [remote], stderr=subprocess.STDOUT, timeout=480)
print(out.decode("utf-8", "replace"), flush=True)
