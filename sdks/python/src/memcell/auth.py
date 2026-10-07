import time
from typing import Any

import httpx

from .exceptions import MemCellError


class AuthManager:
    """Manages authentication tokens, API keys, and OAuth 2.0 M2M client credentials."""

    def __init__(
        self,
        base_url: str,
        api_key: str | None = None,
        access_token: str | None = None,
        client_id: str | None = None,
        client_secret: str | None = None,
        scope: str | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.access_token = access_token
        self.client_id = client_id
        self.client_secret = client_secret
        self.scope = scope

        self._cached_token: str | None = None
        self._token_expires_at: float = 0.0

    def clear_cache(self) -> None:
        """Clears cached OAuth M2M access token."""
        self._cached_token = None
        self._token_expires_at = 0.0

    def get_authorization_header(self, client: httpx.Client | None = None) -> str | None:
        """Synchronously resolves Authorization header value."""
        if self.api_key:
            return f"Bearer {self.api_key}"
        if self.access_token:
            return f"Bearer {self.access_token}"
        if self.client_id and self.client_secret:
            # Check proactive 60s pre-expiry window
            now = time.time()
            if self._cached_token and (now + 60.0) < self._token_expires_at:
                return f"Bearer {self._cached_token}"

            c = client or httpx.Client()
            should_close = client is None
            try:
                data = {
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                }
                if self.scope:
                    data["scope"] = self.scope

                resp = c.post(
                    f"{self.base_url}/oauth2/token",
                    data=data,
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Accept": "application/json",
                    },
                )
                if not resp.is_success:
                    raise MemCellError(
                        f"OAuth M2M token exchange failed: HTTP {resp.status_code} {resp.text}",
                        status=resp.status_code,
                    )
                payload: dict[str, Any] = resp.json()
                token = payload.get("access_token")
                expires_in = payload.get("expires_in", 3600)
                if not token:
                    raise MemCellError("OAuth token endpoint returned empty access_token.")

                self._cached_token = str(token)
                self._token_expires_at = time.time() + float(expires_in)
                return f"Bearer {self._cached_token}"
            finally:
                if should_close:
                    c.close()

        return None

    async def get_authorization_header_async(
        self, client: httpx.AsyncClient | None = None
    ) -> str | None:
        """Asynchronously resolves Authorization header value."""
        if self.api_key:
            return f"Bearer {self.api_key}"
        if self.access_token:
            return f"Bearer {self.access_token}"
        if self.client_id and self.client_secret:
            now = time.time()
            if self._cached_token and (now + 60.0) < self._token_expires_at:
                return f"Bearer {self._cached_token}"

            c = client or httpx.AsyncClient()
            should_close = client is None
            try:
                data = {
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                }
                if self.scope:
                    data["scope"] = self.scope

                resp = await c.post(
                    f"{self.base_url}/oauth2/token",
                    data=data,
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Accept": "application/json",
                    },
                )
                if not resp.is_success:
                    raise MemCellError(
                        f"OAuth M2M token exchange failed: HTTP {resp.status_code} {resp.text}",
                        status=resp.status_code,
                    )
                payload: dict[str, Any] = resp.json()
                token = payload.get("access_token")
                expires_in = payload.get("expires_in", 3600)
                if not token:
                    raise MemCellError("OAuth token endpoint returned empty access_token.")

                self._cached_token = str(token)
                self._token_expires_at = time.time() + float(expires_in)
                return f"Bearer {self._cached_token}"
            finally:
                if should_close:
                    await c.aclose()

        return None
