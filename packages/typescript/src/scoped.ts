import type {
  AdoptMemoryResponse,
  AdoptStatementResponse,
  AgentItem,
  CollaboratorRole,
  ConsolidateSweepParams,
  ConsolidateSweepResponse,
  CreateAgentKeyResponse,
  CreateAgentParams,
  CreateMemoryParams,
  CreateRelationParams,
  CreateStatementParams,
  FeedbackParams,
  FeedbackResponse,
  InviteCollaboratorParams,
  JobEvent,
  ListAgentsParams,
  ListCollaboratorsParams,
  ListCollaboratorsResponse,
  ListMemoriesParams,
  ListProjectRelationsParams,
  ListPromotionsParams,
  ListStatementsParams,
  MemoryHistoryResponse,
  MemoryItem,
  MemoryRelationItem,
  MemoryRelationsResponse,
  MemoryStarResponse,
  PaginatedResult,
  PendingInvitationItem,
  PromoteMemoryParams,
  PromoteMemoryResponse,
  PromoteStatementParams,
  PromoteStatementResponse,
  RecallParams,
  RecallResponse,
  RememberParams,
  RememberResponse,
  ReportParams,
  ReportResponse,
  ScopeItem,
  ScopeOptions,
  ScopedExecutionContext,
  ScopedExecutionResult,
  StatementHistoryResponse,
  StatementItem,
  StatementPromotionRequest,
  StatementRelationItem,
  StatementRelationsResponse,
  StatementStarResponse,
  UpdateAgentParams,
  UpdateMemoryParams,
  UpdateStatementParams,
  WaitForJobOptions,
  WrapExecutionOptions,
} from "./types.js";
import type { MemCell } from "./client.js";

export class ScopedMemCell {
  readonly defaultSubject: string | null;
  readonly defaultFormat: "xml" | "markdown" | "none";

  /**
   * Scoped memory operations bound to this namespace.
   */
  readonly memories = {
    list: (params?: ListMemoriesParams): Promise<PaginatedResult<MemoryItem>> =>
      this.client.memories.list(this.namespace, params),
    get: (memoryId: string): Promise<MemoryItem> =>
      this.client.memories.get(this.namespace, memoryId),
    create: (params: CreateMemoryParams): Promise<MemoryItem> =>
      this.client.memories.create(this.namespace, {
        subject: this.defaultSubject ?? undefined,
        ...params,
      }),
    update: (
      memoryId: string,
      params: UpdateMemoryParams,
    ): Promise<MemoryItem> =>
      this.client.memories.update(this.namespace, memoryId, params),
    delete: (memoryId: string): Promise<void> =>
      this.client.memories.delete(this.namespace, memoryId),
    star: (memoryId: string, starred = true): Promise<MemoryStarResponse> =>
      this.client.memories.star(this.namespace, memoryId, starred),
    history: (memoryId: string): Promise<MemoryHistoryResponse> =>
      this.client.memories.history(this.namespace, memoryId),
    adopt: (
      memoryId: string,
      params: { targetProjectIds?: string[]; targetWorkspaceIds?: string[] },
    ): Promise<AdoptMemoryResponse> =>
      this.client.memories.adopt(this.namespace, memoryId, params),
    promote: (
      memoryId: string,
      params?: PromoteMemoryParams,
    ): Promise<PromoteMemoryResponse> =>
      this.client.memories.promote(this.namespace, memoryId, params),
    relations: {
      list: (memoryId: string): Promise<MemoryRelationsResponse> =>
        this.client.memories.relations.list(this.namespace, memoryId),
      create: (
        memoryId: string,
        params: CreateRelationParams,
      ): Promise<MemoryRelationItem> =>
        this.client.memories.relations.create(this.namespace, memoryId, params),
      delete: (memoryId: string, relationId: string): Promise<void> =>
        this.client.memories.relations.delete(
          this.namespace,
          memoryId,
          relationId,
        ),
      listWorkspace: (
        params?: ListProjectRelationsParams,
      ): Promise<PaginatedResult<MemoryRelationItem>> =>
        this.client.memories.relations.listProject(this.namespace, params),
      listProject: (
        params?: ListProjectRelationsParams,
      ): Promise<PaginatedResult<MemoryRelationItem>> =>
        this.client.memories.relations.listProject(this.namespace, params),
    },
  };

  /**
   * @deprecated Use `memories` instead.
   */
  readonly statements = {
    list: (
      params?: ListStatementsParams,
    ): Promise<PaginatedResult<StatementItem>> =>
      this.client.statements.list(this.namespace, params),
    get: (statementId: string): Promise<StatementItem> =>
      this.client.statements.get(this.namespace, statementId),
    create: (params: CreateStatementParams): Promise<StatementItem> =>
      this.client.statements.create(this.namespace, {
        subject: this.defaultSubject ?? undefined,
        ...params,
      }),
    update: (
      statementId: string,
      params: UpdateStatementParams,
    ): Promise<StatementItem> =>
      this.client.statements.update(this.namespace, statementId, params),
    delete: (statementId: string): Promise<void> =>
      this.client.statements.delete(this.namespace, statementId),
    star: (
      statementId: string,
      starred = true,
    ): Promise<StatementStarResponse> =>
      this.client.statements.star(this.namespace, statementId, starred),
    history: (statementId: string): Promise<StatementHistoryResponse> =>
      this.client.statements.history(this.namespace, statementId),
    adopt: (
      statementId: string,
      params: { targetProjectIds: string[] },
    ): Promise<AdoptStatementResponse> =>
      this.client.statements.adopt(this.namespace, statementId, params),
    promote: (
      statementId: string,
      params?: PromoteStatementParams,
    ): Promise<PromoteStatementResponse> =>
      this.client.statements.promote(this.namespace, statementId, params),
    relations: {
      list: (statementId: string): Promise<StatementRelationsResponse> =>
        this.client.statements.relations.list(this.namespace, statementId),
      create: (
        statementId: string,
        params: CreateRelationParams,
      ): Promise<StatementRelationItem> =>
        this.client.statements.relations.create(
          this.namespace,
          statementId,
          params,
        ),
      delete: (statementId: string, relationId: string): Promise<void> =>
        this.client.statements.relations.delete(
          this.namespace,
          statementId,
          relationId,
        ),
      listProject: (
        params?: ListProjectRelationsParams,
      ): Promise<PaginatedResult<StatementRelationItem>> =>
        this.client.statements.relations.listProject(this.namespace, params),
    },
  };

  /**
   * Scoped agent operations bound to this namespace.
   */
  readonly agents = {
    list: (params?: ListAgentsParams): Promise<PaginatedResult<AgentItem>> =>
      this.client.agents.list(this.namespace, params),
    get: (agentId: string): Promise<AgentItem> =>
      this.client.agents.get(this.namespace, agentId),
    create: (params: CreateAgentParams): Promise<AgentItem> =>
      this.client.agents.create(this.namespace, params),
    update: (agentId: string, params: UpdateAgentParams): Promise<AgentItem> =>
      this.client.agents.update(this.namespace, agentId, params),
    delete: (agentId: string): Promise<void> =>
      this.client.agents.delete(this.namespace, agentId),
    createKey: (agentId: string): Promise<CreateAgentKeyResponse["key"]> =>
      this.client.agents.createKey(this.namespace, agentId),
    revokeKey: (agentId: string, keyId: string): Promise<void> =>
      this.client.agents.revokeKey(this.namespace, agentId, keyId),
  };

  /**
   * Scoped collaborator operations bound to this namespace.
   */
  readonly collaborators = {
    list: (
      params?: ListCollaboratorsParams,
    ): Promise<ListCollaboratorsResponse> =>
      this.client.collaborators.list(this.namespace, params),
    invite: (
      params: InviteCollaboratorParams,
    ): Promise<PendingInvitationItem> =>
      this.client.collaborators.invite(this.namespace, params),
    updateRole: (userId: string, role: CollaboratorRole): Promise<void> =>
      this.client.collaborators.updateRole(this.namespace, userId, role),
    remove: (userId: string): Promise<void> =>
      this.client.collaborators.remove(this.namespace, userId),
    revokeInvitation: (invitationId: string): Promise<void> =>
      this.client.collaborators.revokeInvitation(this.namespace, invitationId),
  };

  /**
   * Scopes registered within this project namespace.
   */
  readonly scopes = {
    list: (): Promise<ScopeItem[]> => this.client.scopes.list(this.namespace),
  };

  /**
   * Scoped statement promotion pipeline operations bound to this namespace.
   */
  readonly promotions = {
    list: (
      params?: ListPromotionsParams,
    ): Promise<PaginatedResult<StatementPromotionRequest>> =>
      this.client.promotions.list(this.namespace, params),
    approve: (
      promotionId: string,
      params?: { reason?: string },
    ): Promise<{ approved: boolean; statement: StatementItem }> =>
      this.client.promotions.approve(this.namespace, promotionId, params),
    reject: (
      promotionId: string,
      params?: { reason?: string },
    ): Promise<{ rejected: boolean }> =>
      this.client.promotions.reject(this.namespace, promotionId, params),
  };

  constructor(
    private readonly client: MemCell,
    readonly namespace: string,
    options?: ScopeOptions,
  ) {
    this.defaultSubject = options?.subject ?? null;
    this.defaultFormat = options?.format ?? "xml";
  }

  /**
   * Pre-flight recall from the scoped memory container.
   */
  async recall(
    query: string,
    options?: Omit<RecallParams, "namespace" | "query">,
  ): Promise<RecallResponse> {
    return await this.client.recall({
      namespace: this.namespace,
      query,
      subject:
        options?.subject !== undefined ? options.subject : this.defaultSubject,
      format: options?.format ?? this.defaultFormat,
      ...options,
    });
  }

  /**
   * Direct addition of durable statements to the scoped memory container.
   */
  async remember(
    statement: Omit<RememberParams, "namespace">,
  ): Promise<RememberResponse> {
    return await this.client.remember({
      namespace: this.namespace,
      subject:
        statement.subject !== undefined
          ? statement.subject
          : this.defaultSubject,
      ...statement,
    });
  }

  /**
   * Post-flight execution reporting & dynamic reinforcement.
   */
  async report(
    params: Omit<ReportParams, "namespace">,
  ): Promise<ReportResponse> {
    return await this.client.report({
      namespace: this.namespace,
      subject:
        params.subject !== undefined ? params.subject : this.defaultSubject,
      ...params,
    });
  }

  /**
   * Direct statement outcome feedback.
   */
  async feedback(
    params: Omit<FeedbackParams, "namespace">,
  ): Promise<FeedbackResponse> {
    return await this.client.feedback({
      namespace: this.namespace,
      ...params,
    });
  }

  /**
   * Automated execution wrapper implementing the complete Agentic Closed-Loop:
   * 1. Pre-Flight Recall: Queries relevant statements (directives, facts, preferences) for the action.
   * 2. In-Flight Execution: Runs the agent callback with promptContext and statements.
   * 3. Post-Flight Reinforcement: Automatically reports outcome ('worked' on resolution, 'failed' on exception)
   *    and attributes feedback before re-throwing any error.
   */
  async wrapExecution<T>(
    options: WrapExecutionOptions,
    actionFn: (context: ScopedExecutionContext) => Promise<T>,
  ): Promise<ScopedExecutionResult<T>> {
    const targetSubject =
      options.subject !== undefined ? options.subject : this.defaultSubject;
    const format = options.format ?? this.defaultFormat;

    // 1. Pre-Flight Recall
    const recallResult = await this.recall(options.action, {
      subject: targetSubject,
      type: options.type,
      kind: options.kind,
      minConfidence: options.minConfidence,
      limit: options.limit,
      tags: options.tags,
      format,
    });

    const executionContext: ScopedExecutionContext = {
      promptContext: recallResult.promptContext,
      statements: recallResult.statements,
      recallId: recallResult.recallId,
      subject: targetSubject,
    };

    // 2. In-Flight Execution
    let result: T;
    try {
      result = await actionFn(executionContext);
    } catch (err) {
      // 3a. Post-Flight Report on Error
      const errorMessage = err instanceof Error ? err.message : String(err);
      try {
        await this.report({
          actionTaken: options.action,
          outcome: "failed",
          recallId: recallResult.recallId,
          subject: targetSubject,
          reason: errorMessage,
          externalRef: options.externalRef,
          payload: options.payload,
          autoDistill: options.autoDistill,
        });
      } catch {
        // Do not suppress the original execution exception
      }
      throw err;
    }

    // 3b. Post-Flight Report on Success
    const reportResult = await this.report({
      actionTaken: options.action,
      outcome: "worked",
      recallId: recallResult.recallId,
      subject: targetSubject,
      externalRef: options.externalRef,
      payload: options.payload,
      autoDistill: options.autoDistill,
    });

    return {
      result,
      report: reportResult,
      recallId: recallResult.recallId,
      memories: recallResult.memories ?? recallResult.statements,
      statements: recallResult.statements,
      promptContext: recallResult.promptContext,
    };
  }

  /**
   * Waits for an asynchronous background job to complete.
   */
  async waitForJob(
    jobId: string,
    options?: WaitForJobOptions,
  ): Promise<JobEvent> {
    return await this.client.waitForJob(jobId, options);
  }

  /**
   * Triggers an asynchronous consolidation sweep in this project space (ADR 0075).
   */
  async consolidateSweep(
    params?: ConsolidateSweepParams,
  ): Promise<ConsolidateSweepResponse> {
    return await this.client.sweep.consolidate(this.namespace, params);
  }
}

export { ScopedMemCell as ScopedWorkspace };
export { ScopedMemCell as ScopedProjectNamespace };
