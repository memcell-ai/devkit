import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";

import { log } from "../loop/session.js";

// The capture toolkit adapters compose — the primitives of reading a
// session back, shared so twenty adapters do not grow twenty slightly
// different laws. What every adapter's `read` must produce is a `Session`;
// how it produces one is the adapter's own business (a transcript the hook
// was handed, a record located on disk, a database) — these are the pieces
// they build it from.
//
// THE LAW every reader obeys: the NAMES of written files travel, never a
// byte of their contents. And a reader that cannot find its record returns
// empty — silence, never a guess.

/** An error in one line, for the log. A reader's trouble is never thrown at
 *  the agent — the turn goes on — so the log is the only place it can be
 *  said, and it has to be legible there. */
const reason = (trouble: unknown): string =>
  trouble instanceof Error ? trouble.message : String(trouble);

export interface ThreadAction {
  type: "tool_call" | "file_touch" | "command" | "milestone";
  name: string;
  target?: string;
  summary: string;
  outcome?: string;
}

export interface TranscriptDelta {
  /** The conversation since `from`, as "role: text" blocks. */
  text: string;
  /** The names of the files this slice's turns wrote — relative to the
   *  project where the reader could tell, capped. */
  touched: string[];
  /** Structured tool, command, and file actions captured in this slice. */
  actions?: ThreadAction[];
  /** How far into the record this read reached, so the next turn slices
   *  only what is new. Its meaning is per-adapter (a byte offset, a line
   *  count); it is only ever compared to itself. */
  read: number;
}
export type Session = TranscriptDelta;

/** What a harness hands the hook on stdin — the fields the adapters read.
 *  Field spelling varies by agent (snake and camel are both real). */
export interface Incoming {
  prompt?: string;
  transformedPrompt?: string;
  cwd?: string;
  session_id?: string;
  sessionId?: string;
  transcript_path?: string;
  transcriptPath?: string;
}

/** How many file names one hand-over may report. More than this is a
 *  sweep, and a sweep's story is its own summary line, not a wall of
 *  paths. */
export const TOUCHED_CAP = 20;
export const ACTIONS_CAP = 50;

export const emptySession = (from: number): Session => ({ text: "", touched: [], read: from });

export function finalizeSession(
  said: string[],
  touched: string[],
  actions: ThreadAction[],
  read: number,
): Session {
  return {
    text: said.join("\n\n"),
    touched: touched.slice(0, TOUCHED_CAP),
    ...(actions.length > 0 ? { actions: actions.slice(0, ACTIONS_CAP) } : {}),
    read,
  };
}

/** A path made relative to the project when it sits inside it, so the
 *  record reads `src/api.ts` rather than a machine-specific absolute
 *  path. */
export function relativeTo(file: string, projectDir?: string): string {
  return projectDir && file.startsWith(`${projectDir}/`) ? file.slice(projectDir.length + 1) : file;
}

/** Collect a touched file name — deduplicated, relativized. */
export function addTouched(touched: string[], file: string | undefined, projectDir?: string): void {
  if (!file) return;
  const named = relativeTo(file, projectDir);
  if (!touched.includes(named)) touched.push(named);
}

/**
 * Walk the NEW lines of a JSONL record, tolerating the half-written tail
 * of a live file. Returns how far the read reached, in bytes — the same
 * number the caller hands back next turn.
 */
/** How the slice reaches its bytes. Injectable for one reason: the branch
 *  that matters — lines delivered and THEN a failure — cannot be reached
 *  with a real file, and it is the branch that once wedged every session on
 *  the machine. A seam here is cheaper than a defect nobody can test. */
export type OpenSlice = (path: string, start: number) => NodeJS.ReadableStream;

const openFile: OpenSlice = (path, start) => createReadStream(path, { start, encoding: "utf8" });

/**
 * The most of a record one turn will read.
 *
 * A backlog has to be BOUNDED, and the bound has to be here rather than at
 * the door. A delivery the instance refuses for size rolls the offset back
 * so the turn can be retried — correct for an outage, and a trap for a
 * refusal the same bytes will always earn: the next read starts at the same
 * place, reaches a now-larger end, and is refused again. Nothing recovers.
 *
 * Measured on 2026-08-26: one session's record reached 879 MB against a
 * door that takes 600k characters, and capture had been wedged for two days
 * — reading the whole file into memory each turn to be refused each turn.
 *
 * Generous against any real turn, and small enough that reading it costs
 * nothing. Past it the read starts near the END: recent work is what a
 * session is worth capturing for, and the alternative on a backlog this
 * size is to capture nothing at all, forever.
 */
export const READ_CEILING = 4_000_000;

export async function readJsonlSlice(
  path: string,
  from: number,
  onEntry: (entry: unknown) => void,
  open: OpenSlice = openFile,
): Promise<number> {
  // STREAMED from the offset, never read whole.
  //
  // This used to be readFile(path, "utf8") and then slice(from). A long
  // session's transcript passes Node's maximum string length, readFile
  // throws ERR_STRING_TOO_LONG, and the failure was swallowed into an
  // empty string — so the hand-over reported "nothing new" and the offset
  // never advanced, forever, on exactly the long dense sessions worth
  // capturing. It also meant holding the entire record in memory to read
  // the tail of it. Reading from the byte offset costs the delta and
  // nothing else.
  const size = await stat(path)
    .then((s) => s.size)
    .catch(() => -1);
  // Unreadable, or the file was replaced by a shorter one — start over
  // rather than seek past its end and report silence.
  if (size < 0) return from;
  const behind = from > size ? 0 : from;
  // Skipping lands mid-line, which drops one entry: the parse below already
  // tolerates that — it is the same shape as the half-written tail of a live
  // file — and one lost line beside a skipped backlog is not the problem.
  const start = size - behind > READ_CEILING ? size - READ_CEILING : behind;
  if (start !== behind) {
    await log(
      `record is ${Math.round((size - behind) / 1e6)}MB behind — reading the last ${Math.round(READ_CEILING / 1e6)}MB and skipping the rest`,
    );
  }

  let read = start;
  await new Promise<void>((resolve, reject) => {
    const stream = open(path, start);
    // Listen for trouble BEFORE anything starts pulling. `createInterface`
    // begins consuming immediately, so a stream that fails on its first
    // read emits into a listener that does not exist yet — the error goes
    // unhandled and this promise never settles, which hangs the turn rather
    // than failing it.
    stream.on("error", reject);
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    // Readline raises its OWN error when its input fails, and an 'error'
    // with no listener is an uncaught exception — which would take the hook
    // process down rather than fail open, against the law every leg here
    // obeys. Whichever of the two settles first wins; the other is spent.
    lines.on("error", reject);
    lines.on("line", (line) => {
      // Byte length, because the offset is a byte offset and a transcript
      // carries characters that are not one byte each.
      read += Buffer.byteLength(line, "utf8") + 1;
      if (!line.trim()) return;
      try {
        onEntry(JSON.parse(line));
      } catch {
        // A half-written line is the tail of a live file, not a problem.
      }
    });
    lines.on("close", resolve);
  }).catch(async (trouble: unknown) => {
    await log(`read failed at byte ${read} — ${reason(trouble)}`);
  });
  return Math.min(read, size);
}

const PATCH_MARKERS = ["*** Add File: ", "*** Update File: ", "*** Delete File: ", "*** Move to: "];

/**
 * The files an apply_patch envelope names, parsed deterministically line-by-line without regex.
 */
export function patchPaths(patch: string): string[] {
  const files: string[] = [];
  for (const rawLine of patch.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    for (const marker of PATCH_MARKERS) {
      if (line.startsWith(marker)) {
        const target = line.slice(marker.length).trim();
        if (target) files.push(target);
        break;
      }
    }
  }
  return files;
}

export function unquoteArg(val: unknown): string | undefined {
  if (typeof val !== "string") return undefined;
  let s = val.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      const parsed = JSON.parse(s);
      if (typeof parsed === "string") s = parsed.trim();
    } catch {
      s = s.slice(1, -1).trim();
    }
  }
  return s.length > 0 ? s : undefined;
}

/**
 * The path a write-shaped tool call addressed, whatever the agent calls
 * the field. The babel is finite — `filePath` (opencode, kilo), `file_path`
 * (gemini, qwen, grok, droid), `path` (copilot, kiro, cline, muse),
 * `filepath` (continue), `notebook_path` (claude notebooks), `TargetFile` /
 * `AbsolutePath` (antigravity) — and it is resolved HERE, once, so no adapter re-learns it.
 */
export function pathOf(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  for (const key of [
    "file_path",
    "filePath",
    "path",
    "filepath",
    "notebook_path",
    "target_path",
    "TargetFile",
    "AbsolutePath",
  ]) {
    const value = unquoteArg(input[key]);
    if (value) return value;
  }
  return undefined;
}

function appendAction(actions: ThreadAction[], action: ThreadAction): void {
  if (actions.length >= ACTIONS_CAP) return;
  const prev = actions[actions.length - 1];
  if (
    prev &&
    prev.type === action.type &&
    prev.name === action.name &&
    prev.target === action.target &&
    prev.summary === action.summary
  ) {
    if (action.outcome && !prev.outcome) prev.outcome = action.outcome;
    return;
  }
  actions.push(action);
}

/**
 * Centralized multi-agent tool action recorder.
 * Normalizes tool invocations across all 19 supported agents into structured ThreadAction entries
 * and records modified file paths into `touched` when a write tool is invoked.
 */
export function recordToolAction(
  toolName: string | undefined,
  rawArgs: Record<string, unknown> | string | undefined,
  options: {
    cwd?: string;
    writeTools?: ReadonlySet<string>;
    touched?: string[];
    actions: ThreadAction[];
    outcome?: string;
  },
): void {
  const name = (toolName ?? "").trim();
  if (!name) return;

  const { cwd, writeTools, touched, actions, outcome } = options;
  const input =
    typeof rawArgs === "object" && rawArgs !== null
      ? (rawArgs as Record<string, unknown>)
      : undefined;

  const patchText =
    typeof rawArgs === "string"
      ? rawArgs
      : (unquoteArg(input?.patch) ?? unquoteArg(input?.input) ?? "");

  const isPatchTool =
    name === "apply_patch" ||
    name.toLowerCase().includes("patch") ||
    patchText.includes("*** Begin Patch");

  if (isPatchTool && patchText) {
    const files = patchPaths(patchText);
    const isWrite = !writeTools || writeTools.has(name) || isPatchTool;
    if (isWrite && touched) {
      for (const f of files) addTouched(touched, f, cwd);
    }
    const relFiles = files.map((f) => relativeTo(f, cwd));
    appendAction(actions, {
      type: "file_touch",
      name,
      ...(relFiles[0] ? { target: relFiles.join(", ").slice(0, 200) } : {}),
      summary:
        relFiles.length > 0
          ? `Patched ${relFiles.join(", ").slice(0, 200)}`
          : `Applied patch via ${name}`,
      ...(outcome ? { outcome } : {}),
    });
    return;
  }

  const isStrReplaceView = name === "str_replace_editor" && unquoteArg(input?.command) === "view";

  if (writeTools?.has(name) && !isStrReplaceView) {
    const fileTarget = pathOf(input);
    if (touched) addTouched(touched, fileTarget, cwd);
    const relTarget = fileTarget ? relativeTo(fileTarget, cwd) : undefined;
    const desc =
      unquoteArg(input?.Description) ??
      unquoteArg(input?.description) ??
      unquoteArg(input?.Instruction) ??
      unquoteArg(input?.toolSummary) ??
      "";
    appendAction(actions, {
      type: "file_touch",
      name,
      ...(relTarget ? { target: relTarget } : {}),
      summary: desc
        ? `Modified ${relTarget ?? "file"}: ${desc.slice(0, 160)}`
        : `Modified ${relTarget ?? "file"} via ${name}`,
      ...(outcome ? { outcome } : {}),
    });
    return;
  }

  const cmdVal =
    !isStrReplaceView && input
      ? (unquoteArg(input.CommandLine) ?? unquoteArg(input.command) ?? unquoteArg(input.cmd))
      : undefined;
  if (cmdVal) {
    const cleanCmd = cmdVal.trim();
    const lowerCmd = cleanCmd.toLowerCase();
    // Never record meta MemCell CLI invocations as workspace actions
    if (
      lowerCmd === "memcell" ||
      lowerCmd.startsWith("memcell ") ||
      lowerCmd.startsWith("npx memcell ") ||
      lowerCmd.startsWith("pnpm memcell ") ||
      lowerCmd.startsWith("bunx memcell ") ||
      lowerCmd.includes("/memcell ")
    ) {
      return;
    }
    const desc = unquoteArg(input?.toolSummary) ?? unquoteArg(input?.description) ?? "";
    appendAction(actions, {
      type: "command",
      name,
      target: cleanCmd.slice(0, 160),
      summary: desc
        ? `${desc}: ${cleanCmd.slice(0, 140)}`
        : `Executed command: ${cleanCmd.slice(0, 160)}`,
      ...(outcome ? { outcome } : {}),
    });
    return;
  }

  const rawTarget =
    pathOf(input) ??
    unquoteArg(input?.SearchPath) ??
    unquoteArg(input?.DirectoryPath) ??
    unquoteArg(input?.Url) ??
    unquoteArg(input?.url) ??
    unquoteArg(input?.query) ??
    unquoteArg(input?.Query) ??
    unquoteArg(input?.pattern);
  const relTarget = rawTarget ? relativeTo(rawTarget, cwd) : undefined;
  const desc =
    unquoteArg(input?.toolSummary) ??
    unquoteArg(input?.toolAction) ??
    unquoteArg(input?.description) ??
    unquoteArg(input?.Description) ??
    unquoteArg(input?.task) ??
    "";

  appendAction(actions, {
    type: "tool_call",
    name,
    ...(relTarget ? { target: relTarget.slice(0, 200) } : {}),
    summary: desc
      ? `${name}${relTarget ? ` (${relTarget.slice(0, 120)})` : ""}: ${desc.slice(0, 140)}`
      : relTarget
        ? `${name} on ${relTarget.slice(0, 160)}`
        : `Invoked ${name}`,
    ...(outcome ? { outcome } : {}),
  });
}

function stripTaggedBlock(input: string, tagName: string): string {
  const openTag = `<${tagName.toLowerCase()}>`;
  const closeTag = `</${tagName.toLowerCase()}>`;
  let current = input;
  while (true) {
    const lower = current.toLowerCase();
    const start = lower.indexOf(openTag);
    if (start === -1) break;
    const end = lower.indexOf(closeTag, start + openTag.length);
    if (end === -1) break;
    current = current.slice(0, start) + current.slice(end + closeTag.length);
  }
  return current;
}

/**
 * Strip injected MemCell recall blocks (<memcell_context>, <system-reminder>, and hook context
 * sections) from raw transcript text so recalled memories are never re-distilled by remember.
 */
export function stripInjectedMemcellContext(raw: string): string {
  if (!raw) return "";
  let cleaned = stripTaggedBlock(raw, "memcell_context");
  cleaned = stripTaggedBlock(cleaned, "system-reminder");

  const lines = cleaned.split("\n");
  const out: string[] = [];
  let skippingSection = false;
  let pendingRolePrefix: string | null = null;

  const stripRolePrefix = (s: string): { role: string | null; body: string } => {
    const lower = s.toLowerCase();
    for (const prefix of ["user: ", "assistant: ", "human: "]) {
      if (lower.startsWith(prefix)) {
        return { role: s.slice(0, prefix.length), body: s.slice(prefix.length).trim() };
      }
    }
    return { role: null, body: s };
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const { role, body } = stripRolePrefix(trimmed);
    if (
      body.startsWith("OPERATIONAL GUARDS & INVARIANTS (Enforce strictly") ||
      body.startsWith("From this workspace's memory (") ||
      body.startsWith("ACTIVE / RESUMED SESSION THREAD (") ||
      body.startsWith("PARALLEL WORKSPACE THREADS (Ambient Awareness Only") ||
      body.startsWith("GROUNDED WORKSPACE DOCUMENTS (RAG):") ||
      body.startsWith(
        "You have already gone against these this session — re-read them before continuing:",
      ) ||
      body.startsWith("🚨 OPERATIONAL GUARD TRIGGER REQUIRED:")
    ) {
      skippingSection = true;
      if (role) pendingRolePrefix = role;
      continue;
    }

    if (skippingSection) {
      if (
        trimmed === "" ||
        trimmed.startsWith("- ") ||
        trimmed.startsWith("Specification: ") ||
        trimmed.startsWith("Applies to: ") ||
        trimmed.startsWith("↳ [") ||
        trimmed.startsWith("Do NOT bypass, rationalize around") ||
        trimmed.startsWith("If a required trigger syntax or precondition") ||
        trimmed.startsWith("These carry earned confidence, not certainty.") ||
        trimmed.startsWith("of date, say so rather than working around it.") ||
        trimmed.startsWith("If you believe one no longer applies, say so plainly") ||
        trimmed.startsWith("working around it again (or report with") ||
        trimmed.startsWith("Instruction [") ||
        trimmed.startsWith("The current prompt does NOT contain") ||
        trimmed.startsWith("You MUST HALT and refuse to proceed")
      ) {
        continue;
      }
      skippingSection = false;
    }

    if (pendingRolePrefix && !role && trimmed !== "") {
      out.push(`${pendingRolePrefix}${line}`);
      pendingRolePrefix = null;
    } else {
      if (role) pendingRolePrefix = null;
      out.push(line);
    }
  }

  return out.join("\n").trim();
}

/**
 * Extract clean prompt text from a user message content string without regex.
 * Unwraps <USER_REQUEST>...</USER_REQUEST> tags if present, and removes <ADDITIONAL_METADATA>,
 * <CONTEXT_SUMMARY>, <SYSTEM_MESSAGE>, and <memcell_context> wrappers.
 */
export function cleanUserPrompt(raw: string): string {
  const lower = raw.toLowerCase();
  const openTag = "<user_request>";
  const closeTag = "</user_request>";
  const start = lower.indexOf(openTag);
  if (start !== -1) {
    const end = lower.indexOf(closeTag, start + openTag.length);
    if (end !== -1) {
      const inner = raw.slice(start + openTag.length, end).trim();
      if (inner) return cleanUserPrompt(inner);
    }
  }
  let cleaned = stripTaggedBlock(raw, "context_summary");
  cleaned = stripTaggedBlock(cleaned, "system_message");
  cleaned = stripTaggedBlock(cleaned, "additional_metadata");
  cleaned = stripTaggedBlock(cleaned, "memcell_context");
  cleaned = stripTaggedBlock(cleaned, "system-reminder");
  cleaned = stripTaggedBlock(cleaned, "user_request");
  return cleaned.trim();
}

/**
 * Shared JSONL transcript entry parser for standard message/tool-call records
 * (used across Hermes, Cline, Windsurf, Goose, Droid, Devin, and similar harnesses).
 * Handles string content, content-block arrays (`text`, `tool_use`, `toolCall`, `functionCall`),
 * nested `message` objects, and top-level `tool_call` records without ever serializing objects as `[object Object]`.
 */
export function parseStandardTranscriptEntry(
  raw: unknown,
  options: {
    cwd?: string;
    writeTools: ReadonlySet<string>;
    said: string[];
    touched: string[];
    actions: ThreadAction[];
  },
): void {
  if (!raw || typeof raw !== "object") return;
  const rec = raw as {
    type?: string;
    role?: string;
    content?: unknown;
    text?: string;
    name?: string;
    tool_name?: string;
    input?: Record<string, unknown>;
    tool_input?: Record<string, unknown>;
    args?: Record<string, unknown>;
    message?: {
      role?: string;
      content?: unknown;
      parts?: unknown[];
      toolCalls?: {
        name?: string;
        args?: Record<string, unknown>;
        input?: Record<string, unknown>;
      }[];
      tool_calls?: {
        name?: string;
        args?: Record<string, unknown>;
        input?: Record<string, unknown>;
        function?: { name?: string; arguments?: Record<string, unknown> | string };
      }[];
    };
    toolCalls?: {
      name?: string;
      args?: Record<string, unknown>;
      input?: Record<string, unknown>;
    }[];
    tool_calls?: {
      name?: string;
      args?: Record<string, unknown>;
      input?: Record<string, unknown>;
      function?: { name?: string; arguments?: Record<string, unknown> | string };
    }[];
  };

  const { cwd, writeTools, said, touched, actions } = options;

  if (rec.type === "tool_call" || rec.type === "tool_use") {
    const name = rec.name ?? rec.tool_name ?? "";
    const input = rec.input ?? rec.tool_input ?? rec.args;
    recordToolAction(name, input, { cwd, writeTools, touched, actions });
    return;
  }

  const rawRole =
    rec.role ??
    rec.message?.role ??
    (rec.type === "user" || rec.type === "assistant" ? rec.type : undefined);
  const role =
    rawRole === "user" || rawRole === "human"
      ? "user"
      : rawRole === "assistant" || rawRole === "model" || rawRole === "agent"
        ? "assistant"
        : undefined;

  const content = rec.content ?? rec.message?.content ?? rec.message?.parts;
  const textParts: string[] = [];

  if (typeof content === "string") {
    if (content.trim()) textParts.push(content.trim());
  } else if (Array.isArray(content)) {
    for (const item of content) {
      if (typeof item === "string") {
        if (item.trim()) textParts.push(item.trim());
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const block = item as {
        type?: string;
        text?: string;
        name?: string;
        input?: Record<string, unknown>;
        args?: Record<string, unknown>;
        arguments?: Record<string, unknown>;
        functionCall?: { name?: string; args?: Record<string, unknown> };
      };
      if (
        typeof block.text === "string" &&
        (!block.type ||
          block.type === "text" ||
          block.type === "input_text" ||
          block.type === "output_text")
      ) {
        if (block.text.trim()) textParts.push(block.text.trim());
      }
      if (block.type === "tool_use" || block.type === "toolCall" || block.type === "tool_call") {
        recordToolAction(block.name, block.input ?? block.args ?? block.arguments, {
          cwd,
          writeTools,
          touched,
          actions,
        });
      } else if (block.functionCall) {
        recordToolAction(block.functionCall.name, block.functionCall.args, {
          cwd,
          writeTools,
          touched,
          actions,
        });
      }
    }
  } else if (typeof rec.text === "string" && rec.text.trim()) {
    textParts.push(rec.text.trim());
  }

  if (role && textParts.length > 0) {
    said.push(`${role}: ${textParts.join("\n")}`);
  }

  const allCalls = [
    ...(rec.toolCalls ?? []),
    ...(rec.tool_calls ?? []),
    ...(rec.message?.toolCalls ?? []),
    ...(rec.message?.tool_calls ?? []),
  ];
  for (const call of allCalls) {
    const fn = (
      call as { function?: { name?: string; arguments?: Record<string, unknown> | string } }
    ).function;
    const callName = call.name ?? fn?.name;
    let callArgs: Record<string, unknown> | string | undefined =
      call.args ?? call.input ?? fn?.arguments;
    if (typeof callArgs === "string") {
      try {
        callArgs = JSON.parse(callArgs) as Record<string, unknown>;
      } catch {
        // leave as string (e.g. patch text)
      }
    }
    recordToolAction(callName, callArgs, {
      cwd,
      writeTools,
      touched,
      actions,
    });
  }
}

function extractTextFromBlocks(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c: unknown) => {
      if (typeof c === "string") return c;
      if (typeof c === "object" && c !== null) {
        const obj = c as { text?: unknown; data?: unknown; kind?: string };
        if (typeof obj.text === "string") return obj.text;
        if (obj.kind === "text" && typeof obj.data === "string") return obj.data;
      }
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

/**
 * Extracts a cleaned user prompt string from any supported agent transcript JSONL record.
 */
export function extractUserPromptFromRecord(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as {
    type?: string;
    source?: string;
    role?: string;
    kind?: string;
    content?: unknown;
    message?: { role?: string; content?: unknown; parts?: unknown };
    data?: { content?: unknown };
    payload?: {
      type?: string;
      role?: string;
      content?: unknown;
      message?: string;
      event?: { kind?: string; prompt?: string };
    };
    params?: { update?: { sessionUpdate?: string; content?: { text?: string } | string } };
    update?: { sessionUpdate?: string; content?: { text?: string } | string };
  };

  let rawText = "";

  // 1. Antigravity / generic top-level user message
  if (rec.type === "USER_INPUT" || rec.source === "USER_EXPLICIT" || rec.role === "user") {
    rawText = extractTextFromBlocks(rec.content);
  }
  // 2. Claude Code / Qwen / Windsurf nested message
  if (!rawText && (rec.type === "user" || rec.message?.role === "user")) {
    rawText =
      extractTextFromBlocks(rec.message?.content) ||
      extractTextFromBlocks(rec.message?.parts) ||
      extractTextFromBlocks(rec.content);
  }
  // 3. Codex response_item or event_msg
  if (!rawText && rec.type === "response_item" && rec.payload?.role === "user") {
    rawText = extractTextFromBlocks(rec.payload.content);
  }
  if (!rawText && rec.type === "event_msg" && rec.payload?.type === "user_message") {
    rawText = typeof rec.payload.message === "string" ? rec.payload.message : "";
  }
  // 4. Copilot user.message or Kiro Prompt
  if (!rawText && (rec.type === "user.message" || rec.kind === "Prompt")) {
    rawText = extractTextFromBlocks(rec.data?.content);
  }
  // 5. Grok ACP user_message_chunk
  const update = rec.params?.update ?? rec.update;
  if (!rawText && update?.sessionUpdate === "user_message_chunk") {
    rawText = typeof update.content === "string" ? update.content : (update.content?.text ?? "");
  }
  // 6. Muse started event
  if (!rawText && rec.payload?.event?.kind === "started") {
    rawText = typeof rec.payload.event.prompt === "string" ? rec.payload.event.prompt : "";
  }

  if (!rawText) return null;
  const cleaned = cleanUserPrompt(rawText);
  return cleaned || null;
}

/**
 * Read the most recent user prompt from a session transcript (e.g. JSONL transcript).
 * Looks backward from the end of the file to quickly locate the latest user input.
 */
export async function readLatestUserPrompt(transcriptPath: string): Promise<string | null> {
  try {
    const info = await stat(transcriptPath).catch(() => null);
    if (!info || info.size === 0) return null;

    // Read up to the last 2MB which covers turns with multiple large tool steps
    const CHUNK_SIZE = 2 * 1024 * 1024;
    const start = Math.max(0, info.size - CHUNK_SIZE);
    const stream = createReadStream(transcriptPath, { start, encoding: "utf8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    const lines: string[] = [];
    for await (const line of rl) {
      if (line.trim()) lines.push(line.trim());
    }

    // Inspect from newest to oldest
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line) continue;
      if (
        !line.includes("USER_INPUT") &&
        !line.includes("USER_EXPLICIT") &&
        !line.includes('"user"') &&
        !line.includes("user.message") &&
        !line.includes("user_message") &&
        !line.includes('"Prompt"') &&
        !line.includes('"started"')
      ) {
        continue;
      }
      try {
        const cleaned = extractUserPromptFromRecord(JSON.parse(line));
        if (cleaned) return cleaned;
      } catch {
        // Skip malformed/truncated lines near chunk boundary
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves the intent envelope for recall via a cumulative hierarchical fallback chain (Card 046).
 * If the current prompt is empty or a continuation, it combines the latest turn delta
 * with the most recent substantive user request from the transcript.
 */
export async function readIntentEnvelope(
  transcriptPath?: string,
  currentPrompt?: string,
): Promise<string> {
  const current = cleanUserPrompt(currentPrompt ?? "");
  if (!transcriptPath) return current;

  try {
    const info = await stat(transcriptPath).catch(() => null);
    if (!info || info.size === 0) return current;

    const CHUNK_SIZE = 2 * 1024 * 1024;
    const start = Math.max(0, info.size - CHUNK_SIZE);
    const stream = createReadStream(transcriptPath, { start, encoding: "utf8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    const lines: string[] = [];
    for await (const line of rl) {
      if (line.trim()) lines.push(line.trim());
    }

    let latestPrompt: string | null = current || null;
    let priorSubstantive: string | null = null;

    // Scan backwards from newest to oldest
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line) continue;
      if (
        !line.includes("USER_INPUT") &&
        !line.includes("USER_EXPLICIT") &&
        !line.includes('"user"') &&
        !line.includes("user.message") &&
        !line.includes("user_message") &&
        !line.includes('"Prompt"') &&
        !line.includes('"started"')
      ) {
        continue;
      }
      try {
        const cleaned = extractUserPromptFromRecord(JSON.parse(line));
        if (!cleaned) continue;

        if (!latestPrompt) {
          latestPrompt = cleaned;
        } else if (cleaned !== latestPrompt) {
          // Found a previous distinct prompt — check if it is substantive
          if (cleaned.length >= 25) {
            priorSubstantive = cleaned;
            break;
          }
        }
      } catch {
        // Skip unparseable line
      }
    }

    if (priorSubstantive && latestPrompt && latestPrompt !== priorSubstantive) {
      // If current prompt is relatively short (< 120 chars), preserve active substantive context
      if (latestPrompt.length < 120) {
        return `${priorSubstantive}\n\nUser instruction: ${latestPrompt}`;
      }
    }

    return latestPrompt || current;
  } catch {
    return current;
  }
}
