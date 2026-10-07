from __future__ import annotations

from typing import Any
from urllib.parse import quote

from .models import InvitationItem


class InvitationsNamespace:
    """Synchronous pending invitations namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client

    def get(self, invitation_id: str) -> InvitationItem:
        data = self._client._request("GET", f"/api/v1/invitations/{quote(invitation_id, safe='')}")
        return InvitationItem(**data.get("invitation", data))

    def accept(self, invitation_id: str) -> dict[str, Any]:
        return self._client._request(
            "POST", f"/api/v1/invitations/{quote(invitation_id, safe='')}/accept"
        )

    def decline(self, invitation_id: str) -> dict[str, Any]:
        return self._client._request(
            "POST", f"/api/v1/invitations/{quote(invitation_id, safe='')}/decline"
        )


class AsyncInvitationsNamespace:
    """Asynchronous pending invitations namespace."""

    def __init__(self, client: Any) -> None:
        self._client = client

    async def get(self, invitation_id: str) -> InvitationItem:
        data = await self._client._request(
            "GET", f"/api/v1/invitations/{quote(invitation_id, safe='')}"
        )
        return InvitationItem(**data.get("invitation", data))

    async def accept(self, invitation_id: str) -> dict[str, Any]:
        return await self._client._request(
            "POST", f"/api/v1/invitations/{quote(invitation_id, safe='')}/accept"
        )

    async def decline(self, invitation_id: str) -> dict[str, Any]:
        return await self._client._request(
            "POST", f"/api/v1/invitations/{quote(invitation_id, safe='')}/decline"
        )
