import type {
  AdoptMemoryResponse,
  AgentItem,
  CollaboratorRole,
  ConsolidateSweepParams,
  ConsolidateSweepResponse,
  CreateAgentKeyResponse,
  CreateAgentParams,
  CreateMemoryParams,
  CreateRelationParams,
  DeleteMemoryOptions,
  DeleteMemoryResponse,
  FeedbackParams,
  FeedbackResponse,
  InviteCollaboratorParams,
  JobEvent,
  ListAgentsParams,
  ListCollaboratorsParams,
  ListCollaboratorsResponse,
  ListMemoriesParams,
  ListWorkspaceRelationsParams,
  ListPromotionsParams,
  MemoryHistoryResponse,
  MemoryItem,
  MemoryRelationItem,
  MemoryRelationsResponse,
  MemoryStarResponse,
  MemoryPromotionRequest,
  PaginatedResult,
  PendingInvitationItem,
  PromoteMemoryParams,
  PromoteMemoryResponse,
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
  UpdateAgentParams,
  UpdateMemoryParams,
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
    delete: (
      memoryId: string,
      options?: DeleteMemoryOptions,
    ): Promise<DeleteMemoryResponse> =>
      this.client.memories.delete(this.namespace, memoryId, options),

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
        params?: ListWorkspaceRelationsParams,
      ): Promise<PaginatedResult<MemoryRelationItem>> =>
        this.client.memories.relations.listWorkspace(this.namespace, params),
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
   * Scoped memory promotion pipeline operations bound to this namespace.
   */
  readonly promotions = {
    list: (
      params?: ListPromotionsParams,
    ): Promise<PaginatedResult<MemoryPromotionRequest>> =>
      this.client.promotions.list(this.namespace, params),
    approve: (
      promotionId: string,
      params?: { reason?: string },
    ): Promise<{ approved: boolean; memory: MemoryItem }> =>
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
   * Direct addition of durable memories to the scoped memory container.
   */
  async remember(
    params: Omit<RememberParams, "namespace">,
  ): Promise<RememberResponse> {
    return await this.client.remember({
      namespace: this.namespace,
      subject:
        params.subject !== undefined ? params.subject : this.defaultSubject,
      ...params,
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
   * Direct memory outcome feedback.
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
   * 1. Pre-Flight Recall: Queries relevant memories (directives, facts, preferences) for the action.
   * 2. In-Flight Execution: Runs the agent callback with promptContext and memories.
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
      minConfidence: options.minConfidence,
      limit: options.limit,
      tags: options.tags,
      format,
    });

    const executionContext: ScopedExecutionContext = {
      promptContext: recallResult.promptContext,
      memories: recallResult.memories,
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
      memories: recallResult.memories,
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
