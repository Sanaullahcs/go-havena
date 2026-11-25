import json
import subprocess
import urllib.request
from pathlib import Path

env = {}
for line in Path(r"D:\wamp64-330\www\go-havena\.deploy\local.env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value

host = f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}"
otp_cmd = [
    r"C:\Program Files\PuTTY\plink.exe",
    "-ssh",
    "-P",
    env["DEPLOY_SSH_PORT"],
    "-pw",
    env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey",
    env.get("DEPLOY_SSH_HOSTKEY", ""),
    host,
    "grep '^OTP_FIXED_CODE=' /home/gohvena/public_html/prod_apis/.env | cut -d= -f2",
]
otp = subprocess.check_output(otp_cmd, text=True).strip()

API = "https://apis.gohavena.com/api/v1"

def post(path, payload, token=None):
    data = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "HavenaDemoCheck/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(API + path, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status, json.loads(resp.read().decode())

def get(path, token):
    headers = {"Accept": "application/json", "Authorization": f"Bearer {token}", "User-Agent": "HavenaDemoCheck/1.0"}
    req = urllib.request.Request(API + path, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status, json.loads(resp.read().decode())

for phone in ["+15555550100", "+15555550200"]:
    s, body = post("/auth/otp/request", {"phone": phone})
    print(phone, "otp-request", s, body.get("message") or body.get("success") or list(body.keys()))
    s, body = post("/auth/otp/verify", {"phone": phone, "code": otp})
    data = body.get("data") or body
    user = data.get("user") or {}
    profile = user.get("profile") or data.get("profile") or {}
    token = data.get("token") or data.get("access_token")
    print(phone, "verify", s, {
        "name": user.get("name"),
        "role": user.get("role"),
        "community_admin_status": user.get("community_admin_status"),
        "display_name": profile.get("display_name"),
        "avatar_url": profile.get("avatar_url"),
        "has_token": bool(token),
    })
    if token:
        for path in ["/auth/me", "/me", "/profile"]:
            try:
                gs, gbody = get(path, token)
                gdata = gbody.get("data") or gbody
                print(phone, path, gs, {
                    "name": gdata.get("name") or (gdata.get("user") or {}).get("name"),
                    "avatar": (gdata.get("profile") or {}).get("avatar_url") or gdata.get("avatar_url"),
                    "keys": list(gdata.keys())[:12] if isinstance(gdata, dict) else type(gdata).__name__,
                })
                break
            except Exception as e:
                print(phone, path, "skip", str(e)[:80])
