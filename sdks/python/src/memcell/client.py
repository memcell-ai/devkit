from __future__ import annotations

import asyncio
import base64
import datetime
import json
import os
import random
import time
from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING, Any

import httpx

from .audit import AsyncOrganizationAuditNamespace, OrganizationAuditNamespace
from .auth import AuthManager
from .exceptions import MemCellError, PlanLimitError, RateLimitError
from .fleet import AsyncOrganizationFleetNamespace, OrganizationFleetNamespace
from .insights import AsyncOrganizationInsightsNamespace, OrganizationInsightsNamespace
from .invitations import AsyncInvitationsNamespace, InvitationsNamespace
from .models import (
    AccountProfile,
    AdoptedTarget,
    AdoptMemoryResponse,
    AgentItem,
    ApiKeyItem,
    CollaboratorItem,
    ConsolidateSweepResponse,
    CreateAgentKeyResult,
    CreatedApiKeyResult,
    DeleteMemoryResponse,
    DocumentChunkItem,
    DocumentChunkSearchResult,
    DocumentDetailResponse,
    DocumentItem,
    DocumentSearchResponse,
    FeedbackResponse,
    IngestDocumentResponse,
    JobEvent,
    ListCollaboratorsResponse,
    MemoryHistoryItem,
    MemoryHistoryResponse,
    MemoryItem,
    MemoryPromotionRequest,
    MemoryRelationItem,
    MemoryRelationsResponse,
    MemoryStarResponse,
    MemoryType,
    OrganizationItem,
    OrganizationSSOResult,
    OrgInvitationItem,
    OrgMemberItem,
    OutcomeVerdict,
    OwnerUsage,
    PaginatedResult,
    PaginationMetadata,
    PendingInvitationItem,
    PromoteMemoryResponse,
    RecallResponse,
    RememberResponse,
    ReportResponse,
    ScopeItem,
    SSODomainLookupResult,
    SSOProviderSummary,
    SSOVerificationToken,
    ThreadActionItem,
    ThreadDetailResponse,
    ThreadItem,
    ThreadMilestoneItem,
    ThreadScope,
    ThreadStatus,
    ThreadTurnItem,
    WorkspaceActivityItem,
    WorkspaceItem,
    WorkspaceOwner,
)
from .operator import AsyncOperatorNamespace, OperatorNamespace
from .sources import AsyncWorkspaceSourcesNamespace, WorkspaceSourcesNamespace
from .teams import AsyncOrganizationTeamsNamespace, OrganizationTeamsNamespace
from .webhooks import AsyncWorkspaceWebhooksNamespace, WorkspaceWebhooksNamespace

if TYPE_CHECKING:
    from .organization import AsyncOrganizationMemCell, OrganizationMemCell
    from .scoped import AsyncScopedMemCell, ScopedMemCell


def _parse_namespace(namespace: str) -> tuple[str, str]:
    if "/" not in namespace:
        raise ValueError(
            f'Invalid namespace "{namespace}". Expected format "owner/workspace" (e.g. "acme/backend").'
        )
    owner, workspace = namespace.split("/", 1)
    return owner.strip(), workspace.strip()


def _resolve_endpoint(
    namespace: str | None,
    action: str,
) -> str:
    if namespace and "/" in namespace:
        owner, workspace = _parse_namespace(namespace)
        return f"/api/v1/{owner}/{workspace}/{action}"
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


def _normalize_memory_type(val: Any) -> MemoryType:
    if not val:
        return "instruction"
    s = str(val).lower()
    if s in ("instruction", "decision", "fact", "preference"):
        return s  # type: ignore
    if s == "observation":
        return "fact"
    return "instruction"


def _parse_memory_relation_item(data: dict[str, Any]) -> MemoryRelationItem:
    source_mem = data.get("sourceMemory")
    target_mem = data.get("targetMemory")
    return MemoryRelationItem(
        id=str(data.get("id") or ""),
        workspace_id=str(data.get("workspaceId") or data.get("workspace_id") or ""),
        source_id=str(data.get("sourceId") or data.get("source_id") or ""),
        target_id=str(data.get("targetId") or data.get("target_id") or ""),
        relation_type=data.get("relationType") or data.get("relation_type") or "relates_to",
        confidence=float(data.get("confidence", 0.9)),
        metadata=data.get("metadata") or {},
        created_at=data.get("createdAt") or data.get("created_at"),
        updated_at=data.get("updatedAt") or data.get("updated_at"),
        source_memory=_parse_memory_item(source_mem) if source_mem else None,
        target_memory=_parse_memory_item(target_mem) if target_mem else None,
    )


def _parse_memory_item(data: dict[str, Any]) -> MemoryItem:
    tags = data.get("tags") or []
    entities = data.get("entities") or []
    resources = data.get("resources") or []
    applies_at = data.get("appliesAt") or data.get("applies_at") or []
    raw_type = data.get("type") or "instruction"
    mem_type = _normalize_memory_type(raw_type)
    status = data.get("status", "active")
    enforce = bool(data.get("enforce", False))

    raw_relations = data.get("relations")
    relations = [_parse_memory_relation_item(r) for r in raw_relations] if raw_relations else None

    return MemoryItem(
        id=str(data.get("id") or data.get("memoryId") or ""),
        root_id=data.get("rootId") or data.get("root_id"),
        version=int(data.get("version", 1)) if data.get("version") is not None else 1,
        title=data.get("title", ""),
        content=data.get("content"),
        context=data.get("context"),
        observation=data.get("observation"),
        tags=tags,
        entities=entities,
        resources=resources,
        applies_at=applies_at,
        subject=data.get("subject"),
        type=mem_type,
        enforce=enforce,
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
        scope=data.get("scope", "workspace"),
        required_roles=data.get("requiredRoles") or data.get("required_roles") or [],
        scope_promoted_at=data.get("scopePromotedAt") or data.get("scope_promoted_at"),
        scope_promoted_by=data.get("scopePromotedBy") or data.get("scope_promoted_by"),
        source_thread_id=data.get("sourceThreadId") or data.get("source_thread_id"),
        source_document_id=data.get("sourceDocumentId") or data.get("source_document_id"),
        metadata=data.get("metadata") or {},
        author=data.get("author"),
        source=data.get("source"),
        relations=relations,
        expires_at=data.get("expiresAt") or data.get("expires_at"),
        created_at=data.get("createdAt") or data.get("created_at"),
        updated_at=data.get("updatedAt") or data.get("updated_at"),
    )


def _parse_promotion_request(data: dict[str, Any]) -> MemoryPromotionRequest:
    mem_data = data.get("memory")
    mem = _parse_memory_item(mem_data) if mem_data else None
    return MemoryPromotionRequest(
        id=str(data.get("id") or ""),
        memory_id=str(data.get("memoryId") or data.get("memory_id") or ""),
        from_scope=str(data.get("fromScope") or data.get("from_scope") or "user"),
        to_scope=str(data.get("toScope") or data.get("to_scope") or "workspace"),
        status=data.get("status", "pending"),
        requester_id=data.get("requesterId") or data.get("requester_id") or data.get("requestedBy"),
        requester_reason=data.get("requesterReason")
        or data.get("requester_reason")
        or data.get("reason"),
        reviewer_id=data.get("reviewerId") or data.get("reviewer_id") or data.get("reviewedBy"),
        review_reason=data.get("reviewReason")
        or data.get("review_reason")
        or data.get("reviewComment"),
        reviewed_at=data.get("reviewedAt") or data.get("reviewed_at"),
        memory=mem,
        created_at=data.get("createdAt") or data.get("created_at"),
        updated_at=data.get("updatedAt") or data.get("updated_at"),
    )


def _parse_delete_memory_response(data: dict[str, Any]) -> DeleteMemoryResponse:
    return DeleteMemoryResponse(
        status=data.get("status", "deleted"),
        deleted_count=int(data.get("deletedCount") or data.get("deleted_count") or 1),
        deleted_scope=data.get("deletedScope") or data.get("deleted_scope") or "memory",
        next_id=data.get("nextId") or data.get("next_id"),
        restored_version=data.get("restoredVersion") or data.get("restored_version"),
        message=data.get("message"),
    )


def _parse_workspace_item(data: dict[str, Any]) -> WorkspaceItem:
    owner_data = data.get("owner")
    owner = WorkspaceOwner(**owner_data) if owner_data else None
    return WorkspaceItem(
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
        workspace_id=str(data.get("workspaceId") or data.get("workspace_id") or ""),
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


def _parse_thread_action_item(data: dict[str, Any]) -> ThreadActionItem:
    raw_type = str(data.get("type") or "tool_call")
    action_type: Any = (
        raw_type if raw_type in ("tool_call", "file_touch", "command", "milestone") else "tool_call"
    )
    return ThreadActionItem(
        type=action_type,
        category=data.get("category"),
        name=str(data.get("name") or ""),
        tool=data.get("tool"),
        target=data.get("target"),
        summary=str(data.get("summary") or ""),
        input_summary=data.get("inputSummary") or data.get("input_summary"),
        output_summary=data.get("outputSummary") or data.get("output_summary"),
        outcome=data.get("outcome"),
        status=data.get("status"),
    )


def _parse_thread_turn_item(data: dict[str, Any]) -> ThreadTurnItem:
    raw_actions = data.get("actions") or []
    return ThreadTurnItem(
        id=str(data.get("id") or ""),
        thread_id=str(data.get("threadId") or data.get("thread_id") or ""),
        workspace_id=str(data.get("workspaceId") or data.get("workspace_id") or ""),
        turn_index=int(data.get("turnIndex") or data.get("turn_index") or 1),
        summary=str(data.get("summary") or ""),
        user_intent=data.get("userIntent") or data.get("user_intent"),
        agent_outcome=data.get("agentOutcome") or data.get("agent_outcome"),
        actions=[_parse_thread_action_item(a) if isinstance(a, dict) else a for a in raw_actions],
        decisions=list(data.get("decisions") or []),
        resources=list(data.get("resources") or []),
        extracted_memory_ids=list(
            data.get("extractedMemoryIds") or data.get("extracted_memory_ids") or []
        ),
        created_at=data.get("createdAt") or data.get("created_at"),
    )


def _parse_thread_item(data: dict[str, Any]) -> ThreadItem:
    raw_milestones = data.get("milestones") or []
    milestones = [
        ThreadMilestoneItem(
            phase=m.get("phase"),
            title=m.get("title"),
            summary=str(m.get("summary") or ""),
            timestamp=m.get("timestamp"),
        )
        if isinstance(m, dict)
        else m
        for m in raw_milestones
    ]
    raw_turns = data.get("turns") or []
    raw_status = str(data.get("status") or "active")
    status: ThreadStatus = (
        raw_status if raw_status in ("active", "paused", "completed") else "active"  # type: ignore[assignment]
    )
    raw_scope = str(data.get("scope") or "user")
    scope: ThreadScope = raw_scope if raw_scope in ("user", "workspace") else "user"  # type: ignore[assignment]
    return ThreadItem(
        id=str(data.get("id") or ""),
        workspace_id=str(data.get("workspaceId") or data.get("workspace_id") or ""),
        user_id=data.get("userId") or data.get("user_id"),
        agent_id=data.get("agentId") or data.get("agent_id"),
        external_session_id=data.get("externalSessionId") or data.get("external_session_id"),
        title=str(data.get("title") or ""),
        status=status,
        scope=scope,
        summary=str(data.get("summary") or ""),
        current_objective=data.get("currentObjective") or data.get("current_objective"),
        decisions=list(data.get("decisions") or []),
        next_steps=list(data.get("nextSteps") or data.get("next_steps") or []),
        entities=list(data.get("entities") or []),
        milestones=milestones,
        resources=list(data.get("resources") or []),
        turns=[_parse_thread_turn_item(t) if isinstance(t, dict) else t for t in raw_turns],
        turn_count=int(data.get("turnCount") or data.get("turn_count") or 1),
        last_active_at=data.get("lastActiveAt") or data.get("last_active_at"),
        created_at=data.get("createdAt") or data.get("created_at"),
        updated_at=data.get("updatedAt") or data.get("updated_at"),
    )


def _parse_document_item(data: dict[str, Any]) -> DocumentItem:
    source_uri = (
        data.get("sourceUri")
        or data.get("source_uri")
        or data.get("sourcePath")
        or data.get("source_path")
        or data.get("path")
    )
    content_type = str(
        data.get("contentType")
        or data.get("content_type")
        or data.get("sourceType")
        or data.get("source_type")
        or "markdown"
    )
    content_str = data.get("content") if isinstance(data.get("content"), str) else ""
    raw_size = (
        data.get("sizeBytes") if data.get("sizeBytes") is not None else data.get("size_bytes")
    )
    size_bytes = int(raw_size) if raw_size is not None else len(content_str)
    return DocumentItem(
        id=str(data.get("id") or ""),
        workspace_id=str(data.get("workspaceId") or data.get("workspace_id") or ""),
        title=str(data.get("title") or ""),
        path=source_uri,
        source_path=source_uri,
        source_uri=source_uri,
        source_type=str(data.get("sourceType") or data.get("source_type") or content_type),
        content_type=content_type,
        content_hash=str(data.get("contentHash") or data.get("content_hash") or ""),
        summary=data.get("summary"),
        status=data.get("status"),
        chunk_count=int(data.get("chunkCount") or data.get("chunk_count") or 0),
        size_bytes=size_bytes,
        metadata=data.get("metadata") or {},
        created_at=data.get("createdAt") or data.get("created_at"),
        updated_at=data.get("updatedAt") or data.get("updated_at"),
    )


def _parse_document_chunk_item(data: dict[str, Any]) -> DocumentChunkItem:
    return DocumentChunkItem(
        id=str(data.get("id") or ""),
        document_id=str(data.get("documentId") or data.get("document_id") or ""),
        chunk_index=int(data.get("chunkIndex") or data.get("chunk_index") or 0),
        heading=data.get("heading"),
        content=str(data.get("content") or ""),
        token_count=int(data.get("tokenCount") or data.get("token_count") or 0),
        created_at=data.get("createdAt") or data.get("created_at"),
    )


def _parse_document_chunk_search_result(data: dict[str, Any]) -> DocumentChunkSearchResult:
    source_uri = (
        data.get("sourceUri")
        or data.get("source_uri")
        or data.get("sourcePath")
        or data.get("source_path")
        or data.get("path")
    )
    return DocumentChunkSearchResult(
        id=str(data.get("id") or ""),
        document_id=str(data.get("documentId") or data.get("document_id") or ""),
        document_title=str(data.get("documentTitle") or data.get("document_title") or ""),
        path=source_uri,
        source_path=source_uri,
        source_uri=source_uri,
        chunk_index=int(data.get("chunkIndex") or data.get("chunk_index") or 0),
        heading=data.get("heading"),
        content=str(data.get("content") or ""),
        score=float(data.get("score") or 0.0),
    )


def _parse_ingest_document_response(data: dict[str, Any]) -> IngestDocumentResponse:
    doc = _parse_document_item(data.get("document") or {})
    chunk_count = int(
        data.get("chunkCount")
        if data.get("chunkCount") is not None
        else data.get("chunksCreated")
        if data.get("chunksCreated") is not None
        else doc.chunk_count
    )
    deduplicated = bool(
        data.get("deduplicated")
        if data.get("deduplicated") is not None
        else data.get("unchanged", False)
    )
    raw_distilled = data.get("distilled")
    distilled_payload: dict[str, Any] | None = None
    created_len = 0
    if isinstance(raw_distilled, dict):
        created_items = [_parse_memory_item(m) for m in (raw_distilled.get("created") or [])]
        evolved_items = [_parse_memory_item(m) for m in (raw_distilled.get("evolved") or [])]
        created_len = len(created_items)
        distilled_payload = {
            "created": created_items,
            "reinforced": raw_distilled.get("reinforced") or [],
            "evolved": evolved_items,
        }
    distilled_count = int(
        data.get("distilledMemoriesCount")
        if data.get("distilledMemoriesCount") is not None
        else data.get("memoriesCreated")
        if data.get("memoriesCreated") is not None
        else created_len
    )
    return IngestDocumentResponse(
        document=doc,
        chunk_count=chunk_count,
        chunks_created=chunk_count,
        deduplicated=deduplicated,
        unchanged=deduplicated,
        distilled=distilled_payload,
        distilled_memories_count=distilled_count,
        memories_created=distilled_count,
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
    return OwnerUsage.model_validate(data)


# ══════════════════════════════════════════════════════════════════════════════
# SYNC NAMESPACES
# ══════════════════════════════════════════════════════════════════════════════


class _MemoriesNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client
        self.relations = _MemoryRelationsNamespaceSync(client)

    def list(
        self,
        namespace: str,
        page: int | None = None,
        per_page: int | None = None,
        type: str | None = None,
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
    ) -> PaginatedResult[MemoryItem]:
        owner, workspace = _parse_namespace(namespace)
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "type": type,
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
        resp = self._client._request("GET", f"/api/v1/{owner}/{workspace}/memories", params=params)
        raw_items = resp.get("memories") or []
        items = [_parse_memory_item(s) for s in raw_items]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)

    def get(self, namespace: str, memory_id: str) -> MemoryItem:
        owner, workspace = _parse_namespace(namespace)
        resp = self._client._request("GET", f"/api/v1/{owner}/{workspace}/memories/{memory_id}")
        return _parse_memory_item(resp.get("memory") or {})

    def create(
        self,
        namespace: str,
        title: str,
        content: str | None = None,
        context: str | None = None,
        observation: str | None = None,
        source: str | None = None,
        tags: list[str] | None = None,
        entities: list[str] | None = None,
        resources: list[str] | None = None,
        applies_at: list[str] | None = None,
        confidence: float | None = None,
        subject: str | None = None,
        type: str | None = None,
        enforce: bool = False,
        status: str | None = None,
        is_pinned: bool | None = None,
        expires_at: Any | None = None,
        scope: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> MemoryItem:
        owner, workspace = _parse_namespace(namespace)
        exp_str = (
            expires_at.isoformat()
            if isinstance(expires_at, datetime.date | datetime.datetime)
            else expires_at
        )
        payload: dict[str, Any] = {
            "title": title,
            "content": content,
            "context": context,
            "observation": observation,
            "source": source,
            "tags": tags,
            "entities": entities,
            "resources": resources,
            "appliesAt": applies_at,
            "confidence": confidence,
            "subject": subject,
            "type": type,
            "enforce": enforce,
            "status": status,
            "isPinned": is_pinned,
            "expiresAt": exp_str,
            "scope": scope,
            "metadata": metadata,
        }
        resp = self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/memories",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_memory_item(resp.get("memory") or {})

    def update(
        self,
        namespace: str,
        memory_id: str,
        title: str | None = None,
        content: str | None = None,
        context: str | None = None,
        observation: str | None = None,
        tags: list[str] | None = None,
        entities: list[str] | None = None,
        resources: list[str] | None = None,
        applies_at: list[str] | None = None,
        confidence: float | None = None,
        status: str | None = None,
        type: str | None = None,
        enforce: bool | None = None,
        subject: str | None = None,
        is_pinned: bool | None = None,
        scope: str | None = None,
        metadata: dict[str, Any] | None = None,
        reason: str | None = None,
    ) -> MemoryItem:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {
            "title": title,
            "content": content,
            "context": context,
            "observation": observation,
            "tags": tags,
            "entities": entities,
            "resources": resources,
            "appliesAt": applies_at,
            "confidence": confidence,
            "status": status,
            "type": type,
            "enforce": enforce,
            "subject": subject,
            "isPinned": is_pinned,
            "scope": scope,
            "metadata": metadata,
            "reason": reason,
        }
        resp = self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{workspace}/memories/{memory_id}",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_memory_item(resp.get("memory") or {})

    def delete(
        self, namespace: str, memory_id: str, all_versions: bool = False
    ) -> DeleteMemoryResponse:
        owner, workspace = _parse_namespace(namespace)
        query = "?allVersions=true" if all_versions else ""
        resp = self._client._request(
            "DELETE", f"/api/v1/{owner}/{workspace}/memories/{memory_id}{query}"
        )
        return _parse_delete_memory_response(resp)

    def star(self, namespace: str, memory_id: str, starred: bool = True) -> MemoryStarResponse:
        owner, workspace = _parse_namespace(namespace)
        method = "PUT" if starred else "DELETE"
        resp = self._client._request(
            method, f"/api/v1/{owner}/{workspace}/memories/{memory_id}/star"
        )
        return MemoryStarResponse(
            root_id=resp.get("rootId", ""),
            starred=bool(resp.get("starred", starred)),
            star_count=int(resp.get("starCount", 0)),
        )

    def history(self, namespace: str, memory_id: str) -> MemoryHistoryResponse:
        owner, workspace = _parse_namespace(namespace)
        resp = self._client._request(
            "GET", f"/api/v1/{owner}/{workspace}/memories/{memory_id}/history"
        )
        hist = [
            MemoryHistoryItem(
                id=h.get("id", ""),
                root_id=h.get("rootId", ""),
                version=h.get("version", 1),
                title=h.get("title", ""),
                content=h.get("content"),
                context=h.get("context"),
                observation=h.get("observation"),
                tags=h.get("tags") or [],
                entities=h.get("entities") or [],
                resources=h.get("resources") or [],
                applies_at=h.get("appliesAt") or h.get("applies_at") or [],
                confidence=float(h.get("confidence", 0.5)),
                status=h.get("status", "active"),
                type=h.get("type", "instruction"),
                enforce=bool(h.get("enforce", False)),
                subject=h.get("subject"),
                scope=h.get("scope", "workspace"),
                author_type=h.get("authorType", "user"),
                author_id=h.get("authorId"),
                author_name=h.get("authorName"),
                mutation_type=h.get("mutationType"),
                change_reason=h.get("changeReason"),
                created_at=h.get("createdAt"),
            )
            for h in resp.get("history", [])
        ]
        return MemoryHistoryResponse(
            root_id=resp.get("rootId", ""),
            total_versions=int(resp.get("totalVersions", len(hist))),
            history=hist,
        )

    def adopt(
        self,
        namespace: str,
        memory_id: str,
        target_workspace_ids: list[str] | None = None,
    ) -> AdoptMemoryResponse:
        owner, workspace = _parse_namespace(namespace)
        targets = target_workspace_ids or []
        resp = self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/memories/{memory_id}/adopt",
            json={"targetWorkspaceIds": targets},
        )
        adopted = [
            AdoptedTarget(
                workspace_id=a.get("workspaceId"),
                memory_id=a.get("memoryId") or "",
                already_existed=bool(a.get("alreadyExisted")),
            )
            for a in resp.get("adopted", [])
        ]
        return AdoptMemoryResponse(
            ok=bool(resp.get("ok", True)),
            source_memory_id=resp.get("sourceMemoryId") or memory_id,
            adopted=adopted,
        )

    def promote(
        self,
        namespace: str,
        memory_id: str,
        to_scope: str = "workspace",
        reason: str | None = None,
    ) -> PromoteMemoryResponse:
        owner, workspace = _parse_namespace(namespace)
        body: dict[str, Any] = {"toScope": to_scope}
        if reason:
            body["reason"] = reason
        resp = self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/memories/{memory_id}/promote",
            json=body,
        )
        mem_data = resp.get("memory")
        promo_data = resp.get("promotionRequest") or resp.get("promotion_request")
        return PromoteMemoryResponse(
            promoted=bool(resp.get("promoted", True)),
            memory=_parse_memory_item(mem_data) if mem_data else None,
            promotion_request=_parse_promotion_request(promo_data) if promo_data else None,
        )

    def list_relations(self, namespace: str, memory_id: str) -> MemoryRelationsResponse:
        return self.relations.list(namespace, memory_id)

    def create_relation(
        self,
        namespace: str,
        memory_id: str,
        target_id: str,
        relation_type: str,
        confidence: float = 0.9,
        metadata: dict[str, Any] | None = None,
    ) -> MemoryRelationItem:
        return self.relations.create(
            namespace, memory_id, target_id, relation_type, confidence, metadata
        )

    def delete_relation(self, namespace: str, memory_id: str, relation_id: str) -> None:
        return self.relations.delete(namespace, memory_id, relation_id)

    def list_workspace_relations(
        self,
        namespace: str,
        page: int | None = None,
        per_page: int | None = None,
        relation_type: str | None = None,
    ) -> PaginatedResult[MemoryRelationItem]:
        return self.relations.list_workspace(namespace, page, per_page, relation_type)


class _MemoryRelationsNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client

    def list(self, namespace: str, memory_id: str) -> MemoryRelationsResponse:
        owner, workspace = _parse_namespace(namespace)
        resp = self._client._request(
            "GET", f"/api/v1/{owner}/{workspace}/memories/{memory_id}/relations"
        )
        return MemoryRelationsResponse(
            incoming=[_parse_memory_relation_item(r) for r in resp.get("incoming", [])],
            outgoing=[_parse_memory_relation_item(r) for r in resp.get("outgoing", [])],
        )

    def relate(
        self,
        namespace: str,
        source_id: str | None = None,
        target_id: str | None = None,
        relation_type: str | None = None,
        confidence: float = 0.9,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        src = source_id or kwargs.get("sourceId") or ""
        tgt = target_id or kwargs.get("targetId") or ""
        rel = relation_type or kwargs.get("type") or "limits"
        conf = confidence if confidence is not None else kwargs.get("confidence", 0.9)
        meta = metadata or kwargs.get("metadata")
        relation = self.create(namespace, src, tgt, rel, confidence=conf, metadata=meta)
        return {"ok": True, "relation": relation}

    def create(
        self,
        namespace: str,
        memory_id: str,
        target_id: str,
        relation_type: str,
        confidence: float = 0.9,
        metadata: dict[str, Any] | None = None,
    ) -> MemoryRelationItem:
        owner, workspace = _parse_namespace(namespace)
        payload = {
            "targetId": target_id,
            "relationType": relation_type,
            "confidence": confidence,
            "metadata": metadata or {},
        }
        resp = self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/memories/{memory_id}/relations",
            json=payload,
        )
        return _parse_memory_relation_item(resp.get("relation", {}))

    def delete(self, namespace: str, memory_id: str, relation_id: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        self._client._request(
            "DELETE",
            f"/api/v1/{owner}/{workspace}/memories/{memory_id}/relations/{relation_id}",
        )

    def list_workspace(
        self,
        namespace: str,
        page: int | None = None,
        per_page: int | None = None,
        relation_type: str | None = None,
    ) -> PaginatedResult[MemoryRelationItem]:
        owner, workspace = _parse_namespace(namespace)
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "relation_type": relation_type,
            }
        )
        resp = self._client._request("GET", f"/api/v1/{owner}/{workspace}/relations", params=params)
        raw_items = resp.get("relations") or []
        items = [_parse_memory_relation_item(r) for r in raw_items]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)


class _WorkspacesNamespaceSync:
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
    ) -> PaginatedResult[WorkspaceItem]:
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
        resp = self._client._request("GET", "/api/v1/workspaces", params=params)
        raw_workspaces = resp.get("workspaces") or []
        items = [_parse_workspace_item(p) for p in raw_workspaces]
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
    ) -> PaginatedResult[WorkspaceItem]:
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
        resp = self._client._request("GET", f"/api/v1/{owner}/workspaces", params=params)
        raw_workspaces = resp.get("workspaces") or []
        items = [_parse_workspace_item(p) for p in raw_workspaces]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)

    def get(self, namespace: str) -> WorkspaceItem:
        owner, workspace = _parse_namespace(namespace)
        resp = self._client._request("GET", f"/api/v1/{owner}/{workspace}")
        return _parse_workspace_item(resp.get("workspace") or resp.get("project") or {})

    def create(
        self,
        name: str,
        slug: str | None = None,
        description: str | None = None,
        website: str | None = None,
        visibility: str = "private",
        owner: str | None = None,
    ) -> WorkspaceItem:
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
            "/api/v1/workspaces",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_workspace_item(resp.get("workspace") or {})

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
    ) -> WorkspaceItem:
        owner, workspace = _parse_namespace(namespace)
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
            f"/api/v1/{owner}/{workspace}",
            json={k: v for k, v in payload.items() if v is not None},
        )
        raw = resp.get("workspace") or resp.get("project")
        if not raw and resp.get("ok"):
            target_slug = resp.get("workspaceSlug") or resp.get("projectSlug") or workspace
            target_owner = resp.get("ownerSlug") or owner
            try:
                return self.get(f"{target_owner}/{target_slug}")
            except Exception:
                pass
        return _parse_workspace_item(raw or {})

    def delete(self, namespace: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        self._client._request("DELETE", f"/api/v1/{owner}/{workspace}")

    def transfer(
        self,
        namespace: str,
        target_owner: str,
        target_slug: str | None = None,
    ) -> None:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {"targetOwner": target_owner}
        if target_slug:
            payload["targetSlug"] = target_slug
        self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/transfer",
            json=payload,
        )

    def copy(
        self,
        namespace: str,
        target_owner: str | None = None,
        target_slug: str | None = None,
        name: str | None = None,
        description: str | None = None,
        visibility: str | None = None,
        include_threads: bool = False,
        include_documents: bool = False,
    ) -> dict[str, Any]:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {
            "targetOwner": target_owner,
            "targetSlug": target_slug,
            "name": name,
            "description": description,
            "visibility": visibility,
            "includeThreads": include_threads,
            "includeDocuments": include_documents,
        }
        return self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/copy",
            json={k: v for k, v in payload.items() if v is not None},
        )

    def activity(
        self,
        namespace: str,
        page: int = 1,
        per_page: int = 25,
        outcome: str | None = None,
        subject: str | None = None,
        memory_id: str | None = None,
    ) -> PaginatedResult[WorkspaceActivityItem]:
        owner, workspace = _parse_namespace(namespace)
        params: dict[str, Any] = {"page": page, "per_page": per_page}
        if outcome:
            params["outcome"] = outcome
        if subject:
            params["subject"] = subject
        if memory_id:
            params["memory_id"] = memory_id
        data = self._client._request("GET", f"/api/v1/{owner}/{workspace}/activity", params=params)
        raw_items = data.get("items") or []
        items = [WorkspaceActivityItem(**i) for i in raw_items]
        return PaginatedResult(
            items=items,
            pagination=PaginationMetadata(
                page=data.get("page", page),
                per_page=data.get("perPage") or data.get("per_page", per_page),
                total=data.get("total", len(items)),
                has_more=data.get("hasMore") or data.get("has_more", False),
            ),
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
        owner, workspace = _parse_namespace(namespace)
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
        resp = self._client._request("GET", f"/api/v1/{owner}/{workspace}/agents", params=params)
        raw_items = resp.get("agents") or []
        items = [_parse_agent_item(a) for a in raw_items]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)

    def get(self, namespace: str, agent_id: str) -> AgentItem:
        owner, workspace = _parse_namespace(namespace)
        resp = self._client._request("GET", f"/api/v1/{owner}/{workspace}/agents/{agent_id}")
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
        owner, workspace = _parse_namespace(namespace)
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
            f"/api/v1/{owner}/{workspace}/agents",
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
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {
            "name": name,
            "model": model,
            "description": description,
            "status": status,
            "metadata": metadata,
        }
        resp = self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{workspace}/agents/{agent_id}",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_agent_item(resp.get("agent", {}))

    def delete(self, namespace: str, agent_id: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        self._client._request("DELETE", f"/api/v1/{owner}/{workspace}/agents/{agent_id}")

    def create_key(self, namespace: str, agent_id: str) -> CreateAgentKeyResult:
        owner, workspace = _parse_namespace(namespace)
        resp = self._client._request("POST", f"/api/v1/{owner}/{workspace}/agents/{agent_id}/keys")
        key_data = resp.get("key")
        if isinstance(key_data, dict):
            return CreateAgentKeyResult(**key_data)
        return CreateAgentKeyResult(
            id=resp.get("keyId") or resp.get("id") or "",
            key=resp.get("key") if isinstance(resp.get("key"), str) else "",
            preview=resp.get("keyPrefix") or resp.get("preview") or "",
        )

    def revoke_key(self, namespace: str, agent_id: str, key_id: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        self._client._request(
            "DELETE", f"/api/v1/{owner}/{workspace}/agents/{agent_id}/keys/{key_id}"
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
        owner, workspace = _parse_namespace(namespace)
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
            "GET", f"/api/v1/{owner}/{workspace}/collaborators", params=params
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
        owner, workspace = _parse_namespace(namespace)
        resp = self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/collaborators",
            json={"identifier": identifier, "role": role},
        )
        return _parse_pending_invitation(resp.get("invitation", {}))

    def update_role(self, namespace: str, user_id: str, role: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{workspace}/collaborators/{user_id}",
            json={"role": role},
        )

    def remove(self, namespace: str, user_id: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        self._client._request("DELETE", f"/api/v1/{owner}/{workspace}/collaborators/{user_id}")

    def revoke_invitation(self, namespace: str, invitation_id: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        self._client._request(
            "DELETE", f"/api/v1/{owner}/{workspace}/collaborators/invitations/{invitation_id}"
        )


class _OrganizationsNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client
        self.sso = _OrganizationSsoNamespaceSync(client)
        self.fleet = OrganizationFleetNamespace(client)
        self.audit = OrganizationAuditNamespace(client)
        self.insights = OrganizationInsightsNamespace(client)
        self.teams = OrganizationTeamsNamespace(client)

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
                workspace_count=o.get("workspaceCount"),
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
            workspace_count=org.get("workspaceCount"),
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


def _parse_sso_provider(data: dict[str, Any]) -> SSOProviderSummary:
    return SSOProviderSummary(
        id=str(data.get("id", "")),
        provider_id=str(data.get("providerId", "")),
        issuer=str(data.get("issuer", "")),
        domain=str(data.get("domain", "")),
        protocol=str(data.get("protocol", "saml")),
        domain_verified=bool(data.get("domainVerified", False)),
        organization_id=data.get("organizationId"),
        created_at=data.get("createdAt"),
        updated_at=data.get("updatedAt"),
    )


class _OrganizationSsoNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client

    def get(self, org_slug: str) -> OrganizationSSOResult:
        resp = self._client._request("GET", f"/api/v1/organizations/{org_slug}/sso")
        providers = [_parse_sso_provider(p) for p in (resp.get("providers") or [])]
        return OrganizationSSOResult(
            ok=resp.get("ok", True),
            providers=providers,
            sso_enforced=bool(resp.get("ssoEnforced", False)),
        )

    def configure(
        self,
        org_slug: str,
        domain: str,
        issuer: str,
        protocol: str = "saml",
        saml_config: dict[str, Any] | None = None,
        oidc_config: dict[str, Any] | None = None,
        provider_id: str | None = None,
    ) -> SSOProviderSummary:
        body: dict[str, Any] = {
            "domain": domain,
            "issuer": issuer,
            "protocol": protocol,
        }
        if provider_id:
            body["providerId"] = provider_id
        if saml_config:
            body["samlConfig"] = saml_config
        if oidc_config:
            body["oidcConfig"] = oidc_config
        resp = self._client._request("POST", f"/api/v1/organizations/{org_slug}/sso", json=body)
        return _parse_sso_provider(resp.get("provider", {}))

    def delete(self, org_slug: str, provider_id: str) -> None:
        self._client._request(
            "DELETE",
            f"/api/v1/organizations/{org_slug}/sso",
            params={"providerId": provider_id},
        )

    def get_verification_token(self, org_slug: str, provider_id: str) -> SSOVerificationToken:
        resp = self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/sso/token",
            json={"providerId": provider_id},
        )
        return SSOVerificationToken(
            token=str(resp.get("token", "")),
            dns_record_name=str(resp.get("dnsRecordName", "")),
            dns_record_type=str(resp.get("dnsRecordType", "TXT")),
            domain=str(resp.get("domain", "")),
        )

    def verify_domain(self, org_slug: str, provider_id: str) -> dict[str, Any]:
        return self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/sso/verify-domain",
            json={"providerId": provider_id},
        )

    def set_enforcement(self, org_slug: str, sso_enforced: bool) -> dict[str, Any]:
        return self._client._request(
            "PATCH",
            f"/api/v1/organizations/{org_slug}/sso/enforce",
            json={"ssoEnforced": sso_enforced},
        )

    def lookup(self, domain_or_email: str) -> SSODomainLookupResult:
        is_email = "@" in domain_or_email
        param = "email" if is_email else "domain"
        resp = self._client._request(
            "GET",
            "/api/v1/auth/sso/lookup",
            params={param: domain_or_email},
        )
        return SSODomainLookupResult(
            sso_available=bool(resp.get("ssoAvailable", False)),
            sso_enforced=bool(resp.get("ssoEnforced", False)),
            provider_id=resp.get("providerId"),
            organization_id=resp.get("organizationId"),
            organization_slug=resp.get("organizationSlug"),
            organization_name=resp.get("organizationName"),
        )


class _UsageNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client

    def get(self, owner: str, timeframe: str = "30d") -> OwnerUsage:
        resp = self._client._request(
            "GET", f"/api/v1/{owner}/usage", params={"timeframe": timeframe}
        )
        return _parse_owner_usage(resp)


class _ApiKeysNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client

    def list(self) -> list[ApiKeyItem]:
        resp = self._client._request("GET", "/api/v1/account/api-keys")
        items = resp.get("keys") or resp.get("tokens", [])
        return [
            ApiKeyItem(
                id=t["id"],
                name=t["name"],
                preview=t.get("preview") or t.get("prefix", ""),
                prefix=t.get("prefix"),
                expires_at=t.get("expiresAt") or t.get("expires_at"),
                last_used_at=t.get("lastUsedAt") or t.get("last_used_at") or t.get("lastRequest"),
                created_at=t.get("createdAt") or t.get("created_at"),
            )
            for t in items
        ]

    def create(self, name: str, expires_in_days: int | None = None) -> CreatedApiKeyResult:
        body: dict[str, Any] = {"name": name}
        if expires_in_days is not None:
            body["expiresInDays"] = expires_in_days
        resp = self._client._request("POST", "/api/v1/account/api-keys", json=body)
        raw = resp.get("key") or resp.get("token", {})
        key_val = raw.get("rawKey") or raw.get("rawToken") or raw.get("key") or raw.get("token", "")
        prefix_val = raw.get("prefix") or raw.get("preview", "")
        return CreatedApiKeyResult(
            id=raw["id"],
            name=raw["name"],
            key=key_val,
            token=key_val,
            preview=prefix_val,
            prefix=prefix_val,
            expires_at=raw.get("expiresAt") or raw.get("expires_at"),
            created_at=raw.get("createdAt") or raw.get("created_at"),
        )

    def revoke(self, key_id: str) -> None:
        self._client._request("DELETE", f"/api/v1/account/api-keys/{key_id}")


_TokensNamespaceSync = _ApiKeysNamespaceSync


class _AccountNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client
        self.api_keys = _ApiKeysNamespaceSync(client)
        self.tokens = self.api_keys

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
            owner, workspace = _parse_namespace(namespace)
            path = f"/api/v1/{owner}/{workspace}/scopes"
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


class _SweepNamespaceSync:
    """Sweep & autonomous consolidation APIs (ADR 0075)."""

    def __init__(self, client: MemCell) -> None:
        self._client = client

    def consolidate(
        self,
        namespace: str,
        *,
        min_similarity: float | None = None,
        min_cluster_size: int | None = None,
        max_cluster_size: int | None = None,
    ) -> ConsolidateSweepResponse:
        owner, workspace = _parse_namespace(namespace)
        body: dict[str, Any] = {}
        if min_similarity is not None:
            body["minSimilarity"] = min_similarity
        if min_cluster_size is not None:
            body["minClusterSize"] = min_cluster_size
        if max_cluster_size is not None:
            body["maxClusterSize"] = max_cluster_size

        resp = self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/lifecycle/sweep/consolidate",
            json=body if body else None,
        )
        return ConsolidateSweepResponse.model_validate(resp)


class _PromotionsNamespaceSync:
    """Memory promotion pipeline operations (ADR 0076)."""

    def __init__(self, client: MemCell) -> None:
        self._client = client

    def request(
        self,
        namespace: str,
        memory_id: str | None = None,
        to_scope: str = "workspace",
        reason: str | None = None,
        **kwargs: Any,
    ) -> PromoteMemoryResponse:
        mem_id = memory_id or kwargs.get("memoryId") or ""
        scope = to_scope or kwargs.get("toScope") or "workspace"
        rsn = reason or kwargs.get("reason")
        return self._client.memories.promote(namespace, mem_id, to_scope=scope, reason=rsn)

    def list(
        self,
        namespace: str,
        status: str | None = None,
        memory_id: str | None = None,
        page: int | None = None,
        per_page: int | None = None,
    ) -> PaginatedResult[MemoryPromotionRequest]:
        owner, workspace = _parse_namespace(namespace)
        params = _build_query_params(
            {
                "status": status,
                "memoryId": memory_id,
                "page": page,
                "per_page": per_page,
            }
        )
        resp = self._client._request(
            "GET", f"/api/v1/{owner}/{workspace}/promotions", params=params
        )
        raw_items = resp.get("requests") or resp.get("items") or resp.get("promotionRequests") or []
        items = [_parse_promotion_request(r) for r in raw_items]
        pagination = (
            _parse_pagination(resp.get("pagination", {}))
            if "pagination" in resp
            else PaginationMetadata(
                page=page or 1,
                per_page=per_page or len(items),
                total=int(resp.get("total", len(items))),
                has_more=False,
            )
        )
        return PaginatedResult[MemoryPromotionRequest](
            items=items,
            pagination=pagination,
        )

    def approve(
        self,
        namespace: str,
        promotion_id: str,
        reason: str | None = None,
        review_comment: str | None = None,
    ) -> dict[str, Any]:
        owner, workspace = _parse_namespace(namespace)
        review_reason = reason or review_comment
        body = {"reviewReason": review_reason} if review_reason else None
        resp = self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/promotions/{promotion_id}/approve",
            json=body,
        )
        promotion_req = (
            _parse_promotion_request(resp["promotionRequest"])
            if resp.get("promotionRequest")
            else None
        )
        mem_data = resp.get("memory")
        mem = _parse_memory_item(mem_data) if mem_data else None
        return {
            "approved": bool(resp.get("approved", True)),
            "promotion_request": promotion_req,
            "promotionRequest": promotion_req,
            "memory": mem,
        }

    def reject(
        self,
        namespace: str,
        promotion_id: str,
        reason: str | None = None,
        review_comment: str | None = None,
    ) -> dict[str, Any]:
        owner, workspace = _parse_namespace(namespace)
        review_reason = reason or review_comment
        body = {"reviewReason": review_reason} if review_reason else None
        resp = self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/promotions/{promotion_id}/reject",
            json=body,
        )
        promotion_req = (
            _parse_promotion_request(resp["promotionRequest"])
            if resp.get("promotionRequest")
            else None
        )
        return {
            "rejected": bool(resp.get("rejected", True)),
            "promotion_request": promotion_req,
            "promotionRequest": promotion_req,
        }


# ══════════════════════════════════════════════════════════════════════════════
# ASYNC NAMESPACES
# ══════════════════════════════════════════════════════════════════════════════


class _MemoriesNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client
        self.relations = _MemoryRelationsNamespaceAsync(client)

    async def list(
        self,
        namespace: str,
        page: int | None = None,
        per_page: int | None = None,
        type: str | None = None,
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
    ) -> PaginatedResult[MemoryItem]:
        owner, workspace = _parse_namespace(namespace)
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "type": type,
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
            "GET", f"/api/v1/{owner}/{workspace}/memories", params=params
        )
        raw_items = resp.get("memories") or []
        items = [_parse_memory_item(s) for s in raw_items]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)

    async def get(self, namespace: str, memory_id: str) -> MemoryItem:
        owner, workspace = _parse_namespace(namespace)
        resp = await self._client._request(
            "GET", f"/api/v1/{owner}/{workspace}/memories/{memory_id}"
        )
        return _parse_memory_item(resp.get("memory") or {})

    async def create(
        self,
        namespace: str,
        title: str,
        content: str | None = None,
        context: str | None = None,
        observation: str | None = None,
        source: str | None = None,
        tags: list[str] | None = None,
        entities: list[str] | None = None,
        resources: list[str] | None = None,
        applies_at: list[str] | None = None,
        confidence: float | None = None,
        subject: str | None = None,
        type: str | None = None,
        enforce: bool = False,
        status: str | None = None,
        is_pinned: bool | None = None,
        expires_at: Any | None = None,
        scope: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> MemoryItem:
        owner, workspace = _parse_namespace(namespace)
        exp_str = (
            expires_at.isoformat()
            if isinstance(expires_at, datetime.date | datetime.datetime)
            else expires_at
        )
        payload: dict[str, Any] = {
            "title": title,
            "content": content,
            "context": context,
            "observation": observation,
            "source": source,
            "tags": tags,
            "entities": entities,
            "resources": resources,
            "appliesAt": applies_at,
            "confidence": confidence,
            "subject": subject,
            "type": type,
            "enforce": enforce,
            "status": status,
            "isPinned": is_pinned,
            "expiresAt": exp_str,
            "scope": scope,
            "metadata": metadata,
        }
        resp = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/memories",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_memory_item(resp.get("memory") or {})

    async def update(
        self,
        namespace: str,
        memory_id: str,
        title: str | None = None,
        content: str | None = None,
        context: str | None = None,
        observation: str | None = None,
        tags: list[str] | None = None,
        entities: list[str] | None = None,
        resources: list[str] | None = None,
        applies_at: list[str] | None = None,
        confidence: float | None = None,
        status: str | None = None,
        type: str | None = None,
        enforce: bool | None = None,
        subject: str | None = None,
        is_pinned: bool | None = None,
        scope: str | None = None,
        metadata: dict[str, Any] | None = None,
        reason: str | None = None,
    ) -> MemoryItem:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {
            "title": title,
            "content": content,
            "context": context,
            "observation": observation,
            "tags": tags,
            "entities": entities,
            "resources": resources,
            "appliesAt": applies_at,
            "confidence": confidence,
            "status": status,
            "type": type,
            "enforce": enforce,
            "subject": subject,
            "isPinned": is_pinned,
            "scope": scope,
            "metadata": metadata,
            "reason": reason,
        }
        resp = await self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{workspace}/memories/{memory_id}",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_memory_item(resp.get("memory") or {})

    async def delete(
        self, namespace: str, memory_id: str, all_versions: bool = False
    ) -> DeleteMemoryResponse:
        owner, workspace = _parse_namespace(namespace)
        query = "?allVersions=true" if all_versions else ""
        resp = await self._client._request(
            "DELETE", f"/api/v1/{owner}/{workspace}/memories/{memory_id}{query}"
        )
        return _parse_delete_memory_response(resp)

    async def star(
        self, namespace: str, memory_id: str, starred: bool = True
    ) -> MemoryStarResponse:
        owner, workspace = _parse_namespace(namespace)
        method = "PUT" if starred else "DELETE"
        resp = await self._client._request(
            method, f"/api/v1/{owner}/{workspace}/memories/{memory_id}/star"
        )
        return MemoryStarResponse(
            root_id=resp.get("rootId", ""),
            starred=bool(resp.get("starred", starred)),
            star_count=int(resp.get("starCount", 0)),
        )

    async def history(self, namespace: str, memory_id: str) -> MemoryHistoryResponse:
        owner, workspace = _parse_namespace(namespace)
        resp = await self._client._request(
            "GET", f"/api/v1/{owner}/{workspace}/memories/{memory_id}/history"
        )
        hist = [
            MemoryHistoryItem(
                id=h.get("id", ""),
                root_id=h.get("rootId", ""),
                version=h.get("version", 1),
                title=h.get("title", ""),
                content=h.get("content"),
                context=h.get("context"),
                observation=h.get("observation"),
                tags=h.get("tags") or [],
                entities=h.get("entities") or [],
                resources=h.get("resources") or [],
                applies_at=h.get("appliesAt") or h.get("applies_at") or [],
                confidence=float(h.get("confidence", 0.5)),
                status=h.get("status", "active"),
                type=h.get("type", "instruction"),
                enforce=bool(h.get("enforce", False)),
                subject=h.get("subject"),
                scope=h.get("scope", "workspace"),
                author_type=h.get("authorType", "user"),
                author_id=h.get("authorId"),
                author_name=h.get("authorName"),
                mutation_type=h.get("mutationType"),
                change_reason=h.get("changeReason"),
                created_at=h.get("createdAt"),
            )
            for h in resp.get("history", [])
        ]
        return MemoryHistoryResponse(
            root_id=resp.get("rootId", ""),
            total_versions=int(resp.get("totalVersions", len(hist))),
            history=hist,
        )

    async def adopt(
        self,
        namespace: str,
        memory_id: str,
        target_workspace_ids: list[str] | None = None,
    ) -> AdoptMemoryResponse:
        owner, workspace = _parse_namespace(namespace)
        targets = target_workspace_ids or []
        resp = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/memories/{memory_id}/adopt",
            json={"targetWorkspaceIds": targets},
        )
        adopted = [
            AdoptedTarget(
                workspace_id=a.get("workspaceId"),
                memory_id=a.get("memoryId") or "",
                already_existed=bool(a.get("alreadyExisted")),
            )
            for a in resp.get("adopted", [])
        ]
        return AdoptMemoryResponse(
            ok=bool(resp.get("ok", True)),
            source_memory_id=resp.get("sourceMemoryId") or memory_id,
            adopted=adopted,
        )

    async def promote(
        self,
        namespace: str,
        memory_id: str,
        to_scope: str = "workspace",
        reason: str | None = None,
    ) -> PromoteMemoryResponse:
        owner, workspace = _parse_namespace(namespace)
        body: dict[str, Any] = {"toScope": to_scope}
        if reason:
            body["reason"] = reason
        resp = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/memories/{memory_id}/promote",
            json=body,
        )
        mem_data = resp.get("memory")
        promo_data = resp.get("promotionRequest") or resp.get("promotion_request")
        return PromoteMemoryResponse(
            promoted=bool(resp.get("promoted", True)),
            memory=_parse_memory_item(mem_data) if mem_data else None,
            promotion_request=_parse_promotion_request(promo_data) if promo_data else None,
        )

    async def list_relations(self, namespace: str, memory_id: str) -> MemoryRelationsResponse:
        return await self.relations.list(namespace, memory_id)

    async def create_relation(
        self,
        namespace: str,
        memory_id: str,
        target_id: str,
        relation_type: str,
        confidence: float = 0.9,
        metadata: dict[str, Any] | None = None,
    ) -> MemoryRelationItem:
        return await self.relations.create(
            namespace, memory_id, target_id, relation_type, confidence, metadata
        )

    async def delete_relation(self, namespace: str, memory_id: str, relation_id: str) -> None:
        return await self.relations.delete(namespace, memory_id, relation_id)

    async def list_workspace_relations(
        self,
        namespace: str,
        page: int | None = None,
        per_page: int | None = None,
        relation_type: str | None = None,
    ) -> PaginatedResult[MemoryRelationItem]:
        return await self.relations.list_workspace(namespace, page, per_page, relation_type)


class _MemoryRelationsNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def list(self, namespace: str, memory_id: str) -> MemoryRelationsResponse:
        owner, workspace = _parse_namespace(namespace)
        resp = await self._client._request(
            "GET", f"/api/v1/{owner}/{workspace}/memories/{memory_id}/relations"
        )
        return MemoryRelationsResponse(
            incoming=[_parse_memory_relation_item(r) for r in resp.get("incoming", [])],
            outgoing=[_parse_memory_relation_item(r) for r in resp.get("outgoing", [])],
        )

    async def relate(
        self,
        namespace: str,
        source_id: str | None = None,
        target_id: str | None = None,
        relation_type: str | None = None,
        confidence: float = 0.9,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        src = source_id or kwargs.get("sourceId") or ""
        tgt = target_id or kwargs.get("targetId") or ""
        rel = relation_type or kwargs.get("type") or "limits"
        conf = confidence if confidence is not None else kwargs.get("confidence", 0.9)
        meta = metadata or kwargs.get("metadata")
        relation = await self.create(namespace, src, tgt, rel, confidence=conf, metadata=meta)
        return {"ok": True, "relation": relation}

    async def create(
        self,
        namespace: str,
        memory_id: str,
        target_id: str,
        relation_type: str,
        confidence: float = 0.9,
        metadata: dict[str, Any] | None = None,
    ) -> MemoryRelationItem:
        owner, workspace = _parse_namespace(namespace)
        payload = {
            "targetId": target_id,
            "relationType": relation_type,
            "confidence": confidence,
            "metadata": metadata or {},
        }
        resp = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/memories/{memory_id}/relations",
            json=payload,
        )
        return _parse_memory_relation_item(resp.get("relation", {}))

    async def delete(self, namespace: str, memory_id: str, relation_id: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        await self._client._request(
            "DELETE",
            f"/api/v1/{owner}/{workspace}/memories/{memory_id}/relations/{relation_id}",
        )

    async def list_workspace(
        self,
        namespace: str,
        page: int | None = None,
        per_page: int | None = None,
        relation_type: str | None = None,
    ) -> PaginatedResult[MemoryRelationItem]:
        owner, workspace = _parse_namespace(namespace)
        params = _build_query_params(
            {
                "page": page,
                "per_page": per_page,
                "relation_type": relation_type,
            }
        )
        resp = await self._client._request(
            "GET", f"/api/v1/{owner}/{workspace}/relations", params=params
        )
        raw_items = resp.get("relations") or []
        items = [_parse_memory_relation_item(r) for r in raw_items]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)


class _WorkspacesNamespaceAsync:
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
    ) -> PaginatedResult[WorkspaceItem]:
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
        resp = await self._client._request("GET", "/api/v1/workspaces", params=params)
        raw_workspaces = resp.get("workspaces") or []
        items = [_parse_workspace_item(p) for p in raw_workspaces]
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
    ) -> PaginatedResult[WorkspaceItem]:
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
        resp = await self._client._request("GET", f"/api/v1/{owner}/workspaces", params=params)
        raw_workspaces = resp.get("workspaces") or []
        items = [_parse_workspace_item(p) for p in raw_workspaces]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)

    async def get(self, namespace: str) -> WorkspaceItem:
        owner, workspace = _parse_namespace(namespace)
        resp = await self._client._request("GET", f"/api/v1/{owner}/{workspace}")
        return _parse_workspace_item(resp.get("workspace") or resp.get("project") or {})

    async def create(
        self,
        name: str,
        slug: str | None = None,
        description: str | None = None,
        website: str | None = None,
        visibility: str = "private",
        owner: str | None = None,
    ) -> WorkspaceItem:
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
            "/api/v1/workspaces",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_workspace_item(resp.get("workspace") or {})

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
    ) -> WorkspaceItem:
        owner, workspace = _parse_namespace(namespace)
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
            f"/api/v1/{owner}/{workspace}",
            json={k: v for k, v in payload.items() if v is not None},
        )
        raw = resp.get("workspace") or resp.get("project")
        if not raw and resp.get("ok"):
            target_slug = resp.get("workspaceSlug") or resp.get("projectSlug") or workspace
            target_owner = resp.get("ownerSlug") or owner
            try:
                return await self.get(f"{target_owner}/{target_slug}")
            except Exception:
                pass
        return _parse_workspace_item(raw or {})

    async def delete(self, namespace: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        await self._client._request("DELETE", f"/api/v1/{owner}/{workspace}")

    async def transfer(
        self,
        namespace: str,
        target_owner: str,
        target_slug: str | None = None,
    ) -> None:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {"targetOwner": target_owner}
        if target_slug:
            payload["targetSlug"] = target_slug
        await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/transfer",
            json=payload,
        )

    async def copy(
        self,
        namespace: str,
        target_owner: str | None = None,
        target_slug: str | None = None,
        name: str | None = None,
        description: str | None = None,
        visibility: str | None = None,
        include_threads: bool = False,
        include_documents: bool = False,
    ) -> dict[str, Any]:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {
            "targetOwner": target_owner,
            "targetSlug": target_slug,
            "name": name,
            "description": description,
            "visibility": visibility,
            "includeThreads": include_threads,
            "includeDocuments": include_documents,
        }
        return await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/copy",
            json={k: v for k, v in payload.items() if v is not None},
        )

    async def activity(
        self,
        namespace: str,
        page: int = 1,
        per_page: int = 25,
        outcome: str | None = None,
        subject: str | None = None,
        memory_id: str | None = None,
    ) -> PaginatedResult[WorkspaceActivityItem]:
        owner, workspace = _parse_namespace(namespace)
        params: dict[str, Any] = {"page": page, "per_page": per_page}
        if outcome:
            params["outcome"] = outcome
        if subject:
            params["subject"] = subject
        if memory_id:
            params["memory_id"] = memory_id
        data = await self._client._request(
            "GET", f"/api/v1/{owner}/{workspace}/activity", params=params
        )
        raw_items = data.get("items") or []
        items = [WorkspaceActivityItem(**i) for i in raw_items]
        return PaginatedResult(
            items=items,
            pagination=PaginationMetadata(
                page=data.get("page", page),
                per_page=data.get("perPage") or data.get("per_page", per_page),
                total=data.get("total", len(items)),
                has_more=data.get("hasMore") or data.get("has_more", False),
            ),
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
        owner, workspace = _parse_namespace(namespace)
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
            "GET", f"/api/v1/{owner}/{workspace}/agents", params=params
        )
        raw_items = resp.get("agents") or []
        items = [_parse_agent_item(a) for a in raw_items]
        pagination = _parse_pagination(resp.get("pagination", {}))
        return PaginatedResult(items=items, pagination=pagination)

    async def get(self, namespace: str, agent_id: str) -> AgentItem:
        owner, workspace = _parse_namespace(namespace)
        resp = await self._client._request("GET", f"/api/v1/{owner}/{workspace}/agents/{agent_id}")
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
        owner, workspace = _parse_namespace(namespace)
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
            f"/api/v1/{owner}/{workspace}/agents",
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
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {
            "name": name,
            "model": model,
            "description": description,
            "status": status,
            "metadata": metadata,
        }
        resp = await self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{workspace}/agents/{agent_id}",
            json={k: v for k, v in payload.items() if v is not None},
        )
        return _parse_agent_item(resp.get("agent", {}))

    async def delete(self, namespace: str, agent_id: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        await self._client._request("DELETE", f"/api/v1/{owner}/{workspace}/agents/{agent_id}")

    async def create_key(self, namespace: str, agent_id: str) -> CreateAgentKeyResult:
        owner, workspace = _parse_namespace(namespace)
        resp = await self._client._request(
            "POST", f"/api/v1/{owner}/{workspace}/agents/{agent_id}/keys"
        )
        key_data = resp.get("key")
        if isinstance(key_data, dict):
            return CreateAgentKeyResult(**key_data)
        return CreateAgentKeyResult(
            id=resp.get("keyId") or resp.get("id") or "",
            key=resp.get("key") if isinstance(resp.get("key"), str) else "",
            preview=resp.get("keyPrefix") or resp.get("preview") or "",
        )

    async def revoke_key(self, namespace: str, agent_id: str, key_id: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        await self._client._request(
            "DELETE", f"/api/v1/{owner}/{workspace}/agents/{agent_id}/keys/{key_id}"
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
        owner, workspace = _parse_namespace(namespace)
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
            "GET", f"/api/v1/{owner}/{workspace}/collaborators", params=params
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
        owner, workspace = _parse_namespace(namespace)
        resp = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/collaborators",
            json={"identifier": identifier, "role": role},
        )
        return _parse_pending_invitation(resp.get("invitation", {}))

    async def update_role(self, namespace: str, user_id: str, role: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        await self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{workspace}/collaborators/{user_id}",
            json={"role": role},
        )

    async def remove(self, namespace: str, user_id: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        await self._client._request(
            "DELETE", f"/api/v1/{owner}/{workspace}/collaborators/{user_id}"
        )

    async def revoke_invitation(self, namespace: str, invitation_id: str) -> None:
        owner, workspace = _parse_namespace(namespace)
        await self._client._request(
            "DELETE",
            f"/api/v1/{owner}/{workspace}/collaborators/invitations/{invitation_id}",
        )


class _OrganizationsNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client
        self.sso = _OrganizationSsoNamespaceAsync(client)
        self.fleet = AsyncOrganizationFleetNamespace(client)
        self.audit = AsyncOrganizationAuditNamespace(client)
        self.insights = AsyncOrganizationInsightsNamespace(client)
        self.teams = AsyncOrganizationTeamsNamespace(client)

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
                workspace_count=o.get("workspaceCount"),
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
            workspace_count=org.get("workspaceCount"),
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


class _OrganizationSsoNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def get(self, org_slug: str) -> OrganizationSSOResult:
        resp = await self._client._request("GET", f"/api/v1/organizations/{org_slug}/sso")
        providers = [_parse_sso_provider(p) for p in (resp.get("providers") or [])]
        return OrganizationSSOResult(
            ok=resp.get("ok", True),
            providers=providers,
            sso_enforced=bool(resp.get("ssoEnforced", False)),
        )

    async def configure(
        self,
        org_slug: str,
        domain: str,
        issuer: str,
        protocol: str = "saml",
        saml_config: dict[str, Any] | None = None,
        oidc_config: dict[str, Any] | None = None,
        provider_id: str | None = None,
    ) -> SSOProviderSummary:
        body: dict[str, Any] = {
            "domain": domain,
            "issuer": issuer,
            "protocol": protocol,
        }
        if provider_id:
            body["providerId"] = provider_id
        if saml_config:
            body["samlConfig"] = saml_config
        if oidc_config:
            body["oidcConfig"] = oidc_config
        resp = await self._client._request(
            "POST", f"/api/v1/organizations/{org_slug}/sso", json=body
        )
        return _parse_sso_provider(resp.get("provider", {}))

    async def delete(self, org_slug: str, provider_id: str) -> None:
        await self._client._request(
            "DELETE",
            f"/api/v1/organizations/{org_slug}/sso",
            params={"providerId": provider_id},
        )

    async def get_verification_token(self, org_slug: str, provider_id: str) -> SSOVerificationToken:
        resp = await self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/sso/token",
            json={"providerId": provider_id},
        )
        return SSOVerificationToken(
            token=str(resp.get("token", "")),
            dns_record_name=str(resp.get("dnsRecordName", "")),
            dns_record_type=str(resp.get("dnsRecordType", "TXT")),
            domain=str(resp.get("domain", "")),
        )

    async def verify_domain(self, org_slug: str, provider_id: str) -> dict[str, Any]:
        return await self._client._request(
            "POST",
            f"/api/v1/organizations/{org_slug}/sso/verify-domain",
            json={"providerId": provider_id},
        )

    async def set_enforcement(self, org_slug: str, sso_enforced: bool) -> dict[str, Any]:
        return await self._client._request(
            "PATCH",
            f"/api/v1/organizations/{org_slug}/sso/enforce",
            json={"ssoEnforced": sso_enforced},
        )

    async def lookup(self, domain_or_email: str) -> SSODomainLookupResult:
        is_email = "@" in domain_or_email
        param = "email" if is_email else "domain"
        resp = await self._client._request(
            "GET",
            "/api/v1/auth/sso/lookup",
            params={param: domain_or_email},
        )
        return SSODomainLookupResult(
            sso_available=bool(resp.get("ssoAvailable", False)),
            sso_enforced=bool(resp.get("ssoEnforced", False)),
            provider_id=resp.get("providerId"),
            organization_id=resp.get("organizationId"),
            organization_slug=resp.get("organizationSlug"),
            organization_name=resp.get("organizationName"),
        )


class _UsageNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def get(self, owner: str, timeframe: str = "30d") -> OwnerUsage:
        resp = await self._client._request(
            "GET", f"/api/v1/{owner}/usage", params={"timeframe": timeframe}
        )
        return _parse_owner_usage(resp)


class _ApiKeysNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def list(self) -> list[ApiKeyItem]:
        resp = await self._client._request("GET", "/api/v1/account/api-keys")
        items = resp.get("keys") or resp.get("tokens", [])
        return [
            ApiKeyItem(
                id=t["id"],
                name=t["name"],
                preview=t.get("preview") or t.get("prefix", ""),
                prefix=t.get("prefix"),
                expires_at=t.get("expiresAt") or t.get("expires_at"),
                last_used_at=t.get("lastUsedAt") or t.get("last_used_at") or t.get("lastRequest"),
                created_at=t.get("createdAt") or t.get("created_at"),
            )
            for t in items
        ]

    async def create(self, name: str, expires_in_days: int | None = None) -> CreatedApiKeyResult:
        body: dict[str, Any] = {"name": name}
        if expires_in_days is not None:
            body["expiresInDays"] = expires_in_days
        resp = await self._client._request("POST", "/api/v1/account/api-keys", json=body)
        raw = resp.get("key") or resp.get("token", {})
        key_val = raw.get("rawKey") or raw.get("rawToken") or raw.get("key") or raw.get("token", "")
        prefix_val = raw.get("prefix") or raw.get("preview", "")
        return CreatedApiKeyResult(
            id=raw["id"],
            name=raw["name"],
            key=key_val,
            token=key_val,
            preview=prefix_val,
            prefix=prefix_val,
            expires_at=raw.get("expiresAt") or raw.get("expires_at"),
            created_at=raw.get("createdAt") or raw.get("created_at"),
        )

    async def revoke(self, key_id: str) -> None:
        await self._client._request("DELETE", f"/api/v1/account/api-keys/{key_id}")


_TokensNamespaceAsync = _ApiKeysNamespaceAsync


class _AccountNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client
        self.api_keys = _ApiKeysNamespaceAsync(client)
        self.tokens = self.api_keys

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
            owner, workspace = _parse_namespace(namespace)
            path = f"/api/v1/{owner}/{workspace}/scopes"
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


class _SweepNamespaceAsync:
    """Async sweep & autonomous consolidation APIs (ADR 0075)."""

    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def consolidate(
        self,
        namespace: str,
        *,
        min_similarity: float | None = None,
        min_cluster_size: int | None = None,
        max_cluster_size: int | None = None,
    ) -> ConsolidateSweepResponse:
        owner, workspace = _parse_namespace(namespace)
        body: dict[str, Any] = {}
        if min_similarity is not None:
            body["minSimilarity"] = min_similarity
        if min_cluster_size is not None:
            body["minClusterSize"] = min_cluster_size
        if max_cluster_size is not None:
            body["maxClusterSize"] = max_cluster_size

        resp = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/lifecycle/sweep/consolidate",
            json=body if body else None,
        )
        return ConsolidateSweepResponse.model_validate(resp)


class _PromotionsNamespaceAsync:
    """Async memory promotion pipeline operations (ADR 0076)."""

    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def request(
        self,
        namespace: str,
        memory_id: str | None = None,
        to_scope: str = "workspace",
        reason: str | None = None,
        **kwargs: Any,
    ) -> PromoteMemoryResponse:
        mem_id = memory_id or kwargs.get("memoryId") or ""
        scope = to_scope or kwargs.get("toScope") or "workspace"
        rsn = reason or kwargs.get("reason")
        return await self._client.memories.promote(namespace, mem_id, to_scope=scope, reason=rsn)

    async def list(
        self,
        namespace: str,
        status: str | None = None,
        memory_id: str | None = None,
        page: int | None = None,
        per_page: int | None = None,
    ) -> PaginatedResult[MemoryPromotionRequest]:
        owner, workspace = _parse_namespace(namespace)
        params = _build_query_params(
            {
                "status": status,
                "memoryId": memory_id,
                "page": page,
                "per_page": per_page,
            }
        )
        resp = await self._client._request(
            "GET", f"/api/v1/{owner}/{workspace}/promotions", params=params
        )
        raw_items = resp.get("requests") or resp.get("items") or resp.get("promotionRequests") or []
        items = [_parse_promotion_request(r) for r in raw_items]
        pagination = (
            _parse_pagination(resp.get("pagination", {}))
            if "pagination" in resp
            else PaginationMetadata(
                page=page or 1,
                per_page=per_page or len(items),
                total=int(resp.get("total", len(items))),
                has_more=False,
            )
        )
        return PaginatedResult[MemoryPromotionRequest](
            items=items,
            pagination=pagination,
        )

    async def approve(
        self,
        namespace: str,
        promotion_id: str,
        reason: str | None = None,
        review_comment: str | None = None,
    ) -> dict[str, Any]:
        owner, workspace = _parse_namespace(namespace)
        review_reason = reason or review_comment
        body = {"reviewReason": review_reason} if review_reason else None
        resp = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/promotions/{promotion_id}/approve",
            json=body,
        )
        promotion_req = (
            _parse_promotion_request(resp["promotionRequest"])
            if resp.get("promotionRequest")
            else None
        )
        mem_data = resp.get("memory")
        mem = _parse_memory_item(mem_data) if mem_data else None
        return {
            "approved": bool(resp.get("approved", True)),
            "promotion_request": promotion_req,
            "promotionRequest": promotion_req,
            "memory": mem,
        }

    async def reject(
        self,
        namespace: str,
        promotion_id: str,
        reason: str | None = None,
        review_comment: str | None = None,
    ) -> dict[str, Any]:
        owner, workspace = _parse_namespace(namespace)
        review_reason = reason or review_comment
        body = {"reviewReason": review_reason} if review_reason else None
        resp = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/promotions/{promotion_id}/reject",
            json=body,
        )
        promotion_req = (
            _parse_promotion_request(resp["promotionRequest"])
            if resp.get("promotionRequest")
            else None
        )
        return {
            "rejected": bool(resp.get("rejected", True)),
            "promotion_request": promotion_req,
            "promotionRequest": promotion_req,
        }


class _ThreadsNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client

    def list(
        self,
        namespace: str,
        *,
        status: str | None = None,
        scope: str | None = None,
        entity: str | None = None,
        q: str | None = None,
        page: int | None = None,
        per_page: int | None = None,
    ) -> PaginatedResult[ThreadItem]:
        owner, workspace = _parse_namespace(namespace)
        params = _build_query_params(
            {
                "status": status,
                "scope": scope,
                "entity": entity,
                "q": q,
                "page": page,
                "per_page": per_page,
            }
        )
        resp = self._client._request(
            "GET",
            f"/api/v1/{owner}/{workspace}/threads",
            params=params or None,
        )
        items = [_parse_thread_item(t) for t in (resp.get("threads") or [])]
        return PaginatedResult[ThreadItem](
            items=items,
            pagination=_parse_pagination(resp.get("pagination") or {}),
        )

    def get(self, namespace: str, thread_id: str) -> ThreadDetailResponse:
        owner, workspace = _parse_namespace(namespace)
        resp = self._client._request(
            "GET",
            f"/api/v1/{owner}/{workspace}/threads/{thread_id}",
        )
        return ThreadDetailResponse(
            thread=_parse_thread_item(resp.get("thread") or {}),
            turns=[_parse_thread_turn_item(t) for t in (resp.get("turns") or [])],
            memories=[_parse_memory_item(m) for m in (resp.get("memories") or [])],
        )

    def update(
        self,
        namespace: str,
        thread_id: str,
        *,
        title: str | None = None,
        status: str | None = None,
        scope: str | None = None,
        summary: str | None = None,
        current_objective: str | None = None,
        decisions: list[str] | None = None,
        next_steps: list[str] | None = None,
        entities: list[str] | None = None,
        milestones: list[dict[str, Any]] | None = None,
        resources: list[str] | None = None,
    ) -> ThreadItem:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {}
        if title is not None:
            payload["title"] = title
        if status is not None:
            payload["status"] = status
        if scope is not None:
            payload["scope"] = scope
        if summary is not None:
            payload["summary"] = summary
        if current_objective is not None:
            payload["currentObjective"] = current_objective
        if decisions is not None:
            payload["decisions"] = decisions
        if next_steps is not None:
            payload["nextSteps"] = next_steps
        if entities is not None:
            payload["entities"] = entities
        if milestones is not None:
            payload["milestones"] = milestones
        if resources is not None:
            payload["resources"] = resources
        resp = self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{workspace}/threads/{thread_id}",
            json=payload,
        )
        return _parse_thread_item(resp.get("thread") or resp)

    def delete(self, namespace: str, thread_id: str) -> dict[str, Any]:
        owner, workspace = _parse_namespace(namespace)
        resp = self._client._request(
            "DELETE",
            f"/api/v1/{owner}/{workspace}/threads/{thread_id}",
        )
        return {"deleted": bool(resp.get("deleted", True))}


class _ThreadsNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def list(
        self,
        namespace: str,
        *,
        status: str | None = None,
        scope: str | None = None,
        entity: str | None = None,
        q: str | None = None,
        page: int | None = None,
        per_page: int | None = None,
    ) -> PaginatedResult[ThreadItem]:
        owner, workspace = _parse_namespace(namespace)
        params = _build_query_params(
            {
                "status": status,
                "scope": scope,
                "entity": entity,
                "q": q,
                "page": page,
                "per_page": per_page,
            }
        )
        resp = await self._client._request(
            "GET",
            f"/api/v1/{owner}/{workspace}/threads",
            params=params or None,
        )
        items = [_parse_thread_item(t) for t in (resp.get("threads") or [])]
        return PaginatedResult[ThreadItem](
            items=items,
            pagination=_parse_pagination(resp.get("pagination") or {}),
        )

    async def get(self, namespace: str, thread_id: str) -> ThreadDetailResponse:
        owner, workspace = _parse_namespace(namespace)
        resp = await self._client._request(
            "GET",
            f"/api/v1/{owner}/{workspace}/threads/{thread_id}",
        )
        return ThreadDetailResponse(
            thread=_parse_thread_item(resp.get("thread") or {}),
            turns=[_parse_thread_turn_item(t) for t in (resp.get("turns") or [])],
            memories=[_parse_memory_item(m) for m in (resp.get("memories") or [])],
        )

    async def update(
        self,
        namespace: str,
        thread_id: str,
        *,
        title: str | None = None,
        status: str | None = None,
        scope: str | None = None,
        summary: str | None = None,
        current_objective: str | None = None,
        decisions: list[str] | None = None,
        next_steps: list[str] | None = None,
        entities: list[str] | None = None,
        milestones: list[dict[str, Any]] | None = None,
        resources: list[str] | None = None,
    ) -> ThreadItem:
        owner, workspace = _parse_namespace(namespace)
        payload: dict[str, Any] = {}
        if title is not None:
            payload["title"] = title
        if status is not None:
            payload["status"] = status
        if scope is not None:
            payload["scope"] = scope
        if summary is not None:
            payload["summary"] = summary
        if current_objective is not None:
            payload["currentObjective"] = current_objective
        if decisions is not None:
            payload["decisions"] = decisions
        if next_steps is not None:
            payload["nextSteps"] = next_steps
        if entities is not None:
            payload["entities"] = entities
        if milestones is not None:
            payload["milestones"] = milestones
        if resources is not None:
            payload["resources"] = resources
        resp = await self._client._request(
            "PATCH",
            f"/api/v1/{owner}/{workspace}/threads/{thread_id}",
            json=payload,
        )
        return _parse_thread_item(resp.get("thread") or resp)

    async def delete(self, namespace: str, thread_id: str) -> dict[str, Any]:
        owner, workspace = _parse_namespace(namespace)
        resp = await self._client._request(
            "DELETE",
            f"/api/v1/{owner}/{workspace}/threads/{thread_id}",
        )
        return {"deleted": bool(resp.get("deleted", True))}


def _build_document_ingest_payload(
    *,
    title: str | None = None,
    content: str | None = None,
    file_path: str | os.PathLike[str] | None = None,
    file_bytes: bytes | None = None,
    file_base64: str | None = None,
    filename: str | None = None,
    mime_type: str | None = None,
    path: str | None = None,
    source_path: str | None = None,
    source_uri: str | None = None,
    content_type: str | None = None,
    distill: bool | None = None,
    distill_memories: bool | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resolved_filename = filename
    resolved_b64 = file_base64
    if file_path is not None:
        p = Path(file_path)
        resolved_b64 = base64.b64encode(p.read_bytes()).decode("ascii")
        if resolved_filename is None:
            resolved_filename = p.name
    elif file_bytes is not None:
        resolved_b64 = base64.b64encode(file_bytes).decode("ascii")

    has_text = isinstance(content, str) and len(content) > 0
    if not has_text and not resolved_b64:
        raise ValueError(
            "Provide either 'content' or binary 'file_path'/'file_bytes'/'file_base64' to ingest a document."
        )

    resolved_uri = source_uri or source_path or path or resolved_filename
    resolved_distill = distill if distill is not None else distill_memories
    resolved_title = title or resolved_filename or resolved_uri or "Untitled Document"

    payload: dict[str, Any] = {"title": resolved_title}
    if has_text:
        payload["content"] = content
    if resolved_b64:
        payload["fileBase64"] = resolved_b64
    if resolved_filename is not None:
        payload["filename"] = resolved_filename
    if mime_type is not None:
        payload["mimeType"] = mime_type
    if resolved_uri is not None:
        payload["sourceUri"] = resolved_uri
        payload["sourcePath"] = resolved_uri
    if content_type is not None:
        payload["contentType"] = content_type
    if resolved_distill is not None:
        payload["distill"] = resolved_distill
        payload["distillMemories"] = resolved_distill
    if metadata is not None:
        payload["metadata"] = metadata
    return payload


class _DocumentsNamespaceSync:
    def __init__(self, client: MemCell) -> None:
        self._client = client

    def list(
        self,
        namespace: str,
        *,
        q: str | None = None,
        page: int | None = None,
        per_page: int | None = None,
    ) -> PaginatedResult[DocumentItem]:
        owner, workspace = _parse_namespace(namespace)
        params = _build_query_params({"q": q, "page": page, "per_page": per_page})
        resp = self._client._request(
            "GET",
            f"/api/v1/{owner}/{workspace}/documents",
            params=params or None,
        )
        items = [_parse_document_item(d) for d in (resp.get("documents") or [])]
        return PaginatedResult[DocumentItem](
            items=items,
            pagination=_parse_pagination(resp.get("pagination") or {}),
        )

    def get(self, namespace: str, document_id: str) -> DocumentDetailResponse:
        owner, workspace = _parse_namespace(namespace)
        resp = self._client._request(
            "GET",
            f"/api/v1/{owner}/{workspace}/documents/{document_id}",
        )
        return DocumentDetailResponse(
            document=_parse_document_item(resp.get("document") or {}),
            chunks=[_parse_document_chunk_item(c) for c in (resp.get("chunks") or [])],
            memories=[_parse_memory_item(m) for m in (resp.get("memories") or [])],
        )

    def ingest(
        self,
        namespace: str,
        *,
        title: str | None = None,
        content: str | None = None,
        file_path: str | os.PathLike[str] | None = None,
        file_bytes: bytes | None = None,
        file_base64: str | None = None,
        filename: str | None = None,
        mime_type: str | None = None,
        path: str | None = None,
        source_path: str | None = None,
        source_uri: str | None = None,
        content_type: str | None = None,
        distill: bool | None = None,
        distill_memories: bool | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> IngestDocumentResponse:
        owner, workspace = _parse_namespace(namespace)
        payload = _build_document_ingest_payload(
            title=title,
            content=content,
            file_path=file_path,
            file_bytes=file_bytes,
            file_base64=file_base64,
            filename=filename,
            mime_type=mime_type,
            path=path,
            source_path=source_path,
            source_uri=source_uri,
            content_type=content_type,
            distill=distill,
            distill_memories=distill_memories,
            metadata=metadata,
        )
        resp = self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/documents",
            json=payload,
        )
        return _parse_ingest_document_response(resp)

    def search(
        self,
        namespace: str,
        query: str,
        limit: int = 5,
    ) -> DocumentSearchResponse:
        owner, workspace = _parse_namespace(namespace)
        params = _build_query_params({"q": query, "chunks": True, "limit": limit})
        resp = self._client._request(
            "GET",
            f"/api/v1/{owner}/{workspace}/documents",
            params=params,
        )
        chunks = [_parse_document_chunk_search_result(c) for c in (resp.get("chunks") or [])]
        return DocumentSearchResponse(chunks=chunks)

    def delete(self, namespace: str, document_id: str) -> dict[str, Any]:
        owner, workspace = _parse_namespace(namespace)
        resp = self._client._request(
            "DELETE",
            f"/api/v1/{owner}/{workspace}/documents/{document_id}",
        )
        return {"deleted": bool(resp.get("deleted", True))}


class _DocumentsNamespaceAsync:
    def __init__(self, client: AsyncMemCell) -> None:
        self._client = client

    async def list(
        self,
        namespace: str,
        *,
        q: str | None = None,
        page: int | None = None,
        per_page: int | None = None,
    ) -> PaginatedResult[DocumentItem]:
        owner, workspace = _parse_namespace(namespace)
        params = _build_query_params({"q": q, "page": page, "per_page": per_page})
        resp = await self._client._request(
            "GET",
            f"/api/v1/{owner}/{workspace}/documents",
            params=params or None,
        )
        items = [_parse_document_item(d) for d in (resp.get("documents") or [])]
        return PaginatedResult[DocumentItem](
            items=items,
            pagination=_parse_pagination(resp.get("pagination") or {}),
        )

    async def get(self, namespace: str, document_id: str) -> DocumentDetailResponse:
        owner, workspace = _parse_namespace(namespace)
        resp = await self._client._request(
            "GET",
            f"/api/v1/{owner}/{workspace}/documents/{document_id}",
        )
        return DocumentDetailResponse(
            document=_parse_document_item(resp.get("document") or {}),
            chunks=[_parse_document_chunk_item(c) for c in (resp.get("chunks") or [])],
            memories=[_parse_memory_item(m) for m in (resp.get("memories") or [])],
        )

    async def ingest(
        self,
        namespace: str,
        *,
        title: str | None = None,
        content: str | None = None,
        file_path: str | os.PathLike[str] | None = None,
        file_bytes: bytes | None = None,
        file_base64: str | None = None,
        filename: str | None = None,
        mime_type: str | None = None,
        path: str | None = None,
        source_path: str | None = None,
        source_uri: str | None = None,
        content_type: str | None = None,
        distill: bool | None = None,
        distill_memories: bool | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> IngestDocumentResponse:
        owner, workspace = _parse_namespace(namespace)
        payload = _build_document_ingest_payload(
            title=title,
            content=content,
            file_path=file_path,
            file_bytes=file_bytes,
            file_base64=file_base64,
            filename=filename,
            mime_type=mime_type,
            path=path,
            source_path=source_path,
            source_uri=source_uri,
            content_type=content_type,
            distill=distill,
            distill_memories=distill_memories,
            metadata=metadata,
        )
        resp = await self._client._request(
            "POST",
            f"/api/v1/{owner}/{workspace}/documents",
            json=payload,
        )
        return _parse_ingest_document_response(resp)

    async def search(
        self,
        namespace: str,
        query: str,
        limit: int = 5,
    ) -> DocumentSearchResponse:
        owner, workspace = _parse_namespace(namespace)
        params = _build_query_params({"q": query, "chunks": True, "limit": limit})
        resp = await self._client._request(
            "GET",
            f"/api/v1/{owner}/{workspace}/documents",
            params=params,
        )
        chunks = [_parse_document_chunk_search_result(c) for c in (resp.get("chunks") or [])]
        return DocumentSearchResponse(chunks=chunks)

    async def delete(self, namespace: str, document_id: str) -> dict[str, Any]:
        owner, workspace = _parse_namespace(namespace)
        resp = await self._client._request(
            "DELETE",
            f"/api/v1/{owner}/{workspace}/documents/{document_id}",
        )
        return {"deleted": bool(resp.get("deleted", True))}


# ══════════════════════════════════════════════════════════════════════════════
# MAIN CLIENTS
# ══════════════════════════════════════════════════════════════════════════════


class MemCell:
    """Synchronous MemCell client."""

    def __init__(
        self,
        api_key: str | None = None,
        access_token: str | None = None,
        token: str | None = None,
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
        base = base_url or os.environ.get("MEMCELL_BASE_URL", "https://memcell.ai")
        self.base_url = base.rstrip("/")
        self.max_retries = max_retries
        self.initial_retry_delay_ms = initial_retry_delay_ms
        self.max_retry_delay_ms = max_retry_delay_ms
        self.on_rate_limit_warning = on_rate_limit_warning

        resolved_api_key = (
            api_key or token or os.environ.get("MEMCELL_API_KEY") or os.environ.get("MEMCELL_TOKEN")
        )
        resolved_client_id = client_id or os.environ.get("MEMCELL_CLIENT_ID")
        resolved_client_secret = client_secret or os.environ.get("MEMCELL_CLIENT_SECRET")
        resolved_scope = scope or os.environ.get("MEMCELL_OAUTH_SCOPE")

        has_client_id = bool(resolved_client_id)
        has_client_secret = bool(resolved_client_secret)
        if (has_client_id and not has_client_secret) or (not has_client_id and has_client_secret):
            raise ValueError(
                "Both 'client_id' and 'client_secret' are required for OAuth client credentials authentication."
            )

        has_static = bool(resolved_api_key or access_token)
        has_oauth = bool(has_client_id and has_client_secret)
        if has_static and has_oauth:
            raise ValueError(
                "Ambiguous authentication: provide either a static token/api_key OR OAuth client_id/client_secret, not both."
            )

        if not has_static and not has_oauth:
            raise ValueError(
                "MemCell authentication required. Provide api_key/token or client_id/client_secret, or set environment variables."
            )

        self.auth_manager = AuthManager(
            base_url=self.base_url,
            api_key=resolved_api_key,
            access_token=access_token,
            client_id=resolved_client_id,
            client_secret=resolved_client_secret,
            scope=resolved_scope,
        )

        self._custom_client = http_client is not None
        self._http = http_client or httpx.Client(timeout=timeout)

        # Mount resource namespaces
        self.memories = _MemoriesNamespaceSync(self)
        self.relations = self.memories.relations
        self.workspaces = _WorkspacesNamespaceSync(self)
        self.threads = _ThreadsNamespaceSync(self)
        self.documents = _DocumentsNamespaceSync(self)
        self.sources = WorkspaceSourcesNamespace(self)
        self.agents = _AgentsNamespaceSync(self)
        self.collaborators = _CollaboratorsNamespaceSync(self)
        self.organizations = _OrganizationsNamespaceSync(self)
        self.usage = _UsageNamespaceSync(self)
        self.account = _AccountNamespaceSync(self)
        self.scopes = _ScopesNamespaceSync(self)
        self.sweep = _SweepNamespaceSync(self)
        self.promotions = _PromotionsNamespaceSync(self)
        self.webhooks = WorkspaceWebhooksNamespace(self)
        self.operator = OperatorNamespace(self)
        self.invitations = InvitationsNamespace(self)
        self.teams = OrganizationTeamsNamespace(self)

    @property
    def insights(self) -> OrganizationInsightsNamespace:
        return self.organizations.insights

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

    for_org = for_organization
    organization = for_organization

    def scope(self, namespace: str, subject: str | None = None) -> ScopedMemCell:
        from .scoped import ScopedMemCell

        return ScopedMemCell(self, namespace, subject=subject)

    def workspace(self, namespace: str, subject: str | None = None) -> ScopedMemCell:
        return self.scope(namespace, subject=subject)

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
                if response.status_code == 402 and code == "plan_limit":
                    raise PlanLimitError(
                        message=message,
                        limit=err_json.get("limit"),
                        used=err_json.get("used"),
                        plan=err_json.get("plan"),
                        details=err_json,
                    )
                raise MemCellError(
                    f"MemCell API Error ({response.status_code}): {message}",
                    status_code=response.status_code,
                    code=code,
                    details=err_json,
                )

            return response.json() if response.content else {}

    def _request_raw(self, method: str, path: str, **kwargs: Any) -> str:
        headers = kwargs.pop("headers", {}) or {}
        auth_header = self.auth_manager.get_authorization_header(self._http)
        if auth_header:
            headers["Authorization"] = auth_header
        url = f"{self.base_url}{path}"
        response = self._http.request(method, url, headers=headers, **kwargs)
        if response.status_code >= 400:
            raise MemCellError(
                f"MemCell API Error ({response.status_code}): {response.text}",
                status_code=response.status_code,
            )
        return response.text

    def recall(
        self,
        query: str | None = None,
        namespace: str | None = None,
        subject: str | None = None,
        type: str | list[str] | None = None,
        enforce: bool | None = None,
        scope: str | None = None,
        scopes: list[str] | None = None,
        my_memory: bool | None = None,
        min_confidence: float | None = None,
        limit: int | None = None,
        tags: list[str] | None = None,
        format: str = "xml",
        allow_provisional: bool | None = None,
        metadata: dict[str, Any] | None = None,
        include_metadata: bool | list[str] | None = None,
        session_id: str | None = None,
        *,
        intent: str | None = None,
    ) -> RecallResponse:
        effective_query = query or intent or ""
        path = _resolve_endpoint(namespace, "recall")
        payload: dict[str, Any] = {
            "query": effective_query,
            "intent": effective_query,
            "sessionId": session_id,
            "subject": subject,
            "type": type,
            "enforce": enforce,
            "scope": scope,
            "scopes": scopes,
            "my_memory": my_memory,
            "min_confidence": min_confidence,
            "limit": limit,
            "tags": tags,
            "format": format,
            "allow_provisional": allow_provisional,
            "metadata": metadata,
            "include_metadata": include_metadata,
        }
        if namespace and "/" not in namespace:
            payload["workspace"] = namespace

        data = self._request("POST", path, json={k: v for k, v in payload.items() if v is not None})
        raw_memories = data.get("memories") or data.get("results") or []
        memories = [_parse_memory_item(s) for s in raw_memories]
        matched_thread = (
            _parse_thread_item(data["matchedThread"]) if data.get("matchedThread") else None
        )
        active_threads = (
            [_parse_thread_item(t) for t in data["activeThreads"]]
            if data.get("activeThreads") is not None
            else None
        )
        document_chunks = (
            [_parse_document_chunk_search_result(c) for c in data["documentChunks"]]
            if data.get("documentChunks") is not None
            else None
        )

        return RecallResponse(
            recall_id=str(data.get("recallId") or data.get("momentId") or ""),
            prompt_context=data.get("promptContext", ""),
            memories=memories,
            matched_thread=matched_thread,
            active_threads=active_threads,
            document_chunks=document_chunks,
            matched_tags=data.get("matchedTags"),
            guard_mode=data.get("guardMode"),
            profile=data.get("profile"),
        )

    def remember(
        self,
        title: str | None = None,
        context: str | None = None,
        observation: str | None = None,
        tags: list[str] | None = None,
        entities: list[str] | None = None,
        resources: list[str] | None = None,
        applies_at: list[str] | None = None,
        subject: str | None = None,
        type: str | None = None,
        enforce: bool = False,
        status: str | None = None,
        confidence: float | None = None,
        scope: str | None = None,
        required_roles: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        expires_at: Any | None = None,
        raw: str | None = None,
        content: str | None = None,
        touched: list[str] | None = None,
        actions: list[dict[str, Any]] | None = None,
        session_id: str | None = None,
        active_memory_ids: list[str] | None = None,
        namespace: str | None = None,
        async_: bool | None = None,
    ) -> RememberResponse:
        path = _resolve_endpoint(namespace, "remember")
        exp_str = (
            expires_at.isoformat()
            if isinstance(expires_at, datetime.date | datetime.datetime)
            else expires_at
        )
        payload: dict[str, Any] = {
            "title": title,
            "content": content if title else None,
            "context": context,
            "observation": observation,
            "tags": tags,
            "entities": entities,
            "resources": resources,
            "appliesAt": applies_at,
            "subject": subject,
            "type": type,
            "enforce": enforce,
            "status": status,
            "confidence": confidence,
            "scope": scope,
            "required_roles": required_roles,
            "metadata": metadata,
            "expires_at": exp_str,
            "raw": raw or (content if not title else None),
            "touched": touched,
            "actions": actions,
            "sessionId": session_id,
            "activeMemoryIds": active_memory_ids,
            "async": async_,
        }
        if namespace and "/" not in namespace:
            payload["workspace"] = namespace

        data = self._request("POST", path, json={k: v for k, v in payload.items() if v is not None})

        if data.get("accepted"):
            return RememberResponse(
                accepted=True,
                job_id=data.get("jobId"),
                status=data.get("status"),
                created=[],
                evolved=[],
                note=data.get("note", "Job accepted for background execution."),
            )

        raw_created = data.get("created") or []
        created = [_parse_memory_item(s) for s in raw_created]
        raw_evolved = data.get("evolved") or []
        evolved = [_parse_memory_item(s) for s in raw_evolved]
        thread = _parse_thread_item(data["thread"]) if data.get("thread") else None

        return RememberResponse(
            created=created,
            evolved=evolved,
            reinforced=data.get("reinforced"),
            superseded=data.get("superseded"),
            thread=thread,
            note=data.get("note"),
        )

    def report(
        self,
        action_taken: str = "",
        outcome: OutcomeVerdict = "worked",
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
        path = _resolve_endpoint(namespace, "report")
        req_payload: dict[str, Any] = {
            "action_taken": action_taken,
            "outcome": outcome,
            "subject": subject,
            "reason": reason,
            "external_ref": external_ref,
            "payload": payload,
            "recall_id": recall_id,
            "memory_id": memory_id,
            "auto_distill": auto_distill,
            "async": async_,
        }
        if namespace and "/" not in namespace:
            req_payload["workspace"] = namespace

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
        raw_distilled = data.get("distilledMemory")
        if raw_distilled:
            distilled = _parse_memory_item(raw_distilled)

        return ReportResponse(
            outcome=data.get("outcome", outcome),
            attributed=data.get("attributed") or [],
            distilled_memory=distilled,
            note=data.get("note"),
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
        path = _resolve_endpoint(namespace, "feedback")
        req_payload: dict[str, Any] = {
            "memory_id": memory_id,
            "recall_id": recall_id,
            "outcome": outcome,
            "reason": reason,
            "external_ref": external_ref,
            "payload": payload,
        }
        if namespace and "/" not in namespace:
            req_payload["workspace"] = namespace

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

    def wrap_execution(
        self,
        action: str = "",
        fn: Callable[[Any], Any] | None = None,
        *,
        namespace: str | None = None,
        query: str | None = None,
        subject: str | None = None,
        external_ref: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> Any:
        if fn is None:
            raise ValueError("fn callback is required for wrap_execution")
        return self.scope(namespace or "", subject=subject).wrap_execution(
            action=action or query or "execute",
            fn=fn,
            subject=subject,
            external_ref=external_ref,
            payload=payload,
            query=query or action,
        )


class AsyncMemCell:
    """Asynchronous MemCell client."""

    def __init__(
        self,
        api_key: str | None = None,
        access_token: str | None = None,
        token: str | None = None,
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
        base = base_url or os.environ.get("MEMCELL_BASE_URL", "https://memcell.ai")
        self.base_url = base.rstrip("/")
        self.max_retries = max_retries
        self.initial_retry_delay_ms = initial_retry_delay_ms
        self.max_retry_delay_ms = max_retry_delay_ms
        self.on_rate_limit_warning = on_rate_limit_warning

        resolved_api_key = (
            api_key or token or os.environ.get("MEMCELL_API_KEY") or os.environ.get("MEMCELL_TOKEN")
        )
        resolved_client_id = client_id or os.environ.get("MEMCELL_CLIENT_ID")
        resolved_client_secret = client_secret or os.environ.get("MEMCELL_CLIENT_SECRET")
        resolved_scope = scope or os.environ.get("MEMCELL_OAUTH_SCOPE")

        has_client_id = bool(resolved_client_id)
        has_client_secret = bool(resolved_client_secret)
        if (has_client_id and not has_client_secret) or (not has_client_id and has_client_secret):
            raise ValueError(
                "Both 'client_id' and 'client_secret' are required for OAuth client credentials authentication."
            )

        has_static = bool(resolved_api_key or access_token)
        has_oauth = bool(has_client_id and has_client_secret)
        if has_static and has_oauth:
            raise ValueError(
                "Ambiguous authentication: provide either a static token/api_key OR OAuth client_id/client_secret, not both."
            )

        if not has_static and not has_oauth:
            raise ValueError(
                "MemCell authentication required. Provide api_key/token or client_id/client_secret, or set environment variables."
            )

        self.auth_manager = AuthManager(
            base_url=self.base_url,
            api_key=resolved_api_key,
            access_token=access_token,
            client_id=resolved_client_id,
            client_secret=resolved_client_secret,
            scope=resolved_scope,
        )

        self._custom_client = http_client is not None
        self._http = http_client or httpx.AsyncClient(timeout=timeout)

        # Mount resource namespaces
        self.memories = _MemoriesNamespaceAsync(self)
        self.relations = self.memories.relations
        self.workspaces = _WorkspacesNamespaceAsync(self)
        self.threads = _ThreadsNamespaceAsync(self)
        self.documents = _DocumentsNamespaceAsync(self)
        self.sources = AsyncWorkspaceSourcesNamespace(self)
        self.agents = _AgentsNamespaceAsync(self)
        self.collaborators = _CollaboratorsNamespaceAsync(self)
        self.organizations = _OrganizationsNamespaceAsync(self)
        self.usage = _UsageNamespaceAsync(self)
        self.account = _AccountNamespaceAsync(self)
        self.scopes = _ScopesNamespaceAsync(self)
        self.sweep = _SweepNamespaceAsync(self)
        self.promotions = _PromotionsNamespaceAsync(self)
        self.webhooks = AsyncWorkspaceWebhooksNamespace(self)
        self.operator = AsyncOperatorNamespace(self)
        self.invitations = AsyncInvitationsNamespace(self)
        self.teams = AsyncOrganizationTeamsNamespace(self)

    @property
    def insights(self) -> AsyncOrganizationInsightsNamespace:
        return self.organizations.insights

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

    for_org = for_organization
    organization = for_organization

    def scope(self, namespace: str, subject: str | None = None) -> AsyncScopedMemCell:
        from .scoped import AsyncScopedMemCell

        return AsyncScopedMemCell(self, namespace, subject=subject)

    def workspace(self, namespace: str, subject: str | None = None) -> AsyncScopedMemCell:
        return self.scope(namespace, subject=subject)

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
                if response.status_code == 402 and code == "plan_limit":
                    raise PlanLimitError(
                        message=message,
                        limit=err_json.get("limit"),
                        used=err_json.get("used"),
                        plan=err_json.get("plan"),
                        details=err_json,
                    )
                raise MemCellError(
                    f"MemCell API Error ({response.status_code}): {message}",
                    status_code=response.status_code,
                    code=code,
                    details=err_json,
                )

            return response.json() if response.content else {}

    async def _request_raw(self, method: str, path: str, **kwargs: Any) -> str:
        headers = kwargs.pop("headers", {}) or {}
        auth_header = await self.auth_manager.get_authorization_header_async(self._http)
        if auth_header:
            headers["Authorization"] = auth_header
        url = f"{self.base_url}{path}"
        response = await self._http.request(method, url, headers=headers, **kwargs)
        if response.status_code >= 400:
            raise MemCellError(
                f"MemCell API Error ({response.status_code}): {response.text}",
                status_code=response.status_code,
            )
        return response.text

    async def recall(
        self,
        query: str | None = None,
        namespace: str | None = None,
        subject: str | None = None,
        type: str | list[str] | None = None,
        enforce: bool | None = None,
        scope: str | None = None,
        scopes: list[str] | None = None,
        my_memory: bool | None = None,
        min_confidence: float | None = None,
        limit: int | None = None,
        tags: list[str] | None = None,
        format: str = "xml",
        allow_provisional: bool | None = None,
        metadata: dict[str, Any] | None = None,
        include_metadata: bool | list[str] | None = None,
        session_id: str | None = None,
        *,
        intent: str | None = None,
    ) -> RecallResponse:
        effective_query = query or intent or ""
        path = _resolve_endpoint(namespace, "recall")
        payload: dict[str, Any] = {
            "query": effective_query,
            "intent": effective_query,
            "sessionId": session_id,
            "subject": subject,
            "type": type,
            "enforce": enforce,
            "scope": scope,
            "scopes": scopes,
            "my_memory": my_memory,
            "min_confidence": min_confidence,
            "limit": limit,
            "tags": tags,
            "format": format,
            "allow_provisional": allow_provisional,
            "metadata": metadata,
            "include_metadata": include_metadata,
        }
        if namespace and "/" not in namespace:
            payload["workspace"] = namespace

        data = await self._request(
            "POST", path, json={k: v for k, v in payload.items() if v is not None}
        )
        raw_memories = data.get("memories") or data.get("results") or []
        memories = [_parse_memory_item(s) for s in raw_memories]
        matched_thread = (
            _parse_thread_item(data["matchedThread"]) if data.get("matchedThread") else None
        )
        active_threads = (
            [_parse_thread_item(t) for t in data["activeThreads"]]
            if data.get("activeThreads") is not None
            else None
        )
        document_chunks = (
            [_parse_document_chunk_search_result(c) for c in data["documentChunks"]]
            if data.get("documentChunks") is not None
            else None
        )

        return RecallResponse(
            recall_id=str(data.get("recallId") or data.get("momentId") or ""),
            prompt_context=data.get("promptContext", ""),
            memories=memories,
            matched_thread=matched_thread,
            active_threads=active_threads,
            document_chunks=document_chunks,
            matched_tags=data.get("matchedTags"),
            guard_mode=data.get("guardMode"),
            profile=data.get("profile"),
        )

    async def remember(
        self,
        title: str | None = None,
        context: str | None = None,
        observation: str | None = None,
        tags: list[str] | None = None,
        entities: list[str] | None = None,
        resources: list[str] | None = None,
        applies_at: list[str] | None = None,
        subject: str | None = None,
        type: str | None = None,
        enforce: bool = False,
        status: str | None = None,
        confidence: float | None = None,
        scope: str | None = None,
        required_roles: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        expires_at: Any | None = None,
        raw: str | None = None,
        content: str | None = None,
        touched: list[str] | None = None,
        actions: list[dict[str, Any]] | None = None,
        session_id: str | None = None,
        active_memory_ids: list[str] | None = None,
        namespace: str | None = None,
        async_: bool | None = None,
    ) -> RememberResponse:
        path = _resolve_endpoint(namespace, "remember")
        exp_str = (
            expires_at.isoformat()
            if isinstance(expires_at, datetime.date | datetime.datetime)
            else expires_at
        )
        payload: dict[str, Any] = {
            "title": title,
            "content": content if title else None,
            "context": context,
            "observation": observation,
            "tags": tags,
            "entities": entities,
            "resources": resources,
            "appliesAt": applies_at,
            "subject": subject,
            "type": type,
            "enforce": enforce,
            "status": status,
            "confidence": confidence,
            "scope": scope,
            "required_roles": required_roles,
            "metadata": metadata,
            "expires_at": exp_str,
            "raw": raw or (content if not title else None),
            "touched": touched,
            "actions": actions,
            "sessionId": session_id,
            "activeMemoryIds": active_memory_ids,
            "async": async_,
        }
        if namespace and "/" not in namespace:
            payload["workspace"] = namespace

        data = await self._request(
            "POST", path, json={k: v for k, v in payload.items() if v is not None}
        )

        if data.get("accepted"):
            return RememberResponse(
                accepted=True,
                job_id=data.get("jobId"),
                status=data.get("status"),
                created=[],
                evolved=[],
                note=data.get("note", "Job accepted for background execution."),
            )

        raw_created = data.get("created") or []
        created = [_parse_memory_item(s) for s in raw_created]
        raw_evolved = data.get("evolved") or []
        evolved = [_parse_memory_item(s) for s in raw_evolved]
        thread = _parse_thread_item(data["thread"]) if data.get("thread") else None

        return RememberResponse(
            created=created,
            evolved=evolved,
            reinforced=data.get("reinforced"),
            superseded=data.get("superseded"),
            thread=thread,
            note=data.get("note"),
        )

    async def report(
        self,
        action_taken: str = "",
        outcome: OutcomeVerdict = "worked",
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
        path = _resolve_endpoint(namespace, "report")
        req_payload: dict[str, Any] = {
            "action_taken": action_taken,
            "outcome": outcome,
            "subject": subject,
            "reason": reason,
            "external_ref": external_ref,
            "payload": payload,
            "recall_id": recall_id,
            "memory_id": memory_id,
            "auto_distill": auto_distill,
            "async": async_,
        }
        if namespace and "/" not in namespace:
            req_payload["workspace"] = namespace

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
        raw_distilled = data.get("distilledMemory")
        if raw_distilled:
            distilled = _parse_memory_item(raw_distilled)

        return ReportResponse(
            outcome=data.get("outcome", outcome),
            attributed=data.get("attributed") or [],
            distilled_memory=distilled,
            note=data.get("note"),
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
        path = _resolve_endpoint(namespace, "feedback")
        req_payload: dict[str, Any] = {
            "memory_id": memory_id,
            "recall_id": recall_id,
            "outcome": outcome,
            "reason": reason,
            "external_ref": external_ref,
            "payload": payload,
        }
        if namespace and "/" not in namespace:
            req_payload["workspace"] = namespace

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

    async def wrap_execution(
        self,
        action: str = "",
        fn: Callable[[Any], Any] | None = None,
        *,
        namespace: str | None = None,
        query: str | None = None,
        subject: str | None = None,
        external_ref: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> Any:
        if fn is None:
            raise ValueError("fn callback is required for wrap_execution")
        return await self.scope(namespace or "", subject=subject).wrap_execution(
            action=action or query or "execute",
            fn=fn,
            subject=subject,
            external_ref=external_ref,
            payload=payload,
            query=query or action,
        )
