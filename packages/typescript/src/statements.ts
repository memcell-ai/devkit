import type { MemCell } from "./client.js";
import type {
  AdoptStatementResponse,
  CreateRelationParams,
  CreateStatementParams,
  ListProjectRelationsParams,
  ListStatementsParams,
  PaginatedResult,
  PromoteStatementParams,
  PromoteStatementResponse,
  StatementHistoryResponse,
  StatementItem,
  StatementRelationItem,
  StatementRelationsResponse,
  StatementStarResponse,
  UpdateStatementParams,
} from "./types.js";

function parseNamespace(namespace: string): { owner: string; project: string } {
  const parts = namespace.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid namespace "${namespace}". Expected format "owner/project" (e.g. "acme/backend").`,
    );
  }
  return {
    owner: encodeURIComponent(parts[0]),
    project: encodeURIComponent(parts[1]),
  };
}

function buildQuery(params?: ListStatementsParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.page !== undefined) q.set("page", String(params.page));
  if (params.perPage !== undefined) q.set("per_page", String(params.perPage));
  if (params.type) q.set("type", params.type);
  if (params.kind) q.set("kind", params.kind);
  if (params.status) q.set("status", params.status);
  if (params.scope) q.set("scope", params.scope);
  if (params.q) q.set("q", params.q);
  if (params.semantic) q.set("semantic", params.semantic);
  if (params.sort) q.set("sort", params.sort);
  if (params.order) q.set("order", params.order);
  if (params.starred !== undefined) q.set("starred", String(params.starred));
  if (params.tag) q.set("tag", params.tag);
  if (params.authorType) q.set("author_type", params.authorType);
  if (params.subject) q.set("subject", params.subject);

  const str = q.toString();
  return str ? `?${str}` : "";
}

export class StatementsNamespace {
  readonly relations: StatementRelationsNamespace;

  constructor(private readonly client: MemCell) {
    this.relations = new StatementRelationsNamespace(client);
  }

  /**
   * Lists statements in a project with filtering and pagination.
   */
  async list(
    namespace: string,
    params?: ListStatementsParams,
  ): Promise<PaginatedResult<StatementItem>> {
    const { owner, project } = parseNamespace(namespace);
    const query = buildQuery(params);
    const json = await this.client.request<{
      statements: StatementItem[];
      pagination: {
        page: number;
        perPage: number;
        total: number;
        hasMore: boolean;
      };
    }>(`/api/v1/${owner}/${project}/statements${query}`, {
      method: "GET",
    });

    return {
      items: json.statements || [],
      pagination: json.pagination,
    };
  }

  /**
   * Fetches a single statement by ID.
   */
  async get(namespace: string, statementId: string): Promise<StatementItem> {
    const { owner, project } = parseNamespace(namespace);
    const json = await this.client.request<{ statement: StatementItem }>(
      `/api/v1/${owner}/${project}/statements/${encodeURIComponent(statementId)}`,
      { method: "GET" },
    );
    return json.statement;
  }

  /**
   * Creates a new statement in the specified project.
   */
  async create(
    namespace: string,
    params: CreateStatementParams,
  ): Promise<StatementItem> {
    const { owner, project } = parseNamespace(namespace);
    const payload: Record<string, unknown> = {
      title: params.title,
      context: params.context,
      example: params.example,
      source: params.source,
      tags: params.tags,
      confidence: params.confidence,
      subject: params.subject,
      type: params.type,
      kind: params.kind,
      status: params.status,
      isPinned: params.isPinned,
      scope: params.scope,
      requiredRoles: params.requiredRoles,
      metadata: params.metadata,
      expiresAt:
        params.expiresAt instanceof Date
          ? params.expiresAt.toISOString()
          : params.expiresAt,
    };

    const json = await this.client.request<{ statement: StatementItem }>(
      `/api/v1/${owner}/${project}/statements`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    return json.statement;
  }

  /**
   * Updates an existing statement.
   */
  async update(
    namespace: string,
    statementId: string,
    params: UpdateStatementParams,
  ): Promise<StatementItem> {
    const { owner, project } = parseNamespace(namespace);
    const json = await this.client.request<{ statement: StatementItem }>(
      `/api/v1/${owner}/${project}/statements/${encodeURIComponent(statementId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(params),
      },
    );
    return json.statement;
  }

  /**
   * Deletes a statement from a project.
   */
  async delete(namespace: string, statementId: string): Promise<void> {
    const { owner, project } = parseNamespace(namespace);
    await this.client.request<{ ok: boolean }>(
      `/api/v1/${owner}/${project}/statements/${encodeURIComponent(statementId)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Stars or unstars a statement.
   */
  async star(
    namespace: string,
    statementId: string,
    starred = true,
  ): Promise<StatementStarResponse> {
    const { owner, project } = parseNamespace(namespace);
    const method = starred ? "PUT" : "DELETE";
    return await this.client.request<StatementStarResponse>(
      `/api/v1/${owner}/${project}/statements/${encodeURIComponent(statementId)}/star`,
      { method },
    );
  }

  /**
   * Retrieves the revision history for a statement.
   */
  async history(
    namespace: string,
    statementId: string,
  ): Promise<StatementHistoryResponse> {
    const { owner, project } = parseNamespace(namespace);
    return await this.client.request<StatementHistoryResponse>(
      `/api/v1/${owner}/${project}/statements/${encodeURIComponent(statementId)}/history`,
      { method: "GET" },
    );
  }

  /**
   * Adopts a statement into one or more target projects.
   */
  async adopt(
    namespace: string,
    statementId: string,
    params: { targetProjectIds: string[] },
  ): Promise<AdoptStatementResponse> {
    const { owner, project } = parseNamespace(namespace);
    return await this.client.request<AdoptStatementResponse>(
      `/api/v1/${owner}/${project}/statements/${encodeURIComponent(statementId)}/adopt`,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }

  /**
   * Promotes a provisional statement to active.
   */
  async promote(
    namespace: string,
    statementId: string,
    params?: PromoteStatementParams,
  ): Promise<PromoteStatementResponse> {
    const { owner, project } = parseNamespace(namespace);
    return await this.client.request<PromoteStatementResponse>(
      `/api/v1/${owner}/${project}/statements/${encodeURIComponent(statementId)}/promote`,
      {
        method: "POST",
        body: JSON.stringify(params || {}),
      },
    );
  }
}

export class StatementRelationsNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Lists incoming and outgoing relations for a specific statement.
   */
  async list(
    namespace: string,
    statementId: string,
  ): Promise<StatementRelationsResponse> {
    const { owner, project } = parseNamespace(namespace);
    return await this.client.request<StatementRelationsResponse>(
      `/api/v1/${owner}/${project}/statements/${encodeURIComponent(statementId)}/relations`,
      { method: "GET" },
    );
  }

  /**
   * Creates an epistemic relation between this statement and a target statement.
   */
  async create(
    namespace: string,
    statementId: string,
    params: CreateRelationParams,
  ): Promise<StatementRelationItem> {
    const { owner, project } = parseNamespace(namespace);
    const json = await this.client.request<{ relation: StatementRelationItem }>(
      `/api/v1/${owner}/${project}/statements/${encodeURIComponent(statementId)}/relations`,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
    return json.relation;
  }

  /**
   * Deletes a statement relation by its ID.
   */
  async delete(
    namespace: string,
    statementId: string,
    relationId: string,
  ): Promise<void> {
    const { owner, project } = parseNamespace(namespace);
    await this.client.request<{ ok: boolean }>(
      `/api/v1/${owner}/${project}/statements/${encodeURIComponent(statementId)}/relations/${encodeURIComponent(relationId)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Lists all statement relations project-wide with optional relationType filter and pagination.
   */
  async listProject(
    namespace: string,
    params?: ListProjectRelationsParams,
  ): Promise<PaginatedResult<StatementRelationItem>> {
    const { owner, project } = parseNamespace(namespace);
    const q = new URLSearchParams();
    if (params?.page !== undefined) q.set("page", String(params.page));
    if (params?.perPage !== undefined)
      q.set("per_page", String(params.perPage));
    if (params?.relationType) q.set("relation_type", params.relationType);
    const query = q.toString() ? `?${q.toString()}` : "";

    const json = await this.client.request<{
      relations: StatementRelationItem[];
      pagination: {
        page: number;
        perPage: number;
        total: number;
        hasMore: boolean;
      };
    }>(`/api/v1/${owner}/${project}/relations${query}`, {
      method: "GET",
    });

    return {
      items: json.relations || [],
      pagination: json.pagination,
    };
  }
}
