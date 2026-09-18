import re
import subprocess
import urllib.request
from pathlib import Path

ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
out_dir = Path(r"D:\wamp64-330\www\go-havena\.tmp\haly-photos")
out_dir.mkdir(parents=True, exist_ok=True)

restaurants = [
    ("chaaye-khana", "https://www.foodpanda.pk/restaurant/w27a/chaaye-khana-haly-tower", "https://www.chaayekhana.com/"),
    ("saudi-broast", "https://www.foodpanda.pk/chain/cn8bs/saudi-broast", None),
    ("california-pizza", "https://www.foodpanda.pk/restaurant/f5ot/california-pizza-dha-f5ot", None),
    ("ping-pong", "https://www.foodpanda.pk/restaurant/cvw3/ping-pong-dha-cvw3", None),
    ("pret-brasserie", "https://www.foodpanda.pk/restaurant/d3km/pret-brasserie-dha-d3km", None),
    ("foodguy", "https://www.foodpanda.pk/restaurant/lxkw/foodguy-dha-lxkw", None),
    ("cuisine-ayesha-kamil", "https://www.foodpanda.pk/restaurant/t4b6/cuisine-by-ayesha-kamil-dha-t4b6", None),
    ("saadi-di-sajji", "https://www.foodpanda.pk/restaurant/q75o/saadi-di-sajji-dha-q75o", None),
    ("paradise-restaurant", "https://www.foodpanda.pk/restaurant/cch9/paradise-restaurant-dha-cch9", None),
    ("kafi", "https://www.foodpanda.pk/restaurant/blxe/kafi-dha-phase-2", None),
    ("majnoon-lebanese", "https://www.foodpanda.pk/restaurant/pmrp/majnoon-lebanese-dha-pmrp", None),
    ("chips-chopsticks", "https://www.foodpanda.pk/restaurant/y4s9/chips-and-chopsticks-dha-y4s9", None),
    ("rax-foods", "https://www.foodpanda.pk/restaurant/kggw/rax-foods-dha-kggw", None),
    ("kruncheese", "https://www.foodpanda.pk/restaurant/ugui/kruncheese-dha", None),
    ("khas-samosa", "https://khassamosa.com/", None),
]

def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read()

def pick_image(html: str):
    heroes = re.findall(r"https://images\.deliveryhero\.io/image/fd-pk/LH/[^\"'\s]+-hero\.[a-zA-Z0-9]+", html)
    if heroes:
        return heroes[0].replace("\\u002F", "/")
    dh = [
        u.replace("\\u002F", "/")
        for u in re.findall(r"https://images\.deliveryhero\.io/[^\"'\\s]+", html)
        if "logo" not in u.lower() and "icon" not in u.lower()
    ]
    if dh:
        return dh[0]
    files = re.findall(r"https?://[^\"'\\s]+\.(?:jpg|jpeg|png|webp)", html, re.I)
    files = [u for u in files if "logo" not in u.lower() and "favicon" not in u.lower() and "sprite" not in u.lower()]
    return files[0] if files else None

picked = {}
for slug, primary, fallback in restaurants:
    html = fetch(primary).decode("utf-8", "replace")
    url = pick_image(html)
    if not url and fallback:
        html = fetch(fallback).decode("utf-8", "replace")
        url = pick_image(html)
    print(f"{slug}: {url or 'NONE'}")
    if not url:
        continue
    try:
        data = fetch(url)
    except Exception as exc:
        print("  download fail", exc)
        continue
    ext = ".jpg"
    if url.lower().endswith(".png"):
        ext = ".png"
    elif url.lower().endswith(".webp"):
        ext = ".webp"
    dest = out_dir / f"{slug}{ext}"
    dest.write_bytes(data)
    picked[slug] = str(dest)
    print("  saved", dest.name, dest.stat().st_size)

print("saved", len(picked))
