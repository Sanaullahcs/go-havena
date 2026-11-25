import json
import re
import urllib.request
from pathlib import Path

ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
pages = {
    "chaaye": "https://www.chaayekhana.com/",
    "ck-fp": "https://www.foodpanda.pk/restaurant/w27a/chaaye-khana-haly-tower",
    "cali": "https://www.foodpanda.pk/restaurant/f5ot/california-pizza-dha-f5ot",
    "khas": "https://khassamosa.com/",
    "saudi": "https://www.foodpanda.pk/chain/cn8bs/saudi-broast",
}

def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", "replace")

out = {}
for key, url in pages.items():
    html = fetch(url)
    dh = re.findall(r"https://images\.deliveryhero\.io/[^\"'\s]+", html)
    files = re.findall(r"https?://[^\"'\s]+\.(?:jpg|jpeg|png|webp)", html, re.I)
    out[key] = {"len": len(html), "dh": dh[:6], "files": files[:10]}
    print(key, "len", len(html), "dh", len(dh), "files", len(files))
    if dh:
        print(" ", dh[0][:180])
    elif files:
        print(" ", files[0][:180])

Path(r"D:\wamp64-330\www\go-havena\.tmp\resto-imgs.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
