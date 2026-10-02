from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

from .models import EnterpriseInsights


def _build_insights_query(
    timeframe: str | None = None,
    team_id: str | None = None,
    project_id: str | None = None,
) -> str:
    params: dict[str, Any] = {}
    if timeframe:
        params["timeframe"] = timeframe
    if team_id:
        params["teamId"] = team_id
    if project_id:
        params["projectId"] = project_id

    query_str = urlencode(params)
    return f"?{query_str}" if query_str else ""


class OrganizationInsightsNamespace:
    """Synchronous enterprise cognitive insights namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client

    def get(
        self,
        org_slug: str,
        timeframe: str = "30d",
        team_id: str | None = None,
        project_id: str | None = None,
    ) -> EnterpriseInsights:
        query = _build_insights_query(
            timeframe=timeframe,
            team_id=team_id,
            project_id=project_id,
        )
        data = self._client._request("GET", f"/api/v1/organizations/{org_slug}/insights{query}")
        return EnterpriseInsights(**data)


class AsyncOrganizationInsightsNamespace:
    """Asynchronous enterprise cognitive insights namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client

    async def get(
        self,
        org_slug: str,
        timeframe: str = "30d",
        team_id: str | None = None,
        project_id: str | None = None,
    ) -> EnterpriseInsights:
        query = _build_insights_query(
            timeframe=timeframe,
            team_id=team_id,
            project_id=project_id,
        )
        data = await self._client._request(
            "GET", f"/api/v1/organizations/{org_slug}/insights{query}"
        )
        return EnterpriseInsights(**data)


class ScopedOrganizationInsightsSync:
    def __init__(self, insights_ns: OrganizationInsightsNamespace, org_slug: str) -> None:
        self._insights = insights_ns
        self.org_slug = org_slug

    def get(self, **kwargs: Any) -> EnterpriseInsights:
        return self._insights.get(self.org_slug, **kwargs)


class ScopedOrganizationInsightsAsync:
    def __init__(self, insights_ns: AsyncOrganizationInsightsNamespace, org_slug: str) -> None:
        self._insights = insights_ns
        self.org_slug = org_slug

    async def get(self, **kwargs: Any) -> EnterpriseInsights:
        return await self._insights.get(self.org_slug, **kwargs)
