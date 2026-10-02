import type { MemCell } from "./client.js";
import type {
  ListPromotionsParams,
  PaginatedResult,
  StatementItem,
  StatementPromotionRequest,
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

export class PromotionsNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Lists pending and reviewed statement promotion requests.
   */
  async list(
    namespace: string,
    params?: ListPromotionsParams,
  ): Promise<PaginatedResult<StatementPromotionRequest>> {
    const { owner, project } = parseNamespace(namespace);
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.statementId) q.set("statementId", params.statementId);
    if (params?.limit !== undefined) q.set("limit", String(params.limit));
    if (params?.offset !== undefined) q.set("offset", String(params.offset));
    if (params?.page !== undefined) q.set("page", String(params.page));
    if (params?.perPage !== undefined)
      q.set("per_page", String(params.perPage));
    const query = q.toString() ? `?${q.toString()}` : "";

    const json = await this.client.request<{
      promotionRequests: StatementPromotionRequest[];
      total: number;
    }>(`/api/v1/${owner}/${project}/promotions${query}`, {
      method: "GET",
    });

    const items = json.promotionRequests || [];
    return {
      items,
      pagination: {
        page: params?.page ?? 1,
        perPage: params?.perPage ?? items.length,
        total: json.total ?? items.length,
        hasMore: false,
      },
    };
  }

  /**
   * Approves a statement promotion request.
   */
  async approve(
    namespace: string,
    promotionId: string,
    params?: { reason?: string },
  ): Promise<{ approved: boolean; statement: StatementItem }> {
    const { owner, project } = parseNamespace(namespace);
    return await this.client.request<{
      approved: boolean;
      statement: StatementItem;
    }>(
      `/api/v1/${owner}/${project}/promotions/${encodeURIComponent(promotionId)}/approve`,
      {
        method: "POST",
        body: JSON.stringify(params || {}),
      },
    );
  }

  /**
   * Rejects a statement promotion request.
   */
  async reject(
    namespace: string,
    promotionId: string,
    params?: { reason?: string },
  ): Promise<{ rejected: boolean }> {
    const { owner, project } = parseNamespace(namespace);
    return await this.client.request<{ rejected: boolean }>(
      `/api/v1/${owner}/${project}/promotions/${encodeURIComponent(promotionId)}/reject`,
      {
        method: "POST",
        body: JSON.stringify(params || {}),
      },
    );
  }
}
