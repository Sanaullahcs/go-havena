import os
import subprocess
import urllib.request
from pathlib import Path

os.environ["PYTHONUNBUFFERED"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

root = Path(r"D:\wamp64-330\www\go-havena")
img_dir = root / ".tmp" / "hp-carousel"
img_dir.mkdir(parents=True, exist_ok=True)

photos = {
    "hp-storm.jpg": "https://images.unsplash.com/photo-1527482797697-017df21bdd92?auto=format&fit=crop&w=1600&h=900&q=80",
    "hp-fire.jpg": "https://images.pexels.com/photos/923681/pexels-photo-923681.jpeg?auto=compress&cs=tinysrgb&w=1600",
    "hp-water.jpg": "https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&w=1600&h=900&q=80",
    "hp-elevator.jpg": "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1600&h=900&q=80",
    "hp-lobby.jpg": "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&h=900&q=80",
    "hp-pool.jpg": "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=1600&h=900&q=80",
    "hp-harbor.jpg": "https://images.unsplash.com/photo-1563840111261-8b096fb63b65?auto=format&fit=crop&w=1600&h=900&q=80",
}

ua = "Mozilla/5.0 (compatible; HavenaDemo/1.0)"
for name, url in photos.items():
    dest = img_dir / name
    if dest.exists() and dest.stat().st_size > 40000:
        print(f"have {name} {dest.stat().st_size}", flush=True)
        continue
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=40) as resp:
        data = resp.read()
    if len(data) < 20000:
        raise SystemExit(f"tiny image {name} {len(data)}")
    dest.write_bytes(data)
    print(f"dl {name} {len(data)}", flush=True)

env = {}
for line in (root / ".deploy" / "local.env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value

host = f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}"
api = env.get("DEPLOY_PATH_API") or "/home/gohvena/public_html/prod_apis"
common = [
    "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
]

for name in photos:
    subprocess.check_call(
        [
            r"C:\Program Files\PuTTY\pscp.exe",
            *common,
            str(img_dir / name),
            f"{host}:/tmp/{name}",
        ]
    )

script = root / ".tmp" / "fix-hp-carousel.php"
script.write_bytes(script.read_bytes().replace(b"\r\n", b"\n"))
subprocess.check_call(
    [r"C:\Program Files\PuTTY\pscp.exe", *common, str(script), f"{host}:/tmp/fix-hp-carousel.php"]
)

remote = (
    "set -e; "
    f"SEED={api}/storage/app/public/seed; "
    "mkdir -p \"$SEED\"; "
    "for f in hp-storm.jpg hp-fire.jpg hp-water.jpg hp-elevator.jpg hp-lobby.jpg hp-pool.jpg hp-harbor.jpg; do "
    "  mv -f /tmp/$f \"$SEED/$f\"; "
    "  chmod 644 \"$SEED/$f\"; "
    "done; "
    "sed -i 's/\\r$//' /tmp/fix-hp-carousel.php; "
    f"cd {api}; "
    "php artisan tinker --execute=\"require '/tmp/fix-hp-carousel.php';\"; "
    "rm -f /tmp/fix-hp-carousel.php; "
    "ls -l storage/app/public/seed/hp-*.jpg"
)
out = subprocess.check_output(
    [r"C:\Program Files\PuTTY\plink.exe", "-ssh", *common, host, remote],
    stderr=subprocess.STDOUT,
    timeout=120,
)
log = root / ".tmp" / "fix-hp-carousel.log"
log.write_bytes(out)
print(out.decode("utf-8", "replace"), flush=True)
