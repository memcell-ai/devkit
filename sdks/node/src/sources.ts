import type { MemCell } from "./client.js";
import type {
  CreateSourceParams,
  CreateSourceResponse,
  SourceItem,
  SourceStatus,
  SourceType,
  SyncSourceOptions,
  SyncSourceResponse,
  WebhookIngestDocumentInput,
  WebhookIngestParams,
  WebhookIngestResponse,
} from "./types.js";

function parseNamespace(namespace: string): {
  owner: string;
  workspace: string;
} {
  const parts = namespace.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid namespace "${namespace}". Expected format "owner/workspace" (e.g. "acme/operations").`,
    );
  }
  return {
    owner: encodeURIComponent(parts[0]),
    workspace: encodeURIComponent(parts[1]),
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

function normalizeSourceItem(raw: Record<string, unknown>): SourceItem {
  const rawType = typeof raw.type === "string" ? raw.type : "github";
  const resolvedType: SourceType =
    rawType === "url" || rawType === "webhook" || rawType === "github"
      ? rawType
      : "github";

  const rawStatus = typeof raw.status === "string" ? raw.status : "idle";
  const resolvedStatus: SourceStatus =
    rawStatus === "idle" ||
    rawStatus === "syncing" ||
    rawStatus === "ready" ||
    rawStatus === "error"
      ? rawStatus
      : "idle";

  return {
    id: String(raw.id ?? ""),
    workspaceId: String(raw.workspaceId ?? ""),
    type: resolvedType,
    name: String(raw.name ?? ""),
    repoFullName:
      typeof raw.repoFullName === "string" ? raw.repoFullName : null,
    defaultBranch:
      typeof raw.defaultBranch === "string" ? raw.defaultBranch : null,
    config:
      typeof raw.config === "object" && raw.config !== null
        ? (raw.config as Record<string, unknown>)
        : undefined,
    status: resolvedStatus,
    lastSyncedSha:
      typeof raw.lastSyncedSha === "string" ? raw.lastSyncedSha : null,
    lastSyncedAt:
      (raw.lastSyncedAt as string | Date | null | undefined) ?? null,
    lastError: typeof raw.lastError === "string" ? raw.lastError : null,
    documentCount:
      typeof raw.documentCount === "number" ? raw.documentCount : 0,
    memoryCount: typeof raw.memoryCount === "number" ? raw.memoryCount : 0,
    createdAt: raw.createdAt as string | Date | undefined,
    updatedAt: raw.updatedAt as string | Date | undefined,
  };
}

function serializeWebhookDocumentInput(
  doc: WebhookIngestDocumentInput,
): Record<string, unknown> {
  const resolvedBase64 = doc.fileBase64 ?? encodeBinaryToBase64(doc.file);
  const out: Record<string, unknown> = {};
  if (doc.title !== undefined) out.title = doc.title;
  if (doc.content !== undefined) out.content = doc.content;
  if (resolvedBase64 !== undefined) out.fileBase64 = resolvedBase64;
  if (doc.filename !== undefined) out.filename = doc.filename;
  if (doc.mimeType !== undefined) out.mimeType = doc.mimeType;
  if (doc.contentType !== undefined) out.contentType = doc.contentType;
  if (doc.sourceUri !== undefined) out.sourceUri = doc.sourceUri;
  if (doc.distill !== undefined) out.distill = doc.distill;
  if (doc.metadata !== undefined) out.metadata = doc.metadata;
  return out;
}

export class SourcesNamespace {
  constructor(protected readonly client: MemCell) {}

  /**
   * Lists connected knowledge sources (URL/sitemap, inbound webhook, GitHub) in a workspace.
   */
  async list(namespace: string): Promise<{ sources: SourceItem[] }> {
    const { owner, workspace } = parseNamespace(namespace);
    const json = await this.client.request<{
      sources?: Record<string, unknown>[];
    }>(`/api/v1/${owner}/${workspace}/sources`, {
      method: "GET",
    });

    return {
      sources: (json.sources || []).map(normalizeSourceItem),
    };
  }

  /**
   * Retrieves a single workspace knowledge source by ID.
   */
  async get(namespace: string, sourceId: string): Promise<SourceItem> {
    const { owner, workspace } = parseNamespace(namespace);
    const json = await this.client.request<{
      source: Record<string, unknown>;
    }>(
      `/api/v1/${owner}/${workspace}/sources/${encodeURIComponent(sourceId)}`,
      { method: "GET" },
    );

    return normalizeSourceItem(json.source || {});
  }

  /**
   * Connects a new URL/sitemap, inbound webhook, or GitHub source to a workspace.
   */
  async create(
    namespace: string,
    params: CreateSourceParams,
  ): Promise<CreateSourceResponse> {
    const { owner, workspace } = parseNamespace(namespace);
    const json = await this.client.request<{
      source: Record<string, unknown>;
      webhookSecret?: string | null;
      ingestPath?: string | null;
    }>(`/api/v1/${owner}/${workspace}/sources`, {
      method: "POST",
      body: JSON.stringify(params),
    });

    return {
      source: normalizeSourceItem(json.source || {}),
      webhookSecret: json.webhookSecret ?? null,
      ingestPath: json.ingestPath ?? null,
    };
  }

  /**
   * Triggers an immediate sync on a URL/sitemap or GitHub source.
   */
  async sync(
    namespace: string,
    sourceId: string,
    options?: SyncSourceOptions,
  ): Promise<SyncSourceResponse> {
    const { owner, workspace } = parseNamespace(namespace);
    const json = await this.client.request<{
      source?: Record<string, unknown>;
      status?: string;
      syncedFiles?: number;
      skippedFiles?: number;
      totalChunks?: number;
      totalMemories?: number;
      headSha?: string | null;
      message?: string;
    }>(
      `/api/v1/${owner}/${workspace}/sources/${encodeURIComponent(sourceId)}/sync`,
      {
        method: "POST",
        body: JSON.stringify(options ?? {}),
      },
    );

    return {
      source: json.source ? normalizeSourceItem(json.source) : undefined,
      status: json.status ?? "ready",
      syncedFiles: json.syncedFiles ?? 0,
      skippedFiles: json.skippedFiles ?? 0,
      totalChunks: json.totalChunks ?? 0,
      totalMemories: json.totalMemories ?? 0,
      headSha: json.headSha ?? null,
      message: json.message,
    };
  }

  /**
   * Pushes one or more documents directly into an inbound webhook source (`type: "webhook"`).
   */
  async ingest(
    namespace: string,
    sourceId: string,
    params: WebhookIngestParams,
  ): Promise<WebhookIngestResponse> {
    const { owner, workspace } = parseNamespace(namespace);
    const payload: Record<string, unknown> =
      serializeWebhookDocumentInput(params);
    if (params.documents !== undefined) {
      payload.documents = params.documents.map(serializeWebhookDocumentInput);
    }
    if (params.distillMemories !== undefined) {
      payload.distillMemories = params.distillMemories;
    }

    const headers: Record<string, string> = {};
    if (params.secret) {
      headers["x-memcell-webhook-secret"] = params.secret;
    }

    const json = await this.client.request<{
      status?: string;
      ingestedDocuments?: number;
      skippedDocuments?: number;
      totalChunks?: number;
      totalMemories?: number;
      documents?: Array<{
        id: string;
        title: string;
        chunkCount: number;
        deduplicated: boolean;
      }>;
    }>(
      `/api/v1/${owner}/${workspace}/sources/${encodeURIComponent(sourceId)}/ingest`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      },
    );

    return {
      status: json.status ?? "ready",
      ingestedDocuments: json.ingestedDocuments ?? 0,
      skippedDocuments: json.skippedDocuments ?? 0,
      totalChunks: json.totalChunks ?? 0,
      totalMemories: json.totalMemories ?? 0,
      documents: json.documents ?? [],
    };
  }

  /**
   * Disconnects and removes a knowledge source from the workspace.
   */
  async delete(
    namespace: string,
    sourceId: string,
  ): Promise<{ deleted: boolean }> {
    const { owner, workspace } = parseNamespace(namespace);
    return await this.client.request<{ deleted: boolean }>(
      `/api/v1/${owner}/${workspace}/sources/${encodeURIComponent(sourceId)}`,
      { method: "DELETE" },
    );
  }
}
