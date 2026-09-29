from __future__ import annotations

from typing import Any

from .models import (
    FeedbackResponse,
    OrganizationItem,
    OrgInvitationItem,
    OrgMemberItem,
    OutcomeVerdict,
    PaginatedResult,
    RecallResponse,
    RememberResponse,
    ReportResponse,
)


class OrganizationMemCell:
    """Synchronous memory handle bound to a specific organization."""

    def __init__(self, client: Any, org_slug: str) -> None:
        self._client = client
        self.org_slug = org_slug.strip().lower()

    def scope(self, project_slug: str, subject: str | None = None) -> Any:
        from .scoped import ScopedMemCell

        clean_slug = project_slug.strip().lstrip("/")
        if clean_slug.startswith(f"{self.org_slug}/"):
            namespace = clean_slug
        else:
            namespace = f"{self.org_slug}/{clean_slug}"
        return ScopedMemCell(self._client, namespace, subject=subject)

    def for_project(self, project_slug: str, subject: str | None = None) -> Any:
        return self.scope(project_slug, subject=subject)

    def _resolve_namespace(self, namespace: str | None) -> str:
        if not namespace:
            return self.org_slug
        if "/" in namespace:
            return namespace
        return f"{self.org_slug}/{namespace}"

    def get(self) -> OrganizationItem:
        return self._client.organizations.get(self.org_slug)

    def update(
        self,
        name: str | None = None,
        bio: str | None = None,
        website: str | None = None,
        logo: str | None = None,
    ) -> OrganizationItem:
        return self._client.organizations.update(
            self.org_slug, name=name, bio=bio, website=website, logo=logo
        )

    def list_members(self, **kwargs: Any) -> PaginatedResult[OrgMemberItem]:
        return self._client.organizations.list_members(self.org_slug, **kwargs)

    def update_member_role(self, user_id: str, role: str) -> None:
        self._client.organizations.update_member_role(self.org_slug, user_id, role)

    def remove_member(self, user_id: str) -> None:
        self._client.organizations.remove_member(self.org_slug, user_id)

    def list_invitations(self) -> list[OrgInvitationItem]:
        return self._client.organizations.list_invitations(self.org_slug)

    def invite_member(
        self, email: str, role: str = "member", team_id: str | None = None
    ) -> OrgInvitationItem:
        return self._client.organizations.invite_member(
            self.org_slug, email, role=role, team_id=team_id
        )

    def recall(
        self,
        query: str,
        namespace: str | None = None,
        subject: str | None = None,
        type: str | list[str] | None = None,
        kind: str | list[str] | None = None,
        min_confidence: float | None = None,
        limit: int | None = None,
        tags: list[str] | None = None,
        format: str = "xml",
        allow_provisional: bool | None = None,
    ) -> RecallResponse:
        return self._client.recall(
            query=query,
            namespace=self._resolve_namespace(namespace),
            subject=subject,
            type=type,
            kind=kind,
            min_confidence=min_confidence,
            limit=limit,
            tags=tags,
            format=format,
            allow_provisional=allow_provisional,
        )

    def remember(
        self,
        title: str | None = None,
        context: str | None = None,
        example: str | None = None,
        tags: list[str] | None = None,
        subject: str | None = None,
        type: str | None = None,
        kind: str | None = None,
        status: str | None = None,
        confidence: float | None = None,
        scope: str | None = None,
        metadata: dict[str, Any] | None = None,
        expires_at: Any | None = None,
        raw: str | None = None,
        session_id: str | None = None,
        namespace: str | None = None,
        async_: bool | None = None,
    ) -> RememberResponse:
        return self._client.remember(
            title=title,
            context=context,
            example=example,
            tags=tags,
            subject=subject,
            type=type,
            kind=kind,
            status=status,
            confidence=confidence,
            scope=scope,
            metadata=metadata,
            expires_at=expires_at,
            raw=raw,
            session_id=session_id,
            namespace=self._resolve_namespace(namespace),
            async_=async_,
        )

    def report(
        self,
        action_taken: str,
        outcome: OutcomeVerdict,
        subject: str | None = None,
        reason: str | None = None,
        external_ref: str | None = None,
        payload: dict[str, Any] | None = None,
        recall_id: str | None = None,
        statement_id: str | None = None,
        namespace: str | None = None,
        auto_distill: bool = True,
        async_: bool | None = None,
    ) -> ReportResponse:
        return self._client.report(
            action_taken=action_taken,
            outcome=outcome,
            subject=subject,
            reason=reason,
            external_ref=external_ref,
            payload=payload,
            recall_id=recall_id,
            statement_id=statement_id,
            namespace=self._resolve_namespace(namespace),
            auto_distill=auto_distill,
            async_=async_,
        )

    def feedback(
        self,
        outcome: OutcomeVerdict,
        statement_id: str | None = None,
        recall_id: str | None = None,
        reason: str | None = None,
        external_ref: str | None = None,
        payload: dict[str, Any] | None = None,
        namespace: str | None = None,
    ) -> FeedbackResponse:
        return self._client.feedback(
            outcome=outcome,
            statement_id=statement_id,
            recall_id=recall_id,
            reason=reason,
            external_ref=external_ref,
            payload=payload,
            namespace=self._resolve_namespace(namespace),
        )


class AsyncOrganizationMemCell:
    """Asynchronous memory handle bound to a specific organization."""

    def __init__(self, client: Any, org_slug: str) -> None:
        self._client = client
        self.org_slug = org_slug.strip().lower()

    def scope(self, project_slug: str, subject: str | None = None) -> Any:
        from .scoped import AsyncScopedMemCell

        clean_slug = project_slug.strip().lstrip("/")
        if clean_slug.startswith(f"{self.org_slug}/"):
            namespace = clean_slug
        else:
            namespace = f"{self.org_slug}/{clean_slug}"
        return AsyncScopedMemCell(self._client, namespace, subject=subject)

    def for_project(self, project_slug: str, subject: str | None = None) -> Any:
        return self.scope(project_slug, subject=subject)

    def _resolve_namespace(self, namespace: str | None) -> str:
        if not namespace:
            return self.org_slug
        if "/" in namespace:
            return namespace
        return f"{self.org_slug}/{namespace}"

    async def get(self) -> OrganizationItem:
        return await self._client.organizations.get(self.org_slug)

    async def update(
        self,
        name: str | None = None,
        bio: str | None = None,
        website: str | None = None,
        logo: str | None = None,
    ) -> OrganizationItem:
        return await self._client.organizations.update(
            self.org_slug, name=name, bio=bio, website=website, logo=logo
        )

    async def list_members(self, **kwargs: Any) -> PaginatedResult[OrgMemberItem]:
        return await self._client.organizations.list_members(self.org_slug, **kwargs)

    async def update_member_role(self, user_id: str, role: str) -> None:
        await self._client.organizations.update_member_role(self.org_slug, user_id, role)

    async def remove_member(self, user_id: str) -> None:
        await self._client.organizations.remove_member(self.org_slug, user_id)

    async def list_invitations(self) -> list[OrgInvitationItem]:
        return await self._client.organizations.list_invitations(self.org_slug)

    async def invite_member(
        self, email: str, role: str = "member", team_id: str | None = None
    ) -> OrgInvitationItem:
        return await self._client.organizations.invite_member(
            self.org_slug, email, role=role, team_id=team_id
        )

    async def recall(
        self,
        query: str,
        namespace: str | None = None,
        subject: str | None = None,
        type: str | list[str] | None = None,
        kind: str | list[str] | None = None,
        min_confidence: float | None = None,
        limit: int | None = None,
        tags: list[str] | None = None,
        format: str = "xml",
        allow_provisional: bool | None = None,
    ) -> RecallResponse:
        return await self._client.recall(
            query=query,
            namespace=self._resolve_namespace(namespace),
            subject=subject,
            type=type,
            kind=kind,
            min_confidence=min_confidence,
            limit=limit,
            tags=tags,
            format=format,
            allow_provisional=allow_provisional,
        )

    async def remember(
        self,
        title: str | None = None,
        context: str | None = None,
        example: str | None = None,
        tags: list[str] | None = None,
        subject: str | None = None,
        type: str | None = None,
        kind: str | None = None,
        status: str | None = None,
        confidence: float | None = None,
        scope: str | None = None,
        metadata: dict[str, Any] | None = None,
        expires_at: Any | None = None,
        raw: str | None = None,
        session_id: str | None = None,
        namespace: str | None = None,
        async_: bool | None = None,
    ) -> RememberResponse:
        return await self._client.remember(
            title=title,
            context=context,
            example=example,
            tags=tags,
            subject=subject,
            type=type,
            kind=kind,
            status=status,
            confidence=confidence,
            scope=scope,
            metadata=metadata,
            expires_at=expires_at,
            raw=raw,
            session_id=session_id,
            namespace=self._resolve_namespace(namespace),
            async_=async_,
        )

    async def report(
        self,
        action_taken: str,
        outcome: OutcomeVerdict,
        subject: str | None = None,
        reason: str | None = None,
        external_ref: str | None = None,
        payload: dict[str, Any] | None = None,
        recall_id: str | None = None,
        statement_id: str | None = None,
        namespace: str | None = None,
        auto_distill: bool = True,
        async_: bool | None = None,
    ) -> ReportResponse:
        return await self._client.report(
            action_taken=action_taken,
            outcome=outcome,
            subject=subject,
            reason=reason,
            external_ref=external_ref,
            payload=payload,
            recall_id=recall_id,
            statement_id=statement_id,
            namespace=self._resolve_namespace(namespace),
            auto_distill=auto_distill,
            async_=async_,
        )

    async def feedback(
        self,
        outcome: OutcomeVerdict,
        statement_id: str | None = None,
        recall_id: str | None = None,
        reason: str | None = None,
        external_ref: str | None = None,
        payload: dict[str, Any] | None = None,
        namespace: str | None = None,
    ) -> FeedbackResponse:
        return await self._client.feedback(
            outcome=outcome,
            statement_id=statement_id,
            recall_id=recall_id,
            reason=reason,
            external_ref=external_ref,
            payload=payload,
            namespace=self._resolve_namespace(namespace),
        )
