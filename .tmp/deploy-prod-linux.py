#!/usr/bin/env python3
"""Pack and deploy Havena frontend + backend to gohavena.com.

Reads .deploy/local.env or DEPLOY_SSH_* environment variables.
Never runs migrate:fresh / db:wipe / db:seed.
"""
from __future__ import annotations

import os
import subprocess
import tarfile
from pathlib import Path

os.environ.setdefault("PYTHONUNBUFFERED", "1")

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".deploy" / "local.env"


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env[key] = value
    for key in (
        "DEPLOY_SSH_USER",
        "DEPLOY_SSH_HOST",
        "DEPLOY_SSH_PORT",
        "DEPLOY_SSH_PASSWORD",
        "DEPLOY_SSH_HOSTKEY",
    ):
        if os.environ.get(key):
            env[key] = os.environ[key]
    missing = [k for k in ("DEPLOY_SSH_USER", "DEPLOY_SSH_HOST", "DEPLOY_SSH_PASSWORD") if not env.get(k)]
    if missing:
        raise SystemExit(
            "Missing deploy SSH settings: "
            + ", ".join(missing)
            + ". Add them to .deploy/local.env or the environment."
        )
    env.setdefault("DEPLOY_SSH_PORT", "22")
    return env


def tar_filter(skip_names: set[str]):
    def _filter(info: tarfile.TarInfo):
        parts = Path(info.name).parts
        if any(p in skip_names for p in parts):
            return None
        name = info.name.replace("\\", "/")
        if name.endswith(".env") or "/.env" in name:
            return None
        return info

    return _filter


def ssh_base(env: dict[str, str]) -> list[str]:
    port = env.get("DEPLOY_SSH_PORT", "22")
    return [
        "sshpass",
        "-p",
        env["DEPLOY_SSH_PASSWORD"],
        "ssh",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "PreferredAuthentications=password",
        "-o",
        "PubkeyAuthentication=no",
        "-p",
        port,
        f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}",
    ]


def scp_base(env: dict[str, str]) -> list[str]:
    port = env.get("DEPLOY_SSH_PORT", "22")
    return [
        "sshpass",
        "-p",
        env["DEPLOY_SSH_PASSWORD"],
        "scp",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "PreferredAuthentications=password",
        "-o",
        "PubkeyAuthentication=no",
        "-P",
        port,
    ]


def main() -> None:
    env = load_env()
    host = f"{env['DEPLOY_SSH_USER']}@{env['DEPLOY_SSH_HOST']}"
    tmp = ROOT / ".tmp"
    tmp.mkdir(exist_ok=True)
    be_tgz = tmp / "havena-backend.tgz"
    fe_tgz = tmp / "havena-frontend.tgz"
    remote = tmp / "gohavena-prod-deploy-remote.sh"

    backend_skip = {"vendor", "node_modules", ".env", ".git", "storage", "bootstrap/cache"}
    frontend_skip = {"node_modules", ".next", ".env.local", ".env.production.local", ".git"}

    if be_tgz.exists():
        be_tgz.unlink()
    if fe_tgz.exists():
        fe_tgz.unlink()

    print("packing backend", flush=True)
    with tarfile.open(be_tgz, "w:gz") as tar:
        tar.add(ROOT / "backend", arcname="backend", filter=tar_filter(backend_skip))
    print(f"backend {be_tgz.stat().st_size / 1_000_000:.1f} MB", flush=True)

    print("packing frontend", flush=True)
    with tarfile.open(fe_tgz, "w:gz") as tar:
        tar.add(ROOT / "frontend", arcname="frontend", filter=tar_filter(frontend_skip))
    print(f"frontend {fe_tgz.stat().st_size / 1_000_000:.1f} MB", flush=True)

    print("upload", flush=True)
    dest = f"{host}:/tmp/"
    subprocess.check_call(scp_base(env) + [str(be_tgz), dest])
    subprocess.check_call(scp_base(env) + [str(fe_tgz), dest])
    subprocess.check_call(scp_base(env) + [str(remote), dest])

    print("remote deploy", flush=True)
    subprocess.check_call(
        ssh_base(env)
        + ["sed -i 's/\\r$//' /tmp/gohavena-prod-deploy-remote.sh && bash /tmp/gohavena-prod-deploy-remote.sh"],
    )


if __name__ == "__main__":
    main()
