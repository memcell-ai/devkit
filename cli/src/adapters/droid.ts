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

// Factory Droid. The closest dialect to Claude Code's: the same nested
// hooks JSON (in <project>/.factory/hooks.json), `transcript_path` on every
// hook's stdin, and hookSpecificOutput.additionalContext for injection. The
// MCP registration rides <project>/.factory/mcp.json.
//
// The record shape matches the agent's documentation, not yet driven
// live: a JSONL of a
// session_start header plus message / tool_call / tool_result records,
// writes named Create · Edit · ApplyPatch with the path in the tool input.
// The reader is deliberately tolerant of spelling, and anything it does not
// recognize reads as nothing.

const EVENT: Record<Moment, string> = {
  "session-start": "SessionStart",
  "prompt-submit": "UserPromptSubmit",
  "before-act": "PreToolUse",
  "turn-end": "Stop",
  "session-end": "SessionEnd",
};

const file = (dir: string) => join(dir, ".factory", "hooks.json");
const mcpFile = (dir: string) => join(dir, ".factory", "mcp.json");

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

const WRITE_TOOLS = new Set(["Create", "Edit", "ApplyPatch", "create", "edit", "apply_patch"]);

export const droid: Adapter = {
  name: "droid",
  get surface() {
    return SURFACE;
  },
  ...ccHookOps("droid", file, EVENT, {
    afterInstall: async (dir) => {
      await removeMcp(dir).catch(() => undefined);
    },
    alsoRemove: removeMcp,
  }),

  speak(moment: Moment, context: string | null): string | null {
    if (!context || moment === "session-end") return null;
    return JSON.stringify({ hookSpecificOutput: { additionalContext: context } });
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

/**
 * What this harness can do, declared — see surface.ts.
 *
 * `tools` is the piece that can live nowhere else. The record holds five
 * words every trade shares and knows nothing about tools, because it
 * outlives whichever agents exist. Naming which of THIS agent's tools count
 * as sending is knowledge about one harness, and this is the file allowed to
 * hold it.
 *
 * `change` is the same set the capture side already learned — one list, so
 * the two halves cannot drift into disagreeing about what a write is. A tool
 * nobody verified is left out: that act goes unguarded, which is silence
 * rather than a memory shown where it does not apply.
 */
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
      read: ["Read", "Glob", "Grep", "WebSearch", "FetchUrl"],
      change: [...WRITE_TOOLS],
      // One shell is record AND send; which one is decided from the command.
      record: ["Execute"],
      send: ["Execute"],
    },
  },
};
