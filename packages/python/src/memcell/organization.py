from __future__ import annotations

from typing import Any

from .audit import (
    ScopedOrganizationAuditAsync,
    ScopedOrganizationAuditSync,
)
from .fleet import (
    ScopedOrganizationFleetAsync,
    ScopedOrganizationFleetSync,
)
from .insights import (
    ScopedOrganizationInsightsAsync,
    ScopedOrganizationInsightsSync,
)
from .models import (
    FeedbackResponse,
    OrganizationItem,
    OrganizationSSOResult,
    OrgInvitationItem,
    OrgMemberItem,
    OutcomeVerdict,
    PaginatedResult,
    RecallResponse,
    RememberResponse,
    ReportResponse,
    SSOProviderSummary,
    SSOVerificationToken,
)
from .teams import (
    ScopedOrganizationTeamsAsync,
    ScopedOrganizationTeamsSync,
)


class OrganizationMemCell:
    """Synchronous memory handle bound to a specific organization."""

    def __init__(self, client: Any, org_slug: str) -> None:
        self._client = client
        self.org_slug = org_slug.strip().lower()

    @property
    def sso(self) -> _ScopedOrganizationSsoSync:
        """Scoped Enterprise SSO handle for this organization."""
        return _ScopedOrganizationSsoSync(self._client.organizations.sso, self.org_slug)

    @property
    def fleet(self) -> ScopedOrganizationFleetSync:
        """Scoped agent fleet management handle for this organization."""
        return ScopedOrganizationFleetSync(self._client.organizations.fleet, self.org_slug)

    @property
    def audit(self) -> ScopedOrganizationAuditSync:
        """Scoped audit logs and SIEM forwarders handle for this organization."""
        return ScopedOrganizationAuditSync(self._client.organizations.audit, self.org_slug)

    @property
    def insights(self) -> ScopedOrganizationInsightsSync:
        """Scoped enterprise cognitive insights handle for this organization."""
        return ScopedOrganizationInsightsSync(self._client.organizations.insights, self.org_slug)

    @property
    def teams(self) -> ScopedOrganizationTeamsSync:
        """Scoped teams handle for this organization."""
        return ScopedOrganizationTeamsSync(self._client.organizations.teams, self.org_slug)

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
        memory_id: str | None = None,
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
            memory_id=memory_id,
            namespace=self._resolve_namespace(namespace),
            auto_distill=auto_distill,
            async_=async_,
        )

    def feedback(
        self,
        outcome: OutcomeVerdict,
        memory_id: str | None = None,
        recall_id: str | None = None,
        reason: str | None = None,
        external_ref: str | None = None,
        payload: dict[str, Any] | None = None,
        namespace: str | None = None,
    ) -> FeedbackResponse:
        return self._client.feedback(
            outcome=outcome,
            memory_id=memory_id,
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

    @property
    def sso(self) -> _ScopedOrganizationSsoAsync:
        """Scoped Enterprise SSO handle for this organization."""
        return _ScopedOrganizationSsoAsync(self._client.organizations.sso, self.org_slug)

    @property
    def fleet(self) -> ScopedOrganizationFleetAsync:
        """Scoped agent fleet management handle for this organization."""
        return ScopedOrganizationFleetAsync(self._client.organizations.fleet, self.org_slug)

    @property
    def audit(self) -> ScopedOrganizationAuditAsync:
        """Scoped audit logs and SIEM forwarders handle for this organization."""
        return ScopedOrganizationAuditAsync(self._client.organizations.audit, self.org_slug)

    @property
    def insights(self) -> ScopedOrganizationInsightsAsync:
        """Scoped enterprise cognitive insights handle for this organization."""
        return ScopedOrganizationInsightsAsync(self._client.organizations.insights, self.org_slug)

    @property
    def teams(self) -> ScopedOrganizationTeamsAsync:
        """Scoped teams handle for this organization."""
        return ScopedOrganizationTeamsAsync(self._client.organizations.teams, self.org_slug)

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
        memory_id: str | None = None,
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
            memory_id=memory_id,
            namespace=self._resolve_namespace(namespace),
            auto_distill=auto_distill,
            async_=async_,
        )

    async def feedback(
        self,
        outcome: OutcomeVerdict,
        memory_id: str | None = None,
        recall_id: str | None = None,
        reason: str | None = None,
        external_ref: str | None = None,
        payload: dict[str, Any] | None = None,
        namespace: str | None = None,
    ) -> FeedbackResponse:
        return await self._client.feedback(
            outcome=outcome,
            memory_id=memory_id,
            recall_id=recall_id,
            reason=reason,
            external_ref=external_ref,
            payload=payload,
            namespace=self._resolve_namespace(namespace),
        )


class _ScopedOrganizationSsoSync:
    def __init__(self, sso_ns: Any, org_slug: str) -> None:
        self._sso_ns = sso_ns
        self.org_slug = org_slug

    def get(self) -> OrganizationSSOResult:
        return self._sso_ns.get(self.org_slug)

    def configure(
        self,
        domain: str,
        issuer: str,
        protocol: str = "saml",
        saml_config: dict[str, Any] | None = None,
        oidc_config: dict[str, Any] | None = None,
        provider_id: str | None = None,
    ) -> SSOProviderSummary:
        return self._sso_ns.configure(
            self.org_slug,
            domain=domain,
            issuer=issuer,
            protocol=protocol,
            saml_config=saml_config,
            oidc_config=oidc_config,
            provider_id=provider_id,
        )

    def delete(self, provider_id: str) -> None:
        self._sso_ns.delete(self.org_slug, provider_id)

    def get_verification_token(self, provider_id: str) -> SSOVerificationToken:
        return self._sso_ns.get_verification_token(self.org_slug, provider_id)

    def verify_domain(self, provider_id: str) -> dict[str, Any]:
        return self._sso_ns.verify_domain(self.org_slug, provider_id)

    def set_enforcement(self, sso_enforced: bool) -> dict[str, Any]:
        return self._sso_ns.set_enforcement(self.org_slug, sso_enforced)


class _ScopedOrganizationSsoAsync:
    def __init__(self, sso_ns: Any, org_slug: str) -> None:
        self._sso_ns = sso_ns
        self.org_slug = org_slug

    async def get(self) -> OrganizationSSOResult:
        return await self._sso_ns.get(self.org_slug)

    async def configure(
        self,
        domain: str,
        issuer: str,
        protocol: str = "saml",
        saml_config: dict[str, Any] | None = None,
        oidc_config: dict[str, Any] | None = None,
        provider_id: str | None = None,
    ) -> SSOProviderSummary:
        return await self._sso_ns.configure(
            self.org_slug,
            domain=domain,
            issuer=issuer,
            protocol=protocol,
            saml_config=saml_config,
            oidc_config=oidc_config,
            provider_id=provider_id,
        )

    async def delete(self, provider_id: str) -> None:
        await self._sso_ns.delete(self.org_slug, provider_id)

    async def get_verification_token(self, provider_id: str) -> SSOVerificationToken:
        return await self._sso_ns.get_verification_token(self.org_slug, provider_id)

    async def verify_domain(self, provider_id: str) -> dict[str, Any]:
        return await self._sso_ns.verify_domain(self.org_slug, provider_id)

    async def set_enforcement(self, sso_enforced: bool) -> dict[str, Any]:
        return await self._sso_ns.set_enforcement(self.org_slug, sso_enforced)
