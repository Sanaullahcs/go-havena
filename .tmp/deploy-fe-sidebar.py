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
src = root / "frontend" / "src" / "components" / "admin" / "sidebar.tsx"
src.write_bytes(src.read_bytes().replace(b"\r\n", b"\n"))
subprocess.check_call(
    [
        r"C:\Program Files\PuTTY\pscp.exe",
        *common,
        str(src),
        f"{host}:{fe}/src/components/admin/sidebar.tsx",
    ]
)
remote = (
    "set -e; "
    f"sed -i 's/\\r$//' {fe}/src/components/admin/sidebar.tsx; "
    "export PATH=/root/.nvm/versions/node/v22.22.3/bin:/usr/local/bin:/usr/bin:$PATH; "
    f"cd {fe}; "
    "npm run build; "
    "pm2 restart havena-prod; "
    "sleep 4; "
    "curl -sS -o /dev/null -w 'web:%{http_code}\\n' https://gohavena.com/"
)
out = subprocess.check_output(
    [r"C:\Program Files\PuTTY\plink.exe", "-ssh", *common, host, remote],
    stderr=subprocess.STDOUT,
    timeout=600,
)
log = root / ".tmp" / "deploy-fe-sidebar.log"
log.write_bytes(out)
print(out.decode("ascii", "replace"), flush=True)
