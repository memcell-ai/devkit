import type { Surface } from "./surface.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Moment } from "../loop/moments.js";
import {
  emptySession,
  finalizeSession,
  readJsonlSlice,
  recordToolAction,
  type Incoming,
  type Session,
  type ThreadAction,
} from "./capture.js";
import { ccHookOps } from "./cc-hooks.js";
import { MCP_ARGS, MCP_COMMAND, type Adapter } from "./shared.js";

// Grok Build (xAI). Claude-shaped hooks, kept in a dedicated file this
// adapter owns whole — <project>/.grok/hooks/memcell.json — so the nested
// core writes it exactly as it writes a settings block. Injection is
// snake_case `additional_context`; the transcript arrives camelCased as
// `transcriptPath` and is a JSONL of ACP session/update notifications. Its
// MCP registration is TOML (project .grok/config.toml), managed between
// markers like the codex adapter's and for the same reason: no TOML parser,
// no ability to rewrite the person's own tables.
//
// Grok's hooks are trust-gated on its side — after installing, a person
// approves them in-product once. Grok also ships an experimental built-in
// memory; this adapter lives beside it.

const EVENT: Record<Moment, string> = {
  "session-start": "SessionStart",
  "prompt-submit": "UserPromptSubmit",
  "before-act": "PreToolUse",
  "turn-end": "Stop",
  "session-end": "SessionEnd",
};

const hooksFile = (dir: string) => join(dir, ".grok", "hooks", "memcell.json");
const tomlFile = (dir: string) => join(dir, ".grok", "config.toml");

const BEGIN = "# memcell:begin — managed block, removed whole by `memcell hook remove`";
const END = "# memcell:end";

const block = (): string =>
  [
    BEGIN,
    `[mcp_servers.memcell]`,
    `command = "${MCP_COMMAND}"`,
    `args = ${JSON.stringify(MCP_ARGS)}`,
    END,
  ].join("\n");

function stripped(text: string): string {
  const begin = text.indexOf(BEGIN);
  if (begin === -1) return text;
  const end = text.indexOf(END, begin);
  if (end === -1) return text;
  let next = `${text.slice(0, begin)}${text.slice(end + END.length)}`;
  while (next.includes("\n\n\n")) {
    next = next.replaceAll("\n\n\n", "\n\n");
  }
  return next;
}

async function installMcp(dir: string): Promise<void> {
  const at = tomlFile(dir);
  const current = await readFile(at, "utf8").catch(() => "");
  await mkdir(dirname(at), { recursive: true });
  const base = stripped(current).trimEnd();
  const next = base ? `${base}\n\n${block()}\n` : `${block()}\n`;
  await writeFile(at, next);
}

async function removeMcp(dir: string): Promise<boolean> {
  const at = tomlFile(dir);
  const current = await readFile(at, "utf8").catch(() => null);
  if (current === null || !current.includes(BEGIN)) return false;
  await writeFile(at, stripped(current));
  return true;
}

const WRITE_TOOLS = new Set(["search_replace", "write", "apply_patch", "edit_file", "write_file"]);

export const grok: Adapter = {
  name: "grok",
  get surface() {
    return SURFACE;
  },
  ...ccHookOps("grok", hooksFile, EVENT, {
    afterInstall: async (dir) => {
      await removeMcp(dir).catch(() => undefined);
    },
    alsoRemove: removeMcp,
  }),

  speak(moment: Moment, context: string | null): string | null {
    if (!context || moment === "session-end") return null;
    return JSON.stringify({ additional_context: context });
  },

  // ── read — the ACP update stream its hooks name ──────────────────────────
  async read(payload: Incoming, from: number): Promise<Session> {
    const path = payload.transcript_path ?? payload.transcriptPath;
    if (!path) return emptySession(from);
    const said: string[] = [];
    const touched: string[] = [];
    const actions: ThreadAction[] = [];
    let activeRole: "user" | "assistant" | null = null;
    let activeChunkBuffer = "";

    const flushRoleBuffer = (): void => {
      if (activeRole && activeChunkBuffer.trim()) {
        said.push(`${activeRole}: ${activeChunkBuffer.trim()}`);
      }
      activeRole = null;
      activeChunkBuffer = "";
    };

    const read = await readJsonlSlice(path, from, (raw) => {
      const entry = raw as { params?: { update?: Record<string, unknown> } } & {
        update?: Record<string, unknown>;
      };
      const update = entry.params?.update ?? entry.update;
      if (!update) return;
      const kind = update.sessionUpdate as string | undefined;
      if (kind === "user_message_chunk" || kind === "agent_message_chunk") {
        const role = kind === "user_message_chunk" ? "user" : "assistant";
        const content = update.content as { text?: string } | string | undefined;
        const text = typeof content === "string" ? content : (content?.text ?? "");
        if (role !== activeRole) {
          flushRoleBuffer();
          activeRole = role;
        }
        activeChunkBuffer += text;
      } else if (kind === "tool_call" || kind === "tool_call_update") {
        flushRoleBuffer();
        const name = String(update.title ?? update.toolName ?? update.name ?? "");
        const input = update.rawInput as Record<string, unknown> | string | undefined;
        recordToolAction(name, input, {
          cwd: payload.cwd,
          writeTools: WRITE_TOOLS,
          touched,
          actions,
        });
      }
    });
    flushRoleBuffer();
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
      inject: { via: "json", path: "additional_context" },
    },
    "prompt-submit": {
      event: "UserPromptSubmit",
      inject: { via: "json", path: "additional_context" },
    },
    "before-act": {
      event: "PreToolUse",
      inject: { via: "json", path: "additional_context" },
    },
    "turn-end": {
      event: "Stop",
      inject: { via: "json", path: "additional_context" },
    },
    "session-end": {
      event: "SessionEnd",
      inject: { unsupported: "the session is over — there is nobody left to tell" },
    },
  },
  guard: {
    event: "PreToolUse",
    matcher: (tools) => (tools.length > 0 ? tools.join("|") : undefined),
    inject: { via: "json", path: "additional_context" },
    refuse: { via: "exit-code", code: 2 },
    tools: {
      read: ["read_file", "grep", "list_dir"],
      change: [...WRITE_TOOLS],
      // One shell is record AND send; which one is decided from the command.
      record: ["run_terminal_cmd", "bash"],
      send: ["run_terminal_cmd", "bash"],
    },
  },
};
