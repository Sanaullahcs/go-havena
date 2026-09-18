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
common = [
    "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
]
remote = r"""
export PATH="/root/.nvm/versions/node/v22.22.3/bin:/usr/local/bin:/usr/bin:$PATH"
API=/home/gohvena/public_html/prod_apis
FE=/home/gohvena/public_html/prod_frontend
echo "=== migrate status ==="
cd "$API"
php artisan migrate:status 2>/dev/null | tail -n 30
echo "=== files ==="
grep -n "useRef" "$FE/src/app/(admin)/admin/feed/page.tsx" | head -2
grep -n "gohavena.com" "$FE/src/components/admin/sidebar.tsx" | head -5
test -f "$API/app/Services/AmenitySharedBillService.php" && echo api_bills=yes || echo api_bills=no
test -d "$FE/.next" && echo fe_next=yes || echo fe_next=no
echo "=== pm2 ==="
pm2 list | sed -n "1,20p"
echo "=== health ==="
curl -sS -o /dev/null -w "api:%{http_code}\n" https://apis.gohavena.com/api/v1/health
curl -sS -o /dev/null -w "web:%{http_code}\n" https://gohavena.com/
curl -sS -o /dev/null -w "feed:%{http_code}\n" https://gohavena.com/admin/feed
echo DONE
"""
out = subprocess.check_output(
    [r"C:\Program Files\PuTTY\plink.exe", "-ssh", *common, host, remote],
    stderr=subprocess.STDOUT,
    timeout=90,
)
log = root / ".tmp" / "verify-prod-deploy.log"
log.write_bytes(out)
print(out.decode("ascii", "replace"), flush=True)
