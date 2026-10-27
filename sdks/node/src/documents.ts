import type { MemCell } from "./client.js";
import type {
  DocumentChunkItem,
  DocumentChunkSearchResult,
  DocumentDetailResponse,
  DocumentItem,
  IngestDocumentParams,
  IngestDocumentResponse,
  ListDocumentsParams,
  MemoryItem,
  PaginatedResult,
  SearchDocumentsOptions,
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

function normalizeDocumentItem(raw: Record<string, unknown>): DocumentItem {
  const sourceUri =
    (typeof raw.sourceUri === "string" ? raw.sourceUri : null) ??
    (typeof raw.sourcePath === "string" ? raw.sourcePath : null) ??
    (typeof raw.path === "string" ? raw.path : null);
  const contentType =
    (typeof raw.contentType === "string" && raw.contentType) ||
    (typeof raw.sourceType === "string" && raw.sourceType) ||
    "markdown";
  const contentStr = typeof raw.content === "string" ? raw.content : "";
  const sizeBytes =
    typeof raw.sizeBytes === "number" ? raw.sizeBytes : contentStr.length;

  return {
    id: String(raw.id ?? ""),
    workspaceId: String(raw.workspaceId ?? ""),
    title: String(raw.title ?? ""),
    path: sourceUri,
    sourcePath: sourceUri,
    sourceUri,
    sourceType:
      typeof raw.sourceType === "string" ? raw.sourceType : contentType,
    contentType,
    contentHash: String(raw.contentHash ?? ""),
    summary: typeof raw.summary === "string" ? raw.summary : null,
    status: typeof raw.status === "string" ? raw.status : undefined,
    chunkCount: typeof raw.chunkCount === "number" ? raw.chunkCount : 0,
    sizeBytes,
    metadata:
      typeof raw.metadata === "object" && raw.metadata !== null
        ? (raw.metadata as Record<string, unknown>)
        : undefined,
    createdAt: (raw.createdAt as string | Date) ?? "",
    updatedAt: (raw.updatedAt as string | Date) ?? "",
  };
}

function normalizeChunkSearchResult(
  raw: Record<string, unknown>,
): DocumentChunkSearchResult {
  const sourceUri =
    (typeof raw.sourceUri === "string" ? raw.sourceUri : null) ??
    (typeof raw.sourcePath === "string" ? raw.sourcePath : null) ??
    (typeof raw.path === "string" ? raw.path : null);

  return {
    id: String(raw.id ?? ""),
    documentId: String(raw.documentId ?? ""),
    documentTitle: String(raw.documentTitle ?? ""),
    path: sourceUri,
    sourcePath: sourceUri,
    sourceUri,
    chunkIndex: typeof raw.chunkIndex === "number" ? raw.chunkIndex : 0,
    heading: typeof raw.heading === "string" ? raw.heading : null,
    content: String(raw.content ?? ""),
    score: typeof raw.score === "number" ? raw.score : 0,
  };
}

function encodeBinaryToBase64(
  input: Uint8Array | ArrayBuffer | string | undefined,
): string | undefined {
  if (input === undefined) return undefined;
  if (typeof input === "string") return input;
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  return Buffer.from(bytes).toString("base64");
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
      documents?: Record<string, unknown>[];
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
      items: (json.documents || []).map(normalizeDocumentItem),
      pagination: json.pagination,
    };
  }

  /**
   * Retrieves a single ingested document along with its chunks and distilled memories.
   */
  async get(
    namespace: string,
    documentId: string,
  ): Promise<DocumentDetailResponse> {
    const { owner, workspace } = parseNamespace(namespace);
    const json = await this.client.request<{
      document: Record<string, unknown>;
      chunks?: DocumentChunkItem[];
      memories?: MemoryItem[];
    }>(
      `/api/v1/${owner}/${workspace}/documents/${encodeURIComponent(documentId)}`,
      { method: "GET" },
    );

    return {
      document: normalizeDocumentItem(json.document || {}),
      chunks: json.chunks || [],
      memories: json.memories || [],
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
    const resolvedSourceUri =
      params.sourceUri ??
      params.sourcePath ??
      params.path ??
      params.filename ??
      undefined;
    const resolvedDistill = params.distill ?? params.distillMemories;
    const resolvedFileBase64 =
      params.fileBase64 ?? encodeBinaryToBase64(params.file);
    const hasTextContent =
      typeof params.content === "string" && params.content.length > 0;

    if (!hasTextContent && !resolvedFileBase64) {
      throw new Error(
        "Provide either 'content' or binary 'file'/'fileBase64' to ingest a document.",
      );
    }

    const resolvedTitle =
      params.title ||
      params.filename ||
      resolvedSourceUri ||
      "Untitled Document";

    const payload: Record<string, unknown> = {
      title: resolvedTitle,
    };
    if (hasTextContent) {
      payload.content = params.content;
    }
    if (resolvedFileBase64) {
      payload.fileBase64 = resolvedFileBase64;
    }
    if (params.filename !== undefined) {
      payload.filename = params.filename;
    }
    if (params.mimeType !== undefined) {
      payload.mimeType = params.mimeType;
    }
    if (resolvedSourceUri !== undefined) {
      payload.sourceUri = resolvedSourceUri;
      payload.sourcePath = resolvedSourceUri;
    }
    if (params.contentType !== undefined) {
      payload.contentType = params.contentType;
    }
    if (resolvedDistill !== undefined) {
      payload.distill = resolvedDistill;
      payload.distillMemories = resolvedDistill;
    }
    if (params.metadata !== undefined) {
      payload.metadata = params.metadata;
    }

    const raw = await this.client.request<{
      document?: Record<string, unknown>;
      chunkCount?: number;
      chunksCreated?: number;
      deduplicated?: boolean;
      unchanged?: boolean;
      distilled?: {
        created?: MemoryItem[];
        reinforced?: Array<{ id: string; title: string; confidence?: number }>;
        evolved?: MemoryItem[];
      };
      distilledMemoriesCount?: number;
      memoriesCreated?: number;
    }>(`/api/v1/${owner}/${workspace}/documents`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const doc = normalizeDocumentItem(raw.document || {});
    const chunkCount =
      raw.chunkCount ?? raw.chunksCreated ?? doc.chunkCount ?? 0;
    const deduplicated = Boolean(raw.deduplicated ?? raw.unchanged ?? false);
    const createdList = raw.distilled?.created || [];
    const distilledCount =
      raw.distilledMemoriesCount ?? raw.memoriesCreated ?? createdList.length;

    return {
      document: doc,
      chunkCount,
      chunksCreated: chunkCount,
      deduplicated,
      unchanged: deduplicated,
      distilled: raw.distilled
        ? {
            created: createdList,
            reinforced: raw.distilled.reinforced,
            evolved: raw.distilled.evolved,
          }
        : undefined,
      distilledMemoriesCount: distilledCount,
      memoriesCreated: distilledCount,
    };
  }

  /**
   * Searches grounded document chunks in a workspace.
   */
  async search(
    namespace: string,
    queryOrOptions: string | SearchDocumentsOptions,
    limit = 5,
  ): Promise<{ chunks: DocumentChunkSearchResult[] }> {
    const { owner, workspace } = parseNamespace(namespace);
    const query =
      typeof queryOrOptions === "string"
        ? queryOrOptions
        : queryOrOptions.query;
    const resolvedLimit =
      typeof queryOrOptions === "string"
        ? limit
        : (queryOrOptions.limit ?? limit);

    const q = new URLSearchParams({
      q: query,
      chunks: "true",
      limit: String(resolvedLimit),
    });
    const res = await this.client.request<{
      chunks?: Record<string, unknown>[];
    }>(`/api/v1/${owner}/${workspace}/documents?${q.toString()}`, {
      method: "GET",
    });

    return {
      chunks: (res.chunks || []).map(normalizeChunkSearchResult),
    };
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
