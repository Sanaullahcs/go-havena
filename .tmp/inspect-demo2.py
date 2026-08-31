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
echo '=== SEED AVATARS ==='
ls -1 storage/app/public/seed | grep -i avatar || echo 'NO AVATARS'
echo
echo '=== SEED COUNT ==='
ls storage/app/public/seed | wc -l
echo
echo '=== ARTISAN QUERY ==='
php artisan tinker --execute="
\$phones = ['+15555550100','+15555550200'];
\$users = DB::table('users')->whereIn('phone', \$phones)->get(['id','name','email','phone','role','status','community_admin_status']);
echo \$users->toJson(JSON_PRETTY_PRINT), PHP_EOL;
\$ids = \$users->pluck('id');
echo 'PROFILES', PHP_EOL;
echo DB::table('profiles')->whereIn('user_id', \$ids)->get(['user_id','display_name','avatar_url','unit_number'])->toJson(JSON_PRETTY_PRINT), PHP_EOL;
echo 'MEMBERSHIPS', PHP_EOL;
echo DB::table('community_memberships as cm')->join('communities as c','c.id','=','cm.community_id')->whereIn('cm.user_id', \$ids)->get(['cm.user_id','cm.community_id','c.name','cm.role','cm.status'])->toJson(JSON_PRETTY_PRINT), PHP_EOL;
echo 'COMMUNITIES', PHP_EOL;
echo DB::table('communities')->orderBy('id')->limit(10)->get(['id','name','status','review_status'])->toJson(JSON_PRETTY_PRINT), PHP_EOL;
echo 'COUNTS posts=', DB::table('posts')->count(),
 ' listings=', DB::table('listings')->count(),
 ' notices=', DB::table('notices')->count(),
 ' amenities=', DB::table('amenities')->count(), PHP_EOL;
"
echo
echo '=== SUBSCRIPTION TABLES ==='
php artisan tinker --execute="echo implode(',', array_column(DB::select('SHOW TABLES'), 'Tables_in_'.DB::getDatabaseName()));"
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
