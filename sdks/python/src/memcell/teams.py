from __future__ import annotations

from typing import Any

from .models import OrgTeam, OrgTeamDetail, TeamMemberItem


class TeamMembersNamespace:
    """Synchronous team members namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client

    def list(self, org_slug: str, team_id: str) -> list[TeamMemberItem]:
        data = self._client._request(
            "GET", f"/api/v1/organizations/{org_slug}/teams/{team_id}/members"
        )
        return [TeamMemberItem(**m) for m in data.get("members", [])]

    def add(
        self,
        org_slug: str,
        team_id: str,
        user_id: str,
        role: str = "member",
    ) -> None:
        self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/teams/{team_id}/members",
            json={"userId": user_id, "role": role},
        )

    def remove(self, org_slug: str, team_id: str, user_id: str) -> None:
        self._client._request(
            "DELETE",
            f"/api/v1/organizations/{org_slug}/teams/{team_id}/members",
            json={"userId": user_id},
        )


class AsyncTeamMembersNamespace:
    """Asynchronous team members namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client

    async def list(self, org_slug: str, team_id: str) -> list[TeamMemberItem]:
        data = await self._client._request(
            "GET", f"/api/v1/organizations/{org_slug}/teams/{team_id}/members"
        )
        return [TeamMemberItem(**m) for m in data.get("members", [])]

    async def add(
        self,
        org_slug: str,
        team_id: str,
        user_id: str,
        role: str = "member",
    ) -> None:
        await self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/teams/{team_id}/members",
            json={"userId": user_id, "role": role},
        )

    async def remove(self, org_slug: str, team_id: str, user_id: str) -> None:
        await self._client._request(
            "DELETE",
            f"/api/v1/organizations/{org_slug}/teams/{team_id}/members",
            json={"userId": user_id},
        )


class OrganizationTeamsNamespace:
    """Synchronous organization teams namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client
        self.members = TeamMembersNamespace(client)

    def list(self, org_slug: str) -> list[OrgTeam]:
        data = self._client._request("GET", f"/api/v1/organizations/{org_slug}/teams")
        return [OrgTeam(**t) for t in data.get("teams", [])]

    def create(self, org_slug: str, name: str) -> OrgTeam:
        data = self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/teams",
            json={"name": name},
        )
        return OrgTeam(**data["team"])

    def get(self, org_slug: str, team_id: str) -> OrgTeamDetail:
        data = self._client._request("GET", f"/api/v1/organizations/{org_slug}/teams/{team_id}")
        return OrgTeamDetail(**data)

    def update(self, org_slug: str, team_id: str, name: str) -> OrgTeam:
        data = self._client._request(
            "PATCH",
            f"/api/v1/organizations/{org_slug}/teams/{team_id}",
            json={"name": name},
        )
        return OrgTeam(**data["team"])

    def delete(self, org_slug: str, team_id: str) -> None:
        self._client._request("DELETE", f"/api/v1/organizations/{org_slug}/teams/{team_id}")


class AsyncOrganizationTeamsNamespace:
    """Asynchronous organization teams namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client
        self.members = AsyncTeamMembersNamespace(client)

    async def list(self, org_slug: str) -> list[OrgTeam]:
        data = await self._client._request("GET", f"/api/v1/organizations/{org_slug}/teams")
        return [OrgTeam(**t) for t in data.get("teams", [])]

    async def create(self, org_slug: str, name: str) -> OrgTeam:
        data = await self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/teams",
            json={"name": name},
        )
        return OrgTeam(**data["team"])

    async def get(self, org_slug: str, team_id: str) -> OrgTeamDetail:
        data = await self._client._request(
            "GET", f"/api/v1/organizations/{org_slug}/teams/{team_id}"
        )
        return OrgTeamDetail(**data)

    async def update(self, org_slug: str, team_id: str, name: str) -> OrgTeam:
        data = await self._client._request(
            "PATCH",
            f"/api/v1/organizations/{org_slug}/teams/{team_id}",
            json={"name": name},
        )
        return OrgTeam(**data["team"])

    async def delete(self, org_slug: str, team_id: str) -> None:
        await self._client._request("DELETE", f"/api/v1/organizations/{org_slug}/teams/{team_id}")


class ScopedOrganizationTeamsSync:
    def __init__(self, teams_ns: OrganizationTeamsNamespace, org_slug: str) -> None:
        self._teams = teams_ns
        self.org_slug = org_slug
        self.members = _ScopedTeamMembersSync(teams_ns.members, org_slug)

    def list(self) -> list[OrgTeam]:
        return self._teams.list(self.org_slug)

    def create(self, name: str) -> OrgTeam:
        return self._teams.create(self.org_slug, name)

    def get(self, team_id: str) -> OrgTeamDetail:
        return self._teams.get(self.org_slug, team_id)

    def update(self, team_id: str, name: str) -> OrgTeam:
        return self._teams.update(self.org_slug, team_id, name)

    def delete(self, team_id: str) -> None:
        self._teams.delete(self.org_slug, team_id)


class ScopedOrganizationTeamsAsync:
    def __init__(self, teams_ns: AsyncOrganizationTeamsNamespace, org_slug: str) -> None:
        self._teams = teams_ns
        self.org_slug = org_slug
        self.members = _ScopedTeamMembersAsync(teams_ns.members, org_slug)

    async def list(self) -> list[OrgTeam]:
        return await self._teams.list(self.org_slug)

    async def create(self, name: str) -> OrgTeam:
        return await self._teams.create(self.org_slug, name)

    async def get(self, team_id: str) -> OrgTeamDetail:
        return await self._teams.get(self.org_slug, team_id)

    async def update(self, team_id: str, name: str) -> OrgTeam:
        return await self._teams.update(self.org_slug, team_id, name)

    async def delete(self, team_id: str) -> None:
        await self._teams.delete(self.org_slug, team_id)


class _ScopedTeamMembersSync:
    def __init__(self, members_ns: TeamMembersNamespace, org_slug: str) -> None:
        self._members = members_ns
        self.org_slug = org_slug

    def list(self, team_id: str) -> list[TeamMemberItem]:
        return self._members.list(self.org_slug, team_id)

    def add(self, team_id: str, user_id: str, role: str = "member") -> None:
        self._members.add(self.org_slug, team_id, user_id, role)

    def remove(self, team_id: str, user_id: str) -> None:
        self._members.remove(self.org_slug, team_id, user_id)


class _ScopedTeamMembersAsync:
    def __init__(self, members_ns: AsyncTeamMembersNamespace, org_slug: str) -> None:
        self._members = members_ns
        self.org_slug = org_slug

    async def list(self, team_id: str) -> list[TeamMemberItem]:
        return await self._members.list(self.org_slug, team_id)

    async def add(self, team_id: str, user_id: str, role: str = "member") -> None:
        await self._members.add(self.org_slug, team_id, user_id, role)

    async def remove(self, team_id: str, user_id: str) -> None:
        await self._members.remove(self.org_slug, team_id, user_id)
