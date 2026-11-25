import subprocess
from pathlib import Path

env = {}
for line in Path(r"D:\wamp64-330\www\go-havena\.deploy\local.env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value

db = env["PROD_DB_DATABASE"]
user = env["PROD_DB_USERNAME"]
pw = env["PROD_DB_PASSWORD"]

remote = f"""
set +e
export MYSQL_PWD={pw!r}
echo '=== USERS 0100/0200 ==='
mysql -u {user} {db} -e "SELECT id, name, email, phone, role, status, community_admin_status, phone_verified_at FROM users WHERE phone IN ('+15555550100','+15555550200','5555550100','5555550200') OR email LIKE 'test.%havena%';"
echo
echo '=== PROFILES ==='
mysql -u {user} {db} -e "SELECT u.phone, p.user_id, p.display_name, p.avatar_url, p.unit_number, p.residence_type, LEFT(p.bio,80) bio FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.phone IN ('+15555550100','+15555550200');"
echo
echo '=== MEMBERSHIPS ==='
mysql -u {user} {db} -e "SELECT u.phone, cm.community_id, c.name, cm.role, cm.status FROM users u JOIN community_memberships cm ON cm.user_id=u.id JOIN communities c ON c.id=cm.community_id WHERE u.phone IN ('+15555550100','+15555550200');"
echo
echo '=== COMMUNITIES ==='
mysql -u {user} {db} -e "SELECT id, name, status, review_status, region_id FROM communities ORDER BY id LIMIT 15;"
echo
echo '=== CONTENT COUNTS ==='
mysql -u {user} {db} -e "SELECT 'posts' t, COUNT(*) n FROM posts UNION SELECT 'listings', COUNT(*) FROM listings UNION SELECT 'notices', COUNT(*) FROM notices UNION SELECT 'amenities', COUNT(*) FROM amenities UNION SELECT 'businesses', COUNT(*) FROM businesses;"
echo
echo '=== SEED IMAGES ==='
ls -la /home/gohvena/public_html/prod_apis/storage/app/public/seed 2>/dev/null | head -n 40
ls -la /home/gohvena/public_html/prod_apis/public/storage/seed 2>/dev/null | head -n 20
echo
echo '=== STORAGE LINK ==='
ls -ld /home/gohvena/public_html/prod_apis/public/storage
echo
echo '=== OTP / APP ENV ==='
grep -E 'OTP|APP_ENV|APP_URL' /home/gohvena/public_html/prod_apis/.env | sed 's/PASSWORD=.*/PASSWORD=***/'
echo
echo '=== BILLING ADMIN ==='
mysql -u {user} {db} -e "SELECT table_name FROM information_schema.tables WHERE table_schema='{db}' AND table_name LIKE '%subscri%' OR (table_schema='{db}' AND table_name LIKE '%billing%');"
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
