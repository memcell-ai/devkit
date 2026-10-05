from __future__ import annotations

import contextlib
import inspect
from collections.abc import Awaitable, Callable
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

from .models import (
    AdoptMemoryResponse,
    AgentItem,
    ConsolidateSweepResponse,
    CreateAgentKeyResult,
    DeleteMemoryResponse,
    FeedbackResponse,
    JobEvent,
    ListCollaboratorsResponse,
    MemoryHistoryResponse,
    MemoryItem,
    MemoryPromotionRequest,
    MemoryRelationItem,
    MemoryRelationsResponse,
    MemoryStarResponse,
    OutcomeVerdict,
    PaginatedResult,
    PendingInvitationItem,
    PromoteMemoryResponse,
    RecallResponse,
    RememberResponse,
    ReportResponse,
    ScopedExecutionContext,
    ScopeItem,
)

T = TypeVar("T")


class ScopedExecutionResult(BaseModel, Generic[T]):
    """Result envelope for wrapped agent execution."""

    result: T
    report: ReportResponse
    recall: RecallResponse


class _ScopedMemoriesSync:
    def __init__(self, client: Any, namespace: str, default_subject: str | None = None) -> None:
        self._client = client
        self._namespace = namespace
        self._default_subject = default_subject

    def list(self, **kwargs: Any) -> PaginatedResult[MemoryItem]:
        return self._client.memories.list(self._namespace, **kwargs)

    def get(self, memory_id: str) -> MemoryItem:
        return self._client.memories.get(self._namespace, memory_id)

    def create(self, title: str, **kwargs: Any) -> MemoryItem:
        if "subject" not in kwargs or kwargs["subject"] is None:
            kwargs["subject"] = self._default_subject
        return self._client.memories.create(self._namespace, title, **kwargs)

    def update(self, memory_id: str, **kwargs: Any) -> MemoryItem:
        return self._client.memories.update(self._namespace, memory_id, **kwargs)

    def delete(self, memory_id: str, all_versions: bool = False) -> DeleteMemoryResponse:
        return self._client.memories.delete(self._namespace, memory_id, all_versions=all_versions)

    def star(self, memory_id: str, starred: bool = True) -> MemoryStarResponse:
        return self._client.memories.star(self._namespace, memory_id, starred=starred)

    def history(self, memory_id: str) -> MemoryHistoryResponse:
        return self._client.memories.history(self._namespace, memory_id)

    def adopt(self, memory_id: str, target_project_ids: list[str]) -> AdoptMemoryResponse:
        return self._client.memories.adopt(self._namespace, memory_id, target_project_ids)

    def promote(
        self, memory_id: str, to_scope: str = "project", reason: str | None = None
    ) -> PromoteMemoryResponse:
        return self._client.memories.promote(
            self._namespace, memory_id, to_scope=to_scope, reason=reason
        )

    def list_relations(self, memory_id: str) -> MemoryRelationsResponse:
        return self._client.memories.list_relations(self._namespace, memory_id)

    def create_relation(
        self,
        memory_id: str,
        target_id: str,
        relation_type: str,
        confidence: float = 0.9,
        metadata: dict[str, Any] | None = None,
    ) -> MemoryRelationItem:
        return self._client.memories.create_relation(
            self._namespace, memory_id, target_id, relation_type, confidence, metadata
        )

    def delete_relation(self, memory_id: str, relation_id: str) -> None:
        self._client.memories.delete_relation(self._namespace, memory_id, relation_id)

    def list_project_relations(self, **kwargs: Any) -> PaginatedResult[MemoryRelationItem]:
        return self._client.memories.list_project_relations(self._namespace, **kwargs)

    @property
    def relations(self) -> Any:
        scoped = self

        class _ScopedRelationsProxy:
            def list(self, memory_id: str) -> MemoryRelationsResponse:
                return scoped.list_relations(memory_id)

            def create(
                self,
                memory_id: str,
                target_id: str,
                relation_type: str,
                confidence: float = 0.9,
                metadata: dict[str, Any] | None = None,
            ) -> MemoryRelationItem:
                return scoped.create_relation(
                    memory_id, target_id, relation_type, confidence, metadata
                )

            def delete(self, memory_id: str, relation_id: str) -> None:
                scoped.delete_relation(memory_id, relation_id)

            def list_project(self, **kwargs: Any) -> PaginatedResult[MemoryRelationItem]:
                return scoped.list_project_relations(**kwargs)

        return _ScopedRelationsProxy()


class _ScopedAgentsSync:
    def __init__(self, client: Any, namespace: str) -> None:
        self._client = client
        self._namespace = namespace

    def list(self, **kwargs: Any) -> PaginatedResult[AgentItem]:
        return self._client.agents.list(self._namespace, **kwargs)

    def get(self, agent_id: str) -> AgentItem:
        return self._client.agents.get(self._namespace, agent_id)

    def create(self, name: str, **kwargs: Any) -> AgentItem:
        return self._client.agents.create(self._namespace, name, **kwargs)

    def update(self, agent_id: str, **kwargs: Any) -> AgentItem:
        return self._client.agents.update(self._namespace, agent_id, **kwargs)

    def delete(self, agent_id: str) -> None:
        self._client.agents.delete(self._namespace, agent_id)

    def create_key(self, agent_id: str) -> CreateAgentKeyResult:
        return self._client.agents.create_key(self._namespace, agent_id)

    def revoke_key(self, agent_id: str, key_id: str) -> None:
        self._client.agents.revoke_key(self._namespace, agent_id, key_id)


class _ScopedCollaboratorsSync:
    def __init__(self, client: Any, namespace: str) -> None:
        self._client = client
        self._namespace = namespace

    def list(self, **kwargs: Any) -> ListCollaboratorsResponse:
        return self._client.collaborators.list(self._namespace, **kwargs)

    def invite(self, identifier: str, role: str = "read") -> PendingInvitationItem:
        return self._client.collaborators.invite(self._namespace, identifier, role=role)

    def update_role(self, user_id: str, role: str) -> None:
        self._client.collaborators.update_role(self._namespace, user_id, role)

    def remove(self, user_id: str) -> None:
        self._client.collaborators.remove(self._namespace, user_id)

    def revoke_invitation(self, invitation_id: str) -> None:
        self._client.collaborators.revoke_invitation(self._namespace, invitation_id)


class _ScopedScopesSync:
    def __init__(self, client: Any, namespace: str) -> None:
        self._client = client
        self._namespace = namespace

    def list(self) -> list[ScopeItem]:
        return self._client.scopes.list(self._namespace)


class _ScopedPromotionsSync:
    def __init__(self, client: Any, namespace: str) -> None:
        self._client = client
        self._namespace = namespace

    def list(
        self,
        status: str | None = None,
        memory_id: str | None = None,
        page: int | None = None,
        per_page: int | None = None,
    ) -> PaginatedResult[MemoryPromotionRequest]:
        return self._client.promotions.list(
            self._namespace,
            status=status,
            memory_id=memory_id,
            page=page,
            per_page=per_page,
        )

    def approve(self, promotion_id: str, reason: str | None = None) -> dict[str, Any]:
        return self._client.promotions.approve(self._namespace, promotion_id, reason=reason)

    def reject(self, promotion_id: str, reason: str | None = None) -> dict[str, Any]:
        return self._client.promotions.reject(self._namespace, promotion_id, reason=reason)


class _ScopedMemoriesAsync:
    def __init__(self, client: Any, namespace: str, default_subject: str | None = None) -> None:
        self._client = client
        self._namespace = namespace
        self._default_subject = default_subject

    async def list(self, **kwargs: Any) -> PaginatedResult[MemoryItem]:
        return await self._client.memories.list(self._namespace, **kwargs)

    async def get(self, memory_id: str) -> MemoryItem:
        return await self._client.memories.get(self._namespace, memory_id)

    async def create(self, title: str, **kwargs: Any) -> MemoryItem:
        if "subject" not in kwargs or kwargs["subject"] is None:
            kwargs["subject"] = self._default_subject
        return await self._client.memories.create(self._namespace, title, **kwargs)

    async def update(self, memory_id: str, **kwargs: Any) -> MemoryItem:
        return await self._client.memories.update(self._namespace, memory_id, **kwargs)

    async def delete(self, memory_id: str, all_versions: bool = False) -> DeleteMemoryResponse:
        return await self._client.memories.delete(
            self._namespace, memory_id, all_versions=all_versions
        )

    async def star(self, memory_id: str, starred: bool = True) -> MemoryStarResponse:
        return await self._client.memories.star(self._namespace, memory_id, starred=starred)

    async def history(self, memory_id: str) -> MemoryHistoryResponse:
        return await self._client.memories.history(self._namespace, memory_id)

    async def adopt(self, memory_id: str, target_project_ids: list[str]) -> AdoptMemoryResponse:
        return await self._client.memories.adopt(self._namespace, memory_id, target_project_ids)

    async def promote(
        self, memory_id: str, to_scope: str = "project", reason: str | None = None
    ) -> PromoteMemoryResponse:
        return await self._client.memories.promote(
            self._namespace, memory_id, to_scope=to_scope, reason=reason
        )

    async def list_relations(self, memory_id: str) -> MemoryRelationsResponse:
        return await self._client.memories.list_relations(self._namespace, memory_id)

    async def create_relation(
        self,
        memory_id: str,
        target_id: str,
        relation_type: str,
        confidence: float = 0.9,
        metadata: dict[str, Any] | None = None,
    ) -> MemoryRelationItem:
        return await self._client.memories.create_relation(
            self._namespace, memory_id, target_id, relation_type, confidence, metadata
        )

    async def delete_relation(self, memory_id: str, relation_id: str) -> None:
        await self._client.memories.delete_relation(self._namespace, memory_id, relation_id)

    async def list_project_relations(self, **kwargs: Any) -> PaginatedResult[MemoryRelationItem]:
        return await self._client.memories.list_project_relations(self._namespace, **kwargs)

    @property
    def relations(self) -> Any:
        scoped = self

        class _AsyncScopedRelationsProxy:
            async def list(self, memory_id: str) -> MemoryRelationsResponse:
                return await scoped.list_relations(memory_id)

            async def create(
                self,
                memory_id: str,
                target_id: str,
                relation_type: str,
                confidence: float = 0.9,
                metadata: dict[str, Any] | None = None,
            ) -> MemoryRelationItem:
                return await scoped.create_relation(
                    memory_id, target_id, relation_type, confidence, metadata
                )

            async def delete(self, memory_id: str, relation_id: str) -> None:
                await scoped.delete_relation(memory_id, relation_id)

            async def list_project(self, **kwargs: Any) -> PaginatedResult[MemoryRelationItem]:
                return await scoped.list_project_relations(**kwargs)

        return _AsyncScopedRelationsProxy()


class _ScopedAgentsAsync:
    def __init__(self, client: Any, namespace: str) -> None:
        self._client = client
        self._namespace = namespace

    async def list(self, **kwargs: Any) -> PaginatedResult[AgentItem]:
        return await self._client.agents.list(self._namespace, **kwargs)

    async def get(self, agent_id: str) -> AgentItem:
        return await self._client.agents.get(self._namespace, agent_id)

    async def create(self, name: str, **kwargs: Any) -> AgentItem:
        return await self._client.agents.create(self._namespace, name, **kwargs)

    async def update(self, agent_id: str, **kwargs: Any) -> AgentItem:
        return await self._client.agents.update(self._namespace, agent_id, **kwargs)

    async def delete(self, agent_id: str) -> None:
        await self._client.agents.delete(self._namespace, agent_id)

    async def create_key(self, agent_id: str) -> CreateAgentKeyResult:
        return await self._client.agents.create_key(self._namespace, agent_id)

    async def revoke_key(self, agent_id: str, key_id: str) -> None:
        await self._client.agents.revoke_key(self._namespace, agent_id, key_id)


class _ScopedCollaboratorsAsync:
    def __init__(self, client: Any, namespace: str) -> None:
        self._client = client
        self._namespace = namespace

    async def list(self, **kwargs: Any) -> ListCollaboratorsResponse:
        return await self._client.collaborators.list(self._namespace, **kwargs)

    async def invite(self, identifier: str, role: str = "read") -> PendingInvitationItem:
        return await self._client.collaborators.invite(self._namespace, identifier, role=role)

    async def update_role(self, user_id: str, role: str) -> None:
        await self._client.collaborators.update_role(self._namespace, user_id, role)

    async def remove(self, user_id: str) -> None:
        await self._client.collaborators.remove(self._namespace, user_id)

    async def revoke_invitation(self, invitation_id: str) -> None:
        await self._client.collaborators.revoke_invitation(self._namespace, invitation_id)


class _ScopedScopesAsync:
    def __init__(self, client: Any, namespace: str) -> None:
        self._client = client
        self._namespace = namespace

    async def list(self) -> list[ScopeItem]:
        return await self._client.scopes.list(self._namespace)


class _ScopedPromotionsAsync:
    def __init__(self, client: Any, namespace: str) -> None:
        self._client = client
        self._namespace = namespace

    async def list(
        self,
        status: str | None = None,
        memory_id: str | None = None,
        page: int | None = None,
        per_page: int | None = None,
    ) -> PaginatedResult[MemoryPromotionRequest]:
        return await self._client.promotions.list(
            self._namespace,
            status=status,
            memory_id=memory_id,
            page=page,
            per_page=per_page,
        )

    async def approve(self, promotion_id: str, reason: str | None = None) -> dict[str, Any]:
        return await self._client.promotions.approve(self._namespace, promotion_id, reason=reason)

    async def reject(self, promotion_id: str, reason: str | None = None) -> dict[str, Any]:
        return await self._client.promotions.reject(self._namespace, promotion_id, reason=reason)


class ScopedMemCell:
    """Synchronous memory handle scoped to a specific project namespace and default subject."""

    def __init__(
        self,
        client: Any,
        namespace: str,
        subject: str | None = None,
    ) -> None:
        self._client = client
        self.namespace = namespace
        self.default_subject = subject

        self.memories = _ScopedMemoriesSync(client, namespace, subject)
        self.agents = _ScopedAgentsSync(client, namespace)
        self.collaborators = _ScopedCollaboratorsSync(client, namespace)
        self.scopes = _ScopedScopesSync(client, namespace)
        self.promotions = _ScopedPromotionsSync(client, namespace)

    def recall(
        self,
        query: str,
        subject: str | None = None,
        type: str | list[str] | None = None,
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
    ) -> RecallResponse:
        return self._client.recall(
            query=query,
            namespace=self.namespace,
            subject=subject or self.default_subject,
            type=type,
            scope=scope,
            scopes=scopes,
            my_memory=my_memory,
            min_confidence=min_confidence,
            limit=limit,
            tags=tags,
            format=format,
            allow_provisional=allow_provisional,
            metadata=metadata,
            include_metadata=include_metadata,
        )

    def remember(
        self,
        title: str | None = None,
        context: str | None = None,
        example: str | None = None,
        tags: list[str] | None = None,
        subject: str | None = None,
        type: str | None = None,
        status: str | None = None,
        confidence: float | None = None,
        scope: str | None = None,
        required_roles: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        expires_at: Any | None = None,
        raw: str | None = None,
        session_id: str | None = None,
        async_: bool | None = None,
    ) -> RememberResponse:
        return self._client.remember(
            title=title,
            context=context,
            example=example,
            tags=tags,
            subject=subject or self.default_subject,
            type=type,
            status=status,
            confidence=confidence,
            scope=scope,
            required_roles=required_roles,
            metadata=metadata,
            expires_at=expires_at,
            raw=raw,
            session_id=session_id,
            namespace=self.namespace,
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
        auto_distill: bool = True,
        async_: bool | None = None,
    ) -> ReportResponse:
        return self._client.report(
            action_taken=action_taken,
            outcome=outcome,
            subject=subject or self.default_subject,
            reason=reason,
            external_ref=external_ref,
            payload=payload,
            recall_id=recall_id,
            memory_id=memory_id,
            namespace=self.namespace,
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
    ) -> FeedbackResponse:
        return self._client.feedback(
            outcome=outcome,
            memory_id=memory_id,
            recall_id=recall_id,
            reason=reason,
            external_ref=external_ref,
            payload=payload,
            namespace=self.namespace,
        )

    def wait_for_job(
        self,
        job_id: str,
        timeout_ms: int = 15000,
        poll_interval_ms: int = 250,
        on_progress: Callable[[JobEvent], None] | None = None,
    ) -> JobEvent:
        return self._client.wait_for_job(
            job_id=job_id,
            timeout_ms=timeout_ms,
            poll_interval_ms=poll_interval_ms,
            on_progress=on_progress,
        )

    def wrap_execution(
        self,
        action: str,
        fn: Callable[[ScopedExecutionContext], T],
        subject: str | None = None,
        external_ref: str | None = None,
        payload: dict[str, Any] | None = None,
        query: str | None = None,
    ) -> ScopedExecutionResult[T]:
        target_subject = subject or self.default_subject
        recall = self.recall(query=query or action, subject=target_subject)
        context = ScopedExecutionContext(
            recall_id=recall.recall_id,
            prompt_context=recall.prompt_context,
            memories=recall.memories,
            action=action,
            subject=target_subject,
        )

        try:
            result = fn(context)
            report = self.report(
                action_taken=action,
                outcome="worked",
                subject=target_subject,
                recall_id=recall.recall_id,
                external_ref=external_ref,
                payload=payload,
            )
            return ScopedExecutionResult[T](result=result, report=report, recall=recall)
        except Exception as e:
            with contextlib.suppress(Exception):
                self.report(
                    action_taken=action,
                    outcome="failed",
                    reason=str(e),
                    subject=target_subject,
                    recall_id=recall.recall_id,
                    external_ref=external_ref,
                    payload=payload,
                )
            raise

    def consolidate_sweep(
        self,
        *,
        min_similarity: float | None = None,
        min_cluster_size: int | None = None,
        max_cluster_size: int | None = None,
    ) -> ConsolidateSweepResponse:
        """Trigger an asynchronous consolidation sweep in this project namespace (ADR 0075)."""
        return self._client.sweep.consolidate(
            self.namespace,
            min_similarity=min_similarity,
            min_cluster_size=min_cluster_size,
            max_cluster_size=max_cluster_size,
        )


class AsyncScopedMemCell:
    """Asynchronous memory handle scoped to a specific project namespace and default subject."""

    def __init__(
        self,
        client: Any,
        namespace: str,
        subject: str | None = None,
    ) -> None:
        self._client = client
        self.namespace = namespace
        self.default_subject = subject

        self.memories = _ScopedMemoriesAsync(client, namespace, subject)
        self.agents = _ScopedAgentsAsync(client, namespace)
        self.collaborators = _ScopedCollaboratorsAsync(client, namespace)
        self.scopes = _ScopedScopesAsync(client, namespace)
        self.promotions = _ScopedPromotionsAsync(client, namespace)

    async def recall(
        self,
        query: str,
        subject: str | None = None,
        type: str | list[str] | None = None,
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
    ) -> RecallResponse:
        return await self._client.recall(
            query=query,
            namespace=self.namespace,
            subject=subject or self.default_subject,
            type=type,
            scope=scope,
            scopes=scopes,
            my_memory=my_memory,
            min_confidence=min_confidence,
            limit=limit,
            tags=tags,
            format=format,
            allow_provisional=allow_provisional,
            metadata=metadata,
            include_metadata=include_metadata,
        )

    async def remember(
        self,
        title: str | None = None,
        context: str | None = None,
        example: str | None = None,
        tags: list[str] | None = None,
        subject: str | None = None,
        type: str | None = None,
        status: str | None = None,
        confidence: float | None = None,
        scope: str | None = None,
        required_roles: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        expires_at: Any | None = None,
        raw: str | None = None,
        session_id: str | None = None,
        async_: bool | None = None,
    ) -> RememberResponse:
        return await self._client.remember(
            title=title,
            context=context,
            example=example,
            tags=tags,
            subject=subject or self.default_subject,
            type=type,
            status=status,
            confidence=confidence,
            scope=scope,
            required_roles=required_roles,
            metadata=metadata,
            expires_at=expires_at,
            raw=raw,
            session_id=session_id,
            namespace=self.namespace,
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
        auto_distill: bool = True,
        async_: bool | None = None,
    ) -> ReportResponse:
        return await self._client.report(
            action_taken=action_taken,
            outcome=outcome,
            subject=subject or self.default_subject,
            reason=reason,
            external_ref=external_ref,
            payload=payload,
            recall_id=recall_id,
            memory_id=memory_id,
            namespace=self.namespace,
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
    ) -> FeedbackResponse:
        return await self._client.feedback(
            outcome=outcome,
            memory_id=memory_id,
            recall_id=recall_id,
            reason=reason,
            external_ref=external_ref,
            payload=payload,
            namespace=self.namespace,
        )

    async def wait_for_job(
        self,
        job_id: str,
        timeout_ms: int = 15000,
        poll_interval_ms: int = 250,
        on_progress: Callable[[JobEvent], None] | None = None,
    ) -> JobEvent:
        return await self._client.wait_for_job(
            job_id=job_id,
            timeout_ms=timeout_ms,
            poll_interval_ms=poll_interval_ms,
            on_progress=on_progress,
        )

    async def wrap_execution(
        self,
        action: str,
        fn: Callable[[ScopedExecutionContext], Awaitable[T] | T],
        subject: str | None = None,
        external_ref: str | None = None,
        payload: dict[str, Any] | None = None,
        query: str | None = None,
    ) -> ScopedExecutionResult[T]:
        target_subject = subject or self.default_subject
        recall = await self.recall(query=query or action, subject=target_subject)
        context = ScopedExecutionContext(
            recall_id=recall.recall_id,
            prompt_context=recall.prompt_context,
            memories=recall.memories,
            action=action,
            subject=target_subject,
        )

        try:
            fn_res = fn(context)
            if inspect.isawaitable(fn_res):
                result = await fn_res
            else:
                result = fn_res
            report = await self.report(
                action_taken=action,
                outcome="worked",
                subject=target_subject,
                recall_id=recall.recall_id,
                external_ref=external_ref,
                payload=payload,
            )
            return ScopedExecutionResult[T](result=result, report=report, recall=recall)
        except Exception as e:
            with contextlib.suppress(Exception):
                await self.report(
                    action_taken=action,
                    outcome="failed",
                    reason=str(e),
                    subject=target_subject,
                    recall_id=recall.recall_id,
                    external_ref=external_ref,
                    payload=payload,
                )
            raise

    async def consolidate_sweep(
        self,
        *,
        min_similarity: float | None = None,
        min_cluster_size: int | None = None,
        max_cluster_size: int | None = None,
    ) -> ConsolidateSweepResponse:
        """Trigger an asynchronous consolidation sweep in this project namespace (ADR 0075)."""
        return await self._client.sweep.consolidate(
            self.namespace,
            min_similarity=min_similarity,
            min_cluster_size=min_cluster_size,
            max_cluster_size=max_cluster_size,
        )
