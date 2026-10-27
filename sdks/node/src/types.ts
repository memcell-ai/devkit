export type MemoryType = "instruction" | "decision" | "fact" | "preference";

export const MEMORY_TYPES: readonly MemoryType[] = [
  "instruction",
  "decision",
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
  token?: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
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
  version?: number;
  title: string;
  text?: string;
  content?: string | null;
  context?: string | null;
  observation?: string | null;
  tags?: string[];
  entities?: string[];
  resources?: string[];
  appliesAt?: string[];
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
  sourceThreadId?: string | null;
  sourceDocumentId?: string | null;
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
  content?: string | null;
  context?: string | null;
  observation?: string | null;
  source?: string | null;
  tags?: string[];
  entities?: string[];
  resources?: string[];
  appliesAt?: string[];
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
  content?: string | null;
  context?: string | null;
  observation?: string | null;
  tags?: string[];
  entities?: string[];
  resources?: string[];
  appliesAt?: string[];
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
  content?: string | null;
  context?: string | null;
  observation?: string | null;
  tags?: string[];
  entities?: string[];
  resources?: string[];
  appliesAt?: string[];
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
  items?: MemoryHistoryItem[];
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
  | "relates_to"
  | "part_of"
  | "depends_on"
  | "justifies"
  | "refines"
  | "limits"
  | "supersedes"
  | "caused_by"
  | "tensions_with";

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

// ─── Threads Domain (Session Continuity & Parallel Workstreams) ───

export type ThreadStatus = "active" | "paused" | "completed";
export type ThreadScope = "user" | "workspace";

export interface ThreadMilestoneItem {
  phase?: string;
  title?: string;
  summary: string;
  timestamp?: string;
}

export interface ThreadActionItem {
  type?: "tool_call" | "file_touch" | "command" | "milestone";
  category?: string;
  name?: string;
  tool?: string;
  target?: string;
  summary?: string;
  inputSummary?: string;
  outputSummary?: string;
  outcome?: string;
  status?: string;
}

export interface ThreadItem {
  id: string;
  workspaceId: string;
  userId?: string | null;
  agentId?: string | null;
  externalSessionId?: string | null;
  title: string;
  status: ThreadStatus;
  scope?: ThreadScope;
  summary: string;
  currentObjective?: string | null;
  decisions: string[];
  nextSteps: string[];
  entities: string[];
  milestones?: ThreadMilestoneItem[];
  resources?: string[];
  turns?: ThreadTurnItem[];
  turnCount: number;
  lastActiveAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ThreadTurnItem {
  id: string;
  threadId: string;
  workspaceId: string;
  turnIndex: number;
  summary?: string;
  userIntent?: string | null;
  agentOutcome?: string | null;
  actions?: ThreadActionItem[];
  decisions?: string[];
  resources?: string[];
  extractedMemoryIds: string[];
  createdAt: string | Date;
}

export interface ListThreadsParams extends PaginationParams {
  status?: ThreadStatus;
  scope?: ThreadScope | "all";
  entity?: string;
  q?: string;
}

export interface UpdateThreadParams {
  title?: string;
  status?: ThreadStatus;
  scope?: ThreadScope;
  summary?: string;
  currentObjective?: string | null;
  decisions?: string[];
  nextSteps?: string[];
  entities?: string[];
  milestones?: ThreadMilestoneItem[];
  resources?: string[];
}

export interface ThreadDetailResponse {
  thread: ThreadItem;
  turns: ThreadTurnItem[];
  memories: MemoryItem[];
}

// ─── Documents Domain (Workspace Bootstrap & Grounded RAG) ───

export interface DocumentItem {
  id: string;
  workspaceId: string;
  title: string;
  path?: string | null;
  sourcePath?: string | null;
  sourceUri?: string | null;
  sourceType?: string;
  contentType: string;
  contentHash: string;
  summary?: string | null;
  status?: string;
  chunkCount: number;
  sizeBytes: number;
  metadata?: Record<string, unknown>;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface DocumentChunkItem {
  id: string;
  documentId: string;
  chunkIndex: number;
  heading?: string | null;
  content: string;
  tokenCount?: number;
  createdAt?: string | Date;
}

export interface DocumentChunkSearchResult {
  id: string;
  documentId: string;
  documentTitle: string;
  path?: string | null;
  sourcePath?: string | null;
  sourceUri?: string | null;
  chunkIndex: number;
  heading?: string | null;
  content: string;
  score: number;
}

export interface ListDocumentsParams extends PaginationParams {
  q?: string;
}

export interface SearchDocumentsOptions {
  query: string;
  limit?: number;
}

export interface IngestDocumentParams {
  title?: string;
  content?: string;
  /**
   * Binary file bytes (`Uint8Array` or `ArrayBuffer`) or base64-encoded string
   * for PDF, DOCX, CSV, TSV, HTML, JSON, or Markdown uploads.
   */
  file?: Uint8Array | ArrayBuffer | string;
  fileBase64?: string;
  filename?: string;
  mimeType?: string;
  path?: string | null;
  sourcePath?: string | null;
  sourceUri?: string | null;
  contentType?: string;
  distill?: boolean;
  distillMemories?: boolean;
  metadata?: Record<string, unknown>;
}

export interface IngestDocumentResponse {
  document: DocumentItem;
  chunkCount: number;
  chunksCreated: number;
  deduplicated: boolean;
  unchanged: boolean;
  distilled?: {
    created: MemoryItem[];
    reinforced?: Array<{ id: string; title: string; confidence?: number }>;
    evolved?: MemoryItem[];
  };
  distilledMemoriesCount?: number;
  memoriesCreated?: number;
}

export interface DocumentDetailResponse {
  document: DocumentItem;
  chunks: DocumentChunkItem[];
  memories: MemoryItem[];
}

// ─── Workspace Sources Domain (URL / Sitemap, Inbound Webhook, GitHub) ───

export type SourceType = "url" | "webhook" | "github";

export type SourceStatus = "idle" | "syncing" | "ready" | "error";

export interface SourceItem {
  id: string;
  workspaceId: string;
  type: SourceType;
  name: string;
  repoFullName?: string | null;
  defaultBranch?: string | null;
  config?: Record<string, unknown>;
  status: SourceStatus;
  lastSyncedSha?: string | null;
  lastSyncedAt?: string | Date | null;
  lastError?: string | null;
  documentCount: number;
  memoryCount: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CreateUrlSourceParams {
  type: "url";
  url: string;
  name?: string;
  maxPages?: number;
  distillMemories?: boolean;
}

export interface CreateWebhookSourceParams {
  type: "webhook";
  name?: string;
  distillMemories?: boolean;
}

export interface CreateGitHubSourceParams {
  type?: "github";
  repoFullName: string;
  defaultBranch?: string;
  name?: string;
  rootPath?: string;
  installationId?: string;
}

export type CreateSourceParams =
  CreateUrlSourceParams | CreateWebhookSourceParams | CreateGitHubSourceParams;

export interface CreateSourceResponse {
  source: SourceItem;
  webhookSecret?: string | null;
  ingestPath?: string | null;
}

export interface SyncSourceOptions {
  distillMemories?: boolean;
  maxFiles?: number;
  maxPages?: number;
}

export interface SyncSourceResponse {
  source?: SourceItem;
  status: string;
  syncedFiles: number;
  skippedFiles?: number;
  totalChunks: number;
  totalMemories: number;
  headSha?: string | null;
  message?: string;
}

export interface WebhookIngestDocumentInput {
  title?: string;
  content?: string;
  file?: Uint8Array | ArrayBuffer | string;
  fileBase64?: string;
  filename?: string;
  mimeType?: string;
  contentType?: string;
  sourceUri?: string;
  distill?: boolean;
  metadata?: Record<string, unknown>;
}

export interface WebhookIngestParams extends WebhookIngestDocumentInput {
  documents?: WebhookIngestDocumentInput[];
  distillMemories?: boolean;
  /**
   * Optional `whsrc_...` signing secret returned when creating a webhook source.
   * When omitted, the SDK authenticates with its configured bearer token/API key.
   */
  secret?: string;
}

export interface WebhookIngestResponse {
  status: string;
  ingestedDocuments: number;
  skippedDocuments: number;
  totalChunks: number;
  totalMemories: number;
  documents: Array<{
    id: string;
    title: string;
    chunkCount: number;
    deduplicated: boolean;
  }>;
}

// ─── Memory Operations (Recall, Remember, Report, Feedback) ───

export interface RecallParams {
  namespace?: string;
  query?: string;
  intent?: string;
  sessionId?: string;
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
  matchedThread?: ThreadItem | null;
  activeThreads?: ThreadItem[];
  documentChunks?: DocumentChunkSearchResult[];
  matchedTags?: string[];
  guardMode?: "strict" | "advisory";
  profile?: string | null;
}

export interface RememberParams {
  namespace?: string;
  title?: string;
  content?: string;
  context?: string | null;
  observation?: string | null;
  tags?: string[];
  entities?: string[];
  resources?: string[];
  appliesAt?: string[];
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
  touched?: string[];
  actions?: ThreadActionItem[];
  sessionId?: string;
  activeMemoryIds?: string[];
  async?: boolean;
}

export interface RememberResponse {
  created: MemoryItem[];
  reinforced?: Array<{ id: string; title: string; confidence?: number }>;
  evolved?: MemoryItem[];
  superseded?: Array<{ id: string; title: string }>;
  thread?: ThreadItem | null;
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
  namespace?: string;
  query?: string;
  action: string;
  subject?: string | null;
  type?: MemoryType | MemoryType[];
  scope?: MemoryScope;
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
  ownerSlug?: string;
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
  targetSlug?: string;
}

export interface CopyWorkspaceParams {
  targetOwner?: string;
  targetSlug?: string;
  name?: string;
  description?: string | null;
  visibility?: "public" | "private";
  includeThreads?: boolean;
  includeDocuments?: boolean;
}

export interface CopyWorkspaceResponse {
  ok: boolean;
  sourceOwnerSlug: string;
  sourceWorkspaceSlug: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
    ownerSlug: string;
    visibility: "public" | "private";
    url: string;
  };
  copied: {
    memories: number;
    relations: number;
    threads: number;
    documents: number;
  };
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
        instruction: number;
        decision: number;
        fact: number;
        preference: number;
        observation?: number;
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

export interface ApiKeyItem {
  id: string;
  name: string;
  preview: string;
  prefix?: string;
  createdAt: string | Date;
  expiresAt?: string | Date | null;
  lastUsedAt?: string | Date | null;
  lastRequest?: string | Date | null;
}

export type PersonalAccessTokenItem = ApiKeyItem;

export interface CreateApiKeyParams {
  name: string;
  expiresAt?: string | Date | null;
  expiresInDays?: number | null;
}

export type CreateTokenParams = CreateApiKeyParams;

export interface CreateApiKeyResponse {
  ok: boolean;
  key: ApiKeyItem;
  secret: string;
  token?: ApiKeyItem;
}

export type CreateTokenResponse = CreateApiKeyResponse;

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

// ─── Workspace & Enterprise Insights Domain ───

export type CalibrationBucketId =
  "atRisk" | "tentative" | "verified" | "reinforced" | "highTrust";

export interface ConfidenceCalibrationBucket {
  bucket: CalibrationBucketId;
  range: string;
  label: string;
  minConfidence: number;
  maxConfidence: number;
  predictedConfidence: number;
  observedWorkedRate: number | null;
  workedCount: number;
  failedCount: number;
  sampleCount: number;
  calibrationGap: number | null;
}

export interface ConfidenceCalibrationSummary {
  totalSamples: number;
  expectedCalibrationError: number | null;
  brierScore: number | null;
  highConfidenceWorkedRate: number | null;
  lowConfidenceWorkedRate: number | null;
  reliabilityLiftPct: number | null;
  buckets: ConfidenceCalibrationBucket[];
}

export interface GovernanceShieldSummary {
  quarantinedUserScopeCount: number;
  provisionalCount: number;
  demotedOrRefutedCount: number;
  enforcedGuardCount: number;
  approvedPromotionsCount: number;
  pendingPromotionsCount: number;
}

export interface WorkspaceInsightsMetricTrend {
  current: number;
  prior: number;
  deltaPercentage: number | null;
  sparkline: Array<{
    timestamp: string;
    label: string;
    value: number;
  }>;
}

export interface WorkspaceInsightsSummary {
  recalls: WorkspaceInsightsMetricTrend & {
    totalHits: number;
    totalMisses: number;
    hitRate: number;
    hitRateDelta?: number | null;
  };
  taskVerification: WorkspaceInsightsMetricTrend & {
    totalWorked: number;
    totalFailed: number;
    workedRate: number;
  };
  memoryHealth: {
    activeMemoriesCount: number;
    standingInstructionsCount: number;
    memoriesAtRiskCount: number;
    avgConfidence: number;
  };
  latency: WorkspaceInsightsMetricTrend & {
    avgMs: number;
  };
  totalRequests: number;
  totalErrors: number;
  successRate: number;
  avgLatencyMs: number;
  activeMemoriesCount: number;
  avgConfidence: number;
}

export interface WorkspaceInsights {
  timeframe: "24h" | "7d" | "30d";
  summary: WorkspaceInsightsSummary;
  calibration: ConfidenceCalibrationSummary;
  governance: GovernanceShieldSummary;
  operationBuckets: Array<Record<string, unknown>>;
  outcomeBuckets: Array<Record<string, unknown>>;
  trafficBuckets: Array<Record<string, unknown>>;
  confidenceBands: Array<{
    band: string;
    range: string;
    label: string;
    count: number;
    percentage: number;
    fill: string;
  }>;
  agentShares: Array<Record<string, unknown>>;
  topMemories: Array<{
    id: string;
    title: string;
    confidence: number;
    stability: number;
    reinforcementCount: number;
    workedCount: number;
    failedCount: number;
    tags: string[];
  }>;
  activityFeed: Array<Record<string, unknown>>;
  memoriesRequiringAttention: Array<{
    id: string;
    title: string;
    confidence: number;
    stability: number;
    reinforcementCount: number;
    workedCount: number;
    failedCount: number;
    tags: string[];
    reason?: string | null;
  }>;
  standingInstructions: Array<{
    id: string;
    title: string;
    confidence: number;
    stability: number;
    reinforcementCount: number;
    workedCount: number;
    failedCount: number;
    tags: string[];
    reason?: string | null;
  }>;
}

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
  calibration?: ConfidenceCalibrationSummary;
  governance?: GovernanceShieldSummary;
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

// ─── Workspace Webhooks Domain ───

export interface WorkspaceWebhookItem {
  id: string;
  workspaceId: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceWebhookParams {
  name: string;
  url: string;
  secret?: string | null;
  events?: string[];
  enabled?: boolean;
}

export interface UpdateWorkspaceWebhookParams {
  name?: string;
  url?: string;
  secret?: string | null;
  events?: string[];
  enabled?: boolean;
}

export interface WebhookPingResult {
  ok: boolean;
  statusCode: number;
  statusText: string;
  error?: string;
}

// ─── Workspace Activity Domain ───

export interface WorkspaceActivityItem {
  id: string;
  timestamp: string;
  outcome: "worked" | "failed" | "avoided" | "observed";
  memoryId?: string;
  subject?: string;
  note?: string;
  agentId?: string;
  caller?: string;
  metadata?: Record<string, unknown>;
}

export interface ListWorkspaceActivityParams extends PaginationParams {
  outcome?: "worked" | "failed";
  subject?: string;
  memoryId?: string;
}

// ─── Invitations Domain ───

export interface InvitationItem {
  id: string;
  organizationId?: string;
  organizationSlug?: string;
  workspaceId?: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "declined" | "expired";
  createdAt: string;
  expiresAt: string;
}

// ─── Operator Domain ───

export interface OperatorStats {
  totalUsers: number;
  totalWorkspaces: number;
  totalMemories: number;
  totalAgents: number;
  activeRecalls24h: number;
  uptimeSeconds: number;
  version: string;
}
