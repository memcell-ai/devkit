from __future__ import annotations

from typing import Any
from urllib.parse import quote

from .models import WebhookPingResult, WorkspaceWebhookItem


def _parse_namespace(namespace: str) -> tuple[str, str]:
    parts = namespace.split("/")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError(
            f'Invalid namespace "{namespace}". Expected format "owner/workspace" (e.g. "acme/backend").'
        )
    return quote(parts[0], safe=""), quote(parts[1], safe="")


class WorkspaceWebhooksNamespace:
    """Synchronous workspace webhooks namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client

    def list(self, namespace: str) -> list[WorkspaceWebhookItem]:
        owner, workspace = _parse_namespace(namespace)
        data = self._client._request("GET", f"/api/v1/{owner}/{workspace}/webhooks")
        return [WorkspaceWebhookItem(**w) for w in data.get("webhooks", [])]

    def create(
        self,
        namespace: str,
        name: str,
        url: str,
        secret: str | None = None,
        events: list[str] | None = None,
        enabled: bool = True,
    ) -> WorkspaceWebhookItem:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {
            "name": name,
            "url": url,
            "secret": secret,
            "events": events,
            "enabled": enabled,
        }
        data = self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/webhooks",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return WorkspaceWebhookItem(**data["webhook"])

    def get(self, namespace: str, webhook_id: str) -> WorkspaceWebhookItem:
        webhooks = self.list(namespace)
        for w in webhooks:
            if w.id == webhook_id:
                return w
        raise ValueError(f"Webhook not found: {webhook_id}")

    def update(
        self,
        namespace: str,
        webhook_id: str,
        name: str | None = None,
        url: str | None = None,
        secret: str | None = None,
        events: list[str] | None = None,
        enabled: bool | None = None,
    ) -> WorkspaceWebhookItem:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if url is not None:
            payload["url"] = url
        if secret is not None:
            payload["secret"] = secret
        if events is not None:
            payload["events"] = events
        if enabled is not None:
            payload["enabled"] = enabled

        data = self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{workspace}/webhooks/{quote(webhook_id, safe='')}",
            json=payload,
        )
        return WorkspaceWebhookItem(**data["webhook"])

    def delete(self, namespace: str, webhook_id: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        self._client._request(
            "DELETE",
            f"/api/v1/{owner}/{workspace}/webhooks/{quote(webhook_id, safe='')}",
        )

    def ping(self, namespace: str, webhook_id: str) -> WebhookPingResult:
        owner, workspace = _parse_namespace(namespace)
        data = self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/webhooks/{quote(webhook_id, safe='')}/ping",
        )
        return WebhookPingResult(**data)


class AsyncWorkspaceWebhooksNamespace:
    """Asynchronous workspace webhooks namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client

    async def list(self, namespace: str) -> list[WorkspaceWebhookItem]:
        owner, workspace = _parse_namespace(namespace)
        data = await self._client._request("GET", f"/api/v1/{owner}/{workspace}/webhooks")
        return [WorkspaceWebhookItem(**w) for w in data.get("webhooks", [])]

    async def create(
        self,
        namespace: str,
        name: str,
        url: str,
        secret: str | None = None,
        events: list[str] | None = None,
        enabled: bool = True,
    ) -> WorkspaceWebhookItem:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {
            "name": name,
            "url": url,
            "secret": secret,
            "events": events,
            "enabled": enabled,
        }
        data = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/webhooks",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return WorkspaceWebhookItem(**data["webhook"])

    async def get(self, namespace: str, webhook_id: str) -> WorkspaceWebhookItem:
        webhooks = await self.list(namespace)
        for w in webhooks:
            if w.id == webhook_id:
                return w
        raise ValueError(f"Webhook not found: {webhook_id}")

    async def update(
        self,
        namespace: str,
        webhook_id: str,
        name: str | None = None,
        url: str | None = None,
        secret: str | None = None,
        events: list[str] | None = None,
        enabled: bool | None = None,
    ) -> WorkspaceWebhookItem:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if url is not None:
            payload["url"] = url
        if secret is not None:
            payload["secret"] = secret
        if events is not None:
            payload["events"] = events
        if enabled is not None:
            payload["enabled"] = enabled

        data = await self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{workspace}/webhooks/{quote(webhook_id, safe='')}",
            json=payload,
        )
        return WorkspaceWebhookItem(**data["webhook"])

    async def delete(self, namespace: str, webhook_id: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        await self._client._request(
            "DELETE",
            f"/api/v1/{owner}/{workspace}/webhooks/{quote(webhook_id, safe='')}",
        )

    async def ping(self, namespace: str, webhook_id: str) -> WebhookPingResult:
        owner, workspace = _parse_namespace(namespace)
        data = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/webhooks/{quote(webhook_id, safe='')}/ping",
        )
        return WebhookPingResult(**data)


class ScopedWorkspaceWebhooksSync:
    def __init__(self, webhooks_ns: WorkspaceWebhooksNamespace, namespace: str) -> None:
        self._webhooks = webhooks_ns
        self.namespace = namespace

    def list(self) -> list[WorkspaceWebhookItem]:
        return self._webhooks.list(self.namespace)

    def create(self, name: str, url: str, **kwargs: Any) -> WorkspaceWebhookItem:
        return self._webhooks.create(self.namespace, name, url, **kwargs)

    def get(self, webhook_id: str) -> WorkspaceWebhookItem:
        return self._webhooks.get(self.namespace, webhook_id)

    def update(self, webhook_id: str, **kwargs: Any) -> WorkspaceWebhookItem:
        return self._webhooks.update(self.namespace, webhook_id, **kwargs)

    def delete(self, webhook_id: str) -> None:
        self._webhooks.delete(self.namespace, webhook_id)

    def ping(self, webhook_id: str) -> WebhookPingResult:
        return self._webhooks.ping(self.namespace, webhook_id)


class ScopedWorkspaceWebhooksAsync:
    def __init__(self, webhooks_ns: AsyncWorkspaceWebhooksNamespace, namespace: str) -> None:
        self._webhooks = webhooks_ns
        self.namespace = namespace

    async def list(self) -> list[WorkspaceWebhookItem]:
        return await self._webhooks.list(self.namespace)

    async def create(self, name: str, url: str, **kwargs: Any) -> WorkspaceWebhookItem:
        return await self._webhooks.create(self.namespace, name, url, **kwargs)

    async def get(self, webhook_id: str) -> WorkspaceWebhookItem:
        return await self._webhooks.get(self.namespace, webhook_id)

    async def update(self, webhook_id: str, **kwargs: Any) -> WorkspaceWebhookItem:
        return await self._webhooks.update(self.namespace, webhook_id, **kwargs)

    async def delete(self, webhook_id: str) -> None:
        await self._webhooks.delete(self.namespace, webhook_id)

    async def ping(self, webhook_id: str) -> WebhookPingResult:
        return await self._webhooks.ping(self.namespace, webhook_id)
