import type { MemCell } from "./client.js";
import type { ScopeItem } from "./types.js";

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

export class ScopesNamespace {
  constructor(private readonly client: MemCell) {}

  /**
   * Lists active scopes and memory counts.
   * If namespace is provided, scopes for that workspace are listed; otherwise caller's active workspace scopes are returned.
   */
  async list(namespace?: string): Promise<ScopeItem[]> {
    const path = namespace
      ? (() => {
          const { owner, workspace } = parseNamespace(namespace);
          return `/api/v1/${owner}/${workspace}/scopes`;
        })()
      : "/api/v1/scopes";

    const json = await this.client.request<{ scopes: ScopeItem[] }>(path, {
      method: "GET",
    });
    return json.scopes || [];
  }
}
