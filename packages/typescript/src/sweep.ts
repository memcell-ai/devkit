import type { MemCell } from "./client.js";

export interface ConsolidateSweepParams {
  minSimilarity?: number;
  minClusterSize?: number;
  maxClusterSize?: number;
}

export interface ConsolidateSweepResponse {
  ok: boolean;
  jobId: string;
  status: string;
  message: string;
  phases: string[];
}

function parseNamespace(
  namespace: string | { owner: string; workspace: string },
): {
  owner: string;
  workspace: string;
} {
  if (typeof namespace === "string") {
    const parts = namespace.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(
        `Invalid namespace '${namespace}'. Expected format: 'owner/workspace'`,
      );
    }
    return { owner: parts[0], workspace: parts[1] };
  }
  return namespace;
}

/**
 * Sweep & Autonomous Consolidation API (ADR 0075 Pillar II: The Cognitive Sleep Cycle).
 */
export class SweepNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Triggers an asynchronous consolidation sweep over active memories in the workspace.
   * Clusters memories by semantic density, fuses redundancies, infers relations,
   * surfaces tensions, and regenerates living workspace profile.
   *
   * @returns 202 Accepted response containing `jobId` and streaming `phases`.
   */
  async consolidate(
    namespace: string | { owner: string; workspace: string },
    params?: ConsolidateSweepParams,
  ): Promise<ConsolidateSweepResponse> {
    const { owner, workspace } = parseNamespace(namespace);
    return await this.client.request<ConsolidateSweepResponse>(
      `/api/v1/${encodeURIComponent(owner)}/${encodeURIComponent(workspace)}/lifecycle/sweep/consolidate`,
      {
        method: "POST",
        body: params ? JSON.stringify(params) : undefined,
      },
    );
  }
}
