import type { Surface } from "./surface.js";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { hookCommand, MOMENTS, type Moment } from "../loop/moments.js";
import {
  addTouched,
  emptySession,
  finalizeSession,
  readJsonlSlice,
  recordToolAction,
  relativeTo,
  type Incoming,
  type Session,
  type ThreadAction,
} from "./capture.js";
import { missingMoments, staleText, type Adapter, type Wiring } from "./shared.js";

// Codex. Its config is TOML, and this adapter carries no TOML parser on
// purpose: everything memcell writes lives between two markers, appended
// whole and removed whole. Inside the markers is valid TOML; outside them
// not a byte is touched. A parser would buy the ability to merge INTO the
// person's own tables — which is the ability that turns a bug into their
// config being rewritten.
//
// Codex hooks are HASH-TRUSTED: it hashes a hook's definition at approval
// and silently skips one that changed since. So the command string is
// frozen, and after installing, a person has to approve via /hooks.

const BEGIN = "# memcell:begin — managed block, removed whole by `memcell hook remove`";
const END = "# memcell:end";

const EVENT: Record<Moment, string> = {
  "session-start": "SessionStart",
  "prompt-submit": "UserPromptSubmit",
  "before-act": "PreToolUse",
  "turn-end": "Stop",
  "session-end": "SessionEnd",
};

const file = () => join(homedir(), ".codex", "config.toml");

const block = (): string =>
  [
    BEGIN,
    ...MOMENTS.map((moment) =>
      [
        ``,
        `[[hooks.${EVENT[moment]}]]`,
        `[[hooks.${EVENT[moment]}.hooks]]`,
        `type = "command"`,
        `command = ${JSON.stringify(hookCommand(moment, "codex"))}`,
        `timeout = 30`,
        `additionalContextLimit = 5000`,
      ].join("\n"),
    ),
    END,
  ].join("\n");

/** The file with our block removed — the whole block, only the block. A torn
 *  block is left for a person rather than guessed at. */
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

export const codex: Adapter = {
  name: "codex",
  get surface() {
    return SURFACE;
  },

  /** An older release's shape — a path or an --agent in the wiring. */
  async stale(_dir: string): Promise<boolean> {
    const files = [join(homedir(), ".codex", "config.toml")];
    // Wiring of the right shape that predates a moment — what every
    // upgrade adding one leaves behind. Caught here so the first hook
    // after an upgrade carries itself forward and nobody is told to.
    return (await staleText(files)) || missingMoments(files, Object.values(EVENT));
  },

  async install(_projectDir: string): Promise<string> {
    const at = file();
    const current = await readFile(at, "utf8").catch(() => "");
    await mkdir(dirname(at), { recursive: true });
    await writeFile(at, `${stripped(current).trimEnd()}\n\n${block()}\n`);
    return at;
  },

  async remove(): Promise<string | null> {
    const at = file();
    const current = await readFile(at, "utf8").catch(() => null);
    if (current === null || !current.includes(BEGIN)) return null;
    await writeFile(at, stripped(current));
    return at;
  },

  async verify(): Promise<Wiring[]> {
    const current = await readFile(file(), "utf8").catch(() => "");
    const begin = current.indexOf(BEGIN);
    const end = current.indexOf(END, begin);
    const held = begin !== -1 && end !== -1 ? current.slice(begin, end) : "";
    return MOMENTS.map((moment) => ({
      moment,
      event: EVENT[moment],
      ok: held.includes(`memcell hook ${moment} codex`),
    }));
  },

  // ── speak — additionalContext, same envelope its hooks parse ─────────────
  speak(moment: Moment, context: string | null): string | null {
    if (!context || moment === "session-end") return null;
    return JSON.stringify({ hookSpecificOutput: { additionalContext: context } });
  },

  // ── read — the rollout, handed over or located ───────────────────────────
  async read(payload: Incoming, from: number): Promise<Session> {
    const path =
      payload.transcript_path ?? payload.transcriptPath ?? (await locateRollout(payload));
    if (!path) return emptySession(from);
    const said: string[] = [];
    const touched: string[] = [];
    const actions: ThreadAction[] = [];
    const read = await readJsonlSlice(path, from, (raw) => {
      const entry = raw as { type?: string; payload?: Record<string, unknown> };
      const p = entry.payload ?? {};
      const pt = p.type as string | undefined;
      if (entry.type === "response_item" && pt === "message") {
        const role = p.role as string | undefined;
        if (role !== "user" && role !== "assistant") return;
        const text = blockText(p.content);
        if (text.trim()) said.push(`${role}: ${text.trim()}`);
      } else if (entry.type === "event_msg" && pt === "patch_apply_end") {
        const changes = p.changes as Record<string, unknown> | undefined;
        const files = Object.keys(changes ?? {});
        for (const file of files) addTouched(touched, file, payload.cwd);
        if (files.length > 0) {
          const relFiles = files.map((f) => relativeTo(f, payload.cwd));
          actions.push({
            type: "file_touch",
            name: "patch_apply",
            target: relFiles.join(", ").slice(0, 200),
            summary: `Patched ${relFiles.join(", ").slice(0, 200)}`,
          });
        }
      } else if (
        entry.type === "response_item" &&
        (pt === "custom_tool_call" || pt === "function_call")
      ) {
        const name = String(p.name ?? pt ?? "tool");
        let input: Record<string, unknown> | string | undefined =
          typeof p.input === "string"
            ? p.input
            : typeof p.arguments === "string"
              ? p.arguments
              : (p.input as Record<string, unknown> | undefined);
        if (typeof input === "string" && !input.includes("*** Begin Patch")) {
          try {
            input = JSON.parse(input) as Record<string, unknown>;
          } catch {
            // keep as string
          }
        }
        recordToolAction(name, input, {
          cwd: payload.cwd,
          writeTools: WRITE_TOOLS,
          touched,
          actions,
        });
      }
    });
    return finalizeSession(said, touched, actions, read);
  },
};

const WRITE_TOOLS = new Set(["Edit", "Write", "apply_patch", "write_file", "replace", "edit_file"]);

/** Codex message content: a string, or an array of `{ type: text|input_text
 *  |output_text, text }` blocks. */
function blockText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c): c is { text: string } => typeof (c as { text?: unknown })?.text === "string")
    .map((c) => c.text)
    .join("\n");
}

/** Find the rollout for this session: the session id is on the metadata
 *  line of exactly one rollout; the newest rollout naming this cwd is the
 *  fallback when the payload carries no id. */
async function locateRollout(payload: Incoming): Promise<string | null> {
  const root = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions");
  const wanted = payload.session_id ?? payload.sessionId;
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) files.push(full);
    }
  };
  await walk(root);
  const withTime = await Promise.all(
    files.map(async (f) => ({
      f,
      mtime: await stat(f).then(
        (s) => s.mtimeMs,
        () => 0,
      ),
    })),
  );
  withTime.sort((a, b) => b.mtime - a.mtime);
  let cwdMatch: string | null = null;
  for (const { f } of withTime) {
    const meta = await metaLine(f);
    if (!meta) continue;
    if (wanted && meta.session_id === wanted) return f;
    if (!cwdMatch && payload.cwd && meta.cwd === payload.cwd) cwdMatch = f;
  }
  return cwdMatch;
}

/** How much of a rollout to read to find its header. The first line is a
 *  session_meta record; anything past this is not one. */
const HEADER_BYTES = 64 * 1024;

/**
 * The metadata on a rollout's first line.
 *
 * A PREFIX, not the file. Locating a session walks every rollout on the
 * machine asking each "are you the one", and this used to answer by reading
 * each one whole — hundreds of megabytes of other sessions' transcripts
 * pulled through memory at turn-end, to look at one line of each.
 */
async function metaLine(path: string): Promise<{ session_id?: string; cwd?: string } | null> {
  const { open } = await import("node:fs/promises");
  let head = "";
  try {
    const fd = await open(path, "r");
    try {
      const { buffer, bytesRead } = await fd.read(Buffer.alloc(HEADER_BYTES), 0, HEADER_BYTES, 0);
      head = buffer.subarray(0, bytesRead).toString("utf8");
    } finally {
      await fd.close();
    }
  } catch {
    return null;
  }
  const breakAt = head.indexOf("\n");
  // No newline inside the prefix means the first record is larger than any
  // header could be — not a rollout header, and not worth reading further.
  if (breakAt === -1 && head.length === HEADER_BYTES) return null;
  const line = breakAt === -1 ? head : head.slice(0, breakAt);
  try {
    const entry = JSON.parse(line) as { payload?: { session_id?: string; cwd?: string } };
    return entry.payload ?? null;
  } catch {
    return null;
  }
}

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
      inject: { via: "json", path: "hookSpecificOutput.additionalContext" },
    },
  },
  guard: {
    event: "PreToolUse",
    matcher: (tools) => (tools.length > 0 ? tools.join("|") : undefined),
    inject: { via: "json", path: "hookSpecificOutput.additionalContext" },
    refuse: { via: "exit-code", code: 2 },
    tools: {
      read: ["Read", "Grep", "Glob", "Bash"],
      change: ["Edit", "Write", "apply_patch", "Bash"],
      record: ["Bash"],
      send: ["Bash"],
    },
  },
};
