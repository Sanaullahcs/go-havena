import subprocess
from pathlib import Path
import urllib.request

env = {}
for line in Path(r"D:\wamp64-330\www\go-havena\.deploy\local.env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value

urls = [
    "https://apis.gohavena.com/storage/seed/avatar-alex.jpg",
    "https://apis.gohavena.com/storage/seed/avatar-admin.jpg",
    "https://apis.gohavena.com/storage/seed/avatar-01.jpg",
    "https://apis.gohavena.com/storage/seed/feed-market.jpg",
    "https://apis.gohavena.com/storage/seed/listing-sofa.jpg",
    "https://apis.gohavena.com/storage/seed/amenity-pool.jpg",
    "https://apis.gohavena.com/storage/seed/community-cover.jpg",
    "https://apis.gohavena.com/storage/seed/business-cafe.jpg",
    "https://apis.gohavena.com/api/v1/health",
]
for url in urls:
    try:
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": "HavenaDemoCheck/1.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            print(resp.status, resp.headers.get("Content-Type"), resp.headers.get("Content-Length"), url)
    except Exception as e:
        print("FAIL", url, e)

host = f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}"
remote = r"""
cd /home/gohvena/public_html/prod_apis
php artisan tinker --execute="
echo 'listings missing images:', PHP_EOL;
echo json_encode(DB::table('listings')->where('community_id',1)->where(function(\$q){\$q->whereNull('images')->orWhere('images','[]')->orWhere('images','');})->get(['id','title','images','status']), JSON_PRETTY_PRINT), PHP_EOL;
echo 'community cols sample:', PHP_EOL;
\$c = DB::table('communities')->where('id',1)->first();
foreach (['id','name','address','image_url','cover_image','cover_url','photo_url','logo_url'] as \$k) {
  if (isset(\$c->\$k)) echo \$k, '=', \$c->\$k, PHP_EOL;
}
echo 'otp=', env('OTP_FIXED_CODE'), PHP_EOL;
echo 'approved residents=', DB::table('community_memberships')->where('community_id',1)->where('status','approved')->count(), PHP_EOL;
echo 'profiles with seed avatar=', DB::table('profiles')->where('avatar_url','like','/storage/seed/%')->count(), PHP_EOL;
"
"""
cmd = [
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
    remote,
]
raise SystemExit(subprocess.call(cmd))
