import { rm } from "node:fs/promises";
import { join } from "node:path";

import type { LifecycleHook } from "../loop/moments.js";
import { emptySession, type Incoming, type Session } from "./capture.js";
import {
  MCP_ARGS,
  MCP_COMMAND,
  oursMcp,
  readJson,
  writeJson,
  type Adapter,
  type Heard,
  type Wiring,
} from "./shared.js";

// Generic MCP configuration adapter (`memcell connect --mcp`).
// Writes the standard `.mcp.json` project-root configuration so any
// MCP-aware client (Claude Desktop, Claude Code, Cursor, Windsurf, Zed,
// or custom MCP hosts) can spawn `memcell mcp` over stdio.

const mcpFile = (dir: string) => join(dir, ".mcp.json");

interface McpFile {
  mcpServers?: Record<string, unknown>;
  [k: string]: unknown;
}

export const mcpAdapter: Adapter = {
  name: "mcp",

  async install(projectDir: string): Promise<string> {
    const at = mcpFile(projectDir);
    const doc = await readJson<McpFile>(at);
    doc.mcpServers ??= {};
    doc.mcpServers.memcell = { type: "stdio", command: MCP_COMMAND, args: MCP_ARGS };
    await writeJson(at, doc);
    return at;
  },

  async remove(projectDir: string): Promise<string | null> {
    const at = mcpFile(projectDir);
    const doc = await readJson<McpFile>(at);
    if (!doc.mcpServers || !oursMcp(doc.mcpServers.memcell)) return null;
    delete doc.mcpServers.memcell;
    if (Object.keys(doc.mcpServers).length === 0) delete doc.mcpServers;
    if (Object.keys(doc).length === 0) {
      await rm(at, { force: true });
    } else {
      await writeJson(at, doc);
    }
    return at;
  },

  async verify(projectDir: string): Promise<Wiring[]> {
    const at = mcpFile(projectDir);
    const doc = await readJson<McpFile>(at).catch(() => ({}) as McpFile);
    const ok = Boolean(doc.mcpServers && oursMcp(doc.mcpServers.memcell));
    return [{ moment: "mcp", event: "mcpServers.memcell", ok }];
  },

  speak(_moment: LifecycleHook, _context: string | null, _heard: Heard): string | null {
    return null;
  },

  async read(_payload: Incoming, from: number): Promise<Session> {
    return emptySession(from);
  },
};
