import { AuthManager } from "./auth.js";
import { ScopedMemCell } from "./scoped.js";
import { OrganizationMemCell, OrganizationsNamespace } from "./organization.js";
import { MemoriesNamespace } from "./memories.js";
import { StatementsNamespace } from "./statements.js";
import { WorkspacesNamespace } from "./workspaces.js";
import { ProjectsNamespace } from "./projects.js";
import { AgentsNamespace } from "./agents.js";
import { CollaboratorsNamespace } from "./collaborators.js";
import { UsageNamespace } from "./usage.js";
import { AccountNamespace } from "./account.js";
import { ScopesNamespace } from "./scopes.js";
import { SweepNamespace } from "./sweep.js";
import { PromotionsNamespace } from "./promotions.js";
import {
  MemCellError,
  RateLimitError,
  type FeedbackParams,
  type FeedbackResponse,
  type JobEvent,
  type MemCellAuth,
  type MemCellConfig,
  type RecallParams,
  type RecallResponse,
  type RememberParams,
  type RememberResponse,
  type ReportParams,
  type ReportResponse,
  type ScopeOptions,
  type StatementItem,
  type WaitForJobOptions,
} from "./types.js";

export class MemCell {
  readonly baseUrl: string;
  readonly authManager: AuthManager;
  private readonly config: MemCellConfig;
  private readonly customFetch?: typeof fetch;

  /**
   * Memories management APIs (atomic epistemic memory units).
   */
  readonly memories: MemoriesNamespace;

  /**
   * Statements collection and lifecycle operations.
   * @deprecated Use `memories` per the MemCell ontology. Retained for backward compatibility.
   */
  readonly statements: StatementsNamespace;

  /**
   * Workspace boundary management APIs.
   */
  readonly workspaces: WorkspacesNamespace;

  /**
   * Project management APIs.
   * @deprecated Use `workspaces` per the MemCell ontology. Retained for backward compatibility.
   */
  readonly projects: ProjectsNamespace;

  /**
   * Registered agents and keys APIs.
   */
  readonly agents: AgentsNamespace;

  /**
   * Project collaborators and invitation APIs.
   */
  readonly collaborators: CollaboratorsNamespace;

  /**
   * Organization lifecycle and membership APIs.
   */
  readonly organizations: OrganizationsNamespace;

  /**
   * Account & organization usage and telemetry APIs.
   */
  readonly usage: UsageNamespace;

  /**
   * Authenticated caller account and personal access token APIs.
   */
  readonly account: AccountNamespace;

  /**
   * Scopes listing APIs.
   */
  readonly scopes: ScopesNamespace;

  /**
   * Sweep & autonomous consolidation APIs (ADR 0075).
   */
  readonly sweep: SweepNamespace;

  /**
   * Statement promotion pipeline operations across 4-tier scopes.
   */
  readonly promotions: PromotionsNamespace;

  constructor(config: MemCellConfig = {}) {
    let base = config.baseUrl;
    if (
      !base &&
      typeof process !== "undefined" &&
      process.env?.MEMCELL_BASE_URL
    ) {
      base = process.env.MEMCELL_BASE_URL;
    }
    this.baseUrl = (base || "https://api.memcell.io").replace(/\/+$/, "");
    this.config = config;
    this.customFetch = config.fetch;

    let auth: MemCellAuth | undefined = config.auth;
    if (!auth) {
      if (config.apiKey) {
        auth = { apiKey: config.apiKey };
      } else if (config.accessToken) {
        auth = { accessToken: config.accessToken };
      } else if (
        typeof process !== "undefined" &&
        process.env?.MEMCELL_API_KEY
      ) {
        auth = { apiKey: process.env.MEMCELL_API_KEY };
      } else {
        throw new Error(
          "MemCell authentication required. Provide apiKey, accessToken, or auth configuration.",
        );
      }
    }

    this.authManager = new AuthManager(auth, this.baseUrl, this.customFetch);

    this.memories = new MemoriesNamespace(this);
    this.statements = new StatementsNamespace(this);
    this.workspaces = new WorkspacesNamespace(this);
    this.projects = new ProjectsNamespace(this);
    this.agents = new AgentsNamespace(this);
    this.collaborators = new CollaboratorsNamespace(this);
    this.organizations = new OrganizationsNamespace(this);
    this.usage = new UsageNamespace(this);
    this.account = new AccountNamespace(this);
    this.scopes = new ScopesNamespace(this);
    this.sweep = new SweepNamespace(this);
    this.promotions = new PromotionsNamespace(this);
  }

  /**
   * Returns an organization-scoped MemCell handle bound to the specified organization slug.
   *
   * @example
   * ```ts
   * const acme = memcell.forOrganization("acme-corp");
   * const devopsMemory = acme.scope("devops");
   * ```
   */
  forOrganization(orgSlug: string): OrganizationMemCell {
    return new OrganizationMemCell(this, orgSlug);
  }

  /**
   * Semantic shorthand alias for `forOrganization(orgSlug)`.
   */
  forOrg(orgSlug: string): OrganizationMemCell {
    return this.forOrganization(orgSlug);
  }

  /**
   * Semantic shorthand alias for `forOrganization(orgSlug)`.
   */
  organization(orgSlug: string): OrganizationMemCell {
    return this.forOrganization(orgSlug);
  }

  /**
   * Creates a scoped handle bound to a specific namespace (and optional default subject).
   *
   * @example
   * ```ts
   * const canaryMemory = memcell.scope("acme-corp/devops", { subject: "pipeline:deploy-canary" });
   * const result = await canaryMemory.wrapExecution({ action: "promote_canary" }, async (ctx) => {
   *   return await runPromotion(ctx.promptContext);
   * });
   * ```
   */
  scope(namespace: string, options?: ScopeOptions): ScopedMemCell {
    return new ScopedMemCell(this, namespace, options);
  }

  /**
   * Creates a scoped handle bound to a specific workspace (and optional default subject).
   * Semantic alias for `scope(workspaceNamespace, options)`.
   */
  workspace(namespace: string, options?: ScopeOptions): ScopedMemCell {
    return this.scope(namespace, options);
  }

  /**
   * Pre-flight recall from MemCell memory.
   */
  async recall(params: RecallParams): Promise<RecallResponse> {
    const path = this.resolveEndpoint(params.namespace, "recall");
    const effectiveType = params.type ?? params.kind;

    const payload: Record<string, unknown> = {
      query: params.query,
      intent: params.query,
      subject: params.subject,
      type: effectiveType,
      kind: effectiveType,
      scope: params.scope,
      scopes: params.scopes,
      my_memory: params.myMemory,
      min_confidence: params.minConfidence,
      limit: params.limit,
      tags: params.tags,
      format: params.format ?? "xml",
      allow_provisional: params.allowProvisional,
    };

    if (params.namespace && !params.namespace.includes("/")) {
      payload.project = params.namespace;
    }

    const json = await this.request<any>(path, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const rawStatements: any[] = json.statements || json.results || [];
    const statements: StatementItem[] = rawStatements.map((s) => ({
      id: s.id || s.statementId,
      rootId: s.rootId,
      title: s.title,
      context: s.context ?? null,
      example: s.example ?? null,
      tags: s.tags ?? [],
      subject: s.subject ?? null,
      type: s.type || s.kind,
      kind: s.kind || s.type,
      status: s.status,
      confidence: s.confidence,
      score: s.score,
      relevance: s.relevance,
      decayFactor: s.decayFactor,
      stability: s.stability,
      reinforcementCount: s.reinforcementCount,
      isPinned: s.isPinned,
      starred: s.starred,
      starCount: s.starCount,
      scope: s.scope,
      requiredRoles: s.requiredRoles ?? s.required_roles,
      scopePromotedAt: s.scopePromotedAt ?? s.scope_promoted_at ?? null,
      scopePromotedBy: s.scopePromotedBy ?? s.scope_promoted_by ?? null,
      metadata: s.metadata,
      isGuard:
        s.isGuard ??
        (s.type === "guard" ||
          s.tags?.includes("guard") ||
          s.tags?.includes("convention")),
      isInvariant:
        s.isInvariant ??
        (s.type === "guard" ||
          s.type === "directive" ||
          s.kind === "invariant" ||
          s.status === "pinned"),
      expiresAt: s.expiresAt ?? null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    return {
      recallId: json.recallId || json.momentId || "",
      promptContext: json.promptContext || "",
      statements,
      matchedTags: json.matchedTags,
      guardMode: json.guardMode,
      profile: json.profile,
    };
  }

  /**
   * Explicitly write a durable statement into MemCell memory.
   */
  async remember(params: RememberParams): Promise<RememberResponse> {
    const path = this.resolveEndpoint(params.namespace, "remember");
    const effectiveType = params.type ?? params.kind;

    const payload: Record<string, unknown> = {
      title: params.title,
      context: params.context,
      example: params.example,
      tags: params.tags,
      subject: params.subject,
      type: effectiveType,
      kind: effectiveType,
      status: params.status,
      confidence: params.confidence,
      scope: params.scope,
      required_roles: params.requiredRoles,
      metadata: params.metadata,
      expires_at:
        params.expiresAt instanceof Date
          ? params.expiresAt.toISOString()
          : params.expiresAt,
      raw: params.raw,
      sessionId: params.sessionId,
      async: params.async,
    };

    if (params.namespace && !params.namespace.includes("/")) {
      payload.project = params.namespace;
    }

    const json = await this.request<any>(path, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (json.accepted) {
      return {
        accepted: true,
        jobId: json.jobId,
        status: json.status,
        created: [],
        note: json.note || "Job accepted for background execution.",
      };
    }

    const rawCreated: any[] = json.created || [];
    const created: StatementItem[] = rawCreated.map((s) => ({
      id: s.id,
      title: s.title,
      context: s.context ?? null,
      example: s.example ?? null,
      tags: s.tags ?? [],
      subject: s.subject ?? null,
      type: s.type || s.kind,
      kind: s.kind || s.type,
      status: s.status,
      confidence: s.confidence,
      scope: s.scope,
      metadata: s.metadata,
      expiresAt: s.expiresAt ?? null,
    }));

    return {
      created,
      reinforced: json.reinforced,
      superseded: json.superseded,
      note: json.note,
    };
  }

  /**
   * Post-flight execution reporting closing the reinforcement loop.
   */
  async report(params: ReportParams): Promise<ReportResponse> {
    const path = this.resolveEndpoint(params.namespace, "report");

    const payload: Record<string, unknown> = {
      action_taken: params.actionTaken,
      outcome: params.outcome,
      subject: params.subject,
      reason: params.reason,
      external_ref: params.externalRef,
      payload: params.payload,
      recall_id: params.recallId,
      statement_id: params.statementId,
      auto_distill: params.autoDistill ?? true,
      async: params.async,
    };

    if (params.namespace && !params.namespace.includes("/")) {
      payload.project = params.namespace;
    }

    const json = await this.request<any>(path, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (json.accepted) {
      return {
        accepted: true,
        jobId: json.jobId,
        status: json.status,
        outcome: params.outcome,
        attributed: [],
        note: json.note || "Report accepted for background execution.",
      };
    }

    return {
      outcome: json.outcome,
      attributed: json.attributed || [],
      distilledStatement: json.distilledStatement
        ? {
            id: json.distilledStatement.id,
            title: json.distilledStatement.title,
            type: json.distilledStatement.type || json.distilledStatement.kind,
            kind: json.distilledStatement.kind || json.distilledStatement.type,
            status: json.distilledStatement.status,
            confidence: json.distilledStatement.confidence,
            subject: json.distilledStatement.subject,
          }
        : null,
      note: json.note,
    };
  }

  /**
   * Waits for a background job to complete, streaming progress milestones.
   */
  async waitForJob(
    jobId: string,
    options?: WaitForJobOptions,
  ): Promise<JobEvent> {
    const timeoutMs = options?.timeoutMs ?? 15000;
    const pollIntervalMs = options?.pollIntervalMs ?? 250;
    const startTime = Date.now();

    // 1. Attempt streaming via GET /api/v1/jobs/:jobId/stream if fetch supports readable streams
    try {
      const url = `${this.baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}/stream`;
      const authHeader = await this.authManager.getAuthorizationHeader();
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
      };
      if (authHeader) headers.Authorization = authHeader;

      const fetchImpl = this.customFetch ?? fetch;
      const res = await fetchImpl(url, { method: "GET", headers });

      if (
        res.ok &&
        res.body &&
        typeof (res.body as any).getReader === "function"
      ) {
        const reader = (res.body as any).getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          if (Date.now() - startTime > timeoutMs) {
            try {
              await reader.cancel();
            } catch {
              // Ignore reader cancellation errors
            }
            throw new Error(`Job ${jobId} timed out after ${timeoutMs}ms.`);
          }

          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data:")) {
              const jsonStr = trimmed.replace(/^data:\s*/, "");
              try {
                const event = JSON.parse(jsonStr) as JobEvent;
                if (options?.onProgress) {
                  options.onProgress(event);
                }
                if (event.step === "completed") {
                  try {
                    await reader.cancel();
                  } catch {
                    // Ignore reader cancellation errors
                  }
                  return event;
                }
                if (event.step === "failed") {
                  try {
                    await reader.cancel();
                  } catch {
                    // Ignore reader cancellation errors
                  }
                  throw new Error(event.message || `Job ${jobId} failed.`);
                }
              } catch (e) {
                if (e instanceof Error && e.message.includes("Job")) throw e;
              }
            }
          }
        }
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes("timed out") || err.message.includes("failed"))
      ) {
        throw err;
      }
      // Fall through to polling
    }

    // 2. Polling fallback
    while (Date.now() - startTime <= timeoutMs) {
      const statusRes = await this.request<{ ok: boolean; job: any }>(
        `/api/v1/jobs/${encodeURIComponent(jobId)}`,
        { method: "GET" },
      ).catch(() => null);

      if (statusRes?.job) {
        const event: JobEvent = {
          step: statusRes.job.step,
          progress: statusRes.job.progress,
          message: statusRes.job.message,
          metadata: statusRes.job.result ?? undefined,
        };

        if (options?.onProgress) {
          options.onProgress(event);
        }

        if (event.step === "completed") {
          return event;
        }
        if (event.step === "failed") {
          throw new Error(event.message || `Job ${jobId} failed.`);
        }
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    throw new Error(`Job ${jobId} timed out after ${timeoutMs}ms.`);
  }

  /**
   * Direct statement outcome evaluation.
   */
  async feedback(params: FeedbackParams): Promise<FeedbackResponse> {
    const path = this.resolveEndpoint(params.namespace, "feedback");

    const payload: Record<string, unknown> = {
      statement_id: params.statementId,
      recall_id: params.recallId,
      outcome: params.outcome,
      reason: params.reason,
      external_ref: params.externalRef,
      payload: params.payload,
    };

    if (params.namespace && !params.namespace.includes("/")) {
      payload.project = params.namespace;
    }

    const json = await this.request<any>(path, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return {
      outcome: json.outcome,
      attributed: json.attributed || [],
    };
  }

  /**
   * Internal HTTP request handler adding authentication, rate limit resilience, and error parsing.
   */
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const fetcher = this.customFetch ?? fetch;
    const maxRetries = this.config.maxRetries ?? 3;
    const initialDelay = this.config.initialRetryDelayMs ?? 1000;
    const maxDelay = this.config.maxRetryDelayMs ?? 15000;
    let attempt = 0;

    while (true) {
      const authHeader = await this.authManager.getAuthorizationHeader();
      const headers: Record<string, string> = {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers as Record<string, string>),
      };

      const response = await fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers,
      });

      // Handle soft warning header (299)
      const warningHeader = response.headers.get("RateLimit-Warning");
      if (warningHeader && this.config.onRateLimitWarning) {
        try {
          this.config.onRateLimitWarning(warningHeader, response);
        } catch {
          // Callback exceptions must not break API response execution
        }
      }

      // Handle 429 rate limit with automatic exponential backoff or RateLimitError
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get("Retry-After");
        const retryAfterSec = retryAfterHeader
          ? parseInt(retryAfterHeader, 10)
          : NaN;

        if (attempt < maxRetries) {
          attempt++;
          const delayMs =
            (!isNaN(retryAfterSec) && retryAfterSec > 0
              ? retryAfterSec * 1000
              : Math.min(maxDelay, initialDelay * Math.pow(2, attempt - 1))) +
            Math.floor(Math.random() * 200);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        // Retries exhausted on 429 -> Throw typed RateLimitError per ADR 057
        const errorJson = (await response.json().catch(() => null)) as {
          error?: string;
          message?: string;
          door?: string;
          limit?: number;
          windowSeconds?: number;
          retryAfter?: number;
        } | null;

        const effectiveRetryAfter =
          !isNaN(retryAfterSec) && retryAfterSec > 0
            ? retryAfterSec
            : (errorJson?.retryAfter ?? 1);

        throw new RateLimitError({
          message:
            errorJson?.message ||
            `Rate limit exceeded${errorJson?.door ? ` on door '${errorJson.door}'` : ""}. Please retry in ${effectiveRetryAfter}s.`,
          door: errorJson?.door,
          limit: errorJson?.limit,
          windowSeconds: errorJson?.windowSeconds,
          retryAfter: effectiveRetryAfter,
          details: errorJson,
        });
      }

      if (!response.ok) {
        const errorJson = (await response.json().catch(() => null)) as {
          error?: string | { message?: string };
          message?: string;
          error_description?: string;
        } | null;

        const message =
          errorJson?.message ||
          (typeof errorJson?.error === "object"
            ? errorJson.error.message
            : errorJson?.error) ||
          errorJson?.error_description ||
          response.statusText ||
          `HTTP ${response.status}`;

        const code =
          typeof errorJson?.error === "string"
            ? errorJson.error
            : typeof errorJson?.error === "object"
              ? "api_error"
              : `HTTP_${response.status}`;

        throw new MemCellError(
          `MemCell API Error (${response.status}): ${message}`,
          response.status,
          code,
          errorJson,
        );
      }

      return (await response.json()) as T;
    }
  }

  /**
   * Internal HTTP request handler returning raw Response for non-JSON or streaming formats (e.g. CEF, CSV).
   */
  async requestRaw(path: string, init: RequestInit = {}): Promise<Response> {
    const fetcher = this.customFetch ?? fetch;
    const authHeader = await this.authManager.getAuthorizationHeader();
    const headers: Record<string, string> = {
      Authorization: authHeader,
      ...(init.headers as Record<string, string>),
    };

    const response = await fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      throw new MemCellError(
        `MemCell API Error (${response.status}): ${response.statusText}`,
        response.status,
        `HTTP_${response.status}`,
      );
    }

    return response;
  }

  private resolveEndpoint(
    namespace: string | undefined,
    action: "recall" | "remember" | "report" | "feedback",
  ): string {
    if (namespace && namespace.includes("/")) {
      const parts = namespace.split("/");
      const owner = parts[0];
      const project = parts[1];
      if (owner && project) {
        return `/api/v1/${encodeURIComponent(owner)}/${encodeURIComponent(project)}/${action}`;
      }
    }
    return `/api/v1/${action}`;
  }
}
