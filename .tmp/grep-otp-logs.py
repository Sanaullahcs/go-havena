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
api = env.get("DEPLOY_PATH_API") or "/home/gohvena/public_html/prod_apis"
cmd = (
    f"cd {api}/storage/logs; "
    "ls -1t laravel*.log 2>/dev/null | head -3; "
    "grep -i -E 'mahnoor|OTP mail failed|Havena OTP' $(ls -1t laravel*.log 2>/dev/null | head -2) 2>/dev/null | tail -n 80"
)
out = subprocess.check_output(
    [
        r"C:\Program Files\PuTTY\plink.exe",
        "-ssh",
        "-P", env["DEPLOY_SSH_PORT"],
        "-pw", env["DEPLOY_SSH_PASSWORD"],
        "-batch",
        "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
        host,
        cmd,
    ],
    stderr=subprocess.STDOUT,
    timeout=60,
)
safe = out.decode("utf-8", "replace").encode("ascii", "replace").decode("ascii")
(root / ".tmp" / "grep-otp-logs.log").write_text(safe, encoding="ascii")
print(safe, flush=True)
