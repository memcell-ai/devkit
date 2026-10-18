import type { MemCell } from "./client.js";
import type {
  ListThreadsParams,
  PaginatedResult,
  ThreadDetailResponse,
  ThreadItem,
  UpdateThreadParams,
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

function buildThreadQuery(params?: ListThreadsParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.page !== undefined) q.set("page", String(params.page));
  if (params.perPage !== undefined) q.set("per_page", String(params.perPage));
  if (params.status) q.set("status", params.status);
  if (params.entity) q.set("entity", params.entity);
  if (params.q) q.set("q", params.q);
  const str = q.toString();
  return str ? `?${str}` : "";
}

export class ThreadsNamespace {
  constructor(protected readonly client: MemCell) {}

  /**
   * Lists session threads in a workspace with filtering and pagination.
   */
  async list(
    namespace: string,
    params?: ListThreadsParams,
  ): Promise<PaginatedResult<ThreadItem>> {
    const { owner, workspace } = parseNamespace(namespace);
    const query = buildThreadQuery(params);
    const json = await this.client.request<{
      threads?: ThreadItem[];
      pagination: {
        page: number;
        perPage: number;
        total: number;
        hasMore: boolean;
      };
    }>(`/api/v1/${owner}/${workspace}/threads${query}`, {
      method: "GET",
    });

    return {
      items: json.threads || [],
      pagination: json.pagination,
    };
  }

  /**
   * Retrieves a single thread along with its turn timeline and distilled memories.
   */
  async get(
    namespace: string,
    threadId: string,
  ): Promise<ThreadDetailResponse> {
    const { owner, workspace } = parseNamespace(namespace);
    return await this.client.request<ThreadDetailResponse>(
      `/api/v1/${owner}/${workspace}/threads/${encodeURIComponent(threadId)}`,
      { method: "GET" },
    );
  }

  /**
   * Updates a thread's status, title, summary, objective, decisions, or next steps.
   */
  async update(
    namespace: string,
    threadId: string,
    params: UpdateThreadParams,
  ): Promise<ThreadItem> {
    const { owner, workspace } = parseNamespace(namespace);
    const json = await this.client.request<{ thread: ThreadItem }>(
      `/api/v1/${owner}/${workspace}/threads/${encodeURIComponent(threadId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(params),
      },
    );
    return json.thread;
  }

  /**
   * Deletes a thread and its turn checkpoints.
   */
  async delete(
    namespace: string,
    threadId: string,
  ): Promise<{ deleted: boolean }> {
    const { owner, workspace } = parseNamespace(namespace);
    return await this.client.request<{ deleted: boolean }>(
      `/api/v1/${owner}/${workspace}/threads/${encodeURIComponent(threadId)}`,
      { method: "DELETE" },
    );
  }
}
