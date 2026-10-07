from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

from .models import (
    CreateFleetAgentResult,
    FleetAgent,
    FleetAgentDetail,
)


def _build_fleet_query(
    q: str | None = None,
    status: str | None = None,
    scope: str | None = None,
    framework: str | None = None,
    team_id: str | None = None,
    workspace_id: str | None = None,
    page: int | None = None,
    per_page: int | None = None,
) -> str:
    params: dict[str, Any] = {}
    if q:
        params["q"] = q
    if status:
        params["status"] = status
    if scope:
        params["scope"] = scope
    if framework:
        params["framework"] = framework
    if team_id:
        params["teamId"] = team_id
    if workspace_id:
        params["workspaceId"] = workspace_id
    if page is not None:
        params["page"] = page
    if per_page is not None:
        params["perPage"] = per_page

    query_str = urlencode(params)
    return f"?{query_str}" if query_str else ""


class OrganizationFleetNamespace:
    """Synchronous fleet management namespace for organizations."""

    def __init__(self, client: Any) -> None:
        self._client = client

    def list(
        self,
        org_slug: str,
        q: str | None = None,
        status: str | None = None,
        scope: str | None = None,
        framework: str | None = None,
        team_id: str | None = None,
        workspace_id: str | None = None,
        page: int | None = None,
        per_page: int | None = None,
    ) -> list[FleetAgent]:
        query = _build_fleet_query(
            q=q,
            status=status,
            scope=scope,
            framework=framework,
            team_id=team_id,
            workspace_id=workspace_id,
            page=page,
            per_page=per_page,
        )
        data = self._client._request("GET", f"/api/v1/organizations/{org_slug}/fleet{query}")
        return [FleetAgent(**a) for a in data.get("agents", [])]

    def get(self, org_slug: str, agent_id: str) -> FleetAgentDetail:
        data = self._client._request("GET", f"/api/v1/organizations/{org_slug}/fleet/{agent_id}")
        return FleetAgentDetail(**data)

    def register(
        self,
        org_slug: str,
        name: str,
        slug: str | None = None,
        scope: str = "organization",
        framework: str | None = None,
        model: str | None = None,
        description: str | None = None,
        team_id: str | None = None,
        workspace_id: str | None = None,
        generate_key: bool = True,
    ) -> CreateFleetAgentResult:
        payload: dict[str, Any] = {
            "name": name,
            "scope": scope,
            "generateKey": generate_key,
        }
        if slug:
            payload["slug"] = slug
        if framework:
            payload["framework"] = framework
        if model:
            payload["model"] = model
        if description:
            payload["description"] = description
        if team_id:
            payload["teamId"] = team_id
        if workspace_id:
            payload["workspaceId"] = workspace_id

        data = self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/fleet",
            json=payload,
        )
        return CreateFleetAgentResult(**data)

    def suspend(self, org_slug: str, agent_id: str, reason: str) -> FleetAgent:
        """Activates the emergency kill-switch for an agent, blocking gateway access."""
        data = self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/fleet/{agent_id}/suspend",
            json={"reason": reason},
        )
        return FleetAgent(**data["agent"])

    def resume(self, org_slug: str, agent_id: str) -> FleetAgent:
        """Reactivates a suspended agent, restoring gateway access."""
        data = self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/fleet/{agent_id}/resume",
        )
        return FleetAgent(**data["agent"])

    def grant(
        self,
        org_slug: str,
        agent_id: str,
        workspace_id: str,
        permission: str = "read",
    ) -> dict[str, Any]:
        return self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/fleet/{agent_id}/grant",
            json={"workspaceId": workspace_id, "permission": permission},
        )

    def revoke(
        self,
        org_slug: str,
        agent_id: str,
        workspace_id: str,
    ) -> dict[str, Any]:
        return self._client._request(
            "DELETE",
            f"/api/v1/organizations/{org_slug}/fleet/{agent_id}/grant",
            json={"workspaceId": workspace_id},
        )

    def delete(self, org_slug: str, agent_id: str) -> dict[str, Any]:
        return self._client._request(
            "DELETE",
            f"/api/v1/organizations/{org_slug}/fleet/{agent_id}",
        )


class AsyncOrganizationFleetNamespace:
    """Asynchronous fleet management namespace for organizations."""

    def __init__(self, client: Any) -> None:
        self._client = client

    async def list(
        self,
        org_slug: str,
        q: str | None = None,
        status: str | None = None,
        scope: str | None = None,
        framework: str | None = None,
        team_id: str | None = None,
        workspace_id: str | None = None,
        page: int | None = None,
        per_page: int | None = None,
    ) -> list[FleetAgent]:
        query = _build_fleet_query(
            q=q,
            status=status,
            scope=scope,
            framework=framework,
            team_id=team_id,
            workspace_id=workspace_id,
            page=page,
            per_page=per_page,
        )
        data = await self._client._request("GET", f"/api/v1/organizations/{org_slug}/fleet{query}")
        return [FleetAgent(**a) for a in data.get("agents", [])]

    async def get(self, org_slug: str, agent_id: str) -> FleetAgentDetail:
        data = await self._client._request(
            "GET", f"/api/v1/organizations/{org_slug}/fleet/{agent_id}"
        )
        return FleetAgentDetail(**data)

    async def register(
        self,
        org_slug: str,
        name: str,
        slug: str | None = None,
        scope: str = "organization",
        framework: str | None = None,
        model: str | None = None,
        description: str | None = None,
        team_id: str | None = None,
        workspace_id: str | None = None,
        generate_key: bool = True,
    ) -> CreateFleetAgentResult:
        payload: dict[str, Any] = {
            "name": name,
            "scope": scope,
            "generateKey": generate_key,
        }
        if slug:
            payload["slug"] = slug
        if framework:
            payload["framework"] = framework
        if model:
            payload["model"] = model
        if description:
            payload["description"] = description
        if team_id:
            payload["teamId"] = team_id
        if workspace_id:
            payload["workspaceId"] = workspace_id

        data = await self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/fleet",
            json=payload,
        )
        return CreateFleetAgentResult(**data)

    async def suspend(self, org_slug: str, agent_id: str, reason: str) -> FleetAgent:
        data = await self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/fleet/{agent_id}/suspend",
            json={"reason": reason},
        )
        return FleetAgent(**data["agent"])

    async def resume(self, org_slug: str, agent_id: str) -> FleetAgent:
        data = await self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/fleet/{agent_id}/resume",
        )
        return FleetAgent(**data["agent"])

    async def grant(
        self,
        org_slug: str,
        agent_id: str,
        workspace_id: str,
        permission: str = "read",
    ) -> dict[str, Any]:
        return await self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/fleet/{agent_id}/grant",
            json={"workspaceId": workspace_id, "permission": permission},
        )

    async def revoke(
        self,
        org_slug: str,
        agent_id: str,
        workspace_id: str,
    ) -> dict[str, Any]:
        return await self._client._request(
            "DELETE",
            f"/api/v1/organizations/{org_slug}/fleet/{agent_id}/grant",
            json={"workspaceId": workspace_id},
        )

    async def delete(self, org_slug: str, agent_id: str) -> dict[str, Any]:
        return await self._client._request(
            "DELETE",
            f"/api/v1/organizations/{org_slug}/fleet/{agent_id}",
        )


class ScopedOrganizationFleetSync:
    def __init__(self, fleet_ns: OrganizationFleetNamespace, org_slug: str) -> None:
        self._fleet = fleet_ns
        self.org_slug = org_slug

    def list(self, **kwargs: Any) -> list[FleetAgent]:
        return self._fleet.list(self.org_slug, **kwargs)

    def get(self, agent_id: str) -> FleetAgentDetail:
        return self._fleet.get(self.org_slug, agent_id)

    def register(self, name: str, **kwargs: Any) -> CreateFleetAgentResult:
        return self._fleet.register(self.org_slug, name, **kwargs)

    def suspend(self, agent_id: str, reason: str) -> FleetAgent:
        return self._fleet.suspend(self.org_slug, agent_id, reason)

    def resume(self, agent_id: str) -> FleetAgent:
        return self._fleet.resume(self.org_slug, agent_id)

    def grant(
        self,
        agent_id: str,
        workspace_id: str,
        permission: str = "read",
        **kwargs: Any,
    ) -> dict[str, Any]:
        return self._fleet.grant(
            self.org_slug, agent_id, workspace_id, permission=permission, **kwargs
        )

    def grant_workspace(
        self,
        agent_id: str,
        workspace_id: str,
        permission: str = "read",
        **kwargs: Any,
    ) -> dict[str, Any]:
        return self.grant(agent_id, workspace_id, permission=permission, **kwargs)

    def revoke(self, agent_id: str, workspace_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._fleet.revoke(self.org_slug, agent_id, workspace_id, **kwargs)

    def revoke_workspace(self, agent_id: str, workspace_id: str, **kwargs: Any) -> dict[str, Any]:
        return self.revoke(agent_id, workspace_id, **kwargs)

    def delete(self, agent_id: str) -> dict[str, Any]:
        return self._fleet.delete(self.org_slug, agent_id)


class ScopedOrganizationFleetAsync:
    def __init__(self, fleet_ns: AsyncOrganizationFleetNamespace, org_slug: str) -> None:
        self._fleet = fleet_ns
        self.org_slug = org_slug

    async def list(self, **kwargs: Any) -> list[FleetAgent]:
        return await self._fleet.list(self.org_slug, **kwargs)

    async def get(self, agent_id: str) -> FleetAgentDetail:
        return await self._fleet.get(self.org_slug, agent_id)

    async def register(self, name: str, **kwargs: Any) -> CreateFleetAgentResult:
        return await self._fleet.register(self.org_slug, name, **kwargs)

    async def suspend(self, agent_id: str, reason: str) -> FleetAgent:
        return await self._fleet.suspend(self.org_slug, agent_id, reason)

    async def resume(self, agent_id: str) -> FleetAgent:
        return await self._fleet.resume(self.org_slug, agent_id)

    async def grant(
        self,
        agent_id: str,
        workspace_id: str,
        permission: str = "read",
        **kwargs: Any,
    ) -> dict[str, Any]:
        return await self._fleet.grant(
            self.org_slug, agent_id, workspace_id, permission=permission, **kwargs
        )

    async def grant_workspace(
        self,
        agent_id: str,
        workspace_id: str,
        permission: str = "read",
        **kwargs: Any,
    ) -> dict[str, Any]:
        return await self.grant(agent_id, workspace_id, permission=permission, **kwargs)

    async def revoke(self, agent_id: str, workspace_id: str, **kwargs: Any) -> dict[str, Any]:
        return await self._fleet.revoke(self.org_slug, agent_id, workspace_id, **kwargs)

    async def revoke_workspace(
        self, agent_id: str, workspace_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return await self.revoke(agent_id, workspace_id, **kwargs)

    async def delete(self, agent_id: str) -> dict[str, Any]:
        return await self._fleet.delete(self.org_slug, agent_id)
