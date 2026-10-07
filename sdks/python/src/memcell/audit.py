from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

from .models import (
    AuditEvent,
    SiemDestination,
)


def _build_audit_query(
    actor_id: str | None = None,
    actor_type: str | None = None,
    action: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    workspace_id: str | None = None,
    team_id: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    page: int | None = None,
    per_page: int | None = None,
) -> str:
    params: dict[str, Any] = {}
    if actor_id:
        params["actorId"] = actor_id
    if actor_type:
        params["actorType"] = actor_type
    if action:
        params["action"] = action
    if target_type:
        params["targetType"] = target_type
    if target_id:
        params["targetId"] = target_id
    if workspace_id:
        params["workspaceId"] = workspace_id
    if team_id:
        params["teamId"] = team_id
    if from_date:
        params["from"] = from_date
    if to_date:
        params["to"] = to_date
    if page is not None:
        params["page"] = page
    if per_page is not None:
        params["perPage"] = per_page

    query_str = urlencode(params)
    return f"?{query_str}" if query_str else ""


class SiemDestinationsNamespace:
    """Synchronous SIEM log forwarder destinations namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client

    def list(self, org_slug: str) -> list[SiemDestination]:
        data = self._client._request(
            "GET", f"/api/v1/organizations/{org_slug}/audit-logs/destinations"
        )
        return [SiemDestination(**d) for d in data.get("destinations", [])]

    def create(
        self,
        org_slug: str,
        name: str,
        url: str,
        destination_type: str = "webhook",
        secret_token: str | None = None,
        format: str = "json",
        enabled: bool = True,
    ) -> SiemDestination:
        payload = {
            "name": name,
            "url": url,
            "destinationType": destination_type,
            "secretToken": secret_token,
            "format": format,
            "enabled": enabled,
        }
        data = self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/audit-logs/destinations",
            json=payload,
        )
        return SiemDestination(**data["destination"])

    def delete(self, org_slug: str, destination_id: str) -> None:
        self._client._request(
            "DELETE",
            f"/api/v1/organizations/{org_slug}/audit-logs/destinations",
            json={"id": destination_id},
        )


class AsyncSiemDestinationsNamespace:
    """Asynchronous SIEM log forwarder destinations namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client

    async def list(self, org_slug: str) -> list[SiemDestination]:
        data = await self._client._request(
            "GET", f"/api/v1/organizations/{org_slug}/audit-logs/destinations"
        )
        return [SiemDestination(**d) for d in data.get("destinations", [])]

    async def create(
        self,
        org_slug: str,
        name: str,
        url: str,
        destination_type: str = "webhook",
        secret_token: str | None = None,
        format: str = "json",
        enabled: bool = True,
    ) -> SiemDestination:
        payload = {
            "name": name,
            "url": url,
            "destinationType": destination_type,
            "secretToken": secret_token,
            "format": format,
            "enabled": enabled,
        }
        data = await self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/audit-logs/destinations",
            json=payload,
        )
        return SiemDestination(**data["destination"])

    async def delete(self, org_slug: str, destination_id: str) -> None:
        await self._client._request(
            "DELETE",
            f"/api/v1/organizations/{org_slug}/audit-logs/destinations",
            json={"id": destination_id},
        )


class OrganizationAuditNamespace:
    """Synchronous enterprise audit logging namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client
        self.destinations = SiemDestinationsNamespace(client)

    def list(
        self,
        org_slug: str,
        actor_id: str | None = None,
        actor_type: str | None = None,
        action: str | None = None,
        target_type: str | None = None,
        target_id: str | None = None,
        workspace_id: str | None = None,
        team_id: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
        page: int | None = None,
        per_page: int | None = None,
    ) -> list[AuditEvent]:
        query = _build_audit_query(
            actor_id=actor_id,
            actor_type=actor_type,
            action=action,
            target_type=target_type,
            target_id=target_id,
            workspace_id=workspace_id,
            team_id=team_id,
            from_date=from_date,
            to_date=to_date,
            page=page,
            per_page=per_page,
        )
        data = self._client._request("GET", f"/api/v1/organizations/{org_slug}/audit-logs{query}")
        return [AuditEvent(**e) for e in data.get("events", [])]

    def export(
        self,
        org_slug: str,
        format: str = "json",
        **kwargs: Any,
    ) -> str:
        query = _build_audit_query(**kwargs)
        join_char = "&" if query else "?"
        # Request raw text for CEF or CSV exports
        return self._client._request_raw(
            "GET",
            f"/api/v1/organizations/{org_slug}/audit-logs/export{query}{join_char}format={format}",
        )


class AsyncOrganizationAuditNamespace:
    """Asynchronous enterprise audit logging namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client
        self.destinations = AsyncSiemDestinationsNamespace(client)

    async def list(
        self,
        org_slug: str,
        actor_id: str | None = None,
        actor_type: str | None = None,
        action: str | None = None,
        target_type: str | None = None,
        target_id: str | None = None,
        workspace_id: str | None = None,
        team_id: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
        page: int | None = None,
        per_page: int | None = None,
    ) -> list[AuditEvent]:
        query = _build_audit_query(
            actor_id=actor_id,
            actor_type=actor_type,
            action=action,
            target_type=target_type,
            target_id=target_id,
            workspace_id=workspace_id,
            team_id=team_id,
            from_date=from_date,
            to_date=to_date,
            page=page,
            per_page=per_page,
        )
        data = await self._client._request(
            "GET", f"/api/v1/organizations/{org_slug}/audit-logs{query}"
        )
        return [AuditEvent(**e) for e in data.get("events", [])]

    async def export(
        self,
        org_slug: str,
        format: str = "json",
        **kwargs: Any,
    ) -> str:
        query = _build_audit_query(**kwargs)
        join_char = "&" if query else "?"
        return await self._client._request_raw(
            "GET",
            f"/api/v1/organizations/{org_slug}/audit-logs/export{query}{join_char}format={format}",
        )


class ScopedOrganizationAuditSync:
    def __init__(self, audit_ns: OrganizationAuditNamespace, org_slug: str) -> None:
        self._audit = audit_ns
        self.org_slug = org_slug

    def list(self, **kwargs: Any) -> list[AuditEvent]:
        return self._audit.list(self.org_slug, **kwargs)

    def export(self, format: str = "json", **kwargs: Any) -> str:
        return self._audit.export(self.org_slug, format=format, **kwargs)


class ScopedOrganizationAuditAsync:
    def __init__(self, audit_ns: AsyncOrganizationAuditNamespace, org_slug: str) -> None:
        self._audit = audit_ns
        self.org_slug = org_slug

    async def list(self, **kwargs: Any) -> list[AuditEvent]:
        return await self._audit.list(self.org_slug, **kwargs)

    async def export(self, format: str = "json", **kwargs: Any) -> str:
        return await self._audit.export(self.org_slug, format=format, **kwargs)
