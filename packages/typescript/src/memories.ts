import type { MemCell } from "./client.js";
import type {
  AdoptMemoryResponse,
  CreateRelationParams,
  CreateMemoryParams,
  DeleteMemoryOptions,
  DeleteMemoryResponse,
  ListWorkspaceRelationsParams,
  ListMemoriesParams,
  PaginatedResult,
  PromoteMemoryParams,
  PromoteMemoryResponse,
  MemoryHistoryResponse,
  MemoryItem,
  MemoryRelationItem,
  MemoryRelationsResponse,
  MemoryStarResponse,
  UpdateMemoryParams,
} from "./types.js";

function parseNamespace(namespace: string): {
  owner: string;
  workspace: string;
} {
  const parts = namespace.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid namespace "${namespace}". Expected format "owner/workspace" (e.g. "acme/backend").`,
    );
  }
  return {
    owner: encodeURIComponent(parts[0]),
    workspace: encodeURIComponent(parts[1]),
  };
}

function buildQuery(params?: ListMemoriesParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.page !== undefined) q.set("page", String(params.page));
  if (params.perPage !== undefined) q.set("per_page", String(params.perPage));
  if (params.type) q.set("type", params.type);
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

export type { DeleteMemoryOptions, DeleteMemoryResponse };

export class MemoriesNamespace {
  readonly relations: MemoryRelationsNamespace;
  protected readonly endpointName: string = "memories";

  constructor(protected readonly client: MemCell) {
    this.relations = new MemoryRelationsNamespace(client);
  }

  /**
   * Lists memories in a workspace with filtering and pagination.
   */
  async list(
    namespace: string,
    params?: ListMemoriesParams,
  ): Promise<PaginatedResult<MemoryItem>> {
    const { owner, workspace } = parseNamespace(namespace);
    const query = buildQuery(params);
    const json = await this.client.request<{
      memories?: MemoryItem[];
      pagination: {
        page: number;
        perPage: number;
        total: number;
        hasMore: boolean;
      };
    }>(`/api/v1/${owner}/${workspace}/${this.endpointName}${query}`, {
      method: "GET",
    });

    return {
      items: (json as any).memories || [],
      pagination: json.pagination,
    };
  }

  /**
   * Fetches a single memory by ID.
   */
  async get(namespace: string, memoryId: string): Promise<MemoryItem> {
    const { owner, workspace } = parseNamespace(namespace);
    const json = await this.client.request<{
      memory?: MemoryItem;
    }>(
      `/api/v1/${owner}/${workspace}/${this.endpointName}/${encodeURIComponent(memoryId)}`,
      { method: "GET" },
    );
    const item = (json as any).memory;
    if (!item) {
      throw new Error(`Memory not found: ${memoryId}`);
    }
    return item;
  }

  /**
   * Remembers a new memory in the specified workspace.
   */
  async remember(
    namespace: string,
    params: CreateMemoryParams,
  ): Promise<MemoryItem> {
    const { owner, workspace } = parseNamespace(namespace);
    const payload: Record<string, unknown> = {
      title: params.title,
      context: params.context,
      example: params.example,
      source: params.source,
      tags: params.tags,
      confidence: params.confidence,
      subject: params.subject,
      type: params.type,
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

    const json = await this.client.request<{
      memory?: MemoryItem;
    }>(`/api/v1/${owner}/${workspace}/${this.endpointName}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const item = (json as any).memory;
    if (!item) {
      throw new Error("Failed to remember memory: empty response");
    }
    return item;
  }

  /**
   * Alias for remember() to maintain compatibility with standard create patterns.
   */
  async create(
    namespace: string,
    params: CreateMemoryParams,
  ): Promise<MemoryItem> {
    return this.remember(namespace, params);
  }

  /**
   * Updates an existing memory.
   */
  async update(
    namespace: string,
    memoryId: string,
    params: UpdateMemoryParams,
  ): Promise<MemoryItem> {
    const { owner, workspace } = parseNamespace(namespace);
    const json = await this.client.request<{
      memory?: MemoryItem;
    }>(
      `/api/v1/${owner}/${workspace}/${this.endpointName}/${encodeURIComponent(memoryId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(params),
      },
    );
    const item = (json as any).memory;
    if (!item) {
      throw new Error(`Failed to update memory: ${memoryId}`);
    }
    return item;
  }

  /**
   * Deletes a memory or its latest version from a workspace.
   * If allVersions is true, permanently deletes the entire memory (all revisions).
   * If allVersions is false, deletes only the latest version and restores the predecessor as latest.
   */
  async delete(
    namespace: string,
    memoryId: string,
    options?: DeleteMemoryOptions,
  ): Promise<DeleteMemoryResponse> {
    const { owner, workspace } = parseNamespace(namespace);
    const query = options?.allVersions ? "?allVersions=true" : "";
    return await this.client.request<DeleteMemoryResponse>(
      `/api/v1/${owner}/${workspace}/${this.endpointName}/${encodeURIComponent(memoryId)}${query}`,
      { method: "DELETE" },
    );
  }

  /**
   * Stars or unstars a memory.
   */
  async star(
    namespace: string,
    memoryId: string,
    starred = true,
  ): Promise<MemoryStarResponse> {
    const { owner, workspace } = parseNamespace(namespace);
    const method = starred ? "PUT" : "DELETE";
    return await this.client.request<MemoryStarResponse>(
      `/api/v1/${owner}/${workspace}/${this.endpointName}/${encodeURIComponent(memoryId)}/star`,
      { method },
    );
  }

  /**
   * Retrieves the revision history for a memory.
   */
  async history(
    namespace: string,
    memoryId: string,
  ): Promise<MemoryHistoryResponse> {
    const { owner, workspace } = parseNamespace(namespace);
    return await this.client.request<MemoryHistoryResponse>(
      `/api/v1/${owner}/${workspace}/${this.endpointName}/${encodeURIComponent(memoryId)}/history`,
      { method: "GET" },
    );
  }

  /**
   * Adopts a memory into one or more target workspaces.
   */
  async adopt(
    namespace: string,
    memoryId: string,
    params: { targetWorkspaceIds?: string[] },
  ): Promise<AdoptMemoryResponse> {
    const { owner, workspace } = parseNamespace(namespace);
    const targetWorkspaceIds = params.targetWorkspaceIds ?? [];
    return await this.client.request<AdoptMemoryResponse>(
      `/api/v1/${owner}/${workspace}/${this.endpointName}/${encodeURIComponent(memoryId)}/adopt`,
      {
        method: "POST",
        body: JSON.stringify({ targetWorkspaceIds }),
      },
    );
  }

  /**
   * Promotes a provisional memory to active.
   */
  async promote(
    namespace: string,
    memoryId: string,
    params?: PromoteMemoryParams,
  ): Promise<PromoteMemoryResponse> {
    const { owner, workspace } = parseNamespace(namespace);
    return await this.client.request<PromoteMemoryResponse>(
      `/api/v1/${owner}/${workspace}/${this.endpointName}/${encodeURIComponent(memoryId)}/promote`,
      {
        method: "POST",
        body: JSON.stringify(params || {}),
      },
    );
  }
}

export class MemoryRelationsNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Lists incoming and outgoing relations for a specific memory.
   */
  async list(
    namespace: string,
    memoryId: string,
  ): Promise<MemoryRelationsResponse> {
    const { owner, workspace } = parseNamespace(namespace);
    return await this.client.request<MemoryRelationsResponse>(
      `/api/v1/${owner}/${workspace}/memories/${encodeURIComponent(memoryId)}/relations`,
      { method: "GET" },
    );
  }

  /**
   * Creates an epistemic relation between this memory and a target memory.
   */
  async create(
    namespace: string,
    memoryId: string,
    params: CreateRelationParams,
  ): Promise<MemoryRelationItem> {
    const { owner, workspace } = parseNamespace(namespace);
    const json = await this.client.request<{ relation: MemoryRelationItem }>(
      `/api/v1/${owner}/${workspace}/memories/${encodeURIComponent(memoryId)}/relations`,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
    return json.relation;
  }

  /**
   * Deletes a memory relation by its ID.
   */
  async delete(
    namespace: string,
    memoryId: string,
    relationId: string,
  ): Promise<void> {
    const { owner, workspace } = parseNamespace(namespace);
    await this.client.request<{ ok: boolean }>(
      `/api/v1/${owner}/${workspace}/memories/${encodeURIComponent(memoryId)}/relations/${encodeURIComponent(relationId)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Lists all memory relations workspace-wide with optional relationType filter and pagination.
   */
  async listWorkspace(
    namespace: string,
    params?: ListWorkspaceRelationsParams,
  ): Promise<PaginatedResult<MemoryRelationItem>> {
    const { owner, workspace } = parseNamespace(namespace);
    const q = new URLSearchParams();
    if (params?.page !== undefined) q.set("page", String(params.page));
    if (params?.perPage !== undefined)
      q.set("per_page", String(params.perPage));
    if (params?.relationType) q.set("relation_type", params.relationType);
    const query = q.toString() ? `?${q.toString()}` : "";

    const json = await this.client.request<{
      relations: MemoryRelationItem[];
      pagination: {
        page: number;
        perPage: number;
        total: number;
        hasMore: boolean;
      };
    }>(`/api/v1/${owner}/${workspace}/relations${query}`, {
      method: "GET",
    });

    return {
      items: json.relations || [],
      pagination: json.pagination,
    };
  }
}
