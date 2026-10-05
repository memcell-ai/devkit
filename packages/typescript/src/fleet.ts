import type { MemCell } from "./client.js";
import type {
  CreateFleetAgentParams,
  CreateFleetAgentResult,
  FleetAgent,
  FleetAgentDetail,
  ListFleetAgentsParams,
  AgentProjectGrant,
} from "./types.js";

function buildFleetQuery(params?: ListFleetAgentsParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.page !== undefined) q.set("page", String(params.page));
  if (params.perPage !== undefined) q.set("perPage", String(params.perPage));
  if (params.q) q.set("q", params.q);
  if (params.status) q.set("status", params.status);
  if (params.scope) q.set("scope", params.scope);
  if (params.framework) q.set("framework", params.framework);
  if (params.teamId) q.set("teamId", params.teamId);
  if (params.workspaceId) q.set("projectId", params.workspaceId);

  const str = q.toString();
  return str ? `?${str}` : "";
}

export class OrganizationFleetNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Lists agents in an organization's central fleet.
   */
  async list(
    orgSlug: string,
    params?: ListFleetAgentsParams,
  ): Promise<{ agents: FleetAgent[]; total: number }> {
    const query = buildFleetQuery(params);
    return await this.client.request<{ agents: FleetAgent[]; total: number }>(
      `/api/v1/organizations/${orgSlug}/fleet${query}`,
      { method: "GET" },
    );
  }

  /**
   * Fetches details, active credentials, and project grants of a fleet agent.
   */
  async get(orgSlug: string, agentId: string): Promise<FleetAgentDetail> {
    return await this.client.request<FleetAgentDetail>(
      `/api/v1/organizations/${orgSlug}/fleet/${agentId}`,
      { method: "GET" },
    );
  }

  /**
   * Registers a new autonomous agent to the central fleet with optional initial credentials.
   */
  async register(
    orgSlug: string,
    params: CreateFleetAgentParams,
  ): Promise<CreateFleetAgentResult> {
    return await this.client.request<CreateFleetAgentResult>(
      `/api/v1/organizations/${orgSlug}/fleet`,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }

  /**
   * Activates the emergency kill-switch for an agent, instantly blocking gateway access.
   */
  async suspend(
    orgSlug: string,
    agentId: string,
    reason: string,
  ): Promise<{ ok: boolean; agent: FleetAgent; message: string }> {
    return await this.client.request<{
      ok: boolean;
      agent: FleetAgent;
      message: string;
    }>(`/api/v1/organizations/${orgSlug}/fleet/${agentId}/suspend`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  /**
   * Reactivates a suspended agent, restoring gateway access.
   */
  async resume(
    orgSlug: string,
    agentId: string,
  ): Promise<{ ok: boolean; agent: FleetAgent; message: string }> {
    return await this.client.request<{
      ok: boolean;
      agent: FleetAgent;
      message: string;
    }>(`/api/v1/organizations/${orgSlug}/fleet/${agentId}/resume`, {
      method: "POST",
    });
  }

  /**
   * Grants an agent cross-project access to a designated project.
   */
  async grant(
    orgSlug: string,
    agentId: string,
    projectId: string,
    permission: "read" | "write" | "admin" = "read",
  ): Promise<{ ok: boolean; grant: AgentProjectGrant }> {
    return await this.client.request<{ ok: boolean; grant: AgentProjectGrant }>(
      `/api/v1/organizations/${orgSlug}/fleet/${agentId}/grant`,
      {
        method: "POST",
        body: JSON.stringify({ projectId, permission }),
      },
    );
  }

  /**
   * Revokes an agent's access to a project.
   */
  async revoke(
    orgSlug: string,
    agentId: string,
    projectId: string,
  ): Promise<{ ok: boolean; agentId: string; projectId: string }> {
    return await this.client.request<{
      ok: boolean;
      agentId: string;
      projectId: string;
    }>(`/api/v1/organizations/${orgSlug}/fleet/${agentId}/grant`, {
      method: "DELETE",
      body: JSON.stringify({ projectId }),
    });
  }

  /**
   * Deletes an agent from the fleet.
   */
  async delete(
    orgSlug: string,
    agentId: string,
  ): Promise<{ ok: boolean; deletedAgentId: string }> {
    return await this.client.request<{ ok: boolean; deletedAgentId: string }>(
      `/api/v1/organizations/${orgSlug}/fleet/${agentId}`,
      { method: "DELETE" },
    );
  }
}

export class ScopedOrganizationFleet {
  constructor(
    private readonly fleet: OrganizationFleetNamespace,
    private readonly orgSlug: string,
  ) {}

  async list(params?: ListFleetAgentsParams) {
    return this.fleet.list(this.orgSlug, params);
  }

  async get(agentId: string) {
    return this.fleet.get(this.orgSlug, agentId);
  }

  async register(params: CreateFleetAgentParams) {
    return this.fleet.register(this.orgSlug, params);
  }

  async suspend(agentId: string, reason: string) {
    return this.fleet.suspend(this.orgSlug, agentId, reason);
  }

  async resume(agentId: string) {
    return this.fleet.resume(this.orgSlug, agentId);
  }

  async grant(
    agentId: string,
    projectId: string,
    permission: "read" | "write" | "admin" = "read",
  ) {
    return this.fleet.grant(this.orgSlug, agentId, projectId, permission);
  }

  async revoke(agentId: string, projectId: string) {
    return this.fleet.revoke(this.orgSlug, agentId, projectId);
  }

  async delete(agentId: string) {
    return this.fleet.delete(this.orgSlug, agentId);
  }
}
