import os
import subprocess
import tarfile
from pathlib import Path

os.environ["PYTHONUNBUFFERED"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

root = Path(r"D:\wamp64-330\www\go-havena")
env = {}
for line in (root / ".deploy" / "local.env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value

host = f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}"
common = [
    "-P", env["DEPLOY_SSH_PORT"],
    "-pw", env["DEPLOY_SSH_PASSWORD"],
    "-batch",
    "-hostkey", env.get("DEPLOY_SSH_HOSTKEY", ""),
]
pscp = [r"C:\Program Files\PuTTY\pscp.exe", *common]
plink = [r"C:\Program Files\PuTTY\plink.exe", "-ssh", *common, host]

backend_skip = {
    "vendor", "node_modules", ".env", ".git", "storage", "bootstrap/cache",
}
frontend_skip = {"node_modules", ".next", ".env.local", ".env.production.local", ".git"}


def tar_filter(skip_names):
    def _filter(info: tarfile.TarInfo):
        parts = Path(info.name).parts
        if any(p in skip_names for p in parts):
            return None
        name = info.name.replace("\\", "/")
        if name.endswith(".env") or "/.env" in name:
            return None
        return info
    return _filter


tmp = root / ".tmp"
be_tgz = tmp / "havena-backend.tgz"
fe_tgz = tmp / "havena-frontend.tgz"
if be_tgz.exists():
    be_tgz.unlink()
if fe_tgz.exists():
    fe_tgz.unlink()

print("packing backend", flush=True)
with tarfile.open(be_tgz, "w:gz") as tar:
    tar.add(root / "backend", arcname="backend", filter=tar_filter(backend_skip))
print(f"backend {be_tgz.stat().st_size / 1_000_000:.1f} MB", flush=True)

print("packing frontend", flush=True)
with tarfile.open(fe_tgz, "w:gz") as tar:
    tar.add(root / "frontend", arcname="frontend", filter=tar_filter(frontend_skip))
print(f"frontend {fe_tgz.stat().st_size / 1_000_000:.1f} MB", flush=True)

print("upload", flush=True)
subprocess.check_call(pscp + [str(be_tgz), f"{host}:/tmp/havena-backend.tgz"])
subprocess.check_call(pscp + [str(fe_tgz), f"{host}:/tmp/havena-frontend.tgz"])
subprocess.check_call(
    pscp + [str(tmp / "gohavena-prod-deploy-remote.sh"), f"{host}:/tmp/gohavena-prod-deploy-remote.sh"]
)

print("remote deploy", flush=True)
out = subprocess.check_output(
    plink + ["sed -i 's/\\r$//' /tmp/gohavena-prod-deploy-remote.sh && bash /tmp/gohavena-prod-deploy-remote.sh"],
    stderr=subprocess.STDOUT,
    timeout=900,
)
log = tmp / "deploy-prod-full-now.log"
log.write_bytes(out)
print(out.decode("utf-8", "replace").encode("ascii", "replace").decode("ascii"), flush=True)
