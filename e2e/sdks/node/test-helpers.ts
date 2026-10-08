import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { MemcellClient } from "../../../sdks/node/src/index.js";

export interface SdkTestEnvironment {
  client: MemcellClient;
  instanceUrl: string;
  authToken: string;
  ownerSlug: string;
  wsSlug: string;
  namespace: string;
  cleanup: () => Promise<void>;
}

export function resolveInstanceUrl(): string {
  return (
    process.env.MEMCELL_URL ||
    process.env.MEMCELL_INSTANCE_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export function resolveAuthToken(instanceUrl: string): string | null {
  if (process.env.MEMCELL_TOKEN?.trim())
    return process.env.MEMCELL_TOKEN.trim();
  if (process.env.MEMCELL_API_KEY?.trim())
    return process.env.MEMCELL_API_KEY.trim();
  if (process.env.MEMCELL_SESSION_TOKEN?.trim()) {
    return process.env.MEMCELL_SESSION_TOKEN.trim();
  }

  // Check stored user credentials in ~/.memcell/credentials.json
  try {
    const credPath = join(homedir(), ".memcell", "credentials.json");
    if (existsSync(credPath)) {
      const data = JSON.parse(readFileSync(credPath, "utf8"));
      const match = data.credentials?.[instanceUrl];
      if (match?.token) return match.token;
    }
  } catch {
    // Ignore read errors
  }

  // Fallback to local Postgres session lookup for dev servers
  try {
    const psqlOut = execFileSync(
      "psql",
      [
        process.env.DATABASE_URL ||
          "postgresql://memcell:memcell@localhost:5442/memcell",
        "-t",
        "-A",
        "-c",
        "SELECT token FROM session WHERE expires_at > NOW() ORDER BY expires_at DESC LIMIT 1;",
      ],
      { encoding: "utf8" },
    ).trim();
    if (psqlOut) return psqlOut;
  } catch {
    // Ignore db query errors
  }

  return null;
}

export async function checkBackendHealth(
  instanceUrl: string,
): Promise<boolean> {
  return fetch(`${instanceUrl}/api/healthz`)
    .then((r) => r.ok)
    .catch(() => false);
}

export async function setupNodeSdkEnvironment(
  prefix: string,
): Promise<SdkTestEnvironment | null> {
  const instanceUrl = resolveInstanceUrl();
  const isHealthy = await checkBackendHealth(instanceUrl);
  if (!isHealthy) return null;

  const authToken = resolveAuthToken(instanceUrl);
  if (!authToken) return null;

  const client = new MemcellClient({
    token: authToken,
    baseUrl: instanceUrl,
  });

  // Resolve current account profile to determine owner slug
  const profile = await client.account.get();
  const ownerSlug =
    profile.handle ||
    profile.email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "") ||
    "user";

  const wsSlug = `e2e-node-${prefix}-${Math.random().toString(36).slice(2, 8)}`;

  // Provision disposable workspace
  const ws = await client.workspaces.create({
    name: `E2E Node Flow ${wsSlug}`,
    slug: wsSlug,
    description: "Compounded Node SDK E2E Lifecycle Workspace",
  });

  const resolvedOwner = (ws as any).ownerSlug || ownerSlug;
  const namespace = `${resolvedOwner}/${ws.slug || wsSlug}`;

  const cleanup = async () => {
    try {
      await client.workspaces.delete(namespace);
    } catch {
      // Best-effort cleanup
    }
  };

  return {
    client,
    instanceUrl,
    authToken,
    ownerSlug: resolvedOwner,
    wsSlug: ws.slug || wsSlug,
    namespace,
    cleanup,
  };
}
