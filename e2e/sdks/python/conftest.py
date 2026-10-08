from __future__ import annotations

import json
import os
import secrets
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import httpx
import pytest

# Ensure local Python SDK is on sys.path
_SDK_SRC = Path(__file__).resolve().parents[3] / "sdks" / "python" / "src"
if str(_SDK_SRC) not in sys.path:
    sys.path.insert(0, str(_SDK_SRC))

from memcell import AsyncMemcellClient, MemcellClient  # noqa: E402


@dataclass
class PythonSdkTestEnvironment:
    client: MemcellClient
    async_client: AsyncMemcellClient
    instance_url: str
    auth_token: str
    owner_slug: str
    ws_slug: str
    namespace: str


def resolve_instance_url() -> str:
    url = (
        os.environ.get("MEMCELL_URL")
        or os.environ.get("MEMCELL_INSTANCE_URL")
        or "http://localhost:3000"
    )
    return url.rstrip("/")


def resolve_auth_token(instance_url: str) -> str | None:
    if os.environ.get("MEMCELL_TOKEN", "").strip():
        return os.environ["MEMCELL_TOKEN"].strip()
    if os.environ.get("MEMCELL_API_KEY", "").strip():
        return os.environ["MEMCELL_API_KEY"].strip()
    if os.environ.get("MEMCELL_SESSION_TOKEN", "").strip():
        return os.environ["MEMCELL_SESSION_TOKEN"].strip()

    # Check ~/.memcell/credentials.json
    try:
        cred_file = Path.home() / ".memcell" / "credentials.json"
        if cred_file.is_file():
            data = json.loads(cred_file.read_text(encoding="utf-8"))
            creds = data.get("credentials", {}).get(instance_url)
            if creds and creds.get("token"):
                return creds["token"]
    except Exception:
        pass

    # Check local Postgres session table
    try:
        db_url = os.environ.get(
            "DATABASE_URL",
            "postgresql://memcell:memcell@localhost:5442/memcell",
        )
        cmd = [
            "psql",
            db_url,
            "-t",
            "-A",
            "-c",
            "SELECT token FROM session WHERE expires_at > NOW() ORDER BY expires_at DESC LIMIT 1;",
        ]
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
            timeout=5,
        )
        token = result.stdout.strip()
        if token:
            return token
    except Exception:
        pass

    return None


def is_backend_healthy(instance_url: str) -> bool:
    try:
        res = httpx.get(f"{instance_url}/api/healthz", timeout=3.0)
        return res.is_success
    except Exception:
        return False


@pytest.fixture(scope="module")
def env():
    instance_url = resolve_instance_url()
    if not is_backend_healthy(instance_url):
        pytest.skip(f"MemCell backend at {instance_url} is not healthy or reachable.")

    auth_token = resolve_auth_token(instance_url)
    if not auth_token:
        pytest.skip("No valid MemCell auth token found in environment, credentials, or session db.")

    client = MemcellClient(base_url=instance_url, token=auth_token)
    async_client = AsyncMemcellClient(base_url=instance_url, token=auth_token)

    # Determine owner slug from authenticated profile
    profile = client.account.get()
    owner_slug = (
        profile.handle
        or profile.email.split("@")[0].lower()
        or "user"
    )

    ws_slug = f"e2e-py-flow-{secrets.token_hex(4)}"

    # Provision disposable workspace
    ws = client.workspaces.create(
        name=f"E2E Python Flow {ws_slug}",
        slug=ws_slug,
        description="Compounded Python SDK E2E Lifecycle Workspace",
    )

    resolved_owner = ws.owner.handle if ws.owner and ws.owner.handle else owner_slug
    namespace = f"{resolved_owner}/{ws.slug or ws_slug}"

    test_env = PythonSdkTestEnvironment(
        client=client,
        async_client=async_client,
        instance_url=instance_url,
        auth_token=auth_token,
        owner_slug=resolved_owner,
        ws_slug=ws.slug or ws_slug,
        namespace=namespace,
    )

    yield test_env

    # Cleanup disposable workspace
    try:
        client.workspaces.delete(namespace)
    except Exception:
        pass
    finally:
        client.close()
