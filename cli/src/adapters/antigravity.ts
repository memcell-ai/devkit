import { unsupported, type Surface } from "./surface.js";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { hookCommand, hookMatches, MOMENTS, type Moment } from "../loop/moments.js";
import {
  emptySession,
  finalizeSession,
  readJsonlSlice,
  recordToolAction,
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

// Google Antigravity (AGY).
//
// Hooks live in <project>/.agents/hooks.json under a dedicated named hook
// object — `{"memcell": {"PreInvocation": [...], "PreToolUse": [...]}}`.
// Global MCP server registration goes into ~/.gemini/config/mcp_config.json
// with stdio transport.
//
// Injection outputs `injectSteps` with an ephemeral system message; refusal
// returns `{"decision": "deny", "reason": ...}`.
// The session transcript is read from JSONL carrying step_index, type, role,
// content, and tool_calls.

const EVENT: Record<Moment, string> = {
  "session-start": "SessionStart",
  "prompt-submit": "PreInvocation",
  "before-act": "PreToolUse",
  "turn-end": "Stop",
  "session-end": "—",
};

interface Handler {
  type?: string;
  command: string;
  timeout?: number;
}

interface GroupedEntry {
  matcher?: string;
  hooks?: Handler[];
}

interface HookSpec {
  enabled?: boolean;
  SessionStart?: Handler[];
  PreInvocation?: Handler[];
  PreToolUse?: GroupedEntry[];
  PostInvocation?: Handler[];
  PostToolUse?: GroupedEntry[];
  Stop?: Handler[];
}

type HooksConfig = Record<string, HookSpec>;

interface McpFile {
  mcpServers?: Record<string, unknown>;
  [k: string]: unknown;
}

const file = (dir: string) => join(dir, ".agents", "hooks.json");
const mcpFile = () => join(homedir(), ".gemini", "config", "mcp_config.json");

const WRITE_TOOLS = new Set([
  "write_to_file",
  "replace_file_content",
  "Write",
  "Edit",
  "write_file",
  "replace",
]);

async function installMcp(): Promise<void> {
  const at = mcpFile();
  const doc = await readJson<McpFile>(at);
  doc.mcpServers ??= {};
  const args = [...MCP_ARGS, "--agent", "antigravity"];
  doc.mcpServers.memcell = { command: MCP_COMMAND, args };
  await writeJson(at, doc);
}

async function removeMcp(): Promise<boolean> {
  const at = mcpFile();
  const doc = await readJson<McpFile>(at);
  if (!doc.mcpServers || !oursMcp(doc.mcpServers.memcell)) return false;
  delete doc.mcpServers.memcell;
  await rmIfEmptied(at, doc, "mcpServers");
  return true;
}

export const antigravity: Adapter = {
  name: "antigravity",
  get surface() {
    return SURFACE;
  },

  async stale(dir: string): Promise<boolean> {
    const hookAt = file(resolve(dir));
    const files = [hookAt];
    const activeEvents = Object.values(EVENT).filter((e) => e !== "—");
    if ((await staleText(files)) || (await missingMoments(files, activeEvents))) {
      return true;
    }
    const config = await readJson<HooksConfig>(hookAt).catch(() => null);
    if (
      config?.memcell?.PostInvocation?.some((h) =>
        hookMatches(h.command, "turn-end", "antigravity"),
      ) ||
      config?.memcell?.Stop?.some((h) => hookMatches(h.command, "session-end", "antigravity"))
    ) {
      return true;
    }
    const mcpDoc = await readJson<McpFile>(mcpFile()).catch(() => null);
    if (mcpDoc?.mcpServers && oursMcp(mcpDoc.mcpServers.memcell)) {
      return true;
    }
    return false;
  },

  async install(projectDir: string): Promise<string> {
    const at = file(resolve(projectDir));
    const config = await readJson<HooksConfig>(at);
    const spec = (config.memcell ??= {});

    // SessionStart (session-start)
    const startCmd = hookCommand("session-start", "antigravity");
    const nonMatchingSessionStart = (spec.SessionStart ?? []).filter(
      (h) => !hookMatches(h.command, "session-start", "antigravity"),
    );
    spec.SessionStart = [
      ...nonMatchingSessionStart,
      { type: "command", command: startCmd, timeout: 30 },
    ];

    // PreInvocation (prompt-submit)
    const promptCmd = hookCommand("prompt-submit", "antigravity");
    const nonMatchingPreInv = (spec.PreInvocation ?? []).filter(
      (h) =>
        !hookMatches(h.command, "prompt-submit", "antigravity") &&
        !hookMatches(h.command, "session-start", "antigravity"),
    );
    spec.PreInvocation = [
      ...nonMatchingPreInv,
      { type: "command", command: promptCmd, timeout: 30 },
    ];

    // PreToolUse (before-act)
    const beforeCmd = hookCommand("before-act", "antigravity");
    const cleanedPreTool = (spec.PreToolUse ?? [])
      .map((entry) => ({
        ...entry,
        hooks: (entry.hooks ?? []).filter(
          (h) => !hookMatches(h.command, "before-act", "antigravity"),
        ),
      }))
      .filter((entry) => (entry.hooks?.length ?? 0) > 0);
    spec.PreToolUse = [
      ...cleanedPreTool,
      {
        matcher: "*",
        hooks: [{ type: "command", command: beforeCmd, timeout: 30 }],
      },
    ];

    // Remove legacy PostInvocation turn-end wiring (PostInvocation fires mid-turn after tool calls)
    if (spec.PostInvocation) {
      const cleanedPostInv = spec.PostInvocation.filter(
        (h) => !hookMatches(h.command, "turn-end", "antigravity"),
      );
      if (cleanedPostInv.length > 0) {
        spec.PostInvocation = cleanedPostInv;
      } else {
        delete spec.PostInvocation;
      }
    }

    // Stop (turn-end — fires when the turn execution loop finishes)
    const turnCmd = hookCommand("turn-end", "antigravity");
    const nonMatchingStop = (spec.Stop ?? []).filter(
      (h) =>
        !hookMatches(h.command, "turn-end", "antigravity") &&
        !hookMatches(h.command, "session-end", "antigravity"),
    );
    spec.Stop = [...nonMatchingStop, { type: "command", command: turnCmd, timeout: 30 }];

    await writeJson(at, config);
    await removeMcp().catch(() => undefined);
    return at;
  },

  async remove(projectDir: string): Promise<string | null> {
    const at = file(resolve(projectDir));
    const config = await readJson<HooksConfig>(at);
    let changed = false;

    if (config.memcell) {
      delete config.memcell;
      changed = true;
    }

    await removeMcp().catch(() => undefined);

    if (!changed) return null;
    await rmIfEmptied(at, config as unknown as Record<string, unknown>, "memcell");
    return at;
  },

  async verify(projectDir: string): Promise<Wiring[]> {
    const config = await readJson<HooksConfig>(file(resolve(projectDir)));
    const spec = config.memcell;

    return MOMENTS.map((moment) => {
      let ok = false;
      if (spec) {
        if (moment === "session-start") {
          ok = Boolean(
            spec.SessionStart?.some((h) => hookMatches(h.command, "session-start", "antigravity")),
          );
        } else if (moment === "prompt-submit") {
          ok = Boolean(
            spec.PreInvocation?.some((h) => hookMatches(h.command, "prompt-submit", "antigravity")),
          );
        } else if (moment === "before-act") {
          ok = Boolean(
            spec.PreToolUse?.some((e) =>
              e.hooks?.some((h) => hookMatches(h.command, "before-act", "antigravity")),
            ),
          );
        } else if (moment === "turn-end") {
          ok = Boolean(spec.Stop?.some((h) => hookMatches(h.command, "turn-end", "antigravity")));
        } else if (moment === "session-end") {
          ok = false;
        }
      }
      return { moment, event: EVENT[moment], ok };
    });
  },

  // ── speak — dialect output for Antigravity hooks ──────────────────────────
  speak(moment: Moment, context: string | null): string | null {
    // Antigravity PreToolUse hook proto expects a decision JSON object; on non-refusal, allow.
    if (moment === "before-act") {
      return JSON.stringify({ decision: "allow" });
    }

    if (!context) return null;

    // Antigravity Stop hook proto accepts { decision: "continue", reason: ... }
    if (moment === "session-end") {
      return JSON.stringify({
        decision: "continue",
        reason: context,
      });
    }

    if (moment === "turn-end") {
      return null;
    }

    // SessionStart and PreInvocation inject persistent systemMessage steps into the conversation
    // trajectory so recalled thread/memory context survives across tool calls within the turn.
    return JSON.stringify({
      injectSteps: [{ systemMessage: { systemMessage: context } }],
    });
  },

  // ── refuse — structured decision denial ──────────────────────────────────
  refuse(reason: string): string | null {
    return JSON.stringify({
      decision: "deny",
      reason,
    });
  },

  // ── read — JSONL transcript slice ─────────────────────────────────────────
  async read(payload: Incoming, from: number): Promise<Session> {
    const path = payload.transcript_path ?? payload.transcriptPath;
    if (!path) return emptySession(from);
    const said: string[] = [];
    const touched: string[] = [];
    const actions: ThreadAction[] = [];

    const read = await readJsonlSlice(path, from, (raw) => {
      const rec = raw as {
        type?: string;
        source?: string;
        content?: unknown;
        thinking?: unknown;
        tool_calls?: {
          name?: string;
          tool_name?: string;
          args?: Record<string, unknown>;
          tool_args?: Record<string, unknown>;
        }[];
      };

      for (const call of rec.tool_calls ?? []) {
        const name = call.name ?? call.tool_name ?? "";
        const args = call.args ?? call.tool_args ?? {};
        recordToolAction(name, args, {
          cwd: payload.cwd,
          writeTools: WRITE_TOOLS,
          touched,
          actions,
        });
      }

      const isUser = rec.type === "USER_INPUT" || rec.source === "USER_EXPLICIT";
      if (isUser) {
        const text = typeof rec.content === "string" ? rec.content.trim() : "";
        if (text) said.push(`user: ${text}`);
        return;
      }

      if (rec.type === "PLANNER_RESPONSE") {
        const text = typeof rec.content === "string" ? rec.content.trim() : "";
        if (text) {
          said.push(`assistant: ${boundAssistantText(text)}`);
        } else if (typeof rec.thinking === "string" && rec.thinking.trim()) {
          said.push(`assistant: ${rec.thinking.trim().slice(0, 1200)}`);
        }
        return;
      }

      if (rec.type === "GENERIC") {
        const text = typeof rec.content === "string" ? rec.content.trim() : "";
        if (!text) return;
        // Never dump raw viewed file contents into transcript delta
        if (text.includes("File Path: ") && text.includes("Showing lines ")) {
          const prevAction = actions[actions.length - 1];
          if (prevAction && !prevAction.outcome) {
            prevAction.outcome = "Read file";
          }
          return;
        }
        // Attach concise outcome to the preceding tool action or capture ask_question responses
        const firstLine =
          text
            .split("\n")
            .find((l) => l.trim() && !l.startsWith("Created At:") && !l.startsWith("Completed At:"))
            ?.trim() ?? "";
        const prevAction = actions[actions.length - 1];
        if (prevAction && !prevAction.outcome && firstLine) {
          prevAction.outcome = firstLine.slice(0, 240);
        }
        if (text.includes("A1:") || text.includes("The command exited")) {
          said.push(`assistant: ${text.slice(0, 800)}`);
        }
        return;
      }

      if (rec.source === "MODEL") {
        const text = typeof rec.content === "string" ? rec.content.trim() : "";
        if (text) {
          said.push(`assistant: ${boundAssistantText(text)}`);
        }
      }
    });

    return finalizeSession(said, touched, actions, read);
  },
};

function boundAssistantText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length > 6000) {
    return trimmed.slice(0, 3000) + "\n\n[...]\n\n" + trimmed.slice(-3000);
  }
  return trimmed;
}

export const SURFACE: Surface = {
  moments: {
    "session-start": {
      event: "SessionStart",
      inject: { via: "json", path: "injectSteps[0].systemMessage.systemMessage" },
    },
    "prompt-submit": {
      event: "PreInvocation",
      inject: { via: "json", path: "injectSteps[0].systemMessage.systemMessage" },
    },
    "before-act": {
      event: "PreToolUse",
      inject: unsupported(
        "Antigravity PreToolUse hook accepts decision/overwrite but not injected context messages",
      ),
    },
    "turn-end": {
      event: "Stop",
      inject: unsupported(
        "Antigravity Stop hook fires at turn completion and only injects reason when blocking termination",
      ),
    },
    "session-end": unsupported(
      "Antigravity has no session-close hook; Stop fires at the end of each turn",
    ),
  },
  guard: {
    event: "PreToolUse",
    matcher: (tools) => (tools.length > 0 ? tools.join("|") : "*"),
    inject: unsupported(
      "Antigravity PreToolUse hook accepts decision/overwrite but not injected context messages",
    ),
    refuse: { via: "json", path: "decision", deny: "deny" },
    tools: {
      read: ["view_file", "list_dir", "grep_search", "find_by_name", "read_url_content"],
      change: [...WRITE_TOOLS],
      record: ["run_command"],
      send: ["run_command"],
    },
  },
};
