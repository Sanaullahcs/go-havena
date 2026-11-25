import subprocess
from pathlib import Path

env = {}
for line in Path(r"D:\wamp64-330\www\go-havena\.deploy\local.env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value

remote = r"""
set +e
cd /home/gohvena/public_html/prod_apis
php artisan tinker --execute="
echo 'POST IMAGES', PHP_EOL;
echo DB::table('posts')->orderByDesc('id')->limit(8)->get(['id','user_id','status','image_url','media_url'])->toJson(JSON_PRETTY_PRINT), PHP_EOL;
echo 'LISTING IMAGES', PHP_EOL;
echo DB::table('listings')->orderByDesc('id')->limit(8)->get(['id','user_id','status','title','image_url'])->toJson(JSON_PRETTY_PRINT), PHP_EOL;
echo 'NOTICE IMAGES', PHP_EOL;
echo DB::table('notices')->orderByDesc('id')->limit(6)->get(['id','title','status','category','image_url'])->toJson(JSON_PRETTY_PRINT), PHP_EOL;
echo 'SUBS', PHP_EOL;
echo DB::table('community_subscriptions')->whereIn('community_id',[1])->get()->toJson(JSON_PRETTY_PRINT), PHP_EOL;
echo 'COLUMNS posts=', implode(',', Schema::getColumnListing('posts')), PHP_EOL;
echo 'COLUMNS listings=', implode(',', Schema::getColumnListing('listings')), PHP_EOL;
echo 'COLUMNS notices=', implode(',', Schema::getColumnListing('notices')), PHP_EOL;
echo 'COLUMNS community_subscriptions=', implode(',', Schema::getColumnListing('community_subscriptions')), PHP_EOL;
"
echo
echo '=== PUBLIC SEED URL ==='
curl -sS -o /dev/null -w 'pool:%{http_code}\n' https://apis.gohavena.com/storage/seed/amenity-pool.jpg
curl -sS -o /dev/null -w 'alex:%{http_code}\n' https://apis.gohavena.com/storage/seed/avatar-alex.jpg
curl -sS -o /dev/null -w 'admin:%{http_code}\n' https://apis.gohavena.com/storage/seed/avatar-admin.jpg
curl -sS -o /dev/null -w 'avatar01:%{http_code}\n' https://apis.gohavena.com/storage/seed/avatar-01.jpg
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
    f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}",
    remote,
]
raise SystemExit(subprocess.call(cmd))
