from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

StatementType = Literal["guard", "directive", "fact", "preference", "observation"]
STATEMENT_SCOPES = ("organization", "team", "project", "user")
StatementScope = Literal["organization", "team", "project", "user", str]
PromotionStatus = Literal["pending", "approved", "rejected"]
MemoryKind = Literal[
    "guard", "directive", "fact", "preference", "observation", "invariant", "reflex", "episodic"
]
RelationType = Literal["constrains", "justifies", "refines", "depends_on", "tensions_with"]
StatementStatus = Literal["provisional", "active", "pinned", "decayed", "refuted"]
MemoryStatus = StatementStatus
OutcomeVerdict = Literal["worked", "failed", "avoided"]

T = TypeVar("T")


class PaginationMetadata(BaseModel):
    page: int
    per_page: int
    total: int
    has_more: bool


class PaginatedResult(BaseModel, Generic[T]):
    items: list[T] = Field(default_factory=list)
    pagination: PaginationMetadata


class StatementAuthor(BaseModel):
    type: str
    id: str | None = None
    name: str | None = None


class StatementRelationItem(BaseModel):
    id: str
    project_id: str
    source_id: str
    target_id: str
    relation_type: RelationType
    confidence: float = 0.9
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    source_statement: StatementItem | None = None
    target_statement: StatementItem | None = None


class StatementRelationsResponse(BaseModel):
    incoming: list[StatementRelationItem] = Field(default_factory=list)
    outgoing: list[StatementRelationItem] = Field(default_factory=list)


class StatementItem(BaseModel):
    """An individual atomic statement in MemCell."""

    id: str
    root_id: str | None = None
    title: str
    context: str | None = None
    example: str | None = None
    tags: list[str] = Field(default_factory=list)
    subject: str | None = None
    type: StatementType = "fact"
    kind: str | None = None  # Deprecated alias retained for backward compatibility
    status: StatementStatus = "active"
    confidence: float = 0.5
    score: float | None = None
    relevance: float | None = None
    decay_factor: float | None = None
    stability: float | None = None
    reinforcement_count: int | None = None
    is_pinned: bool = False
    starred: bool | None = None
    star_count: int | None = None
    is_guard: bool = False
    is_invariant: bool = False
    scope: str = "project"
    required_roles: list[str] = Field(default_factory=list)
    scope_promoted_at: datetime | None = None
    scope_promoted_by: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    author: StatementAuthor | None = None
    source: str | None = None
    relations: list[StatementRelationItem] | None = None
    expires_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @field_validator("type", mode="before")
    @classmethod
    def _validate_type(cls, v: Any) -> str:
        if not v:
            return "fact"
        s = str(v).lower()
        if s in ("guard", "directive", "fact", "preference", "observation"):
            return s
        if s in ("invariant", "reflex"):
            return "directive"
        if s == "episodic":
            return "observation"
        return "fact"


class StatementStarResponse(BaseModel):
    root_id: str
    starred: bool
    star_count: int


class StatementHistoryItem(BaseModel):
    id: str
    root_id: str
    version: int
    title: str
    context: str | None = None
    example: str | None = None
    tags: list[str] = Field(default_factory=list)
    confidence: float = 0.5
    status: StatementStatus = "active"
    type: StatementType = "fact"
    kind: str | None = None
    subject: str | None = None
    scope: str = "common"
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
            return "fact"
        s = str(v).lower()
        if s in ("directive", "fact", "preference", "observation"):
            return s
        if s in ("invariant", "reflex"):
            return "directive"
        if s == "episodic":
            return "observation"
        return "fact"


class StatementHistoryResponse(BaseModel):
    root_id: str
    total_versions: int
    history: list[StatementHistoryItem] = Field(default_factory=list)


class AdoptedTarget(BaseModel):
    project_id: str
    statement_id: str
    already_existed: bool


class AdoptStatementResponse(BaseModel):
    ok: bool
    source_statement_id: str
    adopted: list[AdoptedTarget] = Field(default_factory=list)


class StatementPromotionRequest(BaseModel):
    id: str
    statement_id: str
    from_scope: str
    to_scope: str
    status: PromotionStatus = "pending"
    requester_id: str | None = None
    requester_reason: str | None = None
    reviewer_id: str | None = None
    review_reason: str | None = None
    reviewed_at: datetime | None = None
    statement: StatementItem | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PromoteStatementResponse(BaseModel):
    promoted: bool = True
    statement: StatementItem | None = None
    promotion_request: StatementPromotionRequest | None = None


class RecallResponse(BaseModel):
    """Result of pre-flight memory recall."""

    recall_id: str
    prompt_context: str
    statements: list[StatementItem] = Field(default_factory=list)
    matched_tags: list[str] | None = None
    guard_mode: str | None = None
    profile: dict[str, Any] | None = None


class RememberResponse(BaseModel):
    """Result of explicitly filing statements into MemCell memory."""

    created: list[StatementItem] = Field(default_factory=list)
    reinforced: list[dict[str, Any]] | None = None
    superseded: list[dict[str, Any]] | None = None
    note: str | None = None
    accepted: bool | None = None
    job_id: str | None = None
    status: str | None = None


class ReportResponse(BaseModel):
    """Result of post-flight execution reporting and reinforcement."""

    outcome: OutcomeVerdict
    attributed: list[dict[str, Any]] = Field(default_factory=list)
    distilled_statement: StatementItem | None = None
    note: str | None = None
    accepted: bool | None = None
    job_id: str | None = None
    status: str | None = None


class FeedbackResponse(BaseModel):
    """Direct statement evaluation response."""

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


# ─── Projects Models ───


class ProjectOwner(BaseModel):
    type: str
    slug: str
    name: str


class ProjectItem(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None = None
    website: str | None = None
    tags: list[str] = Field(default_factory=list)
    visibility: str = "private"
    ownership: str | None = None
    owner: ProjectOwner | None = None
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
    project_id: str
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
    project_count: int | None = None
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


class StatementTypeQuotas(BaseModel):
    guard: int | None = None
    directive: int = 0
    fact: int = 0
    preference: int = 0
    observation: int = 0
    provisional: int = 0


class StatementQuotas(BaseModel):
    total: int = 0
    limit: int = 0
    percent: float = 0.0
    types: StatementTypeQuotas = Field(default_factory=StatementTypeQuotas)


class ApiRequestQuotas(BaseModel):
    total: int = 0
    limit: int = 0
    percent: float = 0.0
    window_days: int = 30


class UsageQuotas(BaseModel):
    statements: StatementQuotas = Field(default_factory=StatementQuotas)
    api_requests: ApiRequestQuotas = Field(default_factory=ApiRequestQuotas)


class OwnerUsage(BaseModel):
    owner: dict[str, Any]
    timeframe: str = "30d"
    quotas: UsageQuotas = Field(default_factory=UsageQuotas)
    rate_limits: dict[str, Any] = Field(default_factory=dict)


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


class PersonalAccessTokenItem(BaseModel):
    id: str
    name: str
    preview: str
    expires_at: datetime | None = None
    last_used_at: datetime | None = None
    created_at: datetime | None = None


class CreatedPersonalTokenResult(BaseModel):
    id: str
    name: str
    token: str
    preview: str
    expires_at: datetime | None = None
    created_at: datetime | None = None


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
    statements: list[StatementItem] = Field(default_factory=list)
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
    project_id: str | None = None
    project_name: str | None = None
    last_active_at: datetime | str | None = None
    active_key_count: int = 0
    project_grant_count: int = 0
    suspension_reason: str | None = None
    suspended_at: datetime | str | None = None
    created_at: datetime | str | None = None


class FleetAgentDetail(CamelModel):
    agent: FleetAgent
    team_name: str | None = None
    project_name: str | None = None
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
    project_id: str | None = None
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


# ─── Enterprise Insights Models ───


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
    total_statements: int = 0
    converged_statements: int = 0


class EnterpriseInsights(CamelModel):
    timeframe: str = "30d"
    kpis: EnterpriseKpis = Field(default_factory=EnterpriseKpis)
    metrics: EnterpriseMetrics = Field(default_factory=EnterpriseMetrics)
    timeseries: list[dict[str, Any]] = Field(default_factory=list)


# ─── Team Management Models ───


class OrgTeam(CamelModel):
    id: str
    name: str
    organization_id: str
    member_count: int = 0
    project_count: int = 0
    agent_count: int = 0
    created_at: datetime | str | None = None
    updated_at: datetime | str | None = None


class OrgTeamDetail(CamelModel):
    team: dict[str, Any]
    projects: list[dict[str, Any]] = Field(default_factory=list)
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
