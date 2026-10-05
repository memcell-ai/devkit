import type { MemCell } from "./client.js";
import type {
  CreateWorkspaceParams,
  ListWorkspacesParams,
  PaginatedResult,
  WorkspaceItem,
  TransferWorkspaceParams,
  UpdateWorkspaceParams,
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

function buildQuery(params?: ListWorkspacesParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.page !== undefined) q.set("page", String(params.page));
  if (params.perPage !== undefined) q.set("per_page", String(params.perPage));
  if (params.visibility) q.set("visibility", params.visibility);
  if (params.q) q.set("q", params.q);
  if (params.sort) q.set("sort", params.sort);
  if (params.order) q.set("order", params.order);

  const str = q.toString();
  return str ? `?${str}` : "";
}

export class WorkspacesNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Lists workspaces accessible to the authenticated caller.
   */
  async list(
    params?: ListWorkspacesParams,
  ): Promise<PaginatedResult<WorkspaceItem>> {
    const query = buildQuery(params);
    const json = await this.client.request<{
      projects?: WorkspaceItem[];
      workspaces?: WorkspaceItem[];
      pagination: {
        page: number;
        perPage: number;
        total: number;
        hasMore: boolean;
      };
    }>(`/api/v1/workspaces${query}`, { method: "GET" });

    return {
      items: json.workspaces || json.projects || [],
      pagination: json.pagination,
    };
  }

  /**
   * Lists workspaces belonging to a specific owner (user or organization).
   */
  async listForOwner(
    owner: string,
    params?: ListWorkspacesParams,
  ): Promise<PaginatedResult<WorkspaceItem>> {
    const query = buildQuery(params);
    const json = await this.client.request<{
      owner: string;
      projects?: WorkspaceItem[];
      workspaces?: WorkspaceItem[];
      pagination: {
        page: number;
        perPage: number;
        total: number;
        hasMore: boolean;
      };
    }>(`/api/v1/${encodeURIComponent(owner)}/workspaces${query}`, {
      method: "GET",
    });

    return {
      items: json.workspaces || json.projects || [],
      pagination: json.pagination,
    };
  }

  /**
   * Fetches details of a workspace by namespace (e.g. "acme/backend").
   */
  async get(namespace: string): Promise<WorkspaceItem> {
    const { owner, workspace } = parseNamespace(namespace);
    const json = await this.client.request<{
      project?: WorkspaceItem;
      workspace?: WorkspaceItem;
    }>(`/api/v1/${owner}/${workspace}`, { method: "GET" });
    const item = json.workspace ?? json.project;
    if (!item) {
      throw new Error(`Workspace not found: ${namespace}`);
    }
    return item;
  }

  /**
   * Creates a new workspace.
   */
  async create(params: CreateWorkspaceParams): Promise<WorkspaceItem> {
    const json = await this.client.request<{
      ok: boolean;
      project?: WorkspaceItem;
      workspace?: WorkspaceItem;
    }>("/api/v1/workspaces", {
      method: "POST",
      body: JSON.stringify(params),
    });
    const item = json.workspace ?? json.project;
    if (!item) {
      throw new Error("Failed to create workspace: empty response");
    }
    return item;
  }

  /**
   * Updates an existing workspace's settings and metadata.
   */
  async update(
    namespace: string,
    params: UpdateWorkspaceParams,
  ): Promise<WorkspaceItem> {
    const { owner, workspace } = parseNamespace(namespace);
    const json = await this.client.request<{
      project?: WorkspaceItem;
      workspace?: WorkspaceItem;
    }>(`/api/v1/${owner}/${workspace}`, {
      method: "PATCH",
      body: JSON.stringify(params),
    });
    const item = json.workspace ?? json.project;
    if (!item) {
      throw new Error(`Failed to update workspace: ${namespace}`);
    }
    return item;
  }

  /**
   * Deletes a workspace.
   */
  async delete(namespace: string): Promise<void> {
    const { owner, workspace } = parseNamespace(namespace);
    await this.client.request<{ ok: boolean }>(
      `/api/v1/${owner}/${workspace}`,
      {
        method: "DELETE",
      },
    );
  }

  /**
   * Transfers a workspace to another user or organization.
   */
  async transfer(
    namespace: string,
    params: TransferWorkspaceParams,
  ): Promise<void> {
    const { owner, workspace } = parseNamespace(namespace);
    await this.client.request<{ ok: boolean }>(
      `/api/v1/${owner}/${workspace}/transfer`,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }
}
