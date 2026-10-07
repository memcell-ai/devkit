import type { MemCell } from "./client.js";
import type { OperatorStats, PaginatedResult } from "./types.js";

export class OperatorNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Fetches cluster-wide runtime and memory statistics.
   */
  async stats(): Promise<OperatorStats> {
    return await this.client.request<OperatorStats>("/api/v1/operator/stats", {
      method: "GET",
    });
  }

  /**
   * Fetches operator-level system analytics.
   */
  async analytics(params?: { timeframe?: string }): Promise<any> {
    const query = params?.timeframe
      ? `?timeframe=${encodeURIComponent(params.timeframe)}`
      : "";
    return await this.client.request<any>(
      `/api/v1/operator/analytics${query}`,
      {
        method: "GET",
      },
    );
  }

  /**
   * Lists inference and embedding models available on the cluster.
   */
  async models(): Promise<any> {
    return await this.client.request<any>("/api/v1/operator/models", {
      method: "GET",
    });
  }

  /**
   * Fetches cluster configuration and feature flags.
   */
  async config(): Promise<any> {
    return await this.client.request<any>("/api/v1/operator/config", {
      method: "GET",
    });
  }

  /**
   * Fetches operational limits.
   */
  async limits(
    type: "global" | "accounts" | "telemetry" = "global",
  ): Promise<any> {
    return await this.client.request<any>(`/api/v1/operator/limits/${type}`, {
      method: "GET",
    });
  }

  /**
   * Updates operational limits.
   */
  async updateLimits(
    type: "global" | "accounts" | "telemetry",
    limits: Record<string, unknown>,
  ): Promise<any> {
    return await this.client.request<any>(`/api/v1/operator/limits/${type}`, {
      method: "POST",
      body: JSON.stringify(limits),
    });
  }

  /**
   * Lists platform users across all organizations.
   */
  async users(params?: {
    page?: number;
    perPage?: number;
  }): Promise<PaginatedResult<any>> {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.perPage) q.set("per_page", String(params.perPage));
    const qs = q.toString() ? `?${q.toString()}` : "";
    const json = await this.client.request<any>(`/api/v1/operator/users${qs}`, {
      method: "GET",
    });
    return {
      items: json.users || json.items || [],
      pagination: json.pagination || {
        page: params?.page ?? 1,
        perPage: params?.perPage ?? 25,
        total: 0,
        hasMore: false,
      },
    };
  }

  /**
   * Updates an operator user's platform role.
   */
  async updateUserRole(userId: string, role: string): Promise<any> {
    return await this.client.request<any>(
      `/api/v1/operator/users/${encodeURIComponent(userId)}/role`,
      {
        method: "PATCH",
        body: JSON.stringify({ role }),
      },
    );
  }

  /**
   * Lists all workspaces provisioned across the instance.
   */
  async workspaces(params?: {
    page?: number;
    perPage?: number;
  }): Promise<PaginatedResult<any>> {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.perPage) q.set("per_page", String(params.perPage));
    const qs = q.toString() ? `?${q.toString()}` : "";
    const json = await this.client.request<any>(
      `/api/v1/operator/workspaces${qs}`,
      {
        method: "GET",
      },
    );
    return {
      items: json.workspaces || json.items || [],
      pagination: json.pagination || {
        page: params?.page ?? 1,
        perPage: params?.perPage ?? 25,
        total: 0,
        hasMore: false,
      },
    };
  }
}
