import type { Surface } from "./surface.js";
import { join, resolve } from "node:path";

import { hookCommand, hookMatches, MOMENTS, type Moment } from "../loop/moments.js";
import {
  emptySession,
  finalizeSession,
  parseStandardTranscriptEntry,
  readJsonlSlice,
  type Incoming,
  type Session,
  type ThreadAction,
} from "./capture.js";
import {
  MCP_ARGS,
  MCP_COMMAND,
  oursMcp,
  readJson,
  rmIfEmptied,
  writeJson,
  type Adapter,
  type Wiring,
  missingMoments,
  staleText,
} from "./shared.js";

// Hermes (Nous Research).
// Hooks live in <project>/.hermes/hooks.json, with additionalContext for
// injection, exit-code 2 / decision denial for refusal, and MCP configured
// in <project>/.hermes/mcp.json.

const EVENT: Record<Moment, string> = {
  "session-start": "SessionStart",
  "prompt-submit": "UserPromptSubmit",
  "before-act": "PreToolUse",
  "turn-end": "Stop",
  "session-end": "SessionEnd",
};

interface HookEntry {
  type?: string;
  command: string;
  timeout?: number;
}

interface HooksFile {
  version?: number;
  hooks?: Record<string, HookEntry[]>;
  [k: string]: unknown;
}

const file = (dir: string) => join(dir, ".hermes", "hooks.json");
const mcpFile = (dir: string) => join(dir, ".hermes", "mcp.json");

interface McpFile {
  mcpServers?: Record<string, unknown>;
  [k: string]: unknown;
}

async function installMcp(dir: string): Promise<void> {
  const at = mcpFile(dir);
  const doc = await readJson<McpFile>(at);
  doc.mcpServers ??= {};
  doc.mcpServers.memcell = { command: MCP_COMMAND, args: MCP_ARGS };
  await writeJson(at, doc);
}

async function removeMcp(dir: string): Promise<boolean> {
  const at = mcpFile(dir);
  const doc = await readJson<McpFile>(at);
  if (!doc.mcpServers || !oursMcp(doc.mcpServers.memcell)) return false;
  delete doc.mcpServers.memcell;
  await rmIfEmptied(at, doc, "mcpServers");
  return true;
}

const WRITE_TOOLS = new Set([
  "write_to_file",
  "replace_in_file",
  "apply_patch",
  "Write",
  "Edit",
  "write",
  "edit",
  "write_file",
  "edit_file",
]);

export const hermes: Adapter = {
  name: "hermes",
  get surface() {
    return SURFACE;
  },

  async stale(dir: string): Promise<boolean> {
    const files = [file(resolve(dir))];
    return (await staleText(files)) || missingMoments(files, Object.values(EVENT));
  },

  async install(projectDir: string): Promise<string> {
    const at = file(resolve(projectDir));
    const doc = await readJson<HooksFile>(at);
    doc.version ??= 1;
    doc.hooks ??= {};

    for (const moment of MOMENTS) {
      const entries = (doc.hooks[EVENT[moment]] ??= []);
      const command = hookCommand(moment, "hermes");
      let held = false;
      const kept: { type?: string; command: string; timeout?: number }[] = [];
      for (const entry of entries) {
        if (hookMatches(entry.command, moment, "hermes")) {
          if (!held) {
            entry.command = command;
            kept.push(entry);
            held = true;
          }
        } else {
          kept.push(entry);
        }
      }
      if (!held) {
        kept.push({ type: "command", command, timeout: 30 });
      }
      doc.hooks[EVENT[moment]] = kept;
    }

    await writeJson(at, doc);
    await removeMcp(resolve(projectDir)).catch(() => undefined);
    return at;
  },

  async remove(projectDir: string): Promise<string | null> {
    const at = file(resolve(projectDir));
    const doc = await readJson<HooksFile>(at);
    let changed = false;

    for (const [event, entries] of Object.entries(doc.hooks ?? {})) {
      const filtered = entries.filter((e) => !e.command.includes("memcell"));
      if (filtered.length !== entries.length) {
        changed = true;
        if (doc.hooks) doc.hooks[event] = filtered;
      }
      if (doc.hooks?.[event]?.length === 0) delete doc.hooks[event];
    }

    await removeMcp(resolve(projectDir)).catch(() => undefined);

    if (!changed) return null;
    await rmIfEmptied(at, doc, "hooks");
    return at;
  },

  async verify(projectDir: string): Promise<Wiring[]> {
    const doc = await readJson<HooksFile>(file(resolve(projectDir)));
    return MOMENTS.map((moment) => ({
      moment,
      event: EVENT[moment],
      ok: Boolean(
        doc.hooks?.[EVENT[moment]]?.some((e) => hookMatches(e.command, moment, "hermes")),
      ),
    }));
  },

  speak(moment: Moment, context: string | null): string | null {
    if (!context || moment === "session-end") return null;
    return JSON.stringify({
      hookSpecificOutput: { additionalContext: context },
    });
  },

  refuse(reason: string): string | null {
    return JSON.stringify({
      decision: "deny",
      reason,
    });
  },

  async read(payload: Incoming, from: number): Promise<Session> {
    const path = payload.transcript_path ?? payload.transcriptPath;
    if (!path) return emptySession(from);
    const said: string[] = [];
    const touched: string[] = [];
    const actions: ThreadAction[] = [];

    const read = await readJsonlSlice(path, from, (raw) => {
      parseStandardTranscriptEntry(raw, {
        cwd: payload.cwd,
        writeTools: WRITE_TOOLS,
        said,
        touched,
        actions,
      });
    });

    return finalizeSession(said, touched, actions, read);
  },
};

export const SURFACE: Surface = {
  moments: {
    "session-start": {
      event: "SessionStart",
      inject: { via: "json", path: "hookSpecificOutput.additionalContext" },
    },
    "prompt-submit": {
      event: "UserPromptSubmit",
      inject: { via: "json", path: "hookSpecificOutput.additionalContext" },
    },
    "before-act": {
      event: "PreToolUse",
      inject: { via: "json", path: "hookSpecificOutput.additionalContext" },
    },
    "turn-end": {
      event: "Stop",
      inject: { via: "json", path: "hookSpecificOutput.additionalContext" },
    },
    "session-end": {
      event: "SessionEnd",
      inject: { unsupported: "the session is over — there is nobody left to tell" },
    },
  },
  guard: {
    event: "PreToolUse",
    matcher: (tools) => (tools.length > 0 ? tools.join("|") : undefined),
    inject: { via: "json", path: "hookSpecificOutput.additionalContext" },
    refuse: { via: "exit-code", code: 2 },
    tools: {
      read: ["read_file", "list_files", "search_files", "view_file"],
      change: [...WRITE_TOOLS],
      record: ["execute_command", "run_command", "Bash"],
      send: ["execute_command", "run_command", "Bash"],
    },
  },
};
