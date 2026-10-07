from __future__ import annotations

from typing import Any
from urllib.parse import quote

from .models import OperatorStats, PaginatedResult, PaginationMetadata


class OperatorNamespace:
    """Synchronous platform operator administration namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client

    def stats(self) -> OperatorStats:
        data = self._client._request("GET", "/api/v1/operator/stats")
        return OperatorStats(**data)

    def analytics(self, timeframe: str | None = None) -> dict[str, Any]:
        params = {"timeframe": timeframe} if timeframe else None
        return self._client._request("GET", "/api/v1/operator/analytics", params=params)

    def models(self) -> dict[str, Any]:
        return self._client._request("GET", "/api/v1/operator/models")

    def config(self) -> dict[str, Any]:
        return self._client._request("GET", "/api/v1/operator/config")

    def limits(self, limit_type: str = "global") -> dict[str, Any]:
        return self._client._request("GET", f"/api/v1/operator/limits/{limit_type}")

    def update_limits(self, limit_type: str, limits: dict[str, Any]) -> dict[str, Any]:
        return self._client._request("POST", f"/api/v1/operator/limits/{limit_type}", json=limits)

    def users(self, page: int = 1, per_page: int = 25) -> PaginatedResult[dict[str, Any]]:
        params = {"page": page, "per_page": per_page}
        data = self._client._request("GET", "/api/v1/operator/users", params=params)
        items = data.get("users") or data.get("items") or []
        raw_meta = data.get("pagination") or {
            "page": page,
            "per_page": per_page,
            "total": len(items),
            "has_more": False,
        }
        return PaginatedResult[dict[str, Any]](
            items=items,
            pagination=PaginationMetadata(
                page=raw_meta.get("page", page),
                per_page=raw_meta.get("per_page") or raw_meta.get("perPage", per_page),
                total=raw_meta.get("total", 0),
                has_more=raw_meta.get("has_more") or raw_meta.get("hasMore", False),
            ),
        )

    def update_user_role(self, user_id: str, role: str) -> dict[str, Any]:
        return self._client._request(
            "PATCH",
            f"/api/v1/operator/users/{quote(user_id, safe='')}/role",
            json={"role": role},
        )

    def workspaces(self, page: int = 1, per_page: int = 25) -> PaginatedResult[dict[str, Any]]:
        params = {"page": page, "per_page": per_page}
        data = self._client._request("GET", "/api/v1/operator/workspaces", params=params)
        items = data.get("workspaces") or data.get("items") or []
        raw_meta = data.get("pagination") or {
            "page": page,
            "per_page": per_page,
            "total": len(items),
            "has_more": False,
        }
        return PaginatedResult[dict[str, Any]](
            items=items,
            pagination=PaginationMetadata(
                page=raw_meta.get("page", page),
                per_page=raw_meta.get("per_page") or raw_meta.get("perPage", per_page),
                total=raw_meta.get("total", 0),
                has_more=raw_meta.get("has_more") or raw_meta.get("hasMore", False),
            ),
        )


class AsyncOperatorNamespace:
    """Asynchronous platform operator administration namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client

    async def stats(self) -> OperatorStats:
        data = await self._client._request("GET", "/api/v1/operator/stats")
        return OperatorStats(**data)

    async def analytics(self, timeframe: str | None = None) -> dict[str, Any]:
        params = {"timeframe": timeframe} if timeframe else None
        return await self._client._request("GET", "/api/v1/operator/analytics", params=params)

    async def models(self) -> dict[str, Any]:
        return await self._client._request("GET", "/api/v1/operator/models")

    async def config(self) -> dict[str, Any]:
        return await self._client._request("GET", "/api/v1/operator/config")

    async def limits(self, limit_type: str = "global") -> dict[str, Any]:
        return await self._client._request("GET", f"/api/v1/operator/limits/{limit_type}")

    async def update_limits(self, limit_type: str, limits: dict[str, Any]) -> dict[str, Any]:
        return await self._client._request(
            "POST", f"/api/v1/operator/limits/{limit_type}", json=limits
        )

    async def users(self, page: int = 1, per_page: int = 25) -> PaginatedResult[dict[str, Any]]:
        params = {"page": page, "per_page": per_page}
        data = await self._client._request("GET", "/api/v1/operator/users", params=params)
        items = data.get("users") or data.get("items") or []
        raw_meta = data.get("pagination") or {
            "page": page,
            "per_page": per_page,
            "total": len(items),
            "has_more": False,
        }
        return PaginatedResult[dict[str, Any]](
            items=items,
            pagination=PaginationMetadata(
                page=raw_meta.get("page", page),
                per_page=raw_meta.get("per_page") or raw_meta.get("perPage", per_page),
                total=raw_meta.get("total", 0),
                has_more=raw_meta.get("has_more") or raw_meta.get("hasMore", False),
            ),
        )

    async def update_user_role(self, user_id: str, role: str) -> dict[str, Any]:
        return await self._client._request(
            "PATCH",
            f"/api/v1/operator/users/{quote(user_id, safe='')}/role",
            json={"role": role},
        )

    async def workspaces(
        self, page: int = 1, per_page: int = 25
    ) -> PaginatedResult[dict[str, Any]]:
        params = {"page": page, "per_page": per_page}
        data = await self._client._request("GET", "/api/v1/operator/workspaces", params=params)
        items = data.get("workspaces") or data.get("items") or []
        raw_meta = data.get("pagination") or {
            "page": page,
            "per_page": per_page,
            "total": len(items),
            "has_more": False,
        }
        return PaginatedResult[dict[str, Any]](
            items=items,
            pagination=PaginationMetadata(
                page=raw_meta.get("page", page),
                per_page=raw_meta.get("per_page") or raw_meta.get("perPage", per_page),
                total=raw_meta.get("total", 0),
                has_more=raw_meta.get("has_more") or raw_meta.get("hasMore", False),
            ),
        )
