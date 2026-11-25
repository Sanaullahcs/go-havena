import subprocess
from pathlib import Path

env = {}
for line in Path(r"D:\wamp64-330\www\go-havena\.deploy\local.env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value

local = r"D:\wamp64-330\www\go-havena\.tmp\seed-avatars"
remote_tmp = "/tmp/havena-seed-avatars"
host = f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}"
common = [
    r"C:\Program Files\PuTTY\pscp.exe",
    "-P",
    env["DEPLOY_SSH_PORT"],
    "-pw",
    env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey",
    env.get("DEPLOY_SSH_HOSTKEY", ""),
]

prep = [
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
    f"mkdir -p {remote_tmp} && chmod 777 {remote_tmp}",
]
print("prep", subprocess.call(prep))

upload = common + ["-r", local, f"{host}:{remote_tmp}/"]
print("upload", subprocess.call(upload))

remote = r"""
set -e
SRC=/tmp/havena-seed-avatars/seed-avatars
if [ ! -d "$SRC" ]; then SRC=/tmp/havena-seed-avatars; fi
echo "SRC=$SRC"
ls -1 "$SRC" | head
API=/home/gohvena/public_html/prod_apis
mkdir -p "$API/storage/app/public/seed" "$API/public/storage/seed"
cp -f "$SRC"/avatar-*.jpg "$API/storage/app/public/seed/"
cp -f "$SRC"/avatar-*.jpg "$API/public/storage/seed/"
chown gohvena:gohvena "$API/storage/app/public/seed"/avatar-*.jpg "$API/public/storage/seed"/avatar-*.jpg || true
chmod 644 "$API/storage/app/public/seed"/avatar-*.jpg "$API/public/storage/seed"/avatar-*.jpg
echo '=== AVATARS ON DISK ==='
ls -1 "$API/public/storage/seed"/avatar-*.jpg | wc -l
cd "$API"
php artisan db:seed --class=Database\\Seeders\\MobileTestAccountsSeeder --force
php artisan db:seed --class=Database\\Seeders\\DemoContentSeeder --force
php artisan tinker --execute="
\$plan = DB::table('subscription_plans')->orderBy('id')->first();
\$slug = \$plan->slug ?? 'starter';
\$exists = DB::table('community_subscriptions')->where('community_id', 1)->exists();
\$meta = json_encode(['card_on_file' => true, 'trial_consumed' => true, 'activated_via' => 'manual']);
if (! \$exists) {
  DB::table('community_subscriptions')->insert([
    'community_id' => 1,
    'plan_slug' => \$slug,
    'billing_interval' => 'month',
    'status' => 'active',
    'seat_limit' => 250,
    'extra_seats' => 0,
    'estimated_residents' => 80,
    'current_period_start' => now(),
    'current_period_end' => now()->addYear(),
    'cancel_at_period_end' => 0,
    'meta' => \$meta,
    'created_at' => now(),
    'updated_at' => now(),
  ]);
  echo 'created subscription', PHP_EOL;
} else {
  DB::table('community_subscriptions')->where('community_id', 1)->update([
    'status' => 'active',
    'meta' => \$meta,
    'updated_at' => now(),
  ]);
  echo 'updated subscription', PHP_EOL;
}
DB::table('users')->where('phone', '+15555550100')->update(['name' => 'Alex Rivera', 'status' => 'active', 'phone_verified_at' => now()]);
DB::table('users')->where('phone', '+15555550200')->update(['name' => 'Jordan Hale', 'status' => 'active', 'community_admin_status' => 'approved', 'phone_verified_at' => now()]);
\$alex = DB::table('users')->where('phone', '+15555550100')->value('id');
\$admin = DB::table('users')->where('phone', '+15555550200')->value('id');
DB::table('profiles')->where('user_id', \$alex)->update(['display_name' => 'Alex Rivera', 'avatar_url' => '/storage/seed/avatar-alex.jpg', 'unit_number' => 'Apt 101', 'bio' => 'Resident at Florida Main Street. Weekend runner and farmers-market regular.']);
DB::table('profiles')->where('user_id', \$admin)->update(['display_name' => 'Jordan Hale', 'avatar_url' => '/storage/seed/avatar-admin.jpg', 'unit_number' => 'Management Office', 'bio' => 'Community manager at Florida Main Street.']);
echo 'alex=', \$alex, ' admin=', \$admin, PHP_EOL;
echo json_encode(DB::table('profiles')->whereIn('user_id', [\$alex, \$admin])->get(['user_id','display_name','avatar_url']), JSON_PRETTY_PRINT), PHP_EOL;
"
echo
curl -sS -o /dev/null -w 'alex:%{http_code}\n' https://apis.gohavena.com/storage/seed/avatar-alex.jpg
curl -sS -o /dev/null -w 'admin:%{http_code}\n' https://apis.gohavena.com/storage/seed/avatar-admin.jpg
curl -sS -o /dev/null -w 'avatar01:%{http_code}\n' https://apis.gohavena.com/storage/seed/avatar-01.jpg
curl -sS -o /dev/null -w 'feed:%{http_code}\n' https://apis.gohavena.com/storage/seed/feed-market.jpg
"""

apply = [
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
raise SystemExit(subprocess.call(apply))
