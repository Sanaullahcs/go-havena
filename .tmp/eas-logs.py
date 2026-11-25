import json
import urllib.request
from pathlib import Path

env = {}
for line in Path(r"D:\wamp64-330\www\go-havena\.deploy\local.env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value

query = {
    "query": """
    query($id: ID!) {
      builds {
        byId(buildId: $id) {
          id
          status
          error { errorCode message }
          logFiles
        }
      }
    }
    """,
    "variables": {"id": "59f551d1-1f2b-4257-84d3-23e05f8322fb"},
}

req = urllib.request.Request(
    "https://api.expo.dev/graphql",
    data=json.dumps(query).encode(),
    headers={
        "Authorization": f"Bearer {env['EXPO_TOKEN']}",
        "Content-Type": "application/json",
    },
    method="POST",
)
with urllib.request.urlopen(req, timeout=60) as resp:
    payload = json.loads(resp.read().decode())
print(json.dumps(payload, indent=2)[:4000])

files = (((payload.get("data") or {}).get("builds") or {}).get("byId") or {}).get("logFiles") or []
out = Path(r"D:\wamp64-330\www\go-havena\.tmp\eas-build-logs")
out.mkdir(parents=True, exist_ok=True)
for i, url in enumerate(files):
    try:
        with urllib.request.urlopen(url, timeout=60) as resp:
            text = resp.read().decode("utf-8", errors="replace")
        dest = out / f"log-{i}.txt"
        dest.write_text(text, encoding="utf-8")
        print(f"saved {dest} ({len(text)} chars)")
    except Exception as exc:
        print(f"failed {url}: {exc}")
