import type { MemCell } from "./client.js";
import type {
  CreateWorkspaceWebhookParams,
  UpdateWorkspaceWebhookParams,
  WebhookPingResult,
  WorkspaceWebhookItem,
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

export class WebhooksNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Lists webhooks configured for a workspace.
   */
  async list(namespace: string): Promise<WorkspaceWebhookItem[]> {
    const { owner, workspace } = parseNamespace(namespace);
    const json = await this.client.request<{
      webhooks: WorkspaceWebhookItem[];
    }>(`/api/v1/${owner}/${workspace}/webhooks`, { method: "GET" });
    return json.webhooks || [];
  }

  /**
   * Creates a new webhook in the workspace.
   */
  async create(
    namespace: string,
    params: CreateWorkspaceWebhookParams,
  ): Promise<WorkspaceWebhookItem> {
    const { owner, workspace } = parseNamespace(namespace);
    const json = await this.client.request<{ webhook: WorkspaceWebhookItem }>(
      `/api/v1/${owner}/${workspace}/webhooks`,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
    return json.webhook;
  }

  /**
   * Fetches details of a specific webhook.
   */
  async get(
    namespace: string,
    webhookId: string,
  ): Promise<WorkspaceWebhookItem> {
    const webhooks = await this.list(namespace);
    const found = webhooks.find((w) => w.id === webhookId);
    if (!found) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }
    return found;
  }

  /**
   * Updates an existing webhook configuration.
   */
  async update(
    namespace: string,
    webhookId: string,
    params: UpdateWorkspaceWebhookParams,
  ): Promise<WorkspaceWebhookItem> {
    const { owner, workspace } = parseNamespace(namespace);
    const json = await this.client.request<{ webhook: WorkspaceWebhookItem }>(
      `/api/v1/${owner}/${workspace}/webhooks/${encodeURIComponent(webhookId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(params),
      },
    );
    return json.webhook;
  }

  /**
   * Deletes a webhook from the workspace.
   */
  async delete(namespace: string, webhookId: string): Promise<void> {
    const { owner, workspace } = parseNamespace(namespace);
    await this.client.request<{ deleted: boolean }>(
      `/api/v1/${owner}/${workspace}/webhooks/${encodeURIComponent(webhookId)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Dispatches a ping test event to the webhook destination.
   */
  async ping(namespace: string, webhookId: string): Promise<WebhookPingResult> {
    const { owner, workspace } = parseNamespace(namespace);
    return await this.client.request<WebhookPingResult>(
      `/api/v1/${owner}/${workspace}/webhooks/${encodeURIComponent(webhookId)}/ping`,
      { method: "POST" },
    );
  }
}

export class ScopedWorkspaceWebhooks {
  constructor(
    private readonly webhooks: WebhooksNamespace,
    private readonly namespace: string,
  ) {}

  async list(): Promise<WorkspaceWebhookItem[]> {
    return this.webhooks.list(this.namespace);
  }

  async create(
    params: CreateWorkspaceWebhookParams,
  ): Promise<WorkspaceWebhookItem> {
    return this.webhooks.create(this.namespace, params);
  }

  async get(webhookId: string): Promise<WorkspaceWebhookItem> {
    return this.webhooks.get(this.namespace, webhookId);
  }

  async update(
    webhookId: string,
    params: UpdateWorkspaceWebhookParams,
  ): Promise<WorkspaceWebhookItem> {
    return this.webhooks.update(this.namespace, webhookId, params);
  }

  async delete(webhookId: string): Promise<void> {
    return this.webhooks.delete(this.namespace, webhookId);
  }

  async ping(webhookId: string): Promise<WebhookPingResult> {
    return this.webhooks.ping(this.namespace, webhookId);
  }
}
