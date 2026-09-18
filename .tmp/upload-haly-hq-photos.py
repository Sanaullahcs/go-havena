import os
import subprocess
import tarfile
from io import BytesIO
from pathlib import Path

from PIL import Image

os.environ["PYTHONUNBUFFERED"] = "1"

root = Path(r"D:\wamp64-330\www\go-havena")
src_dir = Path(r"C:\Users\Sanaullah\.cursor\projects\d-wamp64-330-www-go-havena\assets")
out_dir = root / ".tmp" / "haly-hq"
out_dir.mkdir(parents=True, exist_ok=True)

mapping = {
    "Chaayé Khana": "haly-chaaye-khana.jpg",
    "Saudi Broast": "haly-saudi-broast.jpg",
    "California Pizza": "haly-california-pizza.jpg",
    "Ping Pong": "haly-ping-pong.jpg",
    "Pret Brasserie": "haly-pret-brasserie.jpg",
    "FoodGuy": "haly-foodguy.jpg",
    "Cuisine By Ayesha Kamil": "haly-ayesha-kamil.jpg",
    "Saadi Di Sajji": "haly-saadi-sajji.jpg",
    "Paradise Restaurant": "haly-paradise.jpg",
    "KAFI": "haly-kafi.jpg",
    "Majnoon Lebanese": "haly-majnoon.jpg",
    "Chips & Chopsticks": "haly-chips-chopsticks.jpg",
    "Rax Foods": "haly-rax-foods.jpg",
    "Kruncheese": "haly-kruncheese.jpg",
    "Khas Samosa": "haly-khas-samosa.jpg",
}

for name, filename in mapping.items():
    src = src_dir / filename
    dest = out_dir / filename
    im = Image.open(src).convert("RGB")
    im.thumbnail((1280, 800), Image.Resampling.LANCZOS)
    im.save(dest, "JPEG", quality=78, optimize=True, progressive=True)
    print(f"ok {filename} {src.stat().st_size} -> {dest.stat().st_size}")

buf = BytesIO()
with tarfile.open(fileobj=buf, mode="w:gz") as tar:
    for filename in mapping.values():
        path = out_dir / filename
        tar.add(path, arcname=filename)
tgz = root / ".tmp" / "haly-hq.tgz"
tgz.write_bytes(buf.getvalue())
print("tgz", tgz.stat().st_size)

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
    r"C:\Program Files\PuTTY\plink.exe",
    "-ssh",
    "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
    host,
]
put = subprocess.run(
    [*common, "cat > /tmp/haly-hq.tgz"],
    input=tgz.read_bytes(),
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    timeout=90,
)
if put.returncode != 0:
    raise SystemExit(put.stdout.decode("ascii", "replace"))

php = r"""
<?php
use Illuminate\Support\Facades\DB;
$dest = storage_path('app/public/businesses/haly');
@mkdir($dest, 0775, true);
exec('tar -xzf /tmp/haly-hq.tgz -C '.escapeshellarg($dest));
$map = [
    44 => ['Chaayé Khana', 'haly-chaaye-khana.jpg'],
    45 => ['Saudi Broast', 'haly-saudi-broast.jpg'],
    46 => ['California Pizza', 'haly-california-pizza.jpg'],
    47 => ['Ping Pong', 'haly-ping-pong.jpg'],
    48 => ['Pret Brasserie', 'haly-pret-brasserie.jpg'],
    49 => ['FoodGuy', 'haly-foodguy.jpg'],
    50 => ['Cuisine By Ayesha Kamil', 'haly-ayesha-kamil.jpg'],
    51 => ['Saadi Di Sajji', 'haly-saadi-sajji.jpg'],
    52 => ['Paradise Restaurant', 'haly-paradise.jpg'],
    53 => ['KAFI', 'haly-kafi.jpg'],
    54 => ['Majnoon Lebanese', 'haly-majnoon.jpg'],
    55 => ['Chips & Chopsticks', 'haly-chips-chopsticks.jpg'],
    56 => ['Rax Foods', 'haly-rax-foods.jpg'],
    57 => ['Kruncheese', 'haly-kruncheese.jpg'],
    58 => ['Khas Samosa', 'haly-khas-samosa.jpg'],
];
foreach ($map as $id => [$name, $file]) {
    $rel = '/storage/businesses/haly/'.$file;
    $ok = is_file($dest.'/'.$file) ? filesize($dest.'/'.$file) : 0;
    DB::table('businesses')->where('id', $id)->update([
        'name' => $name,
        'image_url' => $rel,
        'updated_at' => now(),
    ]);
    DB::table('deals')->where('community_id', 52)->where('business_id', $id)->update([
        'vendor' => $name,
        'title' => $name.' — Haly Tower',
        'image_url' => $rel,
        'updated_at' => now(),
    ]);
    echo $id.' '.$name.' '.$ok.PHP_EOL;
}
echo 'biz_with_img='.DB::table('businesses')->where('community_id',52)->whereNotNull('image_url')->where('image_url','!=','')->count().PHP_EOL;
echo 'deal_with_img='.DB::table('deals')->where('community_id',52)->whereNotNull('image_url')->where('image_url','!=','')->count().PHP_EOL;
"""
subprocess.run([*common, "cat > /tmp/apply-haly-hq.php"], input=php.replace("\r\n", "\n").encode("utf-8"), check=True, timeout=30)
remote = (
    "sed -i 's/\\r$//' /tmp/apply-haly-hq.php; "
    f"cd {api}; php artisan tinker --execute=\"require '/tmp/apply-haly-hq.php';\"; "
    "rm -f /tmp/apply-haly-hq.php /tmp/haly-hq.tgz"
)
out = subprocess.check_output([*common, remote], stderr=subprocess.STDOUT, timeout=90)
print(out.decode("utf-8", "replace").encode("ascii", "replace").decode("ascii"), flush=True)
