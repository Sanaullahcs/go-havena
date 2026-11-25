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
echo 'posts cols: ', implode(',', Schema::getColumnListing('posts')), PHP_EOL;
echo 'listings cols: ', implode(',', Schema::getColumnListing('listings')), PHP_EOL;
echo 'notices cols: ', implode(',', Schema::getColumnListing('notices')), PHP_EOL;
echo 'subs cols: ', implode(',', Schema::getColumnListing('community_subscriptions')), PHP_EOL;
echo 'POSTS', PHP_EOL; echo json_encode(DB::table('posts')->orderByDesc('id')->limit(5)->get(), JSON_PRETTY_PRINT), PHP_EOL;
echo 'LISTINGS', PHP_EOL; echo json_encode(DB::table('listings')->orderByDesc('id')->limit(5)->get(['id','user_id','status','title']), JSON_PRETTY_PRINT), PHP_EOL;
echo 'SUBS', PHP_EOL; echo json_encode(DB::table('community_subscriptions')->where('community_id',1)->get(), JSON_PRETTY_PRINT), PHP_EOL;
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
    f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}",
    remote,
]
raise SystemExit(subprocess.call(cmd))
