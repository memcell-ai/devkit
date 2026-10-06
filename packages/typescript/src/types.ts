export type MemoryType = "directive" | "fact" | "preference";

export const MEMORY_TYPES: readonly MemoryType[] = [
  "directive",
  "fact",
  "preference",
];

export const MEMORY_SCOPES = [
  "organization",
  "team",
  "workspace",
  "user",
] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number] | (string & {});

export type PromotionStatus = "pending" | "approved" | "rejected";

export type MemoryStatus =
  "provisional" | "active" | "pinned" | "decayed" | "refuted";

export type OutcomeVerdict = "worked" | "failed" | "avoided";

export type MemCellAuth =
  | { clientId: string; clientSecret: string; scope?: string }
  | { apiKey: string }
  | { accessToken: string };

/**
 * Base error thrown by the MemCell SDK on API and network failures.
 */
export class MemCellError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "MemCellError";
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when a request is rejected with HTTP 429 Too Many Requests per ADR 057.
 */
export class RateLimitError extends MemCellError {
  readonly door?: string;
  readonly limit?: number;
  readonly windowSeconds?: number;
  readonly retryAfter: number;

  constructor(params: {
    message: string;
    door?: string;
    limit?: number;
    windowSeconds?: number;
    retryAfter: number;
    details?: unknown;
  }) {
    super(params.message, 429, "rate_limited", params.details);
    this.name = "RateLimitError";
    this.door = params.door;
    this.limit = params.limit;
    this.windowSeconds = params.windowSeconds;
    this.retryAfter = params.retryAfter;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface MemCellConfig {
  auth?: MemCellAuth;
  apiKey?: string;
  accessToken?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  maxRetries?: number;
  initialRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  onRateLimitWarning?: (warning: string, response: Response) => void;
}

// ─── Standard Pagination Types ───

export interface PaginationParams {
  page?: number;
  perPage?: number;
}

export interface PaginationMetadata {
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMetadata;
}

// ─── Memories Domain ───

export interface MemoryAuthor {
  type: "agent" | "user";
  id?: string | null;
  name?: string | null;
}

export interface MemoryItem {
  id: string;
  rootId?: string;
  title: string;
  context?: string | null;
  observation?: string | null;
  tags?: string[];
  subject?: string | null;
  type?: MemoryType;
  enforce?: boolean;
  status?: MemoryStatus;
  confidence?: number;
  score?: number;
  relevance?: number;
  decayFactor?: number;
  stability?: number;
  reinforcementCount?: number;
  isPinned?: boolean;
  starred?: boolean;
  starCount?: number;
  scope?: MemoryScope;
  requiredRoles?: string[];
  scopePromotedAt?: string | Date | null;
  scopePromotedBy?: string | null;
  metadata?: Record<string, unknown>;
  author?: MemoryAuthor;
  source?: string | null;
  relations?: MemoryRelationItem[];
  expiresAt?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ListMemoriesParams extends PaginationParams {
  type?: MemoryType;
  enforce?: boolean;
  status?: MemoryStatus;
  scope?: MemoryScope;
  q?: string;
  semantic?: string;
  sort?: "created" | "confidence" | "stars" | "title";
  order?: "asc" | "desc";
  starred?: boolean;
  tag?: string;
  authorType?: "agent" | "user";
  subject?: string;
}

export interface CreateMemoryParams {
  title: string;
  context?: string | null;
  observation?: string | null;
  source?: string | null;
  tags?: string[];
  confidence?: number;
  subject?: string | null;
  type?: MemoryType;
  enforce?: boolean;
  status?: MemoryStatus;
  isPinned?: boolean;
  expiresAt?: string | Date | null;
  scope?: MemoryScope;
  requiredRoles?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateMemoryParams {
  title?: string;
  context?: string | null;
  observation?: string | null;
  tags?: string[];
  confidence?: number;
  status?: MemoryStatus;
  type?: MemoryType;
  enforce?: boolean;
  subject?: string | null;
  isPinned?: boolean;
  scope?: MemoryScope;
  requiredRoles?: string[];
  metadata?: Record<string, unknown>;
  reason?: string;
}

export interface MemoryHistoryItem {
  id: string;
  rootId: string;
  version: number;
  title: string;
  context?: string | null;
  observation?: string | null;
  tags?: string[];
  confidence: number;
  status: MemoryStatus;
  type?: MemoryType;
  enforce?: boolean;
  subject?: string | null;
  scope?: string;
  authorType: "agent" | "user";
  authorId?: string | null;
  authorName?: string | null;
  mutationType?: string | null;
  changeReason?: string | null;
  createdAt: string | Date;
}

export interface MemoryHistoryResponse {
  rootId: string;
  totalVersions: number;
  history: MemoryHistoryItem[];
}

export interface MemoryStarResponse {
  rootId: string;
  starred: boolean;
  starCount: number;
}

export interface DeleteMemoryOptions {
  /**
   * If true, deletes all versions of the memory.
   * If false (default), deletes only the latest version and restores the predecessor version as latest.
   */
  allVersions?: boolean;
}

export interface DeleteMemoryResponse {
  status?: string;
  deletedCount: number;
  deletedScope?: "version" | "memory";
  nextId?: string | null;
  restoredVersion?: number | null;
  message?: string;
}

export interface AdoptedTarget {
  workspaceId: string;
  memoryId: string;
  alreadyExisted: boolean;
}

export interface AdoptMemoryResponse {
  ok: boolean;
  sourceMemoryId: string;
  adopted: AdoptedTarget[];
}

export interface PromoteMemoryParams {
  toScope?: MemoryScope;
  reason?: string;
}

export interface PromoteMemoryResponse {
  promoted: boolean;
  memory: MemoryItem;
  promotionRequest?: MemoryPromotionRequest;
}

export interface MemoryPromotionRequest {
  id: string;
  memoryId: string;
  fromScope: MemoryScope;
  toScope: MemoryScope;
  status: PromotionStatus;
  requesterId: string;
  requesterReason?: string | null;
  reviewerId?: string | null;
  reviewReason?: string | null;
  reviewedAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ListPromotionsParams extends PaginationParams {
  status?: PromotionStatus;
  memoryId?: string;
  limit?: number;
  offset?: number;
}

// ─── Memory Relations Domain ───

export type RelationType =
  "limits" | "justifies" | "refines" | "depends_on" | "tensions_with";

export interface MemoryRelationItem {
  id: string;
  workspaceId: string;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  confidence: number;
  metadata?: Record<string, unknown>;
  createdAt: string | Date;
  updatedAt: string | Date;
  sourceMemory?: MemoryItem;
  targetMemory?: MemoryItem;
}

export interface CreateRelationParams {
  targetId: string;
  relationType: RelationType;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export type CreateMemoryRelationParams = CreateRelationParams;

export interface MemoryRelationsResponse {
  incoming: MemoryRelationItem[];
  outgoing: MemoryRelationItem[];
}

export interface ListWorkspaceRelationsParams extends PaginationParams {
  relationType?: RelationType;
}

// ─── Memory Operations (Recall, Remember, Report, Feedback) ───

export interface RecallParams {
  namespace?: string;
  query: string;
  subject?: string | null;
  type?: MemoryType | MemoryType[];
  enforce?: boolean;
  scope?: MemoryScope;
  scopes?: MemoryScope[];
  myMemory?: boolean;
  minConfidence?: number;
  limit?: number;
  tags?: string[];
  format?: "xml" | "markdown" | "none";
  allowProvisional?: boolean;
  metadata?: Record<string, unknown>;
  includeMetadata?: boolean | string[];
}

export interface RecallResponse {
  recallId: string;
  promptContext: string;
  memories: MemoryItem[];
  matchedTags?: string[];
  guardMode?: "strict" | "advisory";
  profile?: string | null;
}

export interface RememberParams {
  namespace?: string;
  title?: string;
  context?: string | null;
  observation?: string | null;
  tags?: string[];
  subject?: string | null;
  type?: MemoryType;
  enforce?: boolean;
  status?: MemoryStatus;
  confidence?: number;
  scope?: MemoryScope;
  requiredRoles?: string[];
  expiresAt?: string | Date | null;
  metadata?: Record<string, unknown>;
  raw?: string;
  content?: string;
  sessionId?: string;
  activeMemoryIds?: string[];
  async?: boolean;
}

export interface RememberResponse {
  created: MemoryItem[];
  reinforced?: Array<{ id: string; title: string; confidence?: number }>;
  evolved?: MemoryItem[];
  superseded?: Array<{ id: string; title: string }>;
  note?: string;
  accepted?: boolean;
  jobId?: string;
  status?: string;
}

export interface ReportParams {
  namespace?: string;
  subject?: string | null;
  actionTaken: string;
  outcome: OutcomeVerdict;
  reason?: string | null;
  externalRef?: string | null;
  payload?: Record<string, unknown>;
  recallId?: string;
  memoryId?: string;
  autoDistill?: boolean;
  async?: boolean;
}

export interface ReportResponse {
  outcome: OutcomeVerdict;
  attributed: Array<{
    memoryId: string;
    title: string;
    from: number;
    to: number;
    evidenceId: string;
  }>;
  distilledMemory?: MemoryItem | null;
  note?: string;
  accepted?: boolean;
  jobId?: string;
  status?: string;
}

export interface JobEvent {
  step:
    | "queued"
    | "distilling"
    | "embedding"
    | "reconciling"
    | "completed"
    | "failed";
  progress: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface WaitForJobOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  onProgress?: (event: JobEvent) => void;
}

export interface FeedbackParams {
  namespace?: string;
  memoryId?: string;
  recallId?: string;
  outcome: "worked" | "failed";
  reason?: string | null;
  externalRef?: string | null;
  payload?: Record<string, unknown>;
}

export interface FeedbackResponse {
  outcome: "worked" | "failed";
  attributed: Array<{
    memoryId: string;
    title: string;
    from: number;
    to: number;
    evidenceId: string;
  }>;
}

export interface WrapExecutionOptions {
  action: string;
  subject?: string | null;
  type?: MemoryType | MemoryType[];
  minConfidence?: number;
  limit?: number;
  tags?: string[];
  format?: "xml" | "markdown" | "none";
  externalRef?: string | null;
  payload?: Record<string, unknown>;
  autoDistill?: boolean;
}

export interface ScopedExecutionContext {
  promptContext: string;
  memories: MemoryItem[];
  recallId: string;
  subject: string | null;
}

export interface ScopedExecutionResult<T> {
  result: T;
  report: ReportResponse;
  recallId: string;
  memories: MemoryItem[];
  promptContext: string;
}

export interface ScopeOptions {
  subject?: string | null;
  format?: "xml" | "markdown" | "none";
  minConfidence?: number;
}

// ─── Workspaces Domain ───

export interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  website?: string | null;
  tags?: string[];
  visibility: "public" | "private";
  ownership?: "personal" | "organization";
  owner?: {
    type: "user" | "org";
    slug: string;
    name: string;
  };
  stateRoot?: string | null;
  instruction?: string | null;
  guardMode?: "strict" | "advisory";
  tagPrompt?: string | null;
  profile?: string | null;
  vitals?: Record<string, unknown>;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ListWorkspacesParams extends PaginationParams {
  visibility?: "public" | "private" | "all";
  q?: string;
  sort?: "created" | "updated" | "name";
  order?: "asc" | "desc";
}

export interface CreateWorkspaceParams {
  name: string;
  slug?: string;
  description?: string;
  website?: string;
  visibility?: "public" | "private";
  owner?: string;
}

export interface UpdateWorkspaceParams {
  name?: string;
  slug?: string;
  description?: string;
  website?: string;
  visibility?: "public" | "private";
  tags?: string[];
  instruction?: string;
  guardMode?: "strict" | "advisory";
  tagPrompt?: string;
  profile?: string;
}

export interface TransferWorkspaceParams {
  targetOwner: string;
}

// ─── Agents & Keys Domain ───

export type AgentKind =
  "coding_assistant" | "custom_pipeline" | "inference_engine" | "ci_evaluator";

export type AgentStatus = "active" | "inactive" | "revoked";

export interface AgentItem {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  kind: AgentKind | string;
  model?: string | null;
  description?: string | null;
  status: AgentStatus;
  metadata?: Record<string, unknown>;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  keyCount?: number;
  activeKeyCount?: number;
  lastActiveAt?: string | Date | null;
  telemetry?: {
    totalRecalls: number;
    totalRemembers: number;
    totalReports: number;
  };
}

export interface ListAgentsParams extends PaginationParams {
  status?: AgentStatus;
  kind?: AgentKind;
  q?: string;
  sort?: "created" | "name" | "last_active";
  order?: "asc" | "desc";
}

export interface CreateAgentParams {
  name: string;
  slug?: string;
  kind?: AgentKind;
  model?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateAgentParams {
  name?: string;
  model?: string | null;
  description?: string | null;
  status?: AgentStatus;
  metadata?: Record<string, unknown>;
}

export interface AgentKeyItem {
  id: string;
  agentId: string;
  name?: string;
  preview: string;
  createdAt: string | Date;
  lastUsedAt?: string | Date | null;
  expiresAt?: string | Date | null;
}

export interface CreateAgentKeyResponse {
  ok: boolean;
  key: {
    id: string;
    key: string;
    preview: string;
    name?: string;
  };
}

// ─── Collaborators Domain ───

export type CollaboratorRole = "admin" | "write" | "read";

export interface CollaboratorItem {
  id: string;
  userId: string;
  name: string;
  handle: string | null;
  email: string;
  image: string | null;
  role: CollaboratorRole;
  source: "direct" | "owner" | "organization";
  inherited: boolean;
  createdAt?: string | Date;
}

export interface PendingInvitationItem {
  id: string;
  email: string;
  role: CollaboratorRole;
  invitedBy: {
    name?: string;
    email: string;
  };
  expiresAt: string | Date;
  createdAt: string | Date;
}

export interface ListCollaboratorsParams extends PaginationParams {
  role?: CollaboratorRole | "all";
  affiliation?: "outside" | "direct" | "all";
  q?: string;
}

export interface ListCollaboratorsResponse {
  collaborators: CollaboratorItem[];
  pendingInvitations: PendingInvitationItem[];
  pagination: PaginationMetadata;
}

export interface InviteCollaboratorParams {
  identifier: string;
  role?: CollaboratorRole;
}

// ─── Organizations Domain ───

export interface OrganizationItem {
  id: string;
  name: string;
  slug: string;
  role?: string;
  bio?: string | null;
  website?: string | null;
  logo?: string | null;
  joinedAt?: string | Date;
  memberCount?: number;
  workspaceCount?: number;
}

export interface CreateOrganizationParams {
  name: string;
  slug: string;
  bio?: string | null;
  website?: string | null;
  logo?: string | null;
}

export interface UpdateOrganizationParams {
  name?: string;
  bio?: string | null;
  website?: string | null;
  logo?: string | null;
}

export type OrgRole = "owner" | "admin" | "member";

export interface OrgMemberItem {
  id: string;
  userId: string;
  name: string;
  handle: string | null;
  email: string;
  image: string | null;
  role: OrgRole;
  joinedAt: string | Date;
}

export interface ListMembersParams extends PaginationParams {
  role?: OrgRole | "all";
  q?: string;
  sort?: "created" | "name" | "role";
  order?: "asc" | "desc";
}

export interface OrgInvitationItem {
  id: string;
  email: string;
  role: OrgRole;
  teamId?: string | null;
  expiresAt: string | Date;
  createdAt: string | Date;
  invitedBy?: {
    name?: string;
    email: string;
  };
}

export interface InviteMemberParams {
  email: string;
  role?: OrgRole;
  teamId?: string | null;
}

// ─── Usage Domain ───

export type UsageTimeframe = "30d" | "90d";

export interface OwnerUsage {
  owner: {
    type: "user" | "org";
    slug: string;
    name: string;
  };
  timeframe: UsageTimeframe;
  quotas: {
    memories: {
      total: number;
      limit: number;
      percent: number;
      types: {
        guard?: number;
        directive: number;
        fact: number;
        preference: number;
        observation: number;
        provisional: number;
      };
    };
    apiRequests: {
      total: number;
      limit: number;
      percent: number;
      windowDays: number;
    };
  };
  rateLimits: {
    tier: string;
    recallRpm: number;
    rememberRpm: number;
    defaultRpm: number;
    concurrentLimit: number;
  };
}

// ─── Account Domain ───

export interface AccountProfile {
  id: string;
  email: string;
  name?: string;
  handle?: string;
  image?: string;
  bio?: string;
  website?: string;
  role: string;
  createdAt: string | Date;
}

export interface UpdateProfileParams {
  name?: string;
  handle?: string;
  bio?: string;
  website?: string;
}

export interface PersonalAccessTokenItem {
  id: string;
  name: string;
  preview: string;
  createdAt: string | Date;
  expiresAt?: string | Date | null;
  lastUsedAt?: string | Date | null;
}

export interface CreateTokenParams {
  name: string;
  expiresAt?: string | Date | null;
}

export interface CreateTokenResponse {
  ok: boolean;
  token: PersonalAccessTokenItem;
  secret: string;
}

// ─── Scopes Domain ───

export interface ScopeItem {
  name: string;
  count: number;
  isPrivate?: boolean;
}

// ─── Sweep Domain (ADR 0075) ───

export type {
  ConsolidateSweepParams,
  ConsolidateSweepResponse,
} from "./sweep.js";

// ─── Enterprise SSO Domain ───

export interface SSOProviderSummary {
  id: string;
  providerId: string;
  issuer: string;
  domain: string;
  protocol: "saml" | "oidc";
  domainVerified: boolean;
  organizationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigureSSOInput {
  providerId?: string;
  domain: string;
  issuer: string;
  protocol: "saml" | "oidc";
  samlConfig?: {
    entryPoint: string;
    cert?: string;
    idpMetadata?: {
      metadata?: string;
      entityID?: string;
      cert?: string | string[];
    };
    spMetadata?: {
      entityID?: string;
      metadata?: string;
    };
  };
  oidcConfig?: {
    clientId: string;
    clientSecret: string;
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    jwksEndpoint?: string;
    discoveryEndpoint?: string;
  };
}

export interface SSOVerificationToken {
  token: string;
  dnsRecordName: string;
  dnsRecordType: string;
  domain: string;
}

export interface SSODomainLookupResult {
  ssoAvailable: boolean;
  providerId?: string;
  organizationId?: string;
  organizationSlug?: string;
  organizationName?: string;
  ssoEnforced: boolean;
}

export interface OrganizationSSOResult {
  ok: boolean;
  providers: SSOProviderSummary[];
  ssoEnforced: boolean;
}

// ─── Fleet Management Domain ───

export interface FleetAgent {
  id: string;
  name: string;
  slug: string;
  scope: "workspace" | "team" | "organization";
  framework: string | null;
  model: string | null;
  status: "active" | "suspended" | "revoked";
  health: "healthy" | "degraded" | "suspended" | "offline";
  description: string | null;
  organizationId: string | null;
  teamId: string | null;
  teamName?: string | null;
  workspaceId: string | null;
  workspaceName?: string | null;
  lastActiveAt: string | null;
  activeKeyCount: number;
  workspaceGrantCount: number;
  suspensionReason: string | null;
  suspendedAt: string | null;
  createdAt: string;
}

export interface ListFleetAgentsParams {
  q?: string;
  status?: "active" | "suspended" | "revoked";
  scope?: "workspace" | "team" | "organization";
  framework?: string;
  teamId?: string;
  workspaceId?: string;
  page?: number;
  perPage?: number;
}

export interface CreateFleetAgentParams {
  name: string;
  slug?: string;
  scope?: "workspace" | "team" | "organization";
  framework?: string | null;
  model?: string | null;
  description?: string | null;
  teamId?: string | null;
  workspaceId?: string | null;
  generateKey?: boolean;
}

export interface FleetAgentKeyCreated {
  key: string;
  keyPrefix: string;
  keyId: string;
}

export interface CreateFleetAgentResult {
  agent: FleetAgent;
  key: FleetAgentKeyCreated | null;
}

export interface FleetAgentDetail {
  agent: FleetAgent;
  teamName?: string | null;
  workspaceName?: string | null;
  keys: Array<{
    id: string;
    keyPrefix: string;
    createdAt: string;
    lastUsedAt: string | null;
  }>;
  grants: Array<{
    id: string;
    workspaceId: string;
    workspaceSlug: string;
    permission: string;
    createdAt: string;
  }>;
}

export interface AgentWorkspaceGrant {
  id: string;
  agentId: string;
  workspaceId: string;
  permission: "read" | "write" | "admin";
  grantedBy: string | null;
  createdAt: string;
}

// ─── Audit & SIEM Domain ───

export interface AuditEvent {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  teamId: string | null;
  actorType: "user" | "agent" | "system";
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string;
  targetId: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ListAuditEventsParams {
  actorId?: string;
  actorType?: "user" | "agent" | "system";
  action?: string;
  targetType?: string;
  targetId?: string;
  workspaceId?: string;
  teamId?: string;
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
}

export interface SiemDestination {
  id: string;
  organizationId: string;
  name: string;
  destinationType:
    "webhook" | "splunk" | "datadog" | "cloudwatch" | "gcp_logging";
  url: string;
  secretToken?: string | null;
  format: "json" | "cef";
  enabled: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateSiemDestinationParams {
  name: string;
  destinationType?:
    "webhook" | "splunk" | "datadog" | "cloudwatch" | "gcp_logging";
  url: string;
  secretToken?: string | null;
  format?: "json" | "cef";
  enabled?: boolean;
}

// ─── Enterprise Insights Domain ───

export interface EnterpriseInsights {
  timeframe: string;
  kpis: {
    deadEndAvoidanceRate: number;
    recallUtilizationRate: number;
    recallPrecisionRate: number;
    memoryConvergenceRate: number;
    tokensSaved: number;
    estimatedCostSavedUsd: number;
    latencyMs: {
      p50: number;
      p95: number;
      p99: number;
    };
  };
  metrics: {
    totalRecalls: number;
    workedRecalls: number;
    failedRecalls: number;
    pendingRecalls: number;
    totalMemories: number;
    convergedMemories: number;
  };
  timeseries: Array<{
    date: string;
    recalls: number;
    worked: number;
    failed: number;
  }>;
}

export interface GetInsightsParams {
  timeframe?: "24h" | "7d" | "30d" | "all";
  teamId?: string;
  workspaceId?: string;
}

// ─── Team Management Domain ───

export interface OrgTeam {
  id: string;
  name: string;
  organizationId: string;
  memberCount: number;
  workspaceCount: number;
  agentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrgTeamDetail {
  team: {
    id: string;
    name: string;
    organizationId: string;
    createdAt: string;
    updatedAt: string;
  };
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    visibility: string;
  }>;
  agents: Array<{
    id: string;
    name: string;
    slug: string;
    scope: string;
    status: string;
    health: string;
  }>;
}

export interface TeamMemberItem {
  id: string;
  userId: string;
  role: "manager" | "member";
  name: string | null;
  email: string;
  handle: string | null;
  image: string | null;
  createdAt: string;
}
