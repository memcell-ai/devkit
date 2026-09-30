export type StatementType =
  "guard" | "directive" | "fact" | "preference" | "observation";

/**
 * @deprecated Use `StatementType` per Rule 12. Retained for backward compatibility.
 */
export type MemoryKind = StatementType | "invariant" | "reflex" | "episodic";

export type StatementStatus =
  "provisional" | "active" | "pinned" | "decayed" | "refuted";

/**
 * @deprecated Use `StatementStatus`. Retained for backward compatibility.
 */
export type MemoryStatus = StatementStatus;

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

// ─── Statements Domain ───

export interface StatementAuthor {
  type: "agent" | "user";
  id?: string | null;
  name?: string | null;
}

export interface StatementItem {
  id: string;
  rootId?: string;
  title: string;
  context?: string | null;
  example?: string | null;
  tags?: string[];
  subject?: string | null;
  type?: StatementType;
  /** @deprecated Use `type` instead per Rule 12. */
  kind?: string;
  status?: StatementStatus;
  confidence?: number;
  score?: number;
  relevance?: number;
  decayFactor?: number;
  stability?: number;
  reinforcementCount?: number;
  isPinned?: boolean;
  starred?: boolean;
  starCount?: number;
  isGuard?: boolean;
  isInvariant?: boolean;
  scope?: string;
  metadata?: Record<string, unknown>;
  author?: StatementAuthor;
  source?: string | null;
  relations?: StatementRelationItem[];
  expiresAt?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ListStatementsParams extends PaginationParams {
  type?: StatementType;
  /** @deprecated Use `type` */
  kind?: string;
  status?: StatementStatus;
  scope?: string;
  q?: string;
  semantic?: string;
  sort?: "created" | "confidence" | "stars" | "title";
  order?: "asc" | "desc";
  starred?: boolean;
  tag?: string;
  authorType?: "agent" | "user";
  subject?: string;
}

export interface CreateStatementParams {
  title: string;
  context?: string | null;
  example?: string | null;
  source?: string | null;
  tags?: string[];
  confidence?: number;
  subject?: string | null;
  type?: StatementType;
  /** @deprecated Use `type` */
  kind?: string;
  status?: StatementStatus;
  isPinned?: boolean;
  expiresAt?: string | Date | null;
  scope?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateStatementParams {
  title?: string;
  context?: string | null;
  example?: string | null;
  tags?: string[];
  confidence?: number;
  status?: StatementStatus;
  type?: StatementType;
  /** @deprecated Use `type` */
  kind?: string;
  subject?: string | null;
  isPinned?: boolean;
  scope?: string;
  metadata?: Record<string, unknown>;
  reason?: string;
}

export interface StatementHistoryItem {
  id: string;
  rootId: string;
  version: number;
  title: string;
  context?: string | null;
  example?: string | null;
  tags?: string[];
  confidence: number;
  status: StatementStatus;
  type?: StatementType;
  kind?: string;
  subject?: string | null;
  scope?: string;
  authorType: "agent" | "user";
  authorId?: string | null;
  authorName?: string | null;
  mutationType?: string | null;
  changeReason?: string | null;
  createdAt: string | Date;
}

export interface StatementHistoryResponse {
  rootId: string;
  totalVersions: number;
  history: StatementHistoryItem[];
}

export interface StatementStarResponse {
  rootId: string;
  starred: boolean;
  starCount: number;
}

export interface AdoptedTarget {
  projectId: string;
  statementId: string;
  alreadyExisted: boolean;
}

export interface AdoptStatementResponse {
  ok: boolean;
  sourceStatementId: string;
  adopted: AdoptedTarget[];
}

export interface PromoteStatementParams {
  toScope?: string;
  reason?: string;
}

export interface PromoteStatementResponse {
  promoted: boolean;
  statement: StatementItem;
}

// ─── Statement Relations Domain ───

export type RelationType =
  "constrains" | "justifies" | "refines" | "depends_on" | "tensions_with";

export interface StatementRelationItem {
  id: string;
  projectId: string;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  confidence: number;
  metadata?: Record<string, unknown>;
  createdAt: string | Date;
  updatedAt: string | Date;
  sourceStatement?: StatementItem;
  targetStatement?: StatementItem;
}

export interface CreateRelationParams {
  targetId: string;
  relationType: RelationType;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface StatementRelationsResponse {
  incoming: StatementRelationItem[];
  outgoing: StatementRelationItem[];
}

export interface ListProjectRelationsParams extends PaginationParams {
  relationType?: RelationType;
}

// ─── Memory Operations (Recall, Remember, Report, Feedback) ───

export interface RecallParams {
  namespace?: string;
  query: string;
  subject?: string | null;
  type?: StatementType | StatementType[];
  /** @deprecated Use `type` */
  kind?: MemoryKind | MemoryKind[];
  scope?: string;
  scopes?: string[];
  minConfidence?: number;
  limit?: number;
  tags?: string[];
  format?: "xml" | "markdown" | "none";
  allowProvisional?: boolean;
}

export interface RecallResponse {
  recallId: string;
  promptContext: string;
  statements: StatementItem[];
  matchedTags?: string[];
  guardMode?: "strict" | "advisory";
  profile?: string | null;
}

export interface RememberParams {
  namespace?: string;
  title: string;
  context?: string | null;
  example?: string | null;
  tags?: string[];
  subject?: string | null;
  type?: StatementType;
  /** @deprecated Use `type` */
  kind?: MemoryKind;
  status?: StatementStatus;
  confidence?: number;
  scope?: string;
  expiresAt?: string | Date | null;
  metadata?: Record<string, unknown>;
  raw?: string;
  sessionId?: string;
  async?: boolean;
}

export interface RememberResponse {
  created: StatementItem[];
  reinforced?: Array<{ id: string; title: string; confidence?: number }>;
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
  statementId?: string;
  autoDistill?: boolean;
  async?: boolean;
}

export interface ReportResponse {
  outcome: OutcomeVerdict;
  attributed: Array<{
    statementId: string;
    title: string;
    from: number;
    to: number;
    evidenceId: string;
  }>;
  distilledStatement?: StatementItem | null;
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
  statementId?: string;
  recallId?: string;
  outcome: "worked" | "failed";
  reason?: string | null;
  externalRef?: string | null;
  payload?: Record<string, unknown>;
}

export interface FeedbackResponse {
  outcome: "worked" | "failed";
  attributed: Array<{
    statementId: string;
    title: string;
    from: number;
    to: number;
    evidenceId: string;
  }>;
}

export interface WrapExecutionOptions {
  action: string;
  subject?: string | null;
  type?: StatementType | StatementType[];
  /** @deprecated Use `type` */
  kind?: MemoryKind | MemoryKind[];
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
  statements: StatementItem[];
  recallId: string;
  subject: string | null;
}

export interface ScopedExecutionResult<T> {
  result: T;
  report: ReportResponse;
  recallId: string;
  statements: StatementItem[];
  promptContext: string;
}

export interface ScopeOptions {
  subject?: string | null;
  format?: "xml" | "markdown" | "none";
  minConfidence?: number;
}

// ─── Projects Domain ───

export interface ProjectItem {
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

export interface ListProjectsParams extends PaginationParams {
  visibility?: "public" | "private" | "all";
  q?: string;
  sort?: "created" | "updated" | "name";
  order?: "asc" | "desc";
}

export interface CreateProjectParams {
  name: string;
  slug?: string;
  description?: string;
  website?: string;
  visibility?: "public" | "private";
  owner?: string;
}

export interface UpdateProjectParams {
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

export interface TransferProjectParams {
  targetOwner: string;
}

// ─── Agents & Keys Domain ───

export type AgentKind =
  "coding_assistant" | "custom_pipeline" | "inference_engine" | "ci_evaluator";

export type AgentStatus = "active" | "inactive" | "revoked";

export interface AgentItem {
  id: string;
  projectId: string;
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
  projectCount?: number;
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
    statements: {
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
