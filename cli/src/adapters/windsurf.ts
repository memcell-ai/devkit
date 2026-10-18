import type { Surface } from "./surface.js";
import { join } from "node:path";

import type { Moment } from "../loop/moments.js";
import {
  emptySession,
  finalizeSession,
  parseStandardTranscriptEntry,
  readJsonlSlice,
  type Incoming,
  type Session,
  type ThreadAction,
} from "./capture.js";
import { ccHookOps } from "./cc-hooks.js";
import {
  MCP_ARGS,
  MCP_COMMAND,
  oursMcp,
  readJson,
  rmIfEmptied,
  writeJson,
  type Adapter,
} from "./shared.js";

// Windsurf IDE / Cascade agent (Codeium).
// Claude-shaped hooks in <project>/.windsurf/hooks.json, with
// hookSpecificOutput.additionalContext for injection and exit code 2
// (or JSON deny) for refusal. MCP registration in <project>/.windsurf/mcp_config.json.

const EVENT: Record<Moment, string> = {
  "session-start": "SessionStart",
  "prompt-submit": "UserPromptSubmit",
  "before-act": "PreToolUse",
  "turn-end": "Stop",
  "session-end": "SessionEnd",
};

const file = (dir: string) => join(dir, ".windsurf", "hooks.json");
const mcpFile = (dir: string) => join(dir, ".windsurf", "mcp_config.json");

interface McpFile {
  mcpServers?: Record<string, unknown>;
  [k: string]: unknown;
}

async function installMcp(dir: string): Promise<void> {
  const doc = await readJson<McpFile>(mcpFile(dir));
  doc.mcpServers ??= {};
  doc.mcpServers.memcell = { command: MCP_COMMAND, args: MCP_ARGS };
  await writeJson(mcpFile(dir), doc);
}

async function removeMcp(dir: string): Promise<boolean> {
  const doc = await readJson<McpFile>(mcpFile(dir));
  if (!doc.mcpServers || !oursMcp(doc.mcpServers.memcell)) return false;
  delete doc.mcpServers.memcell;
  await rmIfEmptied(mcpFile(dir), doc, "mcpServers");
  return true;
}

const WRITE_TOOLS = new Set([
  "Write",
  "Edit",
  "write",
  "edit",
  "write_file",
  "edit_file",
  "apply_patch",
]);

const wiring = ccHookOps("windsurf", file, EVENT, {
  afterInstall: async (dir) => {
    await removeMcp(dir).catch(() => undefined);
  },
  alsoRemove: removeMcp,
  legacy: (dir) => [join(dir, ".codeium", "windsurf", "hooks.json")],
});

export const windsurf: Adapter = {
  name: "windsurf",
  surface: {
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
        read: ["Read", "View", "Glob", "Grep", "read_file", "view_file"],
        change: [...WRITE_TOOLS],
        record: ["RunCommand", "run_command", "Bash"],
        send: ["RunCommand", "run_command", "Bash"],
      },
    },
  },
  ...wiring,

  speak(moment: Moment, context: string | null): string | null {
    if (!context || moment === "session-end") return null;
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: EVENT[moment],
        additionalContext: context,
      },
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
