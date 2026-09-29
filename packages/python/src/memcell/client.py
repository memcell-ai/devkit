from __future__ import annotations

import asyncio
import datetime
import json
import os
import random
import time
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

import httpx

from .auth import AuthManager
from .exceptions import MemCellError, RateLimitError
from .models import (
    AccountProfile,
    AdoptedTarget,
    AdoptStatementResponse,
    AgentItem,
    ApiRequestQuotas,
    CollaboratorItem,
    CreateAgentKeyResult,
    CreatedPersonalTokenResult,
    FeedbackResponse,
    JobEvent,
    ListCollaboratorsResponse,
    OrganizationItem,
    OrgInvitationItem,
    OrgMemberItem,
    OutcomeVerdict,
    OwnerUsage,
    PaginatedResult,
    PaginationMetadata,
    PendingInvitationItem,
    PersonalAccessTokenItem,
    ProjectItem,
    ProjectOwner,
    PromoteStatementResponse,
    RecallResponse,
    RememberResponse,
    ReportResponse,
    ScopeItem,
    StatementHistoryItem,
    StatementHistoryResponse,
    StatementItem,
    StatementQuotas,
    StatementStarResponse,
    StatementType,
    StatementTypeQuotas,
    UsageQuotas,
)

if TYPE_CHECKING:
    from .organization import AsyncOrganizationMemCell, OrganizationMemCell
    from .scoped import AsyncScopedMemCell, ScopedMemCell


def _parse_namespace(namespace: str) -> tuple[str, str]:
    if "/" not in namespace:
        raise ValueError(
            f'Invalid namespace "{namespace}". Expected format "owner/project" (e.g. "acme/backend").'
        )
    owner, project = namespace.split("/", 1)
    return owner.strip(), project.strip()


def _resolve_endpoint(
    namespace: str | None,
    action: str,
) -> str:
    if namespace and "/" in namespace:
        owner, project = _parse_namespace(namespace)
        return f"/api/v1/{owner}/{project}/{action}"
    return f"/api/v1/{action}"


def _build_query_params(params: dict[str, Any]) -> dict[str, str]:
    cleaned: dict[str, str] = {}
    for k, v in params.items():
        if v is not None:
            if isinstance(v, bool):
                cleaned[k] = "true" if v else "false"
            else:
                cleaned[k] = str(v)
    return cleaned


def _parse_pagination(data: dict[str, Any]) -> PaginationMetadata:
    return PaginationMetadata(
        page=int(data.get("page", 1)),
        per_page=int(data.get("perPage") or data.get("per_page") or 30),
        total=int(data.get("total", 0)),
        has_more=bool(data.get("hasMore") or data.get("has_more") or False),
    )


def _normalize_statement_type(val: Any) -> StatementType:
    if not val:
        return "fact"
    s = str(val).lower()
    if s in ("directive", "fact", "preference", "observation"):
        return s  # type: ignore
    if s in ("invariant", "reflex"):
        return "directive"
    if s == "episodic":
        return "observation"
    return "fact"


def _parse_statement_item(data: dict[str, Any]) -> StatementItem:
    tags = data.get("tags") or []
    raw_type = data.get("type") or data.get("kind") or "fact"
    stat_type = _normalize_statement_type(raw_type)
    kind = data.get("kind") or stat_type
    status = data.get("status", "active")
    is_guard = data.get("isGuard")
    if is_guard is None:
        is_guard = ("guard" in tags) or ("convention" in tags)
    is_invariant = data.get("isInvariant")
    if is_invariant is None:
        is_invariant = (stat_type == "directive") or (kind == "invariant") or (status == "pinned")

    return StatementItem(
        id=str(data.get("id") or data.get("statementId") or ""),
        root_id=data.get("rootId") or data.get("root_id"),
        title=data.get("title", ""),
        context=data.get("context"),
        example=data.get("example"),
        tags=tags,
        subject=data.get("subject"),
        type=stat_type,
        kind=kind,
        status=status,
        confidence=float(data.get("confidence", 0.5)),
        score=data.get("score"),
        relevance=data.get("relevance"),
        decay_factor=data.get("decayFactor") or data.get("decay_factor"),
        stability=data.get("stability"),
        reinforcement_count=data.get("reinforcementCount") or data.get("reinforcement_count"),
        is_pinned=bool(data.get("isPinned", False)),
        starred=data.get("starred"),
        star_count=data.get("starCount") or data.get("star_count"),
        is_guard=is_guard,
        is_invariant=is_invariant,
        scope=data.get("scope", "common"),
        metadata=data.get("metadata") or {},
        author=data.get("author"),
        source=data.get("source"),
        expires_at=data.get("expiresAt") or data.get("expires_at"),
        created_at=data.get("createdAt") or data.get("created_at"),
        updated_at=data.get("updatedAt") or data.get("updated_at"),
    )


def _parse_project_item(data: dict[str, Any]) -> ProjectItem:
    owner_data = data.get("owner")
    owner = ProjectOwner(**owner_data) if owner_data else None
    return ProjectItem(
        id=str(data.get("id", "")),
        name=str(data.get("name", "")),
        slug=str(data.get("slug", "")),
        description=data.get("description"),
        website=data.get("website"),
        tags=data.get("tags") or [],
        visibility=str(data.get("visibility", "private")),
        ownership=data.get("ownership"),
        owner=owner,
        state_root=data.get("stateRoot") or data.get("state_root"),
        instruction=data.get("instruction"),
        guard_mode=data.get("guardMode") or data.get("guard_mode"),
        tag_prompt=data.get("tagPrompt") or data.get("tag_prompt"),
        profile=data.get("profile"),
        vitals=data.get("vitals"),
        created_at=data.get("createdAt") or data.get("created_at"),
        updated_at=data.get("updatedAt") or data.get("updated_at"),
    )


def _parse_agent_item(data: dict[str, Any]) -> AgentItem:
    return AgentItem(
        id=str(data.get("id", "")),
        project_id=str(data.get("projectId") or data.get("project_id") or ""),
        name=str(data.get("name", "")),
        slug=str(data.get("slug", "")),
        kind=str(data.get("kind", "coding_assistant")),
        model=data.get("model"),
        description=data.get("description"),
        status=str(data.get("status", "active")),
        metadata=data.get("metadata") or {},
        key_count=data.get("keyCount") or data.get("key_count"),
        active_key_count=data.get("activeKeyCount") or data.get("active_key_count"),
        last_active_at=data.get("lastActiveAt") or data.get("last_active_at"),
        telemetry=data.get("telemetry"),
        created_at=data.get("createdAt") or data.get("created_at"),
        updated_at=data.get("updatedAt") or data.get("updated_at"),
    )


def _parse_collaborator_item(data: dict[str, Any]) -> CollaboratorItem:
    return CollaboratorItem(
        id=str(data.get("id", "")),
        user_id=str(data.get("userId") or data.get("user_id") or ""),
        name=str(data.get("name", "")),
        handle=data.get("handle"),
        email=str(data.get("email", "")),
        image=data.get("image"),
        role=str(data.get("role", "read")),
        source=str(data.get("source", "direct")),
        inherited=bool(data.get("inherited", False)),
        created_at=data.get("createdAt") or data.get("created_at"),
    )


def _parse_pending_invitation(data: dict[str, Any]) -> PendingInvitationItem:
    return PendingInvitationItem(
        id=str(data.get("id", "")),
        email=str(data.get("email", "")),
        role=str(data.get("role", "read")),
        invited_by=data.get("invitedBy") or data.get("invited_by"),
        expires_at=data.get("expiresAt") or data.get("expires_at"),
        created_at=data.get("createdAt") or data.get("created_at"),
    )


def _parse_org_member(data: dict[str, Any]) -> OrgMemberItem:
    return OrgMemberItem(
        id=str(data.get("id", "")),
        user_id=str(data.get("userId") or data.get("user_id") or ""),
        name=str(data.get("name", "")),
        handle=data.get("handle"),
        email=str(data.get("email", "")),
        image=data.get("image"),
        role=str(data.get("role", "member")),
        joined_at=data.get("joinedAt") or data.get("joined_at"),
    )


def _parse_org_invitation(data: dict[str, Any]) -> OrgInvitationItem:
    return OrgInvitationItem(
        id=str(data.get("id", "")),
        email=str(data.get("email", "")),
        role=str(data.get("role", "member")),
        team_id=data.get("teamId") or data.get("team_id"),
        invited_by=data.get("invitedBy") or data.get("invited_by"),
        expires_at=data.get("expiresAt") or data.get("expires_at"),
        created_at=data.get("createdAt") or data.get("created_at"),
    )


def _parse_owner_usage(data: dict[str, Any]) -> OwnerUsage:
    quotas_data = data.get("quotas", {})
    stmts_data = quotas_data.get("statements", {})
    types_data = stmts_data.get("types", {})
    reqs_data = quotas_data.get("apiRequests", {}) or quotas_data.get("api_requests", {})

    types_quota = StatementTypeQuotas(
        directive=int(types_data.get("directive", 0)),
        fact=int(types_data.get("fact", 0)),
        preference=int(types_data.get("preference", 0)),
        observation=int(types_data.get("observation", 0)),
        provisional=int(types_data.get("provisional", 0)),
    )
    stmts_quota = StatementQuotas(
        total=int(stmts_data.get("total", 0)),
        limit=int(stmts_data.get("limit", 0)),
        percent=float(stmts_data.get("percent", 0.0)),
        types=types_quota,
    )
    reqs_quota = ApiRequestQuotas(
        total=int(reqs_data.get("total", 0)),
        limit=int(reqs_data.get("limit", 0)),
        percent=float(reqs_data.get("percent", 0.0)),
        window_days=int(reqs_data.get("windowDays") or reqs_data.get("window_days") or 30),
    )
    return OwnerUsage(
        owner=data.get("owner") or {},
        timeframe=str(data.get("timeframe", "30d")),
        quotas=UsageQuotas(statements=stmts_quota, api_requests=reqs_quota),
        rate_limits=data.get("rateLimits") or data.get("rate_limits") or {},
    )


# ══════════════════════════════════════════════════════════════════════════════
# SYNC NAMESPACES
# ══════════════════════════════════════════════════════════════════════════════


class _StatementsNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client

    def list(
        self,
        namespace: str,
        page: int | None = None,
        per_page: int | None = None,
        type: str | None = None,
        kind: str | None = None,
        status: str | None = None,
        scope: str | None = None,
        q: str | None = None,
        semantic: str | None = None,
        sort: str | None = None,
        order: str | None = None,
        starred: bool | None = None,
        tag: str | None = None,
        author_type: str | None = None,
        subject: str | None = None,
    ) -> PaginatedResult[StatementItem]:
        owner, project = _parse_namespace(namespace)
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "type": type or kind,
                "kind": kind or type,
                "status": status,
                "scope": scope,
                "q": q,
                "semantic": semantic,
                "sort": sort,
                "order": order,
                "starred": starred,
                "tag": tag,
                "author_type": author_type,
                "subject": subject,
            }
        )
        resp = self._client._request("GET", f"/api/v1/{owner}/{project}/statements", params=params)
        raw_items = resp.get("statements") or []
        items = [_parse_statement_item(s) for s in raw_items]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)

    def get(self, namespace: str, statement_id: str) -> StatementItem:
        owner, project = _parse_namespace(namespace)
        resp = self._client._request("GET", f"/api/v1/{owner}/{project}/statements/{statement_id}")
        return _parse_statement_item(resp.get("statement", {}))

    def create(
        self,
        namespace: str,
        title: str,
        context: str | None = None,
        example: str | None = None,
        source: str | None = None,
        tags: list[str] | None = None,
        confidence: float | None = None,
        subject: str | None = None,
        type: str | None = None,
        kind: str | None = None,
        status: str | None = None,
        is_pinned: bool | None = None,
        expires_at: Any | None = None,
        scope: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> StatementItem:
        owner, project = _parse_namespace(namespace)
        exp_str = (
            expires_at.isoformat()
            if isinstance(expires_at, datetime.date | datetime.datetime)
            else expires_at
        )
        effective_type = type or kind
        payload: dict[str, Any] = {
            "title": title,
            "context": context,
            "example": example,
            "source": source,
            "tags": tags,
            "confidence": confidence,
            "subject": subject,
            "type": effective_type,
            "kind": effective_type,
            "status": status,
            "isPinned": is_pinned,
            "expiresAt": exp_str,
            "scope": scope,
            "metadata": metadata,
        }
        resp = self._client._request(
            "POST",
            f"/api/v1/{owner}/{project}/statements",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_statement_item(resp.get("statement", {}))

    def update(
        self,
        namespace: str,
        statement_id: str,
        title: str | None = None,
        context: str | None = None,
        example: str | None = None,
        tags: list[str] | None = None,
        confidence: float | None = None,
        status: str | None = None,
        type: str | None = None,
        kind: str | None = None,
        subject: str | None = None,
        is_pinned: bool | None = None,
        scope: str | None = None,
        metadata: dict[str, Any] | None = None,
        reason: str | None = None,
    ) -> StatementItem:
        owner, project = _parse_namespace(namespace)
        effective_type = type or kind
        payload: dict[str, Any] = {
            "title": title,
            "context": context,
            "example": example,
            "tags": tags,
            "confidence": confidence,
            "status": status,
            "type": effective_type,
            "kind": effective_type,
            "subject": subject,
            "isPinned": is_pinned,
            "scope": scope,
            "metadata": metadata,
            "reason": reason,
        }
        resp = self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{project}/statements/{statement_id}",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_statement_item(resp.get("statement", {}))

    def delete(self, namespace: str, statement_id: str) -> None:
        owner, project = _parse_namespace(namespace)
        self._client._request("DELETE", f"/api/v1/{owner}/{project}/statements/{statement_id}")

    def star(
        self, namespace: str, statement_id: str, starred: bool = True
    ) -> StatementStarResponse:
        owner, project = _parse_namespace(namespace)
        method = "PUT" if starred else "DELETE"
        resp = self._client._request(
            method, f"/api/v1/{owner}/{project}/statements/{statement_id}/star"
        )
        return StatementStarResponse(
            root_id=resp.get("rootId", ""),
            starred=bool(resp.get("starred", starred)),
            star_count=int(resp.get("starCount", 0)),
        )

    def history(self, namespace: str, statement_id: str) -> StatementHistoryResponse:
        owner, project = _parse_namespace(namespace)
        resp = self._client._request(
            "GET", f"/api/v1/{owner}/{project}/statements/{statement_id}/history"
        )
        hist = [
            StatementHistoryItem(
                id=h.get("id", ""),
                root_id=h.get("rootId", ""),
                version=h.get("version", 1),
                title=h.get("title", ""),
                context=h.get("context"),
                example=h.get("example"),
                tags=h.get("tags") or [],
                confidence=float(h.get("confidence", 0.5)),
                status=h.get("status", "active"),
                type=h.get("type", "fact"),
                kind=h.get("kind"),
                subject=h.get("subject"),
                scope=h.get("scope", "common"),
                author_type=h.get("authorType", "user"),
                author_id=h.get("authorId"),
                author_name=h.get("authorName"),
                mutation_type=h.get("mutationType"),
                change_reason=h.get("changeReason"),
                created_at=h.get("createdAt"),
            )
            for h in resp.get("history", [])
        ]
        return StatementHistoryResponse(
            root_id=resp.get("rootId", ""),
            total_versions=int(resp.get("totalVersions", len(hist))),
            history=hist,
        )

    def adopt(
        self, namespace: str, statement_id: str, target_project_ids: list[str]
    ) -> AdoptStatementResponse:
        owner, project = _parse_namespace(namespace)
        resp = self._client._request(
            "POST",
            f"/api/v1/{owner}/{project}/statements/{statement_id}/adopt",
            json={"targetProjectIds": target_project_ids},
        )
        adopted = [
            AdoptedTarget(
                project_id=a["projectId"],
                statement_id=a["statementId"],
                already_existed=bool(a["alreadyExisted"]),
            )
            for a in resp.get("adopted", [])
        ]
        return AdoptStatementResponse(
            ok=bool(resp.get("ok", True)),
            source_statement_id=resp.get("sourceStatementId", statement_id),
            adopted=adopted,
        )

    def promote(
        self,
        namespace: str,
        statement_id: str,
        to_scope: str = "common",
        reason: str | None = None,
    ) -> PromoteStatementResponse:
        owner, project = _parse_namespace(namespace)
        body: dict[str, Any] = {"toScope": to_scope}
        if reason:
            body["reason"] = reason
        resp = self._client._request(
            "POST",
            f"/api/v1/{owner}/{project}/statements/{statement_id}/promote",
            json=body,
        )
        return PromoteStatementResponse(
            promoted=bool(resp.get("promoted", True)),
            statement=_parse_statement_item(resp.get("statement", {})),
        )


class _ProjectsNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client

    def list(
        self,
        page: int | None = None,
        per_page: int | None = None,
        visibility: str | None = None,
        q: str | None = None,
        sort: str | None = None,
        order: str | None = None,
    ) -> PaginatedResult[ProjectItem]:
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "visibility": visibility,
                "q": q,
                "sort": sort,
                "order": order,
            }
        )
        resp = self._client._request("GET", "/api/v1/projects", params=params)
        raw_projects = resp.get("projects") or []
        items = [_parse_project_item(p) for p in raw_projects]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)

    def list_for_owner(
        self,
        owner: str,
        page: int | None = None,
        per_page: int | None = None,
        visibility: str | None = None,
        q: str | None = None,
        sort: str | None = None,
        order: str | None = None,
    ) -> PaginatedResult[ProjectItem]:
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "visibility": visibility,
                "q": q,
                "sort": sort,
                "order": order,
            }
        )
        resp = self._client._request("GET", f"/api/v1/{owner}/projects", params=params)
        raw_projects = resp.get("projects") or []
        items = [_parse_project_item(p) for p in raw_projects]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)

    def get(self, namespace: str) -> ProjectItem:
        owner, project = _parse_namespace(namespace)
        resp = self._client._request("GET", f"/api/v1/{owner}/{project}")
        return _parse_project_item(resp.get("project", {}))

    def create(
        self,
        name: str,
        slug: str | None = None,
        description: str | None = None,
        website: str | None = None,
        visibility: str = "private",
        owner: str | None = None,
    ) -> ProjectItem:
        payload: dict[str, Any] = {
            "name": name,
            "slug": slug,
            "description": description,
            "website": website,
            "visibility": visibility,
            "owner": owner,
        }
        resp = self._client._request(
            "POST",
            "/api/v1/projects",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_project_item(resp.get("project", {}))

    def update(
        self,
        namespace: str,
        name: str | None = None,
        slug: str | None = None,
        description: str | None = None,
        website: str | None = None,
        visibility: str | None = None,
        tags: list[str] | None = None,
        instruction: str | None = None,
        guard_mode: str | None = None,
        tag_prompt: str | None = None,
        profile: str | None = None,
    ) -> ProjectItem:
        owner, project = _parse_namespace(namespace)
        payload: dict[str, Any] = {
            "name": name,
            "slug": slug,
            "description": description,
            "website": website,
            "visibility": visibility,
            "tags": tags,
            "instruction": instruction,
            "guardMode": guard_mode,
            "tagPrompt": tag_prompt,
            "profile": profile,
        }
        resp = self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{project}",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_project_item(resp.get("project", {}))

    def delete(self, namespace: str) -> None:
        owner, project = _parse_namespace(namespace)
        self._client._request("DELETE", f"/api/v1/{owner}/{project}")

    def transfer(self, namespace: str, target_owner: str) -> None:
        owner, project = _parse_namespace(namespace)
        self._client._request(
            "POST",
            f"/api/v1/{owner}/{project}/transfer",
            json={"targetOwner": target_owner},
        )


class _AgentsNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client

    def list(
        self,
        namespace: str,
        page: int | None = None,
        per_page: int | None = None,
        status: str | None = None,
        kind: str | None = None,
        q: str | None = None,
        sort: str | None = None,
        order: str | None = None,
    ) -> PaginatedResult[AgentItem]:
        owner, project = _parse_namespace(namespace)
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "status": status,
                "kind": kind,
                "q": q,
                "sort": sort,
                "order": order,
            }
        )
        resp = self._client._request("GET", f"/api/v1/{owner}/{project}/agents", params=params)
        raw_items = resp.get("agents") or []
        items = [_parse_agent_item(a) for a in raw_items]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)

    def get(self, namespace: str, agent_id: str) -> AgentItem:
        owner, project = _parse_namespace(namespace)
        resp = self._client._request("GET", f"/api/v1/{owner}/{project}/agents/{agent_id}")
        return _parse_agent_item(resp.get("agent", {}))

    def create(
        self,
        namespace: str,
        name: str,
        slug: str | None = None,
        kind: str | None = None,
        model: str | None = None,
        description: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AgentItem:
        owner, project = _parse_namespace(namespace)
        payload: dict[str, Any] = {
            "name": name,
            "slug": slug,
            "kind": kind,
            "model": model,
            "description": description,
            "metadata": metadata,
        }
        resp = self._client._request(
            "POST",
            f"/api/v1/{owner}/{project}/agents",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_agent_item(resp.get("agent", {}))

    def update(
        self,
        namespace: str,
        agent_id: str,
        name: str | None = None,
        model: str | None = None,
        description: str | None = None,
        status: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AgentItem:
        owner, project = _parse_namespace(namespace)
        payload: dict[str, Any] = {
            "name": name,
            "model": model,
            "description": description,
            "status": status,
            "metadata": metadata,
        }
        resp = self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{project}/agents/{agent_id}",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_agent_item(resp.get("agent", {}))

    def delete(self, namespace: str, agent_id: str) -> None:
        owner, project = _parse_namespace(namespace)
        self._client._request("DELETE", f"/api/v1/{owner}/{project}/agents/{agent_id}")

    def create_key(self, namespace: str, agent_id: str) -> CreateAgentKeyResult:
        owner, project = _parse_namespace(namespace)
        resp = self._client._request("POST", f"/api/v1/{owner}/{project}/agents/{agent_id}/keys")
        return CreateAgentKeyResult(**resp.get("key", {}))

    def revoke_key(self, namespace: str, agent_id: str, key_id: str) -> None:
        owner, project = _parse_namespace(namespace)
        self._client._request(
            "DELETE", f"/api/v1/{owner}/{project}/agents/{agent_id}/keys/{key_id}"
        )


class _CollaboratorsNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client

    def list(
        self,
        namespace: str,
        page: int | None = None,
        per_page: int | None = None,
        role: str | None = None,
        affiliation: str | None = None,
        q: str | None = None,
    ) -> ListCollaboratorsResponse:
        owner, project = _parse_namespace(namespace)
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "role": role,
                "affiliation": affiliation,
                "q": q,
            }
        )
        resp = self._client._request(
            "GET", f"/api/v1/{owner}/{project}/collaborators", params=params
        )
        collabs = [_parse_collaborator_item(c) for c in resp.get("collaborators", [])]
        invites = [_parse_pending_invitation(i) for i in resp.get("pendingInvitations", [])]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return ListCollaboratorsResponse(
            collaborators=collabs,
            pending_invitations=invites,
            pagination=pagination,
        )

    def invite(self, namespace: str, identifier: str, role: str = "read") -> PendingInvitationItem:
        owner, project = _parse_namespace(namespace)
        resp = self._client._request(
            "POST",
            f"/api/v1/{owner}/{project}/collaborators",
            json={"identifier": identifier, "role": role},
        )
        return _parse_pending_invitation(resp.get("invitation", {}))

    def update_role(self, namespace: str, user_id: str, role: str) -> None:
        owner, project = _parse_namespace(namespace)
        self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{project}/collaborators/{user_id}",
            json={"role": role},
        )

    def remove(self, namespace: str, user_id: str) -> None:
        owner, project = _parse_namespace(namespace)
        self._client._request("DELETE", f"/api/v1/{owner}/{project}/collaborators/{user_id}")

    def revoke_invitation(self, namespace: str, invitation_id: str) -> None:
        owner, project = _parse_namespace(namespace)
        self._client._request(
            "DELETE", f"/api/v1/{owner}/{project}/collaborators/invitations/{invitation_id}"
        )


class _OrganizationsNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client

    def list(self) -> list[OrganizationItem]:
        resp = self._client._request("GET", "/api/v1/organizations")
        orgs = resp.get("organizations") or []
        return [
            OrganizationItem(
                id=o.get("id", ""),
                slug=o.get("slug", ""),
                name=o.get("name", ""),
                role=o.get("role"),
                bio=o.get("bio"),
                website=o.get("website"),
                logo=o.get("logo"),
                member_count=o.get("memberCount"),
                project_count=o.get("projectCount"),
                created_at=o.get("createdAt") or o.get("joinedAt"),
            )
            for o in orgs
        ]

    def create(
        self,
        name: str,
        slug: str | None = None,
        bio: str | None = None,
        website: str | None = None,
        logo: str | None = None,
    ) -> OrganizationItem:
        body: dict[str, Any] = {"name": name}
        if slug:
            body["slug"] = slug
        if bio:
            body["bio"] = bio
        if website:
            body["website"] = website
        if logo:
            body["logo"] = logo
        resp = self._client._request("POST", "/api/v1/organizations", json=body)
        org = resp.get("organization", {})
        return OrganizationItem(
            id=org.get("id", ""),
            slug=org.get("slug", ""),
            name=org.get("name", ""),
            role=org.get("role"),
            bio=org.get("bio"),
            website=org.get("website"),
            logo=org.get("logo"),
            created_at=org.get("createdAt"),
        )

    def get(self, slug: str) -> OrganizationItem:
        resp = self._client._request("GET", f"/api/v1/organizations/{slug}")
        org = resp.get("organization", {})
        return OrganizationItem(
            id=org.get("id", ""),
            slug=org.get("slug", ""),
            name=org.get("name", ""),
            role=org.get("role"),
            bio=org.get("bio"),
            website=org.get("website"),
            logo=org.get("logo"),
            member_count=org.get("memberCount"),
            project_count=org.get("projectCount"),
            created_at=org.get("createdAt"),
        )

    def update(
        self,
        slug: str,
        name: str | None = None,
        bio: str | None = None,
        website: str | None = None,
        logo: str | None = None,
    ) -> OrganizationItem:
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if bio is not None:
            body["bio"] = bio
        if website is not None:
            body["website"] = website
        if logo is not None:
            body["logo"] = logo
        resp = self._client._request("PATCH", f"/api/v1/organizations/{slug}", json=body)
        org = resp.get("organization", {})
        return OrganizationItem(
            id=org.get("id", ""),
            slug=org.get("slug", ""),
            name=org.get("name", ""),
            bio=org.get("bio"),
            website=org.get("website"),
            logo=org.get("logo"),
            created_at=org.get("createdAt"),
        )

    def delete(self, slug: str) -> None:
        self._client._request(
            "DELETE",
            f"/api/v1/organizations/{slug}",
            json={"confirmSlug": slug},
        )

    def list_members(
        self,
        slug: str,
        page: int | None = None,
        per_page: int | None = None,
        role: str | None = None,
        q: str | None = None,
        sort: str | None = None,
        order: str | None = None,
    ) -> PaginatedResult[OrgMemberItem]:
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "role": role,
                "q": q,
                "sort": sort,
                "order": order,
            }
        )
        resp = self._client._request("GET", f"/api/v1/organizations/{slug}/members", params=params)
        members = [_parse_org_member(m) for m in resp.get("members", [])]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=members, pagination=pagination)

    def update_member_role(self, slug: str, user_id: str, role: str) -> None:
        self._client._request(
            "PATCH",
            f"/api/v1/organizations/{slug}/members",
            json={"userId": user_id, "role": role},
        )

    def remove_member(self, slug: str, user_id: str) -> None:
        self._client._request(
            "DELETE",
            f"/api/v1/organizations/{slug}/members",
            params={"userId": user_id},
        )

    def list_invitations(self, slug: str) -> list[OrgInvitationItem]:
        resp = self._client._request("GET", f"/api/v1/organizations/{slug}/invitations")
        return [_parse_org_invitation(i) for i in resp.get("invitations", [])]

    def invite_member(
        self,
        slug: str,
        email: str,
        role: str = "member",
        team_id: str | None = None,
    ) -> OrgInvitationItem:
        body: dict[str, Any] = {"email": email, "role": role}
        if team_id:
            body["teamId"] = team_id
        resp = self._client._request("POST", f"/api/v1/organizations/{slug}/invitations", json=body)
        return _parse_org_invitation(resp.get("invitation", {}))

    def revoke_invitation(self, slug: str, invitation_id: str) -> None:
        self._client._request("DELETE", f"/api/v1/organizations/{slug}/invitations/{invitation_id}")


class _UsageNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client

    def get(self, owner: str, timeframe: str = "30d") -> OwnerUsage:
        resp = self._client._request(
            "GET", f"/api/v1/{owner}/usage", params={"timeframe": timeframe}
        )
        return _parse_owner_usage(resp)


class _TokensNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client

    def list(self) -> list[PersonalAccessTokenItem]:
        resp = self._client._request("GET", "/api/v1/account/tokens")
        return [
            PersonalAccessTokenItem(
                id=t["id"],
                name=t["name"],
                preview=t.get("preview", ""),
                expires_at=t.get("expiresAt") or t.get("expires_at"),
                last_used_at=t.get("lastUsedAt") or t.get("last_used_at"),
                created_at=t.get("createdAt") or t.get("created_at"),
            )
            for t in resp.get("tokens", [])
        ]

    def create(self, name: str, expires_in_days: int | None = None) -> CreatedPersonalTokenResult:
        body: dict[str, Any] = {"name": name}
        if expires_in_days is not None:
            body["expiresInDays"] = expires_in_days
        resp = self._client._request("POST", "/api/v1/account/tokens", json=body)
        tok = resp.get("token", {})
        return CreatedPersonalTokenResult(
            id=tok["id"],
            name=tok["name"],
            token=tok.get("token", ""),
            preview=tok.get("preview", ""),
            expires_at=tok.get("expiresAt"),
            created_at=tok.get("createdAt"),
        )

    def revoke(self, token_id: str) -> None:
        self._client._request("DELETE", f"/api/v1/account/tokens/{token_id}")


class _AccountNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client
        self.tokens = _TokensNamespaceSync(client)

    def get(self) -> AccountProfile:
        resp = self._client._request("GET", "/api/v1/account/profile")
        prof = resp.get("profile", {})
        return AccountProfile(
            id=prof.get("id", ""),
            email=prof.get("email", ""),
            name=prof.get("name"),
            handle=prof.get("handle"),
            image=prof.get("image"),
            bio=prof.get("bio"),
            website=prof.get("website"),
            role=prof.get("role", "member"),
            created_at=prof.get("createdAt"),
        )

    def update_profile(
        self,
        name: str | None = None,
        bio: str | None = None,
        website: str | None = None,
        image: str | None = None,
    ) -> AccountProfile:
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if bio is not None:
            body["bio"] = bio
        if website is not None:
            body["website"] = website
        if image is not None:
            body["image"] = image
        resp = self._client._request("PATCH", "/api/v1/account/profile", json=body)
        prof = resp.get("profile", {})
        return AccountProfile(
            id=prof.get("id", ""),
            email=prof.get("email", ""),
            name=prof.get("name"),
            handle=prof.get("handle"),
            image=prof.get("image"),
            bio=prof.get("bio"),
            website=prof.get("website"),
            role=prof.get("role", "member"),
            created_at=prof.get("createdAt"),
        )


class _ScopesNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client

    def list(self, namespace: str | None = None) -> list[ScopeItem]:
        if namespace:
            owner, project = _parse_namespace(namespace)
            path = f"/api/v1/{owner}/{project}/scopes"
        else:
            path = "/api/v1/scopes"
        resp = self._client._request("GET", path)
        return [
            ScopeItem(
                name=s["name"],
                count=int(s.get("count", 0)),
                is_private=s.get("isPrivate") or s.get("is_private"),
            )
            for s in resp.get("scopes", [])
        ]


# ══════════════════════════════════════════════════════════════════════════════
# ASYNC NAMESPACES
# ══════════════════════════════════════════════════════════════════════════════


class _StatementsNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def list(
        self,
        namespace: str,
        page: int | None = None,
        per_page: int | None = None,
        type: str | None = None,
        kind: str | None = None,
        status: str | None = None,
        scope: str | None = None,
        q: str | None = None,
        semantic: str | None = None,
        sort: str | None = None,
        order: str | None = None,
        starred: bool | None = None,
        tag: str | None = None,
        author_type: str | None = None,
        subject: str | None = None,
    ) -> PaginatedResult[StatementItem]:
        owner, project = _parse_namespace(namespace)
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "type": type or kind,
                "kind": kind or type,
                "status": status,
                "scope": scope,
                "q": q,
                "semantic": semantic,
                "sort": sort,
                "order": order,
                "starred": starred,
                "tag": tag,
                "author_type": author_type,
                "subject": subject,
            }
        )
        resp = await self._client._request(
            "GET", f"/api/v1/{owner}/{project}/statements", params=params
        )
        raw_items = resp.get("statements") or []
        items = [_parse_statement_item(s) for s in raw_items]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)

    async def get(self, namespace: str, statement_id: str) -> StatementItem:
        owner, project = _parse_namespace(namespace)
        resp = await self._client._request(
            "GET", f"/api/v1/{owner}/{project}/statements/{statement_id}"
        )
        return _parse_statement_item(resp.get("statement", {}))

    async def create(
        self,
        namespace: str,
        title: str,
        context: str | None = None,
        example: str | None = None,
        source: str | None = None,
        tags: list[str] | None = None,
        confidence: float | None = None,
        subject: str | None = None,
        type: str | None = None,
        kind: str | None = None,
        status: str | None = None,
        is_pinned: bool | None = None,
        expires_at: Any | None = None,
        scope: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> StatementItem:
        owner, project = _parse_namespace(namespace)
        exp_str = (
            expires_at.isoformat()
            if isinstance(expires_at, datetime.date | datetime.datetime)
            else expires_at
        )
        effective_type = type or kind
        payload: dict[str, Any] = {
            "title": title,
            "context": context,
            "example": example,
            "source": source,
            "tags": tags,
            "confidence": confidence,
            "subject": subject,
            "type": effective_type,
            "kind": effective_type,
            "status": status,
            "isPinned": is_pinned,
            "expiresAt": exp_str,
            "scope": scope,
            "metadata": metadata,
        }
        resp = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{project}/statements",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_statement_item(resp.get("statement", {}))

    async def update(
        self,
        namespace: str,
        statement_id: str,
        title: str | None = None,
        context: str | None = None,
        example: str | None = None,
        tags: list[str] | None = None,
        confidence: float | None = None,
        status: str | None = None,
        type: str | None = None,
        kind: str | None = None,
        subject: str | None = None,
        is_pinned: bool | None = None,
        scope: str | None = None,
        metadata: dict[str, Any] | None = None,
        reason: str | None = None,
    ) -> StatementItem:
        owner, project = _parse_namespace(namespace)
        effective_type = type or kind
        payload: dict[str, Any] = {
            "title": title,
            "context": context,
            "example": example,
            "tags": tags,
            "confidence": confidence,
            "status": status,
            "type": effective_type,
            "kind": effective_type,
            "subject": subject,
            "isPinned": is_pinned,
            "scope": scope,
            "metadata": metadata,
            "reason": reason,
        }
        resp = await self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{project}/statements/{statement_id}",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_statement_item(resp.get("statement", {}))

    async def delete(self, namespace: str, statement_id: str) -> None:
        owner, project = _parse_namespace(namespace)
        await self._client._request(
            "DELETE", f"/api/v1/{owner}/{project}/statements/{statement_id}"
        )

    async def star(
        self, namespace: str, statement_id: str, starred: bool = True
    ) -> StatementStarResponse:
        owner, project = _parse_namespace(namespace)
        method = "PUT" if starred else "DELETE"
        resp = await self._client._request(
            method, f"/api/v1/{owner}/{project}/statements/{statement_id}/star"
        )
        return StatementStarResponse(
            root_id=resp.get("rootId", ""),
            starred=bool(resp.get("starred", starred)),
            star_count=int(resp.get("starCount", 0)),
        )

    async def history(self, namespace: str, statement_id: str) -> StatementHistoryResponse:
        owner, project = _parse_namespace(namespace)
        resp = await self._client._request(
            "GET", f"/api/v1/{owner}/{project}/statements/{statement_id}/history"
        )
        hist = [
            StatementHistoryItem(
                id=h.get("id", ""),
                root_id=h.get("rootId", ""),
                version=h.get("version", 1),
                title=h.get("title", ""),
                context=h.get("context"),
                example=h.get("example"),
                tags=h.get("tags") or [],
                confidence=float(h.get("confidence", 0.5)),
                status=h.get("status", "active"),
                type=h.get("type", "fact"),
                kind=h.get("kind"),
                subject=h.get("subject"),
                scope=h.get("scope", "common"),
                author_type=h.get("authorType", "user"),
                author_id=h.get("authorId"),
                author_name=h.get("authorName"),
                mutation_type=h.get("mutationType"),
                change_reason=h.get("changeReason"),
                created_at=h.get("createdAt"),
            )
            for h in resp.get("history", [])
        ]
        return StatementHistoryResponse(
            root_id=resp.get("rootId", ""),
            total_versions=int(resp.get("totalVersions", len(hist))),
            history=hist,
        )

    async def adopt(
        self, namespace: str, statement_id: str, target_project_ids: list[str]
    ) -> AdoptStatementResponse:
        owner, project = _parse_namespace(namespace)
        resp = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{project}/statements/{statement_id}/adopt",
            json={"targetProjectIds": target_project_ids},
        )
        adopted = [
            AdoptedTarget(
                project_id=a["projectId"],
                statement_id=a["statementId"],
                already_existed=bool(a["alreadyExisted"]),
            )
            for a in resp.get("adopted", [])
        ]
        return AdoptStatementResponse(
            ok=bool(resp.get("ok", True)),
            source_statement_id=resp.get("sourceStatementId", statement_id),
            adopted=adopted,
        )

    async def promote(
        self,
        namespace: str,
        statement_id: str,
        to_scope: str = "common",
        reason: str | None = None,
    ) -> PromoteStatementResponse:
        owner, project = _parse_namespace(namespace)
        body: dict[str, Any] = {"toScope": to_scope}
        if reason:
            body["reason"] = reason
        resp = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{project}/statements/{statement_id}/promote",
            json=body,
        )
        return PromoteStatementResponse(
            promoted=bool(resp.get("promoted", True)),
            statement=_parse_statement_item(resp.get("statement", {})),
        )


class _ProjectsNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def list(
        self,
        page: int | None = None,
        per_page: int | None = None,
        visibility: str | None = None,
        q: str | None = None,
        sort: str | None = None,
        order: str | None = None,
    ) -> PaginatedResult[ProjectItem]:
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "visibility": visibility,
                "q": q,
                "sort": sort,
                "order": order,
            }
        )
        resp = await self._client._request("GET", "/api/v1/projects", params=params)
        raw_projects = resp.get("projects") or []
        items = [_parse_project_item(p) for p in raw_projects]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)

    async def list_for_owner(
        self,
        owner: str,
        page: int | None = None,
        per_page: int | None = None,
        visibility: str | None = None,
        q: str | None = None,
        sort: str | None = None,
        order: str | None = None,
    ) -> PaginatedResult[ProjectItem]:
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "visibility": visibility,
                "q": q,
                "sort": sort,
                "order": order,
            }
        )
        resp = await self._client._request("GET", f"/api/v1/{owner}/projects", params=params)
        raw_projects = resp.get("projects") or []
        items = [_parse_project_item(p) for p in raw_projects]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)

    async def get(self, namespace: str) -> ProjectItem:
        owner, project = _parse_namespace(namespace)
        resp = await self._client._request("GET", f"/api/v1/{owner}/{project}")
        return _parse_project_item(resp.get("project", {}))

    async def create(
        self,
        name: str,
        slug: str | None = None,
        description: str | None = None,
        website: str | None = None,
        visibility: str = "private",
        owner: str | None = None,
    ) -> ProjectItem:
        payload: dict[str, Any] = {
            "name": name,
            "slug": slug,
            "description": description,
            "website": website,
            "visibility": visibility,
            "owner": owner,
        }
        resp = await self._client._request(
            "POST",
            "/api/v1/projects",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_project_item(resp.get("project", {}))

    async def update(
        self,
        namespace: str,
        name: str | None = None,
        slug: str | None = None,
        description: str | None = None,
        website: str | None = None,
        visibility: str | None = None,
        tags: list[str] | None = None,
        instruction: str | None = None,
        guard_mode: str | None = None,
        tag_prompt: str | None = None,
        profile: str | None = None,
    ) -> ProjectItem:
        owner, project = _parse_namespace(namespace)
        payload: dict[str, Any] = {
            "name": name,
            "slug": slug,
            "description": description,
            "website": website,
            "visibility": visibility,
            "tags": tags,
            "instruction": instruction,
            "guardMode": guard_mode,
            "tagPrompt": tag_prompt,
            "profile": profile,
        }
        resp = await self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{project}",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_project_item(resp.get("project", {}))

    async def delete(self, namespace: str) -> None:
        owner, project = _parse_namespace(namespace)
        await self._client._request("DELETE", f"/api/v1/{owner}/{project}")

    async def transfer(self, namespace: str, target_owner: str) -> None:
        owner, project = _parse_namespace(namespace)
        await self._client._request(
            "POST",
            f"/api/v1/{owner}/{project}/transfer",
            json={"targetOwner": target_owner},
        )


class _AgentsNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def list(
        self,
        namespace: str,
        page: int | None = None,
        per_page: int | None = None,
        status: str | None = None,
        kind: str | None = None,
        q: str | None = None,
        sort: str | None = None,
        order: str | None = None,
    ) -> PaginatedResult[AgentItem]:
        owner, project = _parse_namespace(namespace)
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "status": status,
                "kind": kind,
                "q": q,
                "sort": sort,
                "order": order,
            }
        )
        resp = await self._client._request(
            "GET", f"/api/v1/{owner}/{project}/agents", params=params
        )
        raw_items = resp.get("agents") or []
        items = [_parse_agent_item(a) for a in raw_items]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)

    async def get(self, namespace: str, agent_id: str) -> AgentItem:
        owner, project = _parse_namespace(namespace)
        resp = await self._client._request("GET", f"/api/v1/{owner}/{project}/agents/{agent_id}")
        return _parse_agent_item(resp.get("agent", {}))

    async def create(
        self,
        namespace: str,
        name: str,
        slug: str | None = None,
        kind: str | None = None,
        model: str | None = None,
        description: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AgentItem:
        owner, project = _parse_namespace(namespace)
        payload: dict[str, Any] = {
            "name": name,
            "slug": slug,
            "kind": kind,
            "model": model,
            "description": description,
            "metadata": metadata,
        }
        resp = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{project}/agents",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_agent_item(resp.get("agent", {}))

    async def update(
        self,
        namespace: str,
        agent_id: str,
        name: str | None = None,
        model: str | None = None,
        description: str | None = None,
        status: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AgentItem:
        owner, project = _parse_namespace(namespace)
        payload: dict[str, Any] = {
            "name": name,
            "model": model,
            "description": description,
            "status": status,
            "metadata": metadata,
        }
        resp = await self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{project}/agents/{agent_id}",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_agent_item(resp.get("agent", {}))

    async def delete(self, namespace: str, agent_id: str) -> None:
        owner, project = _parse_namespace(namespace)
        await self._client._request("DELETE", f"/api/v1/{owner}/{project}/agents/{agent_id}")

    async def create_key(self, namespace: str, agent_id: str) -> CreateAgentKeyResult:
        owner, project = _parse_namespace(namespace)
        resp = await self._client._request(
            "POST", f"/api/v1/{owner}/{project}/agents/{agent_id}/keys"
        )
        return CreateAgentKeyResult(**resp.get("key", {}))

    async def revoke_key(self, namespace: str, agent_id: str, key_id: str) -> None:
        owner, project = _parse_namespace(namespace)
        await self._client._request(
            "DELETE", f"/api/v1/{owner}/{project}/agents/{agent_id}/keys/{key_id}"
        )


class _CollaboratorsNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def list(
        self,
        namespace: str,
        page: int | None = None,
        per_page: int | None = None,
        role: str | None = None,
        affiliation: str | None = None,
        q: str | None = None,
    ) -> ListCollaboratorsResponse:
        owner, project = _parse_namespace(namespace)
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "role": role,
                "affiliation": affiliation,
                "q": q,
            }
        )
        resp = await self._client._request(
            "GET", f"/api/v1/{owner}/{project}/collaborators", params=params
        )
        collabs = [_parse_collaborator_item(c) for c in resp.get("collaborators", [])]
        invites = [_parse_pending_invitation(i) for i in resp.get("pendingInvitations", [])]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return ListCollaboratorsResponse(
            collaborators=collabs,
            pending_invitations=invites,
            pagination=pagination,
        )

    async def invite(
        self, namespace: str, identifier: str, role: str = "read"
    ) -> PendingInvitationItem:
        owner, project = _parse_namespace(namespace)
        resp = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{project}/collaborators",
            json={"identifier": identifier, "role": role},
        )
        return _parse_pending_invitation(resp.get("invitation", {}))

    async def update_role(self, namespace: str, user_id: str, role: str) -> None:
        owner, project = _parse_namespace(namespace)
        await self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{project}/collaborators/{user_id}",
            json={"role": role},
        )

    async def remove(self, namespace: str, user_id: str) -> None:
        owner, project = _parse_namespace(namespace)
        await self._client._request("DELETE", f"/api/v1/{owner}/{project}/collaborators/{user_id}")

    async def revoke_invitation(self, namespace: str, invitation_id: str) -> None:
        owner, project = _parse_namespace(namespace)
        await self._client._request(
            "DELETE",
            f"/api/v1/{owner}/{project}/collaborators/invitations/{invitation_id}",
        )


class _OrganizationsNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def list(self) -> list[OrganizationItem]:
        resp = await self._client._request("GET", "/api/v1/organizations")
        orgs = resp.get("organizations") or []
        return [
            OrganizationItem(
                id=o.get("id", ""),
                slug=o.get("slug", ""),
                name=o.get("name", ""),
                role=o.get("role"),
                bio=o.get("bio"),
                website=o.get("website"),
                logo=o.get("logo"),
                member_count=o.get("memberCount"),
                project_count=o.get("projectCount"),
                created_at=o.get("createdAt") or o.get("joinedAt"),
            )
            for o in orgs
        ]

    async def create(
        self,
        name: str,
        slug: str | None = None,
        bio: str | None = None,
        website: str | None = None,
        logo: str | None = None,
    ) -> OrganizationItem:
        body: dict[str, Any] = {"name": name}
        if slug:
            body["slug"] = slug
        if bio:
            body["bio"] = bio
        if website:
            body["website"] = website
        if logo:
            body["logo"] = logo
        resp = await self._client._request("POST", "/api/v1/organizations", json=body)
        org = resp.get("organization", {})
        return OrganizationItem(
            id=org.get("id", ""),
            slug=org.get("slug", ""),
            name=org.get("name", ""),
            role=org.get("role"),
            bio=org.get("bio"),
            website=org.get("website"),
            logo=org.get("logo"),
            created_at=org.get("createdAt"),
        )

    async def get(self, slug: str) -> OrganizationItem:
        resp = await self._client._request("GET", f"/api/v1/organizations/{slug}")
        org = resp.get("organization", {})
        return OrganizationItem(
            id=org.get("id", ""),
            slug=org.get("slug", ""),
            name=org.get("name", ""),
            role=org.get("role"),
            bio=org.get("bio"),
            website=org.get("website"),
            logo=org.get("logo"),
            member_count=org.get("memberCount"),
            project_count=org.get("projectCount"),
            created_at=org.get("createdAt"),
        )

    async def update(
        self,
        slug: str,
        name: str | None = None,
        bio: str | None = None,
        website: str | None = None,
        logo: str | None = None,
    ) -> OrganizationItem:
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if bio is not None:
            body["bio"] = bio
        if website is not None:
            body["website"] = website
        if logo is not None:
            body["logo"] = logo
        resp = await self._client._request("PATCH", f"/api/v1/organizations/{slug}", json=body)
        org = resp.get("organization", {})
        return OrganizationItem(
            id=org.get("id", ""),
            slug=org.get("slug", ""),
            name=org.get("name", ""),
            bio=org.get("bio"),
            website=org.get("website"),
            logo=org.get("logo"),
            created_at=org.get("createdAt"),
        )

    async def delete(self, slug: str) -> None:
        await self._client._request(
            "DELETE",
            f"/api/v1/organizations/{slug}",
            json={"confirmSlug": slug},
        )

    async def list_members(
        self,
        slug: str,
        page: int | None = None,
        per_page: int | None = None,
        role: str | None = None,
        q: str | None = None,
        sort: str | None = None,
        order: str | None = None,
    ) -> PaginatedResult[OrgMemberItem]:
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "role": role,
                "q": q,
                "sort": sort,
                "order": order,
            }
        )
        resp = await self._client._request(
            "GET", f"/api/v1/organizations/{slug}/members", params=params
        )
        members = [_parse_org_member(m) for m in resp.get("members", [])]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=members, pagination=pagination)

    async def update_member_role(self, slug: str, user_id: str, role: str) -> None:
        await self._client._request(
            "PATCH",
            f"/api/v1/organizations/{slug}/members",
            json={"userId": user_id, "role": role},
        )

    async def remove_member(self, slug: str, user_id: str) -> None:
        await self._client._request(
            "DELETE",
            f"/api/v1/organizations/{slug}/members",
            params={"userId": user_id},
        )

    async def list_invitations(self, slug: str) -> list[OrgInvitationItem]:
        resp = await self._client._request("GET", f"/api/v1/organizations/{slug}/invitations")
        return [_parse_org_invitation(i) for i in resp.get("invitations", [])]

    async def invite_member(
        self,
        slug: str,
        email: str,
        role: str = "member",
        team_id: str | None = None,
    ) -> OrgInvitationItem:
        body: dict[str, Any] = {"email": email, "role": role}
        if team_id:
            body["teamId"] = team_id
        resp = await self._client._request(
            "POST", f"/api/v1/organizations/{slug}/invitations", json=body
        )
        return _parse_org_invitation(resp.get("invitation", {}))

    async def revoke_invitation(self, slug: str, invitation_id: str) -> None:
        await self._client._request(
            "DELETE",
            f"/api/v1/organizations/{slug}/invitations/{invitation_id}",
        )


class _UsageNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def get(self, owner: str, timeframe: str = "30d") -> OwnerUsage:
        resp = await self._client._request(
            "GET", f"/api/v1/{owner}/usage", params={"timeframe": timeframe}
        )
        return _parse_owner_usage(resp)


class _TokensNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def list(self) -> list[PersonalAccessTokenItem]:
        resp = await self._client._request("GET", "/api/v1/account/tokens")
        return [
            PersonalAccessTokenItem(
                id=t["id"],
                name=t["name"],
                preview=t.get("preview", ""),
                expires_at=t.get("expiresAt") or t.get("expires_at"),
                last_used_at=t.get("lastUsedAt") or t.get("last_used_at"),
                created_at=t.get("createdAt") or t.get("created_at"),
            )
            for t in resp.get("tokens", [])
        ]

    async def create(
        self, name: str, expires_in_days: int | None = None
    ) -> CreatedPersonalTokenResult:
        body: dict[str, Any] = {"name": name}
        if expires_in_days is not None:
            body["expiresInDays"] = expires_in_days
        resp = await self._client._request("POST", "/api/v1/account/tokens", json=body)
        tok = resp.get("token", {})
        return CreatedPersonalTokenResult(
            id=tok["id"],
            name=tok["name"],
            token=tok.get("token", ""),
            preview=tok.get("preview", ""),
            expires_at=tok.get("expiresAt"),
            created_at=tok.get("createdAt"),
        )

    async def revoke(self, token_id: str) -> None:
        await self._client._request("DELETE", f"/api/v1/account/tokens/{token_id}")


class _AccountNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client
        self.tokens = _TokensNamespaceAsync(client)

    async def get(self) -> AccountProfile:
        resp = await self._client._request("GET", "/api/v1/account/profile")
        prof = resp.get("profile", {})
        return AccountProfile(
            id=prof.get("id", ""),
            email=prof.get("email", ""),
            name=prof.get("name"),
            handle=prof.get("handle"),
            image=prof.get("image"),
            bio=prof.get("bio"),
            website=prof.get("website"),
            role=prof.get("role", "member"),
            created_at=prof.get("createdAt"),
        )

    async def update_profile(
        self,
        name: str | None = None,
        bio: str | None = None,
        website: str | None = None,
        image: str | None = None,
    ) -> AccountProfile:
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if bio is not None:
            body["bio"] = bio
        if website is not None:
            body["website"] = website
        if image is not None:
            body["image"] = image
        resp = await self._client._request("PATCH", "/api/v1/account/profile", json=body)
        prof = resp.get("profile", {})
        return AccountProfile(
            id=prof.get("id", ""),
            email=prof.get("email", ""),
            name=prof.get("name"),
            handle=prof.get("handle"),
            image=prof.get("image"),
            bio=prof.get("bio"),
            website=prof.get("website"),
            role=prof.get("role", "member"),
            created_at=prof.get("createdAt"),
        )


class _ScopesNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def list(self, namespace: str | None = None) -> list[ScopeItem]:
        if namespace:
            owner, project = _parse_namespace(namespace)
            path = f"/api/v1/{owner}/{project}/scopes"
        else:
            path = "/api/v1/scopes"
        resp = await self._client._request("GET", path)
        return [
            ScopeItem(
                name=s["name"],
                count=int(s.get("count", 0)),
                is_private=s.get("isPrivate") or s.get("is_private"),
            )
            for s in resp.get("scopes", [])
        ]


# ══════════════════════════════════════════════════════════════════════════════
# MAIN CLIENTS
# ══════════════════════════════════════════════════════════════════════════════


class MemCell:
    """Synchronous MemCell client."""

    def __init__(
        self,
        api_key: str | None = None,
        access_token: str | None = None,
        client_id: str | None = None,
        client_secret: str | None = None,
        scope: str | None = None,
        base_url: str | None = None,
        max_retries: int = 3,
        initial_retry_delay_ms: int = 1000,
        max_retry_delay_ms: int = 15000,
        on_rate_limit_warning: Callable[[str, httpx.Response], None] | None = None,
        timeout: float = 30.0,
        http_client: httpx.Client | None = None,
    ) -> None:
        base = base_url or os.environ.get("MEMCELL_BASE_URL", "https://api.memcell.io")
        self.base_url = base.rstrip("/")
        self.max_retries = max_retries
        self.initial_retry_delay_ms = initial_retry_delay_ms
        self.max_retry_delay_ms = max_retry_delay_ms
        self.on_rate_limit_warning = on_rate_limit_warning

        resolved_api_key = api_key or os.environ.get("MEMCELL_API_KEY")
        self.auth_manager = AuthManager(
            base_url=self.base_url,
            api_key=resolved_api_key,
            access_token=access_token,
            client_id=client_id,
            client_secret=client_secret,
            scope=scope,
        )

        self._custom_client = http_client is not None
        self._http = http_client or httpx.Client(timeout=timeout)

        # Mount resource namespaces
        self.statements = _StatementsNamespaceSync(self)
        self.projects = _ProjectsNamespaceSync(self)
        self.agents = _AgentsNamespaceSync(self)
        self.collaborators = _CollaboratorsNamespaceSync(self)
        self.organizations = _OrganizationsNamespaceSync(self)
        self.usage = _UsageNamespaceSync(self)
        self.account = _AccountNamespaceSync(self)
        self.scopes = _ScopesNamespaceSync(self)

    def close(self) -> None:
        if not self._custom_client:
            self._http.close()

    def __enter__(self) -> MemCell:
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()

    def for_organization(self, org_slug: str) -> OrganizationMemCell:
        from .organization import OrganizationMemCell

        return OrganizationMemCell(self, org_slug)

    def scope(self, namespace: str, subject: str | None = None) -> ScopedMemCell:
        from .scoped import ScopedMemCell

        return ScopedMemCell(self, namespace, subject=subject)

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        attempt = 0
        while True:
            headers = kwargs.pop("headers", {}) or {}
            auth_header = self.auth_manager.get_authorization_header(self._http)
            if auth_header:
                headers["Authorization"] = auth_header
            headers["Content-Type"] = "application/json"
            headers["Accept"] = "application/json"

            url = f"{self.base_url}{path}"
            response = self._http.request(method, url, headers=headers, **kwargs)

            # Check 299 warning header
            warning = response.headers.get("RateLimit-Warning")
            if warning and self.on_rate_limit_warning:
                try:
                    self.on_rate_limit_warning(warning, response)
                except Exception:
                    pass

            # Handle 429
            if response.status_code == 429:
                retry_header = response.headers.get("Retry-After")
                try:
                    retry_sec = int(retry_header) if retry_header else None
                except ValueError:
                    retry_sec = None

                if attempt < self.max_retries:
                    attempt += 1
                    if retry_sec is not None and retry_sec > 0:
                        delay_ms = retry_sec * 1000
                    else:
                        delay_ms = min(
                            self.max_retry_delay_ms,
                            self.initial_retry_delay_ms * (2 ** (attempt - 1)),
                        )
                    delay_ms += random.randint(0, 200)
                    time.sleep(delay_ms / 1000.0)
                    continue

                # Retries exhausted -> throw RateLimitError
                err_json = response.json() if response.content else {}
                effective_retry = (
                    retry_sec if (retry_sec and retry_sec > 0) else err_json.get("retryAfter", 1)
                )
                door_str = f" on door '{err_json.get('door')}'" if err_json.get("door") else ""
                msg = (
                    err_json.get("message")
                    or f"Rate limit exceeded{door_str}. Please retry in {effective_retry}s."
                )
                raise RateLimitError(
                    message=msg,
                    door=err_json.get("door"),
                    limit=err_json.get("limit"),
                    window_seconds=err_json.get("windowSeconds"),
                    retry_after=effective_retry,
                    details=err_json,
                )

            if not response.is_success:
                err_json = response.json() if response.content else {}
                message = (
                    err_json.get("message")
                    or (
                        err_json.get("error", {}).get("message")
                        if isinstance(err_json.get("error"), dict)
                        else err_json.get("error")
                    )
                    or err_json.get("error_description")
                    or response.reason_phrase
                    or f"HTTP {response.status_code}"
                )
                code = (
                    err_json.get("error")
                    if isinstance(err_json.get("error"), str)
                    else f"HTTP_{response.status_code}"
                )
                raise MemCellError(
                    f"MemCell API Error ({response.status_code}): {message}",
                    status_code=response.status_code,
                    code=code,
                    details=err_json,
                )

            return response.json() if response.content else {}

    def recall(
        self,
        query: str,
        namespace: str | None = None,
        subject: str | None = None,
        type: str | list[str] | None = None,
        kind: str | list[str] | None = None,
        scope: str | None = None,
        scopes: list[str] | None = None,
        min_confidence: float | None = None,
        limit: int | None = None,
        tags: list[str] | None = None,
        format: str = "xml",
        allow_provisional: bool | None = None,
    ) -> RecallResponse:
        path = _resolve_endpoint(namespace, "recall")
        effective_type = type or kind
        payload: dict[str, Any] = {
            "query": query,
            "intent": query,
            "subject": subject,
            "type": effective_type,
            "kind": effective_type,
            "scope": scope,
            "scopes": scopes,
            "min_confidence": min_confidence,
            "limit": limit,
            "tags": tags,
            "format": format,
            "allow_provisional": allow_provisional,
        }
        if namespace and "/" not in namespace:
            payload["project"] = namespace

        data = self._request("POST", path, json={k: v for k, v in payload.items() if v is not None})
        raw_statements = data.get("statements") or data.get("results") or []
        statements = [_parse_statement_item(s) for s in raw_statements]

        return RecallResponse(
            recall_id=str(data.get("recallId") or data.get("momentId") or ""),
            prompt_context=data.get("promptContext", ""),
            statements=statements,
            matched_tags=data.get("matchedTags"),
            guard_mode=data.get("guardMode"),
            profile=data.get("profile"),
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
        path = _resolve_endpoint(namespace, "remember")
        exp_str = (
            expires_at.isoformat()
            if isinstance(expires_at, datetime.date | datetime.datetime)
            else expires_at
        )
        effective_type = type or kind
        payload: dict[str, Any] = {
            "title": title,
            "context": context,
            "example": example,
            "tags": tags,
            "subject": subject,
            "type": effective_type,
            "kind": effective_type,
            "status": status,
            "confidence": confidence,
            "scope": scope,
            "metadata": metadata,
            "expires_at": exp_str,
            "raw": raw,
            "sessionId": session_id,
            "async": async_,
        }
        if namespace and "/" not in namespace:
            payload["project"] = namespace

        data = self._request("POST", path, json={k: v for k, v in payload.items() if v is not None})

        if data.get("accepted"):
            return RememberResponse(
                accepted=True,
                job_id=data.get("jobId"),
                status=data.get("status"),
                created=[],
                note=data.get("note", "Job accepted for background execution."),
            )

        raw_created = data.get("created") or []
        created = [_parse_statement_item(s) for s in raw_created]

        return RememberResponse(
            created=created,
            reinforced=data.get("reinforced"),
            superseded=data.get("superseded"),
            note=data.get("note"),
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
        path = _resolve_endpoint(namespace, "report")
        req_payload: dict[str, Any] = {
            "action_taken": action_taken,
            "outcome": outcome,
            "subject": subject,
            "reason": reason,
            "external_ref": external_ref,
            "payload": payload,
            "recall_id": recall_id,
            "statement_id": statement_id,
            "auto_distill": auto_distill,
            "async": async_,
        }
        if namespace and "/" not in namespace:
            req_payload["project"] = namespace

        data = self._request(
            "POST", path, json={k: v for k, v in req_payload.items() if v is not None}
        )

        if data.get("accepted"):
            return ReportResponse(
                outcome=outcome,
                accepted=True,
                job_id=data.get("jobId"),
                status=data.get("status"),
                attributed=[],
                note=data.get("note", "Report accepted for background execution."),
            )

        distilled = None
        if data.get("distilledStatement"):
            distilled = _parse_statement_item(data["distilledStatement"])

        return ReportResponse(
            outcome=data.get("outcome", outcome),
            attributed=data.get("attributed") or [],
            distilled_statement=distilled,
            note=data.get("note"),
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
        path = _resolve_endpoint(namespace, "feedback")
        req_payload: dict[str, Any] = {
            "statement_id": statement_id,
            "recall_id": recall_id,
            "outcome": outcome,
            "reason": reason,
            "external_ref": external_ref,
            "payload": payload,
        }
        if namespace and "/" not in namespace:
            req_payload["project"] = namespace

        data = self._request(
            "POST", path, json={k: v for k, v in req_payload.items() if v is not None}
        )
        return FeedbackResponse(
            outcome=data.get("outcome", outcome),
            attributed=data.get("attributed") or [],
        )

    def wait_for_job(
        self,
        job_id: str,
        timeout_ms: int = 15000,
        poll_interval_ms: int = 250,
        on_progress: Callable[[JobEvent], None] | None = None,
    ) -> JobEvent:
        start_time = time.time()
        timeout_sec = timeout_ms / 1000.0
        poll_sec = poll_interval_ms / 1000.0

        try:
            auth_header = self.auth_manager.get_authorization_header(self._http)
            headers = {"Accept": "text/event-stream"}
            if auth_header:
                headers["Authorization"] = auth_header

            with self._http.stream(
                "GET", f"{self.base_url}/api/v1/jobs/{job_id}/stream", headers=headers
            ) as resp:
                if resp.is_success:
                    for line in resp.iter_lines():
                        if time.time() - start_time > timeout_sec:
                            raise MemCellError(f"Job {job_id} timed out after {timeout_ms}ms.")
                        if line.startswith("data:"):
                            json_str = line[len("data:") :].strip()
                            event_data = json.loads(json_str)
                            event = JobEvent(**event_data)
                            if on_progress:
                                on_progress(event)
                            if event.step == "completed":
                                return event
                            if event.step == "failed":
                                raise MemCellError(event.message or f"Job {job_id} failed.")
        except MemCellError:
            raise
        except Exception:
            pass

        while time.time() - start_time <= timeout_sec:
            try:
                res = self._request("GET", f"/api/v1/jobs/{job_id}")
                job = res.get("job")
                if job:
                    event = JobEvent(
                        step=job.get("step"),
                        progress=int(job.get("progress", 0)),
                        message=job.get("message"),
                        metadata=job.get("result"),
                    )
                    if on_progress:
                        on_progress(event)
                    if event.step == "completed":
                        return event
                    if event.step == "failed":
                        raise MemCellError(event.message or f"Job {job_id} failed.")
            except Exception:
                pass

            time.sleep(poll_sec)

        raise MemCellError(f"Job {job_id} timed out after {timeout_ms}ms.")


class AsyncMemCell:
    """Asynchronous MemCell client."""

    def __init__(
        self,
        api_key: str | None = None,
        access_token: str | None = None,
        client_id: str | None = None,
        client_secret: str | None = None,
        scope: str | None = None,
        base_url: str | None = None,
        max_retries: int = 3,
        initial_retry_delay_ms: int = 1000,
        max_retry_delay_ms: int = 15000,
        on_rate_limit_warning: Callable[[str, httpx.Response], None] | None = None,
        timeout: float = 30.0,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        base = base_url or os.environ.get("MEMCELL_BASE_URL", "https://api.memcell.io")
        self.base_url = base.rstrip("/")
        self.max_retries = max_retries
        self.initial_retry_delay_ms = initial_retry_delay_ms
        self.max_retry_delay_ms = max_retry_delay_ms
        self.on_rate_limit_warning = on_rate_limit_warning

        resolved_api_key = api_key or os.environ.get("MEMCELL_API_KEY")
        self.auth_manager = AuthManager(
            base_url=self.base_url,
            api_key=resolved_api_key,
            access_token=access_token,
            client_id=client_id,
            client_secret=client_secret,
            scope=scope,
        )

        self._custom_client = http_client is not None
        self._http = http_client or httpx.AsyncClient(timeout=timeout)

        # Mount resource namespaces
        self.statements = _StatementsNamespaceAsync(self)
        self.projects = _ProjectsNamespaceAsync(self)
        self.agents = _AgentsNamespaceAsync(self)
        self.collaborators = _CollaboratorsNamespaceAsync(self)
        self.organizations = _OrganizationsNamespaceAsync(self)
        self.usage = _UsageNamespaceAsync(self)
        self.account = _AccountNamespaceAsync(self)
        self.scopes = _ScopesNamespaceAsync(self)

    async def aclose(self) -> None:
        if not self._custom_client:
            await self._http.aclose()

    async def __aenter__(self) -> AsyncMemCell:
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.aclose()

    def for_organization(self, org_slug: str) -> AsyncOrganizationMemCell:
        from .organization import AsyncOrganizationMemCell

        return AsyncOrganizationMemCell(self, org_slug)

    def scope(self, namespace: str, subject: str | None = None) -> AsyncScopedMemCell:
        from .scoped import AsyncScopedMemCell

        return AsyncScopedMemCell(self, namespace, subject=subject)

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        attempt = 0
        while True:
            headers = kwargs.pop("headers", {}) or {}
            auth_header = await self.auth_manager.get_authorization_header_async(self._http)
            if auth_header:
                headers["Authorization"] = auth_header
            headers["Content-Type"] = "application/json"
            headers["Accept"] = "application/json"

            url = f"{self.base_url}{path}"
            response = await self._http.request(method, url, headers=headers, **kwargs)

            # Check 299 warning header
            warning = response.headers.get("RateLimit-Warning")
            if warning and self.on_rate_limit_warning:
                try:
                    self.on_rate_limit_warning(warning, response)
                except Exception:
                    pass

            # Handle 429
            if response.status_code == 429:
                retry_header = response.headers.get("Retry-After")
                try:
                    retry_sec = int(retry_header) if retry_header else None
                except ValueError:
                    retry_sec = None

                if attempt < self.max_retries:
                    attempt += 1
                    if retry_sec is not None and retry_sec > 0:
                        delay_ms = retry_sec * 1000
                    else:
                        delay_ms = min(
                            self.max_retry_delay_ms,
                            self.initial_retry_delay_ms * (2 ** (attempt - 1)),
                        )
                    delay_ms += random.randint(0, 200)
                    await asyncio.sleep(delay_ms / 1000.0)
                    continue

                # Retries exhausted -> throw RateLimitError
                err_json = response.json() if response.content else {}
                effective_retry = (
                    retry_sec if (retry_sec and retry_sec > 0) else err_json.get("retryAfter", 1)
                )
                door_str = f" on door '{err_json.get('door')}'" if err_json.get("door") else ""
                msg = (
                    err_json.get("message")
                    or f"Rate limit exceeded{door_str}. Please retry in {effective_retry}s."
                )
                raise RateLimitError(
                    message=msg,
                    door=err_json.get("door"),
                    limit=err_json.get("limit"),
                    window_seconds=err_json.get("windowSeconds"),
                    retry_after=effective_retry,
                    details=err_json,
                )

            if not response.is_success:
                err_json = response.json() if response.content else {}
                message = (
                    err_json.get("message")
                    or (
                        err_json.get("error", {}).get("message")
                        if isinstance(err_json.get("error"), dict)
                        else err_json.get("error")
                    )
                    or err_json.get("error_description")
                    or response.reason_phrase
                    or f"HTTP {response.status_code}"
                )
                code = (
                    err_json.get("error")
                    if isinstance(err_json.get("error"), str)
                    else f"HTTP_{response.status_code}"
                )
                raise MemCellError(
                    f"MemCell API Error ({response.status_code}): {message}",
                    status_code=response.status_code,
                    code=code,
                    details=err_json,
                )

            return response.json() if response.content else {}

    async def recall(
        self,
        query: str,
        namespace: str | None = None,
        subject: str | None = None,
        type: str | list[str] | None = None,
        kind: str | list[str] | None = None,
        scope: str | None = None,
        scopes: list[str] | None = None,
        min_confidence: float | None = None,
        limit: int | None = None,
        tags: list[str] | None = None,
        format: str = "xml",
        allow_provisional: bool | None = None,
    ) -> RecallResponse:
        path = _resolve_endpoint(namespace, "recall")
        effective_type = type or kind
        payload: dict[str, Any] = {
            "query": query,
            "intent": query,
            "subject": subject,
            "type": effective_type,
            "kind": effective_type,
            "scope": scope,
            "scopes": scopes,
            "min_confidence": min_confidence,
            "limit": limit,
            "tags": tags,
            "format": format,
            "allow_provisional": allow_provisional,
        }
        if namespace and "/" not in namespace:
            payload["project"] = namespace

        data = await self._request(
            "POST", path, json={k: v for k, v in payload.items() if v is not None}
        )
        raw_statements = data.get("statements") or data.get("results") or []
        statements = [_parse_statement_item(s) for s in raw_statements]

        return RecallResponse(
            recall_id=str(data.get("recallId") or data.get("momentId") or ""),
            prompt_context=data.get("promptContext", ""),
            statements=statements,
            matched_tags=data.get("matchedTags"),
            guard_mode=data.get("guardMode"),
            profile=data.get("profile"),
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
        path = _resolve_endpoint(namespace, "remember")
        exp_str = (
            expires_at.isoformat()
            if isinstance(expires_at, datetime.date | datetime.datetime)
            else expires_at
        )
        effective_type = type or kind
        payload: dict[str, Any] = {
            "title": title,
            "context": context,
            "example": example,
            "tags": tags,
            "subject": subject,
            "type": effective_type,
            "kind": effective_type,
            "status": status,
            "confidence": confidence,
            "scope": scope,
            "metadata": metadata,
            "expires_at": exp_str,
            "raw": raw,
            "sessionId": session_id,
            "async": async_,
        }
        if namespace and "/" not in namespace:
            payload["project"] = namespace

        data = await self._request(
            "POST", path, json={k: v for k, v in payload.items() if v is not None}
        )

        if data.get("accepted"):
            return RememberResponse(
                accepted=True,
                job_id=data.get("jobId"),
                status=data.get("status"),
                created=[],
                note=data.get("note", "Job accepted for background execution."),
            )

        raw_created = data.get("created") or []
        created = [_parse_statement_item(s) for s in raw_created]

        return RememberResponse(
            created=created,
            reinforced=data.get("reinforced"),
            superseded=data.get("superseded"),
            note=data.get("note"),
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
        path = _resolve_endpoint(namespace, "report")
        req_payload: dict[str, Any] = {
            "action_taken": action_taken,
            "outcome": outcome,
            "subject": subject,
            "reason": reason,
            "external_ref": external_ref,
            "payload": payload,
            "recall_id": recall_id,
            "statement_id": statement_id,
            "auto_distill": auto_distill,
            "async": async_,
        }
        if namespace and "/" not in namespace:
            req_payload["project"] = namespace

        data = await self._request(
            "POST", path, json={k: v for k, v in req_payload.items() if v is not None}
        )

        if data.get("accepted"):
            return ReportResponse(
                outcome=outcome,
                accepted=True,
                job_id=data.get("jobId"),
                status=data.get("status"),
                attributed=[],
                note=data.get("note", "Report accepted for background execution."),
            )

        distilled = None
        if data.get("distilledStatement"):
            distilled = _parse_statement_item(data["distilledStatement"])

        return ReportResponse(
            outcome=data.get("outcome", outcome),
            attributed=data.get("attributed") or [],
            distilled_statement=distilled,
            note=data.get("note"),
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
        path = _resolve_endpoint(namespace, "feedback")
        req_payload: dict[str, Any] = {
            "statement_id": statement_id,
            "recall_id": recall_id,
            "outcome": outcome,
            "reason": reason,
            "external_ref": external_ref,
            "payload": payload,
        }
        if namespace and "/" not in namespace:
            req_payload["project"] = namespace

        data = await self._request(
            "POST", path, json={k: v for k, v in req_payload.items() if v is not None}
        )
        return FeedbackResponse(
            outcome=data.get("outcome", outcome),
            attributed=data.get("attributed") or [],
        )

    async def wait_for_job(
        self,
        job_id: str,
        timeout_ms: int = 15000,
        poll_interval_ms: int = 250,
        on_progress: Callable[[JobEvent], None] | None = None,
    ) -> JobEvent:
        start_time = time.time()
        timeout_sec = timeout_ms / 1000.0
        poll_sec = poll_interval_ms / 1000.0

        try:
            auth_header = await self.auth_manager.get_authorization_header_async(self._http)
            headers = {"Accept": "text/event-stream"}
            if auth_header:
                headers["Authorization"] = auth_header

            async with self._http.stream(
                "GET", f"{self.base_url}/api/v1/jobs/{job_id}/stream", headers=headers
            ) as resp:
                if resp.is_success:
                    async for line in resp.aiter_lines():
                        if time.time() - start_time > timeout_sec:
                            raise MemCellError(f"Job {job_id} timed out after {timeout_ms}ms.")
                        if line.startswith("data:"):
                            json_str = line[len("data:") :].strip()
                            event_data = json.loads(json_str)
                            event = JobEvent(**event_data)
                            if on_progress:
                                on_progress(event)
                            if event.step == "completed":
                                return event
                            if event.step == "failed":
                                raise MemCellError(event.message or f"Job {job_id} failed.")
        except MemCellError:
            raise
        except Exception:
            pass

        while time.time() - start_time <= timeout_sec:
            try:
                res = await self._request("GET", f"/api/v1/jobs/{job_id}")
                job = res.get("job")
                if job:
                    event = JobEvent(
                        step=job.get("step"),
                        progress=int(job.get("progress", 0)),
                        message=job.get("message"),
                        metadata=job.get("result"),
                    )
                    if on_progress:
                        on_progress(event)
                    if event.step == "completed":
                        return event
                    if event.step == "failed":
                        raise MemCellError(event.message or f"Job {job_id} failed.")
            except Exception:
                pass

            await asyncio.sleep(poll_sec)

        raise MemCellError(f"Job {job_id} timed out after {timeout_ms}ms.")
