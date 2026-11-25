import json
import os
import subprocess
import urllib.error
import urllib.request
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

# Reproduce OTP request against production
payload = json.dumps({"email": "resident@gohavena.com", "intent": "login"}).encode("utf-8")
req = urllib.request.Request(
    "https://apis.gohavena.com/api/v1/auth/otp/request",
    data=payload,
    headers={
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "HavenaDebug/1.0",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode("utf-8", "replace")
        print(f"HTTP {resp.status}\n{body}", flush=True)
except urllib.error.HTTPError as exc:
    body = exc.read().decode("utf-8", "replace")
    print(f"HTTP {exc.code}\n{body}", flush=True)

host = f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}"
api = env.get("DEPLOY_PATH_API") or "/home/gohvena/public_html/prod_apis"
common = [
    "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
]
remote = (
    f"cd {api}; "
    "echo '--- laravel log ---'; "
    "tail -n 80 storage/logs/laravel.log 2>/dev/null || true; "
    "echo '--- latest log ---'; "
    "ls -1t storage/logs | head -n 5; "
    "latest=$(ls -1t storage/logs/laravel*.log 2>/dev/null | head -n 1); "
    "if [ -n \"$latest\" ]; then tail -n 120 \"$latest\"; fi"
)
out = subprocess.check_output(
    [r"C:\\Program Files\\PuTTY\\plink.exe", "-ssh", *common, host, remote],
    stderr=subprocess.STDOUT,
    timeout=60,
)
log = root / ".tmp" / "resident-otp-error.log"
log.write_bytes(out)
print(out.decode("utf-8", "replace"), flush=True)
