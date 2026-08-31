import subprocess
from pathlib import Path

env = {}
for line in Path(r"D:\wamp64-330\www\go-havena\.deploy\local.env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value

host = f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}"
remote = r"""
API=/home/gohvena/public_html/prod_apis
echo '=== public/storage/seed ==='
ls -la "$API/public/storage/seed" 2>/dev/null | head -80
echo
echo '=== storage/app/public/seed ==='
ls -la "$API/storage/app/public/seed" 2>/dev/null | head -80
echo
echo '=== symlink? ==='
ls -ld "$API/public/storage" "$API/storage/app/public"
echo
cd "$API"
php artisan tinker --execute="
echo 'posts images:', PHP_EOL;
echo json_encode(DB::table('posts')->where('community_id',1)->get(['id','image_url','status']), JSON_PRETTY_PRINT), PHP_EOL;
echo 'listings images:', PHP_EOL;
echo json_encode(DB::table('listings')->where('community_id',1)->get(['id','title','images','status']), JSON_PRETTY_PRINT), PHP_EOL;
echo 'notices images sample:', PHP_EOL;
echo json_encode(DB::table('notices')->where('community_id',1)->where('status','published')->limit(8)->get(['id','title','image_url']), JSON_PRETTY_PRINT), PHP_EOL;
echo 'amenities:', PHP_EOL;
echo json_encode(DB::table('amenities')->where('community_id',1)->get(['id','name','image_url']), JSON_PRETTY_PRINT), PHP_EOL;
echo 'businesses:', PHP_EOL;
echo json_encode(DB::table('businesses')->where('community_id',1)->get(['id','name','image_url']), JSON_PRETTY_PRINT), PHP_EOL;
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
