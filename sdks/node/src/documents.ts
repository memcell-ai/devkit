import type { MemCell } from "./client.js";
import type {
  DocumentChunkSearchResult,
  DocumentItem,
  IngestDocumentParams,
  IngestDocumentResponse,
  ListDocumentsParams,
  PaginatedResult,
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

function buildDocumentQuery(params?: ListDocumentsParams): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.page !== undefined) q.set("page", String(params.page));
  if (params.perPage !== undefined) q.set("per_page", String(params.perPage));
  if (params.q) q.set("q", params.q);
  const str = q.toString();
  return str ? `?${str}` : "";
}

export class DocumentsNamespace {
  constructor(protected readonly client: MemCell) {}

  /**
   * Lists ingested RAG documents in a workspace.
   */
  async list(
    namespace: string,
    params?: ListDocumentsParams,
  ): Promise<PaginatedResult<DocumentItem>> {
    const { owner, workspace } = parseNamespace(namespace);
    const query = buildDocumentQuery(params);
    const json = await this.client.request<{
      documents?: DocumentItem[];
      pagination: {
        page: number;
        perPage: number;
        total: number;
        hasMore: boolean;
      };
    }>(`/api/v1/${owner}/${workspace}/documents${query}`, {
      method: "GET",
    });

    return {
      items: json.documents || [],
      pagination: json.pagination,
    };
  }

  /**
   * Ingests a document into the workspace's grounded RAG store (and optionally distills atomic memories).
   */
  async ingest(
    namespace: string,
    params: IngestDocumentParams,
  ): Promise<IngestDocumentResponse> {
    const { owner, workspace } = parseNamespace(namespace);
    return await this.client.request<IngestDocumentResponse>(
      `/api/v1/${owner}/${workspace}/documents`,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }

  /**
   * Searches grounded document chunks in a workspace.
   */
  async search(
    namespace: string,
    query: string,
    limit = 5,
  ): Promise<{ chunks: DocumentChunkSearchResult[] }> {
    const { owner, workspace } = parseNamespace(namespace);
    const q = new URLSearchParams({
      search: query,
      limit: String(limit),
    });
    return await this.client.request<{ chunks: DocumentChunkSearchResult[] }>(
      `/api/v1/${owner}/${workspace}/documents?${q.toString()}`,
      { method: "GET" },
    );
  }

  /**
   * Deletes an ingested document and its chunks.
   */
  async delete(
    namespace: string,
    documentId: string,
  ): Promise<{ deleted: boolean }> {
    const { owner, workspace } = parseNamespace(namespace);
    return await this.client.request<{ deleted: boolean }>(
      `/api/v1/${owner}/${workspace}/documents/${encodeURIComponent(documentId)}`,
      { method: "DELETE" },
    );
  }
}
