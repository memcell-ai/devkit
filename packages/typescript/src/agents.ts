import type { MemCell } from "./client.js";
import type {
  AgentItem,
  CreateAgentKeyResponse,
  CreateAgentParams,
  ListAgentsParams,
  PaginatedResult,
  UpdateAgentParams,
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

function buildQuery(params?: ListAgentsParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.page !== undefined) q.set("page", String(params.page));
  if (params.perPage !== undefined) q.set("per_page", String(params.perPage));
  if (params.status) q.set("status", params.status);
  if (params.kind) q.set("kind", params.kind);
  if (params.q) q.set("q", params.q);
  if (params.sort) q.set("sort", params.sort);
  if (params.order) q.set("order", params.order);

  const str = q.toString();
  return str ? `?${str}` : "";
}

export class AgentsNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Lists agents registered in a project with pagination and filtering.
   */
  async list(
    namespace: string,
    params?: ListAgentsParams,
  ): Promise<PaginatedResult<AgentItem>> {
    const { owner, project } = parseNamespace(namespace);
    const query = buildQuery(params);
    const json = await this.client.request<{
      agents: AgentItem[];
      pagination: {
        page: number;
        perPage: number;
        total: number;
        hasMore: boolean;
      };
    }>(`/api/v1/${owner}/${project}/agents${query}`, { method: "GET" });

    return {
      items: json.agents || [],
      pagination: json.pagination,
    };
  }

  /**
   * Fetches an agent by ID within a project.
   */
  async get(namespace: string, agentId: string): Promise<AgentItem> {
    const { owner, project } = parseNamespace(namespace);
    const json = await this.client.request<{ agent: AgentItem }>(
      `/api/v1/${owner}/${project}/agents/${encodeURIComponent(agentId)}`,
      { method: "GET" },
    );
    return json.agent;
  }

  /**
   * Registers a new agent in the project.
   */
  async create(
    namespace: string,
    params: CreateAgentParams,
  ): Promise<AgentItem> {
    const { owner, project } = parseNamespace(namespace);
    const json = await this.client.request<{ agent: AgentItem }>(
      `/api/v1/${owner}/${project}/agents`,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
    return json.agent;
  }

  /**
   * Updates an existing agent's configuration or status.
   */
  async update(
    namespace: string,
    agentId: string,
    params: UpdateAgentParams,
  ): Promise<AgentItem> {
    const { owner, project } = parseNamespace(namespace);
    const json = await this.client.request<{ agent: AgentItem }>(
      `/api/v1/${owner}/${project}/agents/${encodeURIComponent(agentId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(params),
      },
    );
    return json.agent;
  }

  /**
   * Deletes an agent from a project.
   */
  async delete(namespace: string, agentId: string): Promise<void> {
    const { owner, project } = parseNamespace(namespace);
    await this.client.request<{ ok: boolean }>(
      `/api/v1/${owner}/${project}/agents/${encodeURIComponent(agentId)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Generates a new API key for the specified agent.
   */
  async createKey(
    namespace: string,
    agentId: string,
  ): Promise<CreateAgentKeyResponse["key"]> {
    const { owner, project } = parseNamespace(namespace);
    const json = await this.client.request<CreateAgentKeyResponse>(
      `/api/v1/${owner}/${project}/agents/${encodeURIComponent(agentId)}/keys`,
      { method: "POST" },
    );
    return json.key;
  }

  /**
   * Revokes an existing API key for an agent.
   */
  async revokeKey(
    namespace: string,
    agentId: string,
    keyId: string,
  ): Promise<void> {
    const { owner, project } = parseNamespace(namespace);
    await this.client.request<{ revoked: boolean }>(
      `/api/v1/${owner}/${project}/agents/${encodeURIComponent(agentId)}/keys/${encodeURIComponent(keyId)}`,
      { method: "DELETE" },
    );
  }
}
