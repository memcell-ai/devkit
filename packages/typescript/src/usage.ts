import type { MemCell } from "./client.js";
import type { OwnerUsage, UsageTimeframe } from "./types.js";

export class UsageNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Fetches account or organization usage metrics, quotas, and memory type distribution.
   */
  async get(
    owner: string,
    params?: { timeframe?: UsageTimeframe },
  ): Promise<OwnerUsage> {
    const q = params?.timeframe
      ? `?timeframe=${encodeURIComponent(params.timeframe)}`
      : "";
    return await this.client.request<OwnerUsage>(
      `/api/v1/${encodeURIComponent(owner)}/usage${q}`,
      { method: "GET" },
    );
  }
}
