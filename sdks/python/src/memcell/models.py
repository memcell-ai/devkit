from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

MemoryType = Literal["instruction", "decision", "fact", "preference"]
MEMORY_TYPES = ("instruction", "decision", "fact", "preference")

MEMORY_SCOPES = ("organization", "team", "workspace", "user")
MemoryScope = Literal["organization", "team", "workspace", "user", str]

PromotionStatus = Literal["pending", "approved", "rejected"]
RelationType = Literal[
    "relates_to",
    "part_of",
    "depends_on",
    "justifies",
    "refines",
    "limits",
    "supersedes",
    "caused_by",
    "tensions_with",
]
MemoryStatus = Literal["provisional", "active", "pinned", "decayed", "refuted"]
OutcomeVerdict = Literal["worked", "failed", "avoided"]
ThreadStatus = Literal["active", "paused", "completed"]
ThreadScope = Literal["user", "workspace"]
SourceType = Literal["url", "webhook", "github"]
SourceStatus = Literal["idle", "syncing", "ready", "error"]

T = TypeVar("T")


class PaginationMetadata(BaseModel):
    page: int
    per_page: int
    total: int
    has_more: bool


class PaginatedResult(BaseModel, Generic[T]):
    items: list[T] = Field(default_factory=list)
    pagination: PaginationMetadata


class MemoryAuthor(BaseModel):
    type: str
    id: str | None = None
    name: str | None = None


class MemoryRelationItem(BaseModel):
    id: str
    workspace_id: str | None = None
    source_id: str
    target_id: str
    relation_type: RelationType
    confidence: float = 0.9
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    source_memory: MemoryItem | None = None
    target_memory: MemoryItem | None = None


class MemoryRelationsResponse(BaseModel):
    incoming: list[MemoryRelationItem] = Field(default_factory=list)
    outgoing: list[MemoryRelationItem] = Field(default_factory=list)


class MemoryItem(BaseModel):
    """An individual atomic memory in MemCell."""

    id: str
    root_id: str | None = None
    version: int | None = 1
    title: str
    content: str | None = None
    context: str | None = None
    observation: str | None = None
    tags: list[str] = Field(default_factory=list)
    entities: list[str] = Field(default_factory=list)
    resources: list[str] = Field(default_factory=list)
    applies_at: list[str] = Field(default_factory=list)
    subject: str | None = None
    type: MemoryType = "instruction"
    enforce: bool = False
    status: MemoryStatus = "active"
    confidence: float = 0.5
    score: float | None = None
    relevance: float | None = None
    decay_factor: float | None = None
    stability: float | None = None
    reinforcement_count: int | None = None
    is_pinned: bool = False
    starred: bool | None = None
    star_count: int | None = None
    scope: str = "workspace"
    required_roles: list[str] = Field(default_factory=list)
    scope_promoted_at: datetime | None = None
    scope_promoted_by: str | None = None
    source_thread_id: str | None = None
    source_document_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    author: MemoryAuthor | None = None
    source: str | None = None
    relations: list[MemoryRelationItem] | None = None
    expires_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @field_validator("type", mode="before")
    @classmethod
    def _validate_type(cls, v: Any) -> str:
        if not v:
            return "instruction"
        s = str(v).lower()
        if s in ("instruction", "decision", "fact", "preference"):
            return s
        if s == "observation":
            return "fact"
        return "instruction"

    @property
    def text(self) -> str:
        """Alias for title."""
        return self.title


class MemoryStarResponse(BaseModel):
    root_id: str
    starred: bool
    star_count: int


class MemoryHistoryItem(BaseModel):
    id: str
    root_id: str
    version: int
    title: str
    content: str | None = None
    context: str | None = None
    observation: str | None = None
    tags: list[str] = Field(default_factory=list)
    entities: list[str] = Field(default_factory=list)
    resources: list[str] = Field(default_factory=list)
    applies_at: list[str] = Field(default_factory=list)
    confidence: float = 0.5
    status: MemoryStatus = "active"
    type: MemoryType = "instruction"
    enforce: bool = False
    subject: str | None = None
    scope: str = "workspace"
    author_type: str = "user"
    author_id: str | None = None
    author_name: str | None = None
    mutation_type: str | None = None
    change_reason: str | None = None
    created_at: datetime | None = None

    @field_validator("type", mode="before")
    @classmethod
    def _validate_type(cls, v: Any) -> str:
        if not v:
            return "instruction"
        s = str(v).lower()
        if s in ("instruction", "decision", "fact", "preference"):
            return s
        if s == "observation":
            return "fact"
        return "instruction"


class MemoryHistoryResponse(BaseModel):
    root_id: str
    total_versions: int
    history: list[MemoryHistoryItem] = Field(default_factory=list)


class AdoptedTarget(BaseModel):
    workspace_id: str | None = None
    memory_id: str | None = None
    already_existed: bool


class AdoptMemoryResponse(BaseModel):
    ok: bool
    source_memory_id: str | None = None
    adopted: list[AdoptedTarget] = Field(default_factory=list)


class DeleteMemoryResponse(BaseModel):
    """Result of deleting a memory."""

    status: str = "deleted"
    deleted_count: int = Field(default=1, alias="deletedCount")
    deleted_scope: Literal["version", "memory"] | str = Field(
        default="memory", alias="deletedScope"
    )
    next_id: str | None = Field(default=None, alias="nextId")
    restored_version: int | None = Field(default=None, alias="restoredVersion")
    message: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class MemoryPromotionRequest(BaseModel):
    id: str
    memory_id: str | None = None
    from_scope: str
    to_scope: str
    status: PromotionStatus = "pending"
    requester_id: str | None = None
    requester_reason: str | None = None
    reviewer_id: str | None = None
    review_reason: str | None = None
    reviewed_at: datetime | None = None
    memory: MemoryItem | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PromoteMemoryResponse(BaseModel):
    promoted: bool = True
    memory: MemoryItem | None = None
    promotion_request: MemoryPromotionRequest | None = None


class ThreadMilestoneItem(BaseModel):
    phase: str | None = None
    title: str | None = None
    summary: str
    timestamp: str | None = None


class ThreadActionItem(BaseModel):
    type: Literal["tool_call", "file_touch", "command", "milestone"] = "tool_call"
    category: str | None = None
    name: str = ""
    tool: str | None = None
    target: str | None = None
    summary: str = ""
    input_summary: str | None = None
    output_summary: str | None = None
    outcome: str | None = None
    status: str | None = None


class ThreadTurnItem(BaseModel):
    id: str
    thread_id: str
    workspace_id: str
    turn_index: int = 1
    summary: str = ""
    user_intent: str | None = None
    agent_outcome: str | None = None
    actions: list[ThreadActionItem] = Field(default_factory=list)
    decisions: list[str] = Field(default_factory=list)
    resources: list[str] = Field(default_factory=list)
    extracted_memory_ids: list[str] = Field(default_factory=list)
    created_at: datetime | None = None


class ThreadItem(BaseModel):
    id: str
    workspace_id: str
    user_id: str | None = None
    agent_id: str | None = None
    external_session_id: str | None = None
    title: str
    status: ThreadStatus = "active"
    scope: ThreadScope = "user"
    summary: str = ""
    current_objective: str | None = None
    decisions: list[str] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)
    entities: list[str] = Field(default_factory=list)
    milestones: list[ThreadMilestoneItem] = Field(default_factory=list)
    resources: list[str] = Field(default_factory=list)
    turns: list[ThreadTurnItem] = Field(default_factory=list)
    turn_count: int = 1
    last_active_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ThreadDetailResponse(BaseModel):
    thread: ThreadItem
    turns: list[ThreadTurnItem] = Field(default_factory=list)
    memories: list[MemoryItem] = Field(default_factory=list)


class DocumentItem(BaseModel):
    id: str
    workspace_id: str = ""
    title: str = ""
    path: str | None = None
    source_path: str | None = None
    source_uri: str | None = None
    source_type: str = "markdown"
    content_type: str = "markdown"
    content_hash: str = ""
    summary: str | None = None
    status: str | None = None
    chunk_count: int = 0
    size_bytes: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DocumentChunkItem(BaseModel):
    id: str
    document_id: str = ""
    chunk_index: int = 0
    heading: str | None = None
    content: str = ""
    token_count: int = 0
    created_at: datetime | None = None


class DocumentChunkSearchResult(BaseModel):
    id: str
    document_id: str
    document_title: str
    path: str | None = None
    source_path: str | None = None
    source_uri: str | None = None
    chunk_index: int = 0
    heading: str | None = None
    content: str
    score: float = 0.0


class DocumentSearchResponse(BaseModel):
    chunks: list[DocumentChunkSearchResult] = Field(default_factory=list)


class DocumentDetailResponse(BaseModel):
    document: DocumentItem
    chunks: list[DocumentChunkItem] = Field(default_factory=list)
    memories: list[MemoryItem] = Field(default_factory=list)


class IngestDocumentResponse(BaseModel):
    document: DocumentItem
    chunk_count: int = 0
    chunks_created: int = 0
    deduplicated: bool = False
    unchanged: bool = False
    distilled: dict[str, Any] | None = None
    distilled_memories_count: int = 0
    memories_created: int = 0


class RecallResponse(BaseModel):
    """Result of pre-flight memory recall."""

    recall_id: str
    prompt_context: str
    memories: list[MemoryItem] = Field(default_factory=list)
    matched_thread: ThreadItem | None = None
    active_threads: list[ThreadItem] | None = None
    document_chunks: list[DocumentChunkSearchResult] | None = None
    matched_tags: list[str] | None = None
    guard_mode: str | None = None
    profile: str | dict[str, Any] | None = None


class RememberResponse(BaseModel):
    """Result of explicitly filing memories into MemCell."""

    created: list[MemoryItem] = Field(default_factory=list)
    evolved: list[MemoryItem] = Field(default_factory=list)
    reinforced: list[dict[str, Any]] | None = None
    superseded: list[dict[str, Any]] | None = None
    thread: ThreadItem | None = None
    note: str | None = None
    accepted: bool | None = None
    job_id: str | None = None
    status: str | None = None


class ReportResponse(BaseModel):
    """Result of post-flight execution reporting and reinforcement."""

    outcome: OutcomeVerdict
    attributed: list[dict[str, Any]] = Field(default_factory=list)
    distilled_memory: MemoryItem | None = None
    note: str | None = None
    accepted: bool | None = None
    job_id: str | None = None
    status: str | None = None


class FeedbackResponse(BaseModel):
    """Direct memory evaluation response."""

    outcome: OutcomeVerdict
    attributed: list[dict[str, Any]] = Field(default_factory=list)


class JobEvent(BaseModel):
    """Telemetry milestone during background job execution."""

    step: str
    progress: int
    message: str | None = None
    metadata: Any | None = None


class ConsolidateSweepResponse(BaseModel):
    """Consolidation sweep job trigger response (ADR 0075)."""

    ok: bool = True
    job_id: str = Field(alias="jobId")
    status: str
    message: str
    phases: list[str] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


# ─── Workspaces Models ───


class WorkspaceOwner(BaseModel):
    type: str
    slug: str
    name: str


class WorkspaceItem(BaseModel):
    id: str
    name: str
    slug: str
    owner_slug: str | None = Field(default=None, alias="ownerSlug")
    description: str | None = None

    model_config = ConfigDict(populate_by_name=True)
    website: str | None = None
    tags: list[str] = Field(default_factory=list)
    visibility: str = "private"
    ownership: str | None = None
    owner: WorkspaceOwner | None = None
    state_root: str | None = None
    instruction: str | None = None
    guard_mode: str | None = None
    tag_prompt: str | None = None
    profile: str | None = None
    vitals: dict[str, Any] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ─── Agents Models ───


class AgentItem(BaseModel):
    id: str
    workspace_id: str | None = None
    name: str
    slug: str
    kind: str = "coding_assistant"
    model: str | None = None
    description: str | None = None
    status: str = "active"
    metadata: dict[str, Any] = Field(default_factory=dict)
    key_count: int | None = None
    active_key_count: int | None = None
    last_active_at: datetime | None = None
    telemetry: dict[str, Any] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AgentKeyItem(BaseModel):
    id: str
    agent_id: str
    preview: str
    name: str | None = None
    created_at: datetime | None = None
    last_used_at: datetime | None = None
    expires_at: datetime | None = None


class CreateAgentKeyResult(BaseModel):
    id: str
    key: str
    preview: str
    name: str | None = None


# ─── Collaborators Models ───


class CollaboratorItem(BaseModel):
    id: str
    user_id: str
    name: str
    handle: str | None = None
    email: str
    image: str | None = None
    role: str = "read"
    source: str = "direct"
    inherited: bool = False
    created_at: datetime | None = None


class PendingInvitationItem(BaseModel):
    id: str
    email: str
    role: str = "read"
    invited_by: dict[str, Any] | None = None
    expires_at: datetime | None = None
    created_at: datetime | None = None


class ListCollaboratorsResponse(BaseModel):
    collaborators: list[CollaboratorItem] = Field(default_factory=list)
    pending_invitations: list[PendingInvitationItem] = Field(default_factory=list)
    pagination: PaginationMetadata


# ─── Organizations Models ───


class OrganizationItem(BaseModel):
    id: str
    slug: str
    name: str
    role: str | None = None
    bio: str | None = None
    website: str | None = None
    logo: str | None = None
    member_count: int | None = None
    workspace_count: int | None = None
    created_at: datetime | None = None


class OrgMemberItem(BaseModel):
    id: str
    user_id: str
    name: str
    handle: str | None = None
    email: str
    image: str | None = None
    role: str = "member"
    joined_at: datetime | None = None


class OrgInvitationItem(BaseModel):
    id: str
    email: str
    role: str = "member"
    team_id: str | None = None
    invited_by: dict[str, Any] | None = None
    expires_at: datetime | None = None
    created_at: datetime | None = None


# ─── Usage Models ───


class _UsageModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class QuotaMetric(_UsageModel):
    used: int
    # None when the plan has no fixed limit, as on Enterprise.
    limit: int | None
    percentage: float
    is_near_limit: bool
    is_over_limit: bool


class MemoryTypeBreakdown(_UsageModel):
    instruction: int
    decision: int
    fact: int
    preference: int
    provisional: int
    enforced: int


class UsagePlan(_UsageModel):
    id: str
    name: str
    status: Literal["active", "trialing", "past_due", "canceled"]
    renews_at: datetime | None
    rate_limit_per_minute: int
    soft_limit_percentage: float | None = None
    soft_warning_threshold: int | None = None
    throttled_requests_count: int | None = None
    is_custom_rate_override: bool | None = None
    rate_multiplier: float | None = None
    bypass_rate_limits: bool | None = None


class MemoryQuota(QuotaMetric):
    types: MemoryTypeBreakdown | None = None
    is_custom_override: bool | None = None
    custom_memory_limit: int | None = None


class UnlimitedGuarantee(_UsageModel):
    workspaces: Literal[True]
    requests: Literal[True]


class UsageQuotas(_UsageModel):
    plan: UsagePlan
    memories: MemoryQuota
    unlimited_guarantee: UnlimitedGuarantee


class UsageSummary(_UsageModel):
    total_ingress_calls: int
    recall_count: int
    remember_count: int
    feedback_count: int
    ingest_count: int
    error_count: int
    total_memories: int
    active_workspaces_count: int
    avg_daily_requests: int
    total_soft_warnings: int
    total_throttled: int


class OwnerDailyTimeSeriesItem(_UsageModel):
    date: str
    label: str
    recall: int
    remember: int
    feedback: int
    ingest: int
    errors: int
    total: int
    soft_warnings: int
    throttled: int


class WorkspaceUsageItem(_UsageModel):
    workspace_id: str
    name: str
    slug: str
    visibility: Literal["private", "public"]
    total_requests: int
    recall_count: int
    remember_count: int
    feedback_count: int
    ingest_count: int
    memory_count: int
    share_percentage: float


class UsageOwner(_UsageModel):
    id: str
    slug: str
    name: str
    type: Literal["user", "org"]


class UsagePeriod(_UsageModel):
    start: datetime
    end: datetime


class OwnerUsage(_UsageModel):
    owner: UsageOwner
    timeframe: Literal["30d", "90d"]
    period: UsagePeriod
    quotas: UsageQuotas
    summary: UsageSummary
    daily_time_series: list[OwnerDailyTimeSeriesItem]
    workspace_breakdown: list[WorkspaceUsageItem]


# ─── Account Models ───


class AccountProfile(BaseModel):
    id: str
    email: str
    name: str | None = None
    handle: str | None = None
    image: str | None = None
    bio: str | None = None
    website: str | None = None
    role: str = "member"
    created_at: datetime | None = None


class ApiKeyItem(BaseModel):
    id: str
    name: str
    preview: str
    prefix: str | None = None
    expires_at: datetime | None = None
    last_used_at: datetime | None = None
    created_at: datetime | None = None


PersonalAccessTokenItem = ApiKeyItem


class CreatedApiKeyResult(BaseModel):
    id: str
    name: str
    key: str = ""
    token: str = ""
    preview: str = ""
    prefix: str | None = None
    expires_at: datetime | None = None
    created_at: datetime | None = None


CreatedPersonalTokenResult = CreatedApiKeyResult


# ─── Scope Models ───


class ScopeItem(BaseModel):
    name: str
    count: int
    is_private: bool | None = None


# ─── Context Models ───


class ScopedExecutionContext(BaseModel):
    """Context object injected into agent callbacks during wrap_execution."""

    recall_id: str
    prompt_context: str
    memories: list[MemoryItem] = Field(default_factory=list)
    action: str
    subject: str | None = None


# ─── Enterprise SSO Models ───


class SSOProviderSummary(BaseModel):
    id: str
    provider_id: str
    issuer: str
    domain: str
    protocol: str
    domain_verified: bool = False
    organization_id: str | None = None
    created_at: datetime | str | None = None
    updated_at: datetime | str | None = None


class SSOVerificationToken(BaseModel):
    token: str
    dns_record_name: str
    dns_record_type: str = "TXT"
    domain: str


class SSODomainLookupResult(BaseModel):
    sso_available: bool = False
    sso_enforced: bool = False
    provider_id: str | None = None
    organization_id: str | None = None
    organization_slug: str | None = None
    organization_name: str | None = None


class OrganizationSSOResult(BaseModel):
    ok: bool = True
    providers: list[SSOProviderSummary] = Field(default_factory=list)
    sso_enforced: bool = False


def _to_camel(string: str) -> str:
    components = string.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=_to_camel)


# ─── Fleet Management Models ───


class FleetAgent(CamelModel):
    id: str
    name: str
    slug: str
    scope: str = "organization"
    framework: str | None = None
    model: str | None = None
    status: str = "active"
    health: str = "healthy"
    description: str | None = None
    organization_id: str | None = None
    team_id: str | None = None
    team_name: str | None = None
    workspace_id: str | None = None
    workspace_name: str | None = None
    last_active_at: datetime | str | None = None
    active_key_count: int = 0
    workspace_grant_count: int = 0
    suspension_reason: str | None = None
    suspended_at: datetime | str | None = None
    created_at: datetime | str | None = None


class FleetAgentDetail(CamelModel):
    agent: FleetAgent
    team_name: str | None = None
    workspace_name: str | None = None
    keys: list[dict[str, Any]] = Field(default_factory=list)
    grants: list[dict[str, Any]] = Field(default_factory=list)


class FleetAgentKeyCreated(CamelModel):
    key: str
    key_prefix: str
    key_id: str


class CreateFleetAgentResult(CamelModel):
    agent: FleetAgent
    key: FleetAgentKeyCreated | None = None


# ─── Audit & SIEM Models ───


class AuditEvent(CamelModel):
    id: str
    organization_id: str
    workspace_id: str | None = None
    team_id: str | None = None
    actor_type: str = "user"
    actor_id: str | None = None
    actor_name: str | None = None
    action: str
    target_type: str
    target_id: str
    ip_address: str | None = None
    user_agent: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | str | None = None


class SiemDestination(CamelModel):
    id: str
    organization_id: str
    name: str
    destination_type: str = "webhook"
    url: str
    secret_token: str | None = None
    format: str = "json"
    enabled: bool = True
    created_at: datetime | str | None = None


# ─── Workspace & Enterprise Insights Models ───


class ConfidenceCalibrationBucket(CamelModel):
    bucket: str
    range: str
    label: str
    min_confidence: float = 0.0
    max_confidence: float = 1.0
    predicted_confidence: float = 0.0
    observed_worked_rate: float | None = None
    worked_count: int = 0
    failed_count: int = 0
    sample_count: int = 0
    calibration_gap: float | None = None


class ConfidenceCalibrationSummary(CamelModel):
    total_samples: int = 0
    expected_calibration_error: float | None = None
    brier_score: float | None = None
    high_confidence_worked_rate: float | None = None
    low_confidence_worked_rate: float | None = None
    reliability_lift_pct: float | None = None
    buckets: list[ConfidenceCalibrationBucket] = Field(default_factory=list)


class GovernanceShieldSummary(CamelModel):
    quarantined_user_scope_count: int = 0
    provisional_count: int = 0
    demoted_or_refuted_count: int = 0
    enforced_guard_count: int = 0
    approved_promotions_count: int = 0
    pending_promotions_count: int = 0


class WorkspaceInsightsSummary(CamelModel):
    recalls: dict[str, Any] = Field(default_factory=dict)
    task_verification: dict[str, Any] = Field(default_factory=dict)
    memory_health: dict[str, Any] = Field(default_factory=dict)
    latency: dict[str, Any] = Field(default_factory=dict)
    total_requests: int = 0
    total_errors: int = 0
    success_rate: float = 100.0
    avg_latency_ms: float = 0.0
    active_memories_count: int = 0
    avg_confidence: float = 0.0


class WorkspaceInsights(CamelModel):
    timeframe: str = "24h"
    summary: WorkspaceInsightsSummary = Field(default_factory=WorkspaceInsightsSummary)
    calibration: ConfidenceCalibrationSummary = Field(default_factory=ConfidenceCalibrationSummary)
    governance: GovernanceShieldSummary = Field(default_factory=GovernanceShieldSummary)
    operation_buckets: list[dict[str, Any]] = Field(default_factory=list)
    outcome_buckets: list[dict[str, Any]] = Field(default_factory=list)
    traffic_buckets: list[dict[str, Any]] = Field(default_factory=list)
    confidence_bands: list[dict[str, Any]] = Field(default_factory=list)
    agent_shares: list[dict[str, Any]] = Field(default_factory=list)
    top_memories: list[dict[str, Any]] = Field(default_factory=list)
    activity_feed: list[dict[str, Any]] = Field(default_factory=list)
    memories_requiring_attention: list[dict[str, Any]] = Field(default_factory=list)
    standing_instructions: list[dict[str, Any]] = Field(default_factory=list)


class LatencyMs(CamelModel):
    p50: float = 0.0
    p95: float = 0.0
    p99: float = 0.0


class EnterpriseKpis(CamelModel):
    dead_end_avoidance_rate: float = 100.0
    recall_utilization_rate: float = 0.0
    recall_precision_rate: float = 100.0
    memory_convergence_rate: float = 0.0
    tokens_saved: int = 0
    estimated_cost_saved_usd: float = 0.0
    latency_ms: LatencyMs = Field(default_factory=LatencyMs)


class EnterpriseMetrics(CamelModel):
    total_recalls: int = 0
    worked_recalls: int = 0
    failed_recalls: int = 0
    pending_recalls: int = 0
    total_memories: int = 0
    converged_memories: int = 0


class EnterpriseInsights(CamelModel):
    timeframe: str = "30d"
    kpis: EnterpriseKpis = Field(default_factory=EnterpriseKpis)
    metrics: EnterpriseMetrics = Field(default_factory=EnterpriseMetrics)
    calibration: ConfidenceCalibrationSummary | None = None
    governance: GovernanceShieldSummary | None = None
    timeseries: list[dict[str, Any]] = Field(default_factory=list)


# ─── Team Management Models ───


class OrgTeam(CamelModel):
    id: str
    name: str
    organization_id: str
    member_count: int = 0
    workspace_count: int = 0
    agent_count: int = 0
    created_at: datetime | str | None = None
    updated_at: datetime | str | None = None


class OrgTeamDetail(CamelModel):
    team: dict[str, Any]
    workspaces: list[dict[str, Any]] = Field(default_factory=list)
    agents: list[dict[str, Any]] = Field(default_factory=list)


class TeamMemberItem(CamelModel):
    id: str
    user_id: str
    role: str = "member"
    name: str | None = None
    email: str | None = None
    handle: str | None = None
    image: str | None = None
    created_at: datetime | str | None = None


# ─── Workspace Webhooks Models ───


class WorkspaceWebhookItem(CamelModel):
    id: str
    workspace_id: str
    name: str
    url: str
    secret: str | None = None
    events: list[str] = Field(default_factory=list)
    enabled: bool = True
    created_at: datetime | str | None = None
    updated_at: datetime | str | None = None


class WebhookPingResult(CamelModel):
    ok: bool
    status_code: int = Field(alias="statusCode", default=200)
    status_text: str = Field(alias="statusText", default="OK")
    error: str | None = None


# ─── Workspace Activity Models ───


class WorkspaceActivityItem(CamelModel):
    id: str
    timestamp: datetime | str | None = None
    outcome: str = "worked"
    memory_id: str | None = None
    subject: str | None = None
    note: str | None = None
    agent_id: str | None = None
    caller: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


# ─── Invitations Models ───


class InvitationItem(CamelModel):
    id: str
    organization_id: str | None = None
    organization_slug: str | None = None
    workspace_id: str | None = None
    email: str
    role: str = "member"
    status: str = "pending"
    created_at: datetime | str | None = None
    expires_at: datetime | str | None = None


# ─── Operator Models ───


class OperatorStats(CamelModel):
    total_users: int = 0
    total_workspaces: int = 0
    total_memories: int = 0
    total_agents: int = 0
    active_recalls_24h: int = 0
    uptime_seconds: float = 0.0
    version: str = "1.0.0"


# ─── Workspace Sources Models (URL / Sitemap, Inbound Webhook, GitHub) ───


class SourceItem(CamelModel):
    id: str
    workspace_id: str = ""
    type: SourceType = "url"
    name: str = ""
    repo_full_name: str | None = None
    default_branch: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    status: SourceStatus = "idle"
    last_synced_sha: str | None = None
    last_synced_at: datetime | str | None = None
    last_error: str | None = None
    document_count: int = 0
    memory_count: int = 0
    created_at: datetime | str | None = None
    updated_at: datetime | str | None = None


class CreateSourceResponse(CamelModel):
    source: SourceItem
    webhook_secret: str | None = None
    ingest_path: str | None = None


class SyncSourceResponse(CamelModel):
    source: SourceItem | None = None
    status: str = "ready"
    synced_files: int = 0
    skipped_files: int = 0
    total_chunks: int = 0
    total_memories: int = 0
    head_sha: str | None = None
    message: str | None = None


class WebhookIngestDocumentResult(CamelModel):
    id: str
    title: str = ""
    chunk_count: int = 0
    deduplicated: bool = False


class WebhookIngestResponse(CamelModel):
    status: str = "ready"
    ingested_documents: int = 0
    skipped_documents: int = 0
    total_chunks: int = 0
    total_memories: int = 0
    documents: list[WebhookIngestDocumentResult] = Field(default_factory=list)
