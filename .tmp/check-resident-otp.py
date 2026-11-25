import json
import urllib.error
import urllib.request

payload = json.dumps({"email": "resident@gohavena.com", "intent": "login"}).encode()
req = urllib.request.Request(
    "https://apis.gohavena.com/api/v1/auth/otp/request",
    data=payload,
    headers={"Accept": "application/json", "Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        print(resp.status)
        print(resp.read().decode())
except urllib.error.HTTPError as exc:
    print(exc.code)
    print(exc.read().decode())
