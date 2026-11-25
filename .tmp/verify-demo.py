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
cd /home/gohvena/public_html/prod_apis
php artisan tinker --execute="
\$phones = ['+15555550100','+15555550200'];
\$users = DB::table('users')->whereIn('phone', \$phones)->get();
echo '=== USERS ===', PHP_EOL;
foreach (\$users as \$u) {
  echo json_encode(\$u, JSON_PRETTY_PRINT), PHP_EOL;
  \$p = DB::table('profiles')->where('user_id', \$u->id)->first();
  echo 'PROFILE ', json_encode(\$p, JSON_PRETTY_PRINT), PHP_EOL;
  \$ms = DB::table('community_memberships')->where('user_id', \$u->id)->get();
  echo 'MEMBERSHIPS ', json_encode(\$ms, JSON_PRETTY_PRINT), PHP_EOL;
}
echo '=== COMMUNITY 1 ===', PHP_EOL;
echo json_encode(DB::table('communities')->where('id',1)->first(['id','name','address','status','review_status']), JSON_PRETTY_PRINT), PHP_EOL;
echo '=== SUBSCRIPTION ===', PHP_EOL;
echo json_encode(DB::table('community_subscriptions')->where('community_id',1)->first(), JSON_PRETTY_PRINT), PHP_EOL;
echo '=== COUNTS ===', PHP_EOL;
echo 'posts=', DB::table('posts')->where('community_id',1)->count(), PHP_EOL;
echo 'posts_with_image=', DB::table('posts')->where('community_id',1)->whereNotNull('image_url')->where('image_url','!=','')->count(), PHP_EOL;
echo 'listings=', DB::table('listings')->where('community_id',1)->count(), PHP_EOL;
echo 'listings_with_image=', DB::table('listings')->where('community_id',1)->whereNotNull('image_url')->where('image_url','!=','')->count(), PHP_EOL;
echo 'notices=', DB::table('notices')->where('community_id',1)->count(), PHP_EOL;
echo 'amenities=', DB::table('amenities')->where('community_id',1)->count(), PHP_EOL;
echo 'events=', DB::table('events')->where('community_id',1)->count() ?? 'n/a', PHP_EOL;
echo '=== SAMPLE POST IMAGES ===', PHP_EOL;
echo json_encode(DB::table('posts')->where('community_id',1)->orderByDesc('id')->limit(8)->get(['id','title','image_url']), JSON_PRETTY_PRINT), PHP_EOL;
echo '=== SAMPLE LISTING IMAGES ===', PHP_EOL;
echo json_encode(DB::table('listings')->where('community_id',1)->orderByDesc('id')->limit(6)->get(['id','title','image_url']), JSON_PRETTY_PRINT), PHP_EOL;
echo '=== AMENITY IMAGES ===', PHP_EOL;
echo json_encode(DB::table('amenities')->where('community_id',1)->limit(6)->get(['id','name','image_url']), JSON_PRETTY_PRINT), PHP_EOL;
"
echo
echo '=== PUBLIC IMAGE CHECKS ==='
for f in avatar-alex.jpg avatar-admin.jpg avatar-01.jpg avatar-02.jpg feed-market.jpg amenity-pool.jpg; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "https://apis.gohavena.com/storage/seed/\$f")
  echo "\$f \$code"
done
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
