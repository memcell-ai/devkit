export { MemCell } from "./client.js";
export { ScopedMemCell } from "./scoped.js";
export { OrganizationMemCell, OrganizationsNamespace } from "./organization.js";
export {
  MemoriesNamespace,
  MemoryRelationsNamespace,
  type DeleteMemoryOptions,
  type DeleteMemoryResponse,
  type DeleteStatementOptions,
  type DeleteStatementResponse,
} from "./memories.js";

export {
  StatementsNamespace,
  StatementRelationsNamespace,
} from "./statements.js";
export { WorkspacesNamespace } from "./workspaces.js";
export { ProjectsNamespace } from "./projects.js";
export { AgentsNamespace } from "./agents.js";
export { CollaboratorsNamespace } from "./collaborators.js";
export { UsageNamespace } from "./usage.js";
export { AccountNamespace } from "./account.js";
export { ScopesNamespace } from "./scopes.js";
export { SweepNamespace } from "./sweep.js";
export { PromotionsNamespace } from "./promotions.js";
export { OrganizationSsoNamespace, ScopedOrganizationSso } from "./sso.js";
export {
  OrganizationFleetNamespace,
  ScopedOrganizationFleet,
} from "./fleet.js";
export {
  OrganizationAuditNamespace,
  ScopedOrganizationAudit,
  SiemDestinationsNamespace,
  ScopedSiemDestinations,
} from "./audit.js";
export {
  OrganizationInsightsNamespace,
  ScopedOrganizationInsights,
} from "./insights.js";
export {
  OrganizationTeamsNamespace,
  ScopedOrganizationTeams,
  TeamMembersNamespace,
  ScopedTeamMembers,
} from "./teams.js";
export { AuthManager } from "./auth.js";
export {
  MemCellError,
  RateLimitError,
  MEMORY_SCOPES,
  MEMORY_TYPES,
  STATEMENT_SCOPES,
} from "./types.js";

export type {
  // Axiom Types
  MemoryType,
  StatementType,
  MemoryScope,
  StatementScope,
  PromotionStatus,
  MemoryStatus,
  StatementStatus,
  MemoryKind,
  OutcomeVerdict,
  MemCellAuth,
  MemCellConfig,

  // Pagination
  PaginationParams,
  PaginationMetadata,
  PaginatedResult,

  // Memories & Statements
  MemoryItem,
  StatementItem,
  StatementAuthor,
  ListMemoriesParams,
  ListStatementsParams,
  CreateMemoryParams,
  CreateStatementParams,
  UpdateMemoryParams,
  UpdateStatementParams,
  StatementHistoryItem,
  StatementHistoryResponse,
  MemoryHistoryResponse,
  StatementStarResponse,
  MemoryStarResponse,
  AdoptedTarget,
  AdoptStatementResponse,
  AdoptMemoryResponse,
  PromoteMemoryParams,
  PromoteStatementParams,
  PromoteStatementResponse,
  PromoteMemoryResponse,
  StatementPromotionRequest,
  ListPromotionsParams,

  // Relations
  RelationType,
  StatementRelationItem,
  MemoryRelationItem,
  CreateRelationParams,
  CreateMemoryRelationParams,
  StatementRelationsResponse,
  MemoryRelationsResponse,
  ListProjectRelationsParams,

  // Workspaces & Projects
  WorkspaceItem,
  ProjectItem,
  ListWorkspacesParams,
  ListProjectsParams,
  CreateWorkspaceParams,
  CreateProjectParams,
  UpdateWorkspaceParams,
  UpdateProjectParams,
  TransferWorkspaceParams,
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

  // Sweep (ADR 0075)
  ConsolidateSweepParams,
  ConsolidateSweepResponse,

  // Enterprise SSO
  SSOProviderSummary,
  ConfigureSSOInput,
  SSOVerificationToken,
  SSODomainLookupResult,
  OrganizationSSOResult,

  // Fleet Management
  FleetAgent,
  ListFleetAgentsParams,
  CreateFleetAgentParams,
  CreateFleetAgentResult,
  FleetAgentDetail,
  AgentProjectGrant,

  // Audit & SIEM
  AuditEvent,
  ListAuditEventsParams,
  SiemDestination,
  CreateSiemDestinationParams,

  // Enterprise Insights
  EnterpriseInsights,
  GetInsightsParams,

  // Team Management
  OrgTeam,
  OrgTeamDetail,
  TeamMemberItem,
} from "./types.js";
