import os
import subprocess
from pathlib import Path

os.environ["PYTHONUNBUFFERED"] = "1"
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
remote = (
    f"grep -n 'Havena Admin\\|support@gohavena.com' {fe}/src/components/admin/sidebar.tsx || echo source_clean; "
    f"grep -R -l 'Havena Admin' {fe}/.next/server {fe}/.next/static 2>/dev/null | head -n 5 || echo build_clean"
)
out = subprocess.check_output(
    [r"C:\Program Files\PuTTY\plink.exe", "-ssh", *common, host, remote],
    stderr=subprocess.STDOUT,
    timeout=30,
)
print(out.decode("ascii", "replace"), flush=True)
