export { MemCell } from "./client.js";
export { ScopedMemCell } from "./scoped.js";
export { OrganizationMemCell, OrganizationsNamespace } from "./organization.js";
export { StatementsNamespace } from "./statements.js";
export { ProjectsNamespace } from "./projects.js";
export { AgentsNamespace } from "./agents.js";
export { CollaboratorsNamespace } from "./collaborators.js";
export { UsageNamespace } from "./usage.js";
export { AccountNamespace } from "./account.js";
export { ScopesNamespace } from "./scopes.js";
export { AuthManager } from "./auth.js";
export { MemCellError, RateLimitError } from "./types.js";

export type {
  // Axiom Types
  StatementType,
  StatementStatus,
  MemoryKind,
  MemoryStatus,
  OutcomeVerdict,
  MemCellAuth,
  MemCellConfig,

  // Pagination
  PaginationParams,
  PaginationMetadata,
  PaginatedResult,

  // Statements
  StatementItem,
  StatementAuthor,
  ListStatementsParams,
  CreateStatementParams,
  UpdateStatementParams,
  StatementHistoryItem,
  StatementHistoryResponse,
  StatementStarResponse,
  AdoptedTarget,
  AdoptStatementResponse,
  PromoteStatementParams,
  PromoteStatementResponse,

  // Projects
  ProjectItem,
  ListProjectsParams,
  CreateProjectParams,
  UpdateProjectParams,
  TransferProjectParams,

  // Agents & Keys
  AgentItem,
  AgentKind,
  AgentStatus,
  ListAgentsParams,
  CreateAgentParams,
  UpdateAgentParams,
  AgentKeyItem,
  CreateAgentKeyResponse,

  // Collaborators
  CollaboratorItem,
  CollaboratorRole,
  PendingInvitationItem,
  ListCollaboratorsParams,
  ListCollaboratorsResponse,
  InviteCollaboratorParams,

  // Organizations
  OrganizationItem,
  CreateOrganizationParams,
  UpdateOrganizationParams,
  OrgRole,
  OrgMemberItem,
  ListMembersParams,
  OrgInvitationItem,
  InviteMemberParams,

  // Usage & Telemetry
  UsageTimeframe,
  OwnerUsage,

  // Account
  AccountProfile,
  UpdateProfileParams,
  PersonalAccessTokenItem,
  CreateTokenParams,
  CreateTokenResponse,

  // Scopes
  ScopeItem,

  // Memory Operations
  RecallParams,
  RecallResponse,
  RememberParams,
  RememberResponse,
  ReportParams,
  ReportResponse,
  FeedbackParams,
  FeedbackResponse,
  JobEvent,
  WaitForJobOptions,
  WrapExecutionOptions,
  ScopedExecutionContext,
  ScopedExecutionResult,
  ScopeOptions,
} from "./types.js";
