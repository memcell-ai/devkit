import type {
  AdoptStatementResponse,
  AgentItem,
  CollaboratorRole,
  CreateAgentKeyResponse,
  CreateAgentParams,
  CreateStatementParams,
  FeedbackParams,
  FeedbackResponse,
  InviteCollaboratorParams,
  JobEvent,
  ListAgentsParams,
  ListCollaboratorsParams,
  ListCollaboratorsResponse,
  ListStatementsParams,
  PaginatedResult,
  PendingInvitationItem,
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
  StatementStarResponse,
  UpdateAgentParams,
  UpdateStatementParams,
  WaitForJobOptions,
  WrapExecutionOptions,
} from "./types.js";
import type { MemCell } from "./client.js";

export class ScopedMemCell {
  readonly defaultSubject: string | null;
  readonly defaultFormat: "xml" | "markdown" | "none";

  /**
   * Scoped statement operations bound to this namespace.
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
}
