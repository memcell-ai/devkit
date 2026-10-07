import type { MemCell } from "./client.js";
import type { EnterpriseInsights, GetInsightsParams } from "./types.js";

function buildInsightsQuery(params?: GetInsightsParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.timeframe) q.set("timeframe", params.timeframe);
  if (params.teamId) q.set("teamId", params.teamId);
  if (params.workspaceId) q.set("workspaceId", params.workspaceId);

  const str = q.toString();
  return str ? `?${str}` : "";
}

export class OrganizationInsightsNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Retrieves enterprise cognitive KPIs, token avoidance economics, and latency telemetry.
   */
  async get(
    orgSlug: string,
    params?: GetInsightsParams,
  ): Promise<EnterpriseInsights> {
    const query = buildInsightsQuery(params);
    return await this.client.request<EnterpriseInsights>(
      `/api/v1/organizations/${orgSlug}/insights${query}`,
      { method: "GET" },
    );
  }

  /**
   * Retrieves cognitive KPIs and telemetry for a specific workspace.
   */
  async getForWorkspace(
    namespace: string,
    timeframe: "24h" | "7d" | "30d" = "30d",
  ): Promise<EnterpriseInsights> {
    const parts = namespace.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(
        `Invalid namespace "${namespace}". Expected format "owner/workspace".`,
      );
    }
    const owner = encodeURIComponent(parts[0]);
    const workspace = encodeURIComponent(parts[1]);
    const query = `?timeframe=${encodeURIComponent(timeframe)}`;
    return await this.client.request<EnterpriseInsights>(
      `/api/v1/${owner}/${workspace}/insights${query}`,
      { method: "GET" },
    );
  }
}

export class ScopedOrganizationInsights {
  constructor(
    private readonly insights: OrganizationInsightsNamespace,
    private readonly orgSlug: string,
  ) {}

  async get(params?: GetInsightsParams): Promise<EnterpriseInsights> {
    return this.insights.get(this.orgSlug, params);
  }
}
