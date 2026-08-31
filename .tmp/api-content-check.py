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
otp = subprocess.check_output([
    r"C:\Program Files\PuTTY\plink.exe", "-ssh", "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"], "-batch", "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
    host, "grep '^OTP_FIXED_CODE=' /home/gohvena/public_html/prod_apis/.env | cut -d= -f2",
], text=True).strip()

API = "https://apis.gohavena.com/api/v1"

def req(method, path, payload=None, token=None):
    headers = {"Accept": "application/json", "User-Agent": "HavenaDemoCheck/1.0"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=30) as resp:
        return resp.status, json.loads(resp.read().decode())

# fill last two listings
polish = r"""
cd /home/gohvena/public_html/prod_apis
php artisan tinker --execute="
DB::table('listings')->where('id',13)->update(['images' => json_encode(['/storage/seed/wellness-learning.jpg']), 'updated_at' => now()]);
DB::table('listings')->where('id',14)->update(['images' => json_encode(['/storage/seed/listing-desk.jpg']), 'updated_at' => now()]);
echo 'ok';
"
"""
subprocess.check_call([
    r"C:\Program Files\PuTTY\plink.exe", "-ssh", "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"], "-batch", "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
    host, polish,
])

_, verify = req("POST", "/auth/otp/verify", {"phone": "+15555550100", "code": otp})
token = (verify.get("data") or verify).get("token") or (verify.get("data") or {}).get("access_token")
_, me = req("GET", "/me", token=token)
me_data = me.get("data") or me
print("resident memberships", [
    {"community_id": m.get("community_id") or (m.get("community") or {}).get("id"),
     "name": (m.get("community") or {}).get("name"),
     "role": m.get("role"), "status": m.get("status")}
    for m in (me_data.get("memberships") or [])
])

_, admin_verify = req("POST", "/auth/otp/verify", {"phone": "+15555550200", "code": otp})
admin_token = (admin_verify.get("data") or admin_verify).get("token") or (admin_verify.get("data") or {}).get("access_token")
_, admin_me = req("GET", "/me", token=admin_token)
admin_data = admin_me.get("data") or admin_me
print("admin memberships", [
    {"community_id": m.get("community_id") or (m.get("community") or {}).get("id"),
     "name": (m.get("community") or {}).get("name"),
     "role": m.get("role"), "status": m.get("status")}
    for m in (admin_data.get("memberships") or [])
])

for label, path in [
    ("posts", "/posts"),
    ("listings", "/listings"),
    ("amenities", "/amenities"),
    ("notices", "/notices"),
    ("businesses", "/businesses"),
]:
    try:
        status, body = req("GET", path, token=token)
        data = body.get("data") or body
        rows = data if isinstance(data, list) else (data.get("data") if isinstance(data, dict) else [])
        if isinstance(rows, dict):
            rows = rows.get("data") or []
        print(label, status, "count", len(rows) if isinstance(rows, list) else type(rows).__name__)
        if isinstance(rows, list):
            for row in rows[:4]:
                print(" ", {
                    "title": row.get("title") or row.get("name") or row.get("body", "")[:40],
                    "image": row.get("image_url") or row.get("image") or row.get("images") or row.get("cover_url"),
                    "author": row.get("author_name") or row.get("author") or row.get("display_name"),
                })
    except Exception as e:
        print(label, "FAIL", str(e)[:160])
