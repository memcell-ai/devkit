import type { MemCell } from "./client.js";
import type {
  CreateProjectParams,
  ListProjectsParams,
  PaginatedResult,
  ProjectItem,
  TransferProjectParams,
  UpdateProjectParams,
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

function buildQuery(params?: ListProjectsParams): string {
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

export class ProjectsNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Lists projects accessible to the authenticated caller (equivalent to GitHub /user/repos).
   */
  async list(
    params?: ListProjectsParams,
  ): Promise<PaginatedResult<ProjectItem>> {
    const query = buildQuery(params);
    const json = await this.client.request<{
      projects: ProjectItem[];
      pagination: {
        page: number;
        perPage: number;
        total: number;
        hasMore: boolean;
      };
    }>(`/api/v1/projects${query}`, { method: "GET" });

    return {
      items: json.projects || [],
      pagination: json.pagination,
    };
  }

  /**
   * Lists projects belonging to a specific owner (user or organization).
   */
  async listForOwner(
    owner: string,
    params?: ListProjectsParams,
  ): Promise<PaginatedResult<ProjectItem>> {
    const query = buildQuery(params);
    const json = await this.client.request<{
      owner: string;
      projects: ProjectItem[];
      pagination: {
        page: number;
        perPage: number;
        total: number;
        hasMore: boolean;
      };
    }>(`/api/v1/${encodeURIComponent(owner)}/projects${query}`, {
      method: "GET",
    });

    return {
      items: json.projects || [],
      pagination: json.pagination,
    };
  }

  /**
   * Fetches details of a project by namespace (e.g. "acme/backend").
   */
  async get(namespace: string): Promise<ProjectItem> {
    const { owner, project } = parseNamespace(namespace);
    const json = await this.client.request<{ project: ProjectItem }>(
      `/api/v1/${owner}/${project}`,
      { method: "GET" },
    );
    return json.project;
  }

  /**
   * Creates a new project.
   */
  async create(params: CreateProjectParams): Promise<ProjectItem> {
    const json = await this.client.request<{
      ok: boolean;
      project: ProjectItem;
    }>("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return json.project;
  }

  /**
   * Updates an existing project's settings and metadata.
   */
  async update(
    namespace: string,
    params: UpdateProjectParams,
  ): Promise<ProjectItem> {
    const { owner, project } = parseNamespace(namespace);
    const json = await this.client.request<{ project: ProjectItem }>(
      `/api/v1/${owner}/${project}`,
      {
        method: "PATCH",
        body: JSON.stringify(params),
      },
    );
    return json.project;
  }

  /**
   * Deletes a project.
   */
  async delete(namespace: string): Promise<void> {
    const { owner, project } = parseNamespace(namespace);
    await this.client.request<{ ok: boolean }>(`/api/v1/${owner}/${project}`, {
      method: "DELETE",
    });
  }

  /**
   * Transfers a project to another user or organization.
   */
  async transfer(
    namespace: string,
    params: TransferProjectParams,
  ): Promise<void> {
    const { owner, project } = parseNamespace(namespace);
    await this.client.request<{ ok: boolean }>(
      `/api/v1/${owner}/${project}/transfer`,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }
}
