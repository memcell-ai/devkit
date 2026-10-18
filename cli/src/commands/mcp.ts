import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  RootsListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { agentKeyForProject, listConnectedProjects } from "../keyring.js";
import { detectActiveRuntimeModel } from "../model-detect.js";
import {
  findWorkspace,
  findWorkspaceFromRoots,
  type Workspace,
  type FoundWorkspace,
} from "../workspace.js";

// `memcell mcp` — the stdio face of the paired instance's /mcp endpoint.
//
// Bridges IDEs and autonomous agent harnesses to MemCell over standard MCP stdio.
// Dynamically resolves workspaces via MCP client roots (roots/list),
// CLI target directory, process.cwd(), or keyring-connected workspaces.
// Maintains upstream HTTP client pooling per connected workspace/instance.

const DEFAULT_TOOLS = [
  {
    name: "recall",
    description:
      "Ask the workspace's memory before acting. Evaluates intent against durable instructions, decisions, facts, preferences, active session threads, and grounded RAG documents. Zero conversation retention: query text is strictly ephemeral and never stored. Pass the recallId to 'report' so task outcomes sharpen what was recalled.",
    inputSchema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "What you are trying to do or know, in plain words",
        },
        query: {
          type: "string",
          description: "Alternative alias for intent",
        },
        limit: {
          type: "number",
          description: "How many matched memories to serve (default 5, max 20)",
        },
        type: {
          type: "string",
          description: "Optional memory type filter: instruction, decision, fact, or preference",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional tags to filter or guide lexical matching",
        },
        scope: {
          type: "string",
          description: "Operational scope filter (e.g. 'workspace', 'user', 'organization')",
        },
        scopes: {
          type: "array",
          items: { type: "string" },
          description: "Array of authorized operational scopes to recall from",
        },
        metadata: {
          type: "object",
          description: 'Optional metadata containment filter (e.g. {"threadId": "123"})',
        },
      },
    },
  },
  {
    name: "remember",
    description:
      "Record knowledge into MemCell. Accepts raw text, conversational excerpts, or structured hints. MemCell distills material into atomic memories, links them into the workspace Knowledge Graph, and checkpoints session threads.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Text content, instruction, decision, or transcript to remember",
        },
        raw: {
          type: "string",
          description: "Alias for content (raw material)",
        },
        learning: {
          type: "string",
          description: "The concrete instruction, decision, fact, or preference to persist",
        },
        type: {
          type: "string",
          description: "Memory type: instruction, decision, fact, or preference",
        },
        title: {
          type: "string",
          description: "Optional concise title",
        },
        context: {
          type: "string",
          description: "Why this was learned: the task, trigger, or surrounding circumstance",
        },
        scope: {
          type: "string",
          description: "Operational boundary scope (defaults to workspace)",
        },
      },
    },
  },
  {
    name: "report",
    description:
      "Close the recall loop. Reports whether a recalled memory worked, failed, or was avoided in practice. Strengthens what worked and surfaces what failed for correction.",
    inputSchema: {
      type: "object",
      properties: {
        recall_id: {
          type: "string",
          description: "The recallId returned by a prior recall call",
        },
        recallId: {
          type: "string",
          description: "Alias for recall_id",
        },
        memory_id: {
          type: "string",
          description: "Direct memory ID to attribute this outcome to",
        },
        action_taken: {
          type: "string",
          description: "Description of the action taken that succeeded or failed",
        },
        outcome: {
          type: "string",
          enum: ["worked", "failed", "avoided"],
          description: "What happened when this memory was applied",
        },
        reason: {
          type: "string",
          description: "Optional explanation of the outcome or what happened",
        },
      },
      required: ["outcome"],
    },
  },
  {
    name: "feedback",
    description:
      "Evaluate a specific memory after execution: report whether its advice worked or failed in practice. Dynamically updates confidence and appends evidence.",
    inputSchema: {
      type: "object",
      properties: {
        memory_id: {
          type: "string",
          description: "The memory ID being evaluated",
        },
        outcome: {
          type: "string",
          enum: ["worked", "failed"],
          description: "Outcome verdict: worked or failed",
        },
        reason: {
          type: "string",
          description: "Notes or reason describing what happened in practice",
        },
        recall_id: {
          type: "string",
          description: "Optional recall ID for task-level attribution",
        },
      },
      required: ["memory_id", "outcome"],
    },
  },
];

export async function mcp(targetDir?: string, agentName?: string): Promise<number> {
  const server = new Server(
    { name: "memcell", version: "0.3.0" },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const upstreamPool = new Map<string, Client>();

  async function resolveCurrentProject(workspaceHint?: string): Promise<FoundWorkspace | null> {
    // 1. Explicit workspace hint passed to tool call
    if (workspaceHint) {
      const found = await findWorkspace(workspaceHint).catch(() => null);
      if (found) return found;
    }

    // 2. Explicit targetDir passed via CLI argument
    if (targetDir) {
      const found = await findWorkspace(targetDir).catch(() => null);
      if (found) return found;
    }

    // 3. MCP roots protocol list from the IDE / client
    try {
      const rootsResult = await server.listRoots();
      if (rootsResult?.roots?.length) {
        const rootPaths = rootsResult.roots.map((r) =>
          r.uri.startsWith("file://") ? fileURLToPath(r.uri) : r.uri,
        );
        const found = await findWorkspaceFromRoots(rootPaths);
        if (found) return found;
      }
    } catch {
      // Client does not implement roots or hasn't connected roots capability
    }

    // 4. Check process.cwd()
    const foundCwd = await findWorkspace(process.cwd()).catch(() => null);
    if (foundCwd) return foundCwd;

    // 5. Check workspace environment variables
    const envDir =
      process.env.MEMCELL_PROJECT_DIR ||
      process.env.WORKSPACE_DIR ||
      process.env.PROJECT_DIR ||
      process.env.VSCODE_WORKSPACE;
    if (envDir) {
      const foundEnv = await findWorkspace(envDir).catch(() => null);
      if (foundEnv) return foundEnv;
    }

    // 6. Single-connected-project fallback for global setups
    const connected = await listConnectedProjects().catch(() => []);
    if (connected.length === 1 && connected[0]) {
      const c = connected[0];
      if (c.projectPath) {
        const found = await findWorkspace(c.projectPath).catch(() => null);
        if (found) return found;
      }
      const projPath = c.projectPath ?? process.cwd();
      const wsObj: Workspace = {
        instance: c.instance,
        owner: c.ownerSlug,
        project: c.projectSlug ?? "default",
        workspace: c.projectSlug ?? "default",
        workspaceId: c.projectId,
        projectId: c.projectId,
        space: c.projectSlug ?? "default",
      };
      return {
        workspace: wsObj,
        project: wsObj,
        at: join(projPath, ".memcell", "config.toml"),
        root: projPath,
      };
    }

    return null;
  }

  async function getUpstreamClient(project: Workspace, rootDir: string): Promise<Client | null> {
    const projectIdentifier =
      project.projectId ??
      (project.owner ? `${project.owner}/${project.project}` : project.project);
    const held = await agentKeyForProject(project.instance, rootDir, agentName, projectIdentifier);
    if (!held) return null;

    const poolKey = `${project.instance}|${held.keyId}|${held.agentId ?? ""}|${agentName ?? ""}`;
    const cached = upstreamPool.get(poolKey);
    if (cached) return cached;

    const runtimeModel = detectActiveRuntimeModel(agentName);
    const upstream = new Client({ name: "memcell-cli", version: "0.3.0" });
    await upstream.connect(
      new StreamableHTTPClientTransport(new URL(`${project.instance}/mcp`), {
        requestInit: {
          headers: {
            authorization: `Bearer ${held.key}`,
            ...(held.agentId ? { "x-memcell-agent": held.agentId } : {}),
            ...(runtimeModel ? { "x-memcell-model": runtimeModel } : {}),
          },
        },
      }),
    );
    upstreamPool.set(poolKey, upstream);
    return upstream;
  }

  // Handle IDE root changes dynamically
  try {
    server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
      // Roots changed in client (e.g. workspace folders added or removed)
    });
  } catch {
    // Ignore notification handler setup if not supported
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const resolved = await resolveCurrentProject();
    if (resolved) {
      try {
        const upstream = await getUpstreamClient(resolved.project, resolved.root);
        if (upstream) {
          return await upstream.listTools();
        }
      } catch {
        // Fall back to native default tools if upstream check fails
      }
    }
    return { tools: DEFAULT_TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const workspaceHint =
      typeof args.workspace === "string"
        ? args.workspace
        : typeof args.project === "string"
          ? args.project
          : undefined;

    const resolved = await resolveCurrentProject(workspaceHint);
    if (!resolved) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `No connected memcell project could be found for workspace (${process.cwd()}). Run 'memcell connect [owner]/<project>' in your workspace directory to pair memory.`,
          },
        ],
      };
    }

    const upstream = await getUpstreamClient(resolved.project, resolved.root);
    if (!upstream) {
      const projName =
        resolved.project.owner && resolved.project.project
          ? `${resolved.project.owner}/${resolved.project.project}`
          : resolved.project.project || resolved.project.space;
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `No agent key found on this machine for project '${projName}'. Run 'memcell connect' in this project directory to pair this machine.`,
          },
        ],
      };
    }

    return await upstream.callTool(request.params);
  });

  await server.connect(new StdioServerTransport());
  await new Promise<void>((resolve) => {
    server.onclose = () => resolve();
  });

  for (const client of upstreamPool.values()) {
    await client.close().catch(() => undefined);
  }
  return 0;
}
