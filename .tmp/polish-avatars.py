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
\$img = '/storage/seed';
\$memberIds = DB::table('community_memberships')->where('community_id', 1)->pluck('user_id');
\$users = DB::table('users')->whereIn('id', \$memberIds)->orderBy('id')->get(['id','name','email','phone']);
\$i = 0;
foreach (\$users as \$u) {
  \$phone = (string) \$u->phone;
  if (\$phone === '+15555550100') {
    \$file = 'avatar-alex.jpg';
  } elseif (\$phone === '+15555550200') {
    \$file = 'avatar-admin.jpg';
  } else {
    \$file = 'avatar-'.str_pad((string) ((\$i % 14) + 1), 2, '0', STR_PAD_LEFT).'.jpg';
    \$i++;
  }
  DB::table('profiles')->updateOrInsert(
    ['user_id' => \$u->id],
    ['avatar_url' => \$img.'/'.\$file, 'display_name' => DB::table('profiles')->where('user_id', \$u->id)->value('display_name') ?: \$u->name, 'updated_at' => now()]
  );
}
echo 'seed avatars=', DB::table('profiles')->whereIn('user_id', \$memberIds)->where('avatar_url','like','/storage/seed/%')->count(), '/', count(\$memberIds), PHP_EOL;
echo json_encode(DB::table('profiles')->whereIn('user_id', \$memberIds)->get(['user_id','display_name','avatar_url']), JSON_PRETTY_PRINT), PHP_EOL;
echo 'otp_set=', (env('OTP_FIXED_CODE') ? 'yes' : 'no'), ' config=', (config('havena.otp_fixed_code') ? 'yes' : (config('services.otp.fixed') ? 'yes' : 'unknown')), PHP_EOL;
"
grep -E '^OTP_FIXED_CODE=' .env | sed 's/=.*/=SET/'
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
