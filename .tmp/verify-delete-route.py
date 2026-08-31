import json
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

env = {}
for line in Path(r"D:\wamp64-330\www\go-havena\.deploy\local.env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value

try:
    urllib.request.urlopen(urllib.request.Request(
        "https://apis.gohavena.com/api/v1/me",
        method="DELETE",
        headers={"Accept": "application/json", "User-Agent": "HavenaStoreCheck/1.0"},
    ), timeout=20)
    print("delete unexpected success")
except urllib.error.HTTPError as e:
    print("delete unauth", e.code)

otp = subprocess.check_output([
    r"C:\Program Files\PuTTY\plink.exe", "-ssh", "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"], "-batch", "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
    f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}",
    "grep '^OTP_FIXED_CODE=' /home/gohvena/public_html/prod_apis/.env | cut -d= -f2",
], text=True).strip()

def post(path, payload):
    req = urllib.request.Request(
        "https://apis.gohavena.com/api/v1" + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())

post("/auth/otp/request", {"phone": "+15555550100"})
body = post("/auth/otp/verify", {"phone": "+15555550100", "code": otp})
data = body.get("data") or body
token = data.get("token") or data.get("access_token")
user = data.get("user") or {}
print("login", user.get("name"), user.get("role"), "token", bool(token))
req = urllib.request.Request(
    "https://apis.gohavena.com/api/v1/me",
    headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
)
with urllib.request.urlopen(req, timeout=30) as resp:
    me = json.loads(resp.read().decode()).get("data") or {}
print("me", me.get("name"), (me.get("profile") or {}).get("avatar_url"))
