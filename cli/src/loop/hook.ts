import { actOf } from "./act.js";
import { can } from "../adapters/surface.js";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import {
  evaluatePreAct,
  stageMemoriesFromRecall,
  type RawMemoryInput,
  type RawMemoryRelation,
} from "./pre-act.js";

import { agentKeyForProject } from "../keyring.js";
import { findWorkspace, type Workspace } from "../workspace.js";
import { PIPELINE_PHASES, LEGS, type LifecycleHook, type Moment } from "./moments.js";
import {
  keepSessionCache,
  dropSessionCache,
  log,
  sessionCacheFor,
  type SessionCache,
  type Note,
} from "./session.js";
import { adapterFor } from "../adapters/index.js";
import {
  ACTIONS_CAP,
  readIntentEnvelope,
  readLatestUserPrompt,
  recordToolAction,
  stripInjectedMemcellContext,
  TOUCHED_CAP,
  type ThreadAction,
  type TranscriptDelta,
} from "../adapters/capture.js";
import { detectActiveRuntimeModel } from "../model-detect.js";

// What an installed hook executes — the loop, fired by the harness rather
// than chosen by the model.
//
// THE FIRST AXIOM, above everything: this fails open, always. It runs inside
// somebody's coding session, between them pressing enter and their agent
// answering. If memcell is down, slow, unreachable or wrong, the right
// behaviour is to say nothing and let the session continue. A memory service
// that can break an agent is worse than no memory service, and it only has
// to happen once for the hooks to come out. Every path here exits 0.
//
// THE SECOND AXIOM: the hook ships and connects, it never judges. It hands
// the turn's transcript delta to `remember` and the memory engine distills what was durable;
// it reports an outcome only where the memory itself said the turn
// corroborated a memory. Deciding "was that worth keeping" or "did that
// help" on the client would be guessing with somebody's record.

const WATCHED_MS = 8_000;
const UNWATCHED_MS = 20_000;
const LIVE_CHECKPOINT_MS = 2_500;
const PAYLOAD_TIMEOUT_MS = 60_000;
const HANDOVER_MS = PAYLOAD_TIMEOUT_MS; // Backwards-compatible alias
const SERVED_AT_LIMIT = 12;

interface Incoming {
  prompt?: string;
  transformedPrompt?: string;
  cwd?: string;
  session_id?: string;
  sessionId?: string;
  transcript_path?: string;
  transcriptPath?: string;
  /** The act about to happen, at `before-act`. Every harness names these two
   *  things; only the spelling differs, so both are read. */
  tool_name?: string;
  toolName?: string;
  tool_input?: Record<string, unknown>;
  toolInput?: Record<string, unknown>;
  /** Protojson tool call structure sent by Antigravity and Vertex AI agents */
  toolCall?: { name?: string; args?: Record<string, unknown> };
  model?: string;
  subagent_type?: string;
  subagentType?: string;
  agent_type?: string;
  agentType?: string;
  agent_id?: string;
  agentId?: string;
  agent_transcript_path?: string;
  agentTranscriptPath?: string;
  last_assistant_message?: string;
  lastAssistantMessage?: string;
  task?: string;
  workspace_roots?: string[];
  workspaceRoots?: string[];
  hook_event_name?: string;
  hookEventName?: string;
  error?: string;
  error_message?: string;
  errorMessage?: string;
  failure_type?: string;
  failureType?: string;
  result?: unknown;
}

async function incoming(): Promise<Incoming> {
  if (process.stdin.isTTY) return {};
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8"));
    }
    const text = Buffer.concat(chunks).toString("utf8").trim();
    if (!text) return {};
    const raw = JSON.parse(text) as Incoming & {
      conversationId?: string;
      conversation_id?: string;
      workspacePaths?: string[];
      workspace_roots?: string[];
      workspaceRoots?: string[];
      model?: string;
      subagent_type?: string;
      subagentType?: string;
      agent_type?: string;
      agentType?: string;
      agent_id?: string;
      agentId?: string;
      task?: string;
      hook_event_name?: string;
      hookEventName?: string;
    };
    raw.sessionId ??= raw.conversationId;
    raw.session_id ??= raw.conversation_id;
    const roots = raw.workspacePaths ?? raw.workspace_roots ?? raw.workspaceRoots;
    if (roots && roots.length > 0 && !raw.cwd) {
      raw.cwd = roots[0];
    }
    const subagent = raw.subagent_type ?? raw.subagentType ?? raw.agent_type ?? raw.agentType;
    if (subagent) {
      raw.tool_name ??= "subagent";
      raw.tool_input ??= {
        subagent,
        prompt: raw.prompt ?? raw.task ?? raw.last_assistant_message,
        task: raw.task ?? raw.last_assistant_message,
      };
    }
    if (raw.toolCall) {
      raw.tool_name ??= raw.toolCall.name;
      raw.tool_input ??= raw.toolCall.args;
    }
    return raw;
  } catch {
    return {};
  }
}

export type ProjectWiring =
  | { ok: true; project: Workspace; key: string; agentId?: string }
  | { ok: false; why: string; project?: Workspace };
export type Standing = ProjectWiring; // Backwards-compatible alias

export async function resolveProjectWiring(cwd?: string, program?: string): Promise<ProjectWiring> {
  const found = await findWorkspace(cwd ?? process.cwd());
  if (!found) return { ok: false, why: "not wired · run memcell connect" };

  if (found.project.paused) {
    return {
      ok: false,
      why: "paused · run memcell resume",
      project: found.project,
    };
  }

  const held = await agentKeyForProject(found.project.instance, found.root, program);
  if (!held) {
    return {
      ok: false,
      why: `no key for ${found.project.space} · run memcell connect`,
      project: found.project,
    };
  }
  return { ok: true, project: found.project, key: held.key, agentId: held.agentId };
}
export const standing = resolveProjectWiring; // Backwards-compatible alias

type Answered<T> =
  | { at: "answered"; status: number; body: T }
  | { at: "refused"; status: number; said?: string }
  | null;

/** One call to a loop API endpoint. Null when the instance was never reached. */
export async function apiCall<T>(
  instance: string,
  key: string,
  path: string,
  body: unknown,
  deadlineMs: number,
  session?: string,
  agentId?: string,
  turn?: string,
  model?: string,
): Promise<Answered<T>> {
  const startedAt = Date.now();
  for (const attempt of [1, 2]) {
    const left = deadlineMs - (Date.now() - startedAt);
    if (left <= 0) return null;
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), left);
    try {
      const response = await fetch(`${instance}/api/v1/${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          origin: instance,
          ...(session ? { "x-memcell-session": session } : {}),
          ...(agentId ? { "x-memcell-agent": agentId } : {}),
          "x-memcell-budget": String(deadlineMs),
          ...(turn ? { "x-memcell-turn": turn } : {}),
          ...(model ? { "x-memcell-model": model } : {}),
        },
        body: JSON.stringify(body),
        signal: stop.signal,
      });
      if (!response.ok) {
        const said = await response
          .json()
          .then((b) => (b as { message?: unknown }).message)
          .catch(() => undefined);
        return {
          at: "refused",
          status: response.status,
          ...(typeof said === "string" && said.trim() ? { said: said.trim() } : {}),
        };
      }
      return { at: "answered", status: response.status, body: (await response.json()) as T };
    } catch {
      if (attempt === 2) return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
export const door = apiCall; // Backwards-compatible alias

export const MAX_PAYLOAD_CHARS = 560_000;
export const MAX_HANDOVER_CHARS = MAX_PAYLOAD_CHARS; // Backwards-compatible alias

const refusedForGood = (status: number): boolean =>
  status === 400 || status === 413 || status === 422;

export function formatApiError(answer: Answered<unknown>): string {
  if (answer?.at !== "refused") return "the instance could not be reached";
  return answer.said
    ? `the instance answered ${answer.status} — ${answer.said}`
    : `the instance answered ${answer.status}`;
}
export const doorTrouble = formatApiError; // Backwards-compatible alias

export interface Recalled {
  memoryId: string;
  text: string;
  content?: string | null;
  resources?: string[];
  confidence: number;
  layer: string;
  type?: string;
  enforce?: boolean;
  tags?: string[];
  entities?: string[];
  relations?: RawMemoryRelation[];
  /** The moments this bears on — read, change, record, send, answer. Empty
   *  for knowledge, which is most of a memory. */
  appliesAt?: string[];
  contested?: boolean;
  /** Served because this session already went against it. */
  diverged?: boolean;
  violated?: boolean;
  /** Somebody asked this memory to STOP the act it bears on. */
  refuses?: boolean;
  pinned?: boolean;
  standing?: boolean;
  vouched?: boolean;
  verified?: boolean;
}

export interface RecalledThread {
  id: string;
  externalSessionId?: string | null;
  title: string;
  status: string;
  summary: string;
  currentObjective?: string | null;
  decisions?: string[];
  nextSteps?: string[];
  milestones?: { phase?: string; title?: string; summary: string; timestamp?: string }[];
  resources?: string[];
  entities?: string[];
  turnCount?: number;
}

export interface RecalledDocumentChunk {
  id?: string;
  documentId: string;
  documentTitle: string;
  sourcePath?: string | null;
  sourceUri?: string | null;
  heading?: string | null;
  content: string;
  score?: number;
}

export interface AsContextExtras {
  matchedThread?: RecalledThread | null;
  activeThreads?: RecalledThread[];
  documentChunks?: RecalledDocumentChunk[];
}

/** A memory is treated as an operational guard if it has enforce: true, is explicitly typed as a
 *  guard, tagged with 'guard', flagged as refusing the act, or marked as a standing/pinned action constraint.
 *  Standard instructions, facts, and preferences are NOT guards. */
export function isGuard(r: Recalled): boolean {
  if (r.enforce || r.type === "guard" || r.refuses || r.tags?.includes("guard")) return true;
  if (r.type === "preference" || r.type === "fact") return false;
  if (r.standing || r.pinned || (r.appliesAt && r.appliesAt.length > 0)) return true;
  return false;
}

function collapseWhitespace(input: string): string {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts.join(" ");
}

const HOME_DIR = homedir();

function filterExistingLocalResources(resources: string[] | undefined): string[] {
  if (!resources || resources.length === 0) return [];
  return resources.filter((res) => {
    const trimmed = res?.trim();
    if (!trimmed) return false;
    if (HOME_DIR && trimmed.startsWith(`${HOME_DIR}/`)) {
      return existsSync(trimmed);
    }
    return true;
  });
}

function formatMemoryLine(r: Recalled, prefix = ""): string {
  const lines = [
    `- ${prefix}${r.text}  [id: ${(r.memoryId || "").slice(0, 8)} · ${r.confidence.toFixed(2)} · ${r.layer}${r.contested ? " · contested" : ""}]`,
  ];
  if (r.content && r.content.trim()) {
    lines.push(`  Specification: ${r.content.trim()}`);
  }
  const validResources = filterExistingLocalResources(r.resources);
  if (validResources.length > 0) {
    lines.push(`  Applies to: ${validResources.slice(0, 6).join(", ")}`);
  }
  if (r.relations && r.relations.length > 0) {
    const seenRels = new Set<string>();
    for (const rel of r.relations) {
      const linkedTitle = rel.targetTitle ?? rel.targetMemory?.title ?? rel.sourceMemory?.title;
      const linkedId =
        rel.targetMemoryId ??
        rel.targetMemory?.id ??
        rel.sourceMemory?.id ??
        (rel.sourceId && rel.sourceId !== r.memoryId ? rel.sourceId : rel.targetId) ??
        "";
      if (!linkedTitle || (r.memoryId && linkedId === r.memoryId)) continue;
      const dedupKey = `${rel.relationType}:${linkedId || linkedTitle}`;
      if (seenRels.has(dedupKey)) continue;
      seenRels.add(dedupKey);
      lines.push(
        `  ↳ [${rel.relationType}] ${linkedTitle}${linkedId ? ` [id: ${linkedId.slice(0, 8)}]` : ""}`,
      );
      if (seenRels.size >= 3) break;
    }
  }
  return lines.join("\n");
}

/** Recalled memories, threads, graph edges, and grounded document chunks written for a model's turn. */
export function asContext(
  results: Recalled[],
  space: string,
  _prompt?: string,
  extras?: AsContextExtras,
): string {
  const against = results.filter((r) => r.diverged);
  const rest = results.filter((r) => !r.diverged);
  const guards = rest.filter(isGuard);
  const conventions = rest.filter((r) => !isGuard(r));

  const sections: string[] = [];

  if (extras?.matchedThread) {
    const mt = extras.matchedThread;
    const validThreadResources = filterExistingLocalResources(mt.resources);
    const threadLines = [
      `ACTIVE / RESUMED SESSION THREAD (${mt.title}):`,
      ...(mt.currentObjective ? [`- Objective: ${mt.currentObjective}`] : []),
      ...(mt.summary ? [`- Summary: ${mt.summary}`] : []),
      ...(mt.milestones && mt.milestones.length > 0
        ? [
            `- Completed Milestones: ${mt.milestones
              .slice(-4)
              .map((m) => {
                const phase = m.phase || m.title;
                return phase ? `${phase} (${m.summary})` : m.summary;
              })
              .join(" | ")}`,
          ]
        : []),
      ...(mt.decisions && mt.decisions.length > 0
        ? [`- Settled Decisions: ${mt.decisions.join(" | ")}`]
        : []),
      ...(mt.nextSteps && mt.nextSteps.length > 0
        ? [`- Open Next Steps: ${mt.nextSteps.join(" | ")}`]
        : []),
      ...(validThreadResources.length > 0
        ? [`- Touched Resources: ${validThreadResources.slice(0, 10).join(", ")}`]
        : []),
      "",
    ];
    sections.push(threadLines.join("\n"));
  }

  const parallelThreads = (extras?.activeThreads ?? []).filter(
    (t) => t.id !== extras?.matchedThread?.id,
  );
  if (parallelThreads.length > 0) {
    sections.push(
      [
        "PARALLEL WORKSPACE THREADS (Ambient Awareness Only — do not mix into current task unless asked):",
        ...parallelThreads
          .slice(0, 4)
          .map(
            (t) => `- [${t.title}] ${t.currentObjective || t.summary} (${t.turnCount ?? 1} turns)`,
          ),
        "",
      ].join("\n"),
    );
  }

  if (against.length > 0) {
    sections.push(
      [
        "You have already gone against these this session — re-read them before continuing:",
        ...against.map((r) => formatMemoryLine(r)),
        "",
        "If you believe one no longer applies, say so plainly rather than",
        "working around it again (or report with 'memcell report <id> failed').",
        "",
      ].join("\n"),
    );
  }

  if (guards.length > 0) {
    sections.push(
      [
        "OPERATIONAL GUARDS & INVARIANTS (Enforce strictly — halt or refuse if required triggers/conditions are missing):",
        ...guards.map((r) => formatMemoryLine(r, "[GUARD] ")),
        "",
        "Do NOT bypass, rationalize around, or treat these guards as optional.",
        "If a required trigger syntax or precondition is absent, you must stop and request it.",
        "",
      ].join("\n"),
    );
  }

  if (conventions.length > 0) {
    sections.push(
      [
        `From this workspace's memory (${space}) — already learned here:`,
        ...conventions.map((r) => formatMemoryLine(r)),
        "",
        "These carry earned confidence, not certainty. If one proves wrong or out",
        "of date, say so rather than working around it.",
      ].join("\n"),
    );
  }

  if (extras?.documentChunks && extras.documentChunks.length > 0) {
    sections.push(
      [
        "GROUNDED WORKSPACE DOCUMENTS (RAG):",
        ...extras.documentChunks.slice(0, 4).map((c) => {
          const sourceLabel = c.sourcePath || c.sourceUri || c.documentTitle;
          const headingLabel = c.heading ? ` > ${c.heading}` : "";
          return `- [${sourceLabel}${headingLabel}] ${collapseWhitespace(c.content)}`;
        }),
        "",
      ].join("\n"),
    );
  }

  return sections.join("\n");
}

function mergeUniqueStrings(primary: string[], secondary: string[], cap: number): string[] {
  const out: string[] = [];
  for (const item of [...primary, ...secondary]) {
    if (item && !out.includes(item)) {
      out.push(item);
      if (out.length >= cap) break;
    }
  }
  return out;
}

function mergeUniqueActions(
  primary: ThreadAction[],
  secondary: ThreadAction[],
  cap: number,
): ThreadAction[] {
  const out: ThreadAction[] = [];
  for (const action of [...primary, ...secondary]) {
    if (!action || !action.name) continue;
    const dup = out.some(
      (a) =>
        a.type === action.type &&
        a.name === action.name &&
        a.target === action.target &&
        a.summary === action.summary,
    );
    if (!dup) {
      out.push(action);
      if (out.length >= cap) break;
    }
  }
  return out;
}

function formatActionsForDistillation(
  actions: ThreadAction[],
  touched: string[],
  program: string,
): string {
  const lines: string[] = [`assistant: Executed ${program} session actions:`];
  for (const a of actions.slice(0, 25)) {
    lines.push(
      `- [${a.type}] ${a.name}${a.target ? ` (${a.target})` : ""}: ${a.summary}${a.outcome ? ` -> ${a.outcome}` : ""}`,
    );
  }
  if (touched.length > 0) {
    lines.push(`Modified files: ${touched.join(", ")}`);
  }
  return lines.join("\n");
}

export interface HookResult {
  context?: string;
  /** An instruction somebody asked to stop this act, in its own words. The command
   *  turns it into whatever refusal this harness understands — the reason is
   *  always the instruction itself, so nobody is stopped without being told why. */
  refuse?: string;
  heard: { prompt?: string; transformedPrompt?: string; hookEventName?: string };
}

export async function runMoment(moment: LifecycleHook, program: string): Promise<HookResult> {
  const payload = await incoming();
  const transcriptPath = payload.transcript_path ?? payload.transcriptPath;
  if (
    (moment === "prompt-submit" || moment === "session-start") &&
    !payload.prompt &&
    !payload.transformedPrompt &&
    transcriptPath
  ) {
    const latest = await readLatestUserPrompt(transcriptPath);
    if (latest) {
      payload.prompt = latest;
    }
  }
  const hookEventName = payload.hook_event_name ?? payload.hookEventName;
  const heard = {
    prompt: payload.prompt,
    transformedPrompt: payload.transformedPrompt,
    hookEventName,
  };
  const here = await resolveProjectWiring(payload.cwd, program);

  const agentId = here.ok ? here.agentId : undefined;
  const tag = agentId ? `${moment} ${program} ${agentId}` : `${moment} ${program}`;
  const logEvent = (line: string) => log(line, here.project);
  if (!here.ok) {
    await logEvent(`${tag} · ${here.why}`);
    return moment === "session-start" && !here.why.startsWith("paused")
      ? { heard, context: here.why }
      : { heard };
  }

  const { project, key } = here;
  const session = payload.session_id ?? payload.sessionId;
  const sessionId = session ?? "unknown";
  const note = await sessionCacheFor(sessionId);
  note.space = project.space;

  const runtimeModel =
    detectActiveRuntimeModel(program) ||
    (typeof payload.model === "string" && payload.model.trim()
      ? payload.model.trim()
      : undefined) ||
    note.model;
  if (runtimeModel) note.model = runtimeModel;

  const phases = PIPELINE_PHASES[moment];
  const result: HookResult = { heard };

  const leaving = async (r: HookResult): Promise<HookResult> => {
    await keepSessionCache(sessionId, note);
    return r;
  };

  /**
   * Real-time mid-turn checkpointing: when a live session provides `transcriptPath`
   * during `before-act` or `after-act` and the transcript has advanced with new
   * prose or tool calls, asynchronously queue an incremental checkpoint to `/api/v1/remember`
   * (`async: true`, 202 response in <20ms) so threads and memories stay up-to-date
   * while the turn is actively progressing.
   */
  const shipIncrementalCheckpoint = async (): Promise<void> => {
    if (!transcriptPath) return;
    const adapter = adapterFor(program);
    if (!adapter) return;
    const startedAt = note.read ?? 0;
    const turn = session ? `${session}:${JSON.stringify(startedAt)}` : undefined;
    const delta = await adapter.read(payload, startedAt);
    if (delta.read === startedAt) return;

    const mergedActions = mergeUniqueActions(
      delta.actions ?? [],
      note.pendingActions ?? [],
      ACTIONS_CAP,
    );
    const mergedTouched = mergeUniqueStrings(delta.touched, note.pendingTouched ?? [], TOUCHED_CAP);
    // Mid-turn incremental checkpoints (during before-act / after-act) should only fire
    // when files have actually been modified. Read-only inspection turns wait for turn-end
    // so read-only commands never prematurely spawn "Status Check" threads mid-turn.
    if (mergedTouched.length === 0) return;

    const cleanDeltaText = stripInjectedMemcellContext(delta.text);
    const proseText = cleanDeltaText.trim();
    const rawPayload =
      proseText.length >= 20
        ? cleanDeltaText
        : [proseText, formatActionsForDistillation(mergedActions, mergedTouched, program)]
            .filter(Boolean)
            .join("\n\n");

    if (rawPayload.trim().length < 20) return;

    note.read = delta.read;
    const handed = await apiCall<{ accepted?: boolean }>(
      project.instance,
      key,
      "remember",
      {
        raw:
          rawPayload.length > MAX_PAYLOAD_CHARS ? rawPayload.slice(-MAX_PAYLOAD_CHARS) : rawPayload,
        origin: { title: `${program} session` },
        async: true,
        ...(mergedTouched.length > 0 ? { touched: mergedTouched } : {}),
        ...(mergedActions.length > 0 ? { actions: mergedActions } : {}),
        ...(session ? { sessionId: session } : {}),
      },
      LIVE_CHECKPOINT_MS,
      session,
      agentId,
      turn,
      runtimeModel,
    );

    if (handed?.at === "answered") {
      note.pendingActions = [];
      note.pendingTouched = [];
      await logEvent(`${tag} · checkpoint · incremental activity handed over`);
    } else {
      const forGood = handed?.at === "refused" && refusedForGood(handed.status);
      if (!forGood) note.read = startedAt;
    }
  };

  // ── before an act ─────────────────────────────────────────────────────
  if (moment === "before-act") {
    const tool = payload.tool_name ?? payload.toolName ?? "";
    const toolInput = (payload.tool_input ?? payload.toolInput) as
      Record<string, unknown> | undefined;
    const guard = adapterFor(program)?.surface?.guard;

    if (tool) {
      const pendingActions = note.pendingActions ?? (note.pendingActions = []);
      const pendingTouched = note.pendingTouched ?? (note.pendingTouched = []);
      const writeTools = new Set(guard && can(guard) ? (guard.tools?.change ?? []) : []);
      recordToolAction(tool, toolInput, {
        cwd: payload.cwd,
        writeTools,
        touched: pendingTouched,
        actions: pendingActions,
      });
    }

    if (!tool || !guard || !can(guard)) {
      await shipIncrementalCheckpoint();
      return leaving(result);
    }

    const evalResult = evaluatePreAct({
      tool,
      input: toolInput,
      guard,
      activeMemories: note.activeMemories ?? [],
      firedMap: note.fired,
    });

    if (evalResult.verdict === "pass") {
      await shipIncrementalCheckpoint();
      return leaving(result);
    }

    const pairs = note.servedAt ?? (note.servedAt = []);
    for (const p of evalResult.pairs) {
      if (pairs.length >= SERVED_AT_LIMIT) break;
      if (pairs.some((x) => x.memoryId === p.memoryId && x.act === p.act)) continue;
      pairs.push(p);
    }

    if (evalResult.verdict === "refuse") {
      result.refuse = evalResult.reason;
      await logEvent(
        `${tag} · before-act · ${tool} is ${evalResult.act} · refused · ${result.refuse}`,
      );
      return leaving(result);
    }

    if (evalResult.verdict === "advise") {
      const saidKey = `said:${evalResult.act}`;
      note.fired[saidKey] = Date.now();
      result.context = evalResult.guidance;
      note.pendingGuidance = evalResult.guidance;
      await logEvent(
        `${tag} · before-act · ${tool} is ${evalResult.act} · ${evalResult.bears.length} said`,
      );
      await shipIncrementalCheckpoint();
      return leaving(result);
    }

    await shipIncrementalCheckpoint();
    return leaving(result);
  }

  if (moment === "after-act") {
    const tool = payload.tool_name ?? payload.toolName ?? "";
    const toolInput = (payload.tool_input ?? payload.toolInput) as
      Record<string, unknown> | undefined;
    const errorMessage =
      payload.error_message ?? (payload as { errorMessage?: string }).errorMessage ?? payload.error;
    const failureType = payload.failure_type ?? (payload as { failureType?: string }).failureType;

    if (tool) {
      const guard = adapterFor(program)?.surface?.guard;
      const pendingActions = note.pendingActions ?? (note.pendingActions = []);
      const pendingTouched = note.pendingTouched ?? (note.pendingTouched = []);
      const writeTools = new Set(guard && can(guard) ? (guard.tools?.change ?? []) : []);
      recordToolAction(tool, toolInput, {
        cwd: payload.cwd,
        writeTools,
        touched: pendingTouched,
        actions: pendingActions,
        outcome: errorMessage || failureType ? `failed: ${errorMessage || failureType}` : undefined,
      });
    }

    await shipIncrementalCheckpoint();

    if (note.pendingGuidance) {
      result.context = note.pendingGuidance;
      note.pendingGuidance = null;
      await logEvent(`${tag} · after-act · delivered staged guidance`);
      return leaving(result);
    }

    if (errorMessage || failureType) {
      const reason = errorMessage || failureType || "unknown error";
      await logEvent(`${tag} · after-act · tool failure on ${tool || "action"}: ${reason}`);
      result.context = `Tool execution failed on ${tool || "action"}: ${reason}. Review active instructions before retrying.`;
      return leaving(result);
    }

    return leaving(result);
  }

  // ── recall ────────────────────────────────────────────────────────────
  if (phases.includes("recall")) {
    const rawPrompt = (payload.prompt ?? payload.transformedPrompt ?? "").trim();

    // In multi-step tool loops (e.g. Antigravity PreInvocation) or when SessionStart and
    // prompt-submit fire back-to-back on Turn 1 with the same prompt, skip redundant recall.
    if (
      moment === "prompt-submit" &&
      rawPrompt.length > 0 &&
      note.lastRecalledPrompt === rawPrompt
    ) {
      return leaving(result);
    }

    const intent =
      rawPrompt.length > 0
        ? await readIntentEnvelope(transcriptPath, rawPrompt)
        : `starting work in ${project.space}: the standing decisions, conventions and gotchas here`;

    if (intent) {
      if (rawPrompt.length > 0) {
        note.lastRecalledPrompt = rawPrompt;
      }
      const asked = await apiCall<{
        momentId?: string;
        recallId?: string;
        results?: Recalled[];
        memories?: RawMemoryInput[];
        matchedThread?: RecalledThread | null;
        activeThreads?: RecalledThread[];
        chunks?: RecalledDocumentChunk[];
        documentChunks?: RecalledDocumentChunk[];
        guardMode?: "strict" | "advisory";
        profile?: string | null;
        note?: string;
      }>(
        project.instance,
        key,
        "recall",
        { intent, ...(session ? { sessionId: session } : {}) },
        moment === "prompt-submit" ? WATCHED_MS : UNWATCHED_MS,
        session,
        agentId,
        undefined,
        runtimeModel,
      );
      const answer = asked?.at === "answered" ? asked.body : null;
      if (!answer) {
        await logEvent(`${tag} · recall · ${formatApiError(asked)}`);
      }
      const rawMemories = (answer?.memories ?? answer?.results ?? []) as RawMemoryInput[];
      const guardMode = (answer?.guardMode ?? note.guardMode ?? "strict") as "strict" | "advisory";
      note.guardMode = guardMode;

      const staged = stageMemoriesFromRecall(rawMemories, guardMode);
      if (staged.length > 0) {
        const existing = note.activeMemories ?? [];
        const stagedIds = new Set(staged.map((m) => m.memoryId).filter(Boolean));
        note.activeMemories = [
          ...staged,
          ...existing.filter((m) => !m.memoryId || !stagedIds.has(m.memoryId)),
        ].slice(0, 50);
      }

      const results: Recalled[] = rawMemories.map((r) => {
        const memoryId = (r.id ?? r.memoryId ?? "") as string;
        const text = r.title ? (r.context ? `${r.title}: ${r.context}` : r.title) : (r.text ?? "");
        const isGuardMemory =
          Boolean(r.enforce) ||
          r.type === "guard" ||
          r.tags?.includes("guard") ||
          Boolean(r.refuses);
        return {
          memoryId,
          text,
          ...(r.content ? { content: r.content } : {}),
          ...(Array.isArray(r.resources) && r.resources.length > 0
            ? { resources: r.resources }
            : {}),
          confidence: r.confidence ?? 0.8,
          layer: r.layer ?? (r.tags?.join(", ") || "workspace"),
          type: r.type,
          enforce: Boolean(r.enforce),
          tags: r.tags,
          entities: r.entities,
          relations: r.relations,
          appliesAt: r.appliesAt,
          refuses: guardMode === "strict" ? isGuardMemory : false,
          contested: Boolean(r.contested),
          diverged: Boolean(r.diverged || r.violated),
          violated: Boolean(r.diverged || r.violated),
          vouched: Boolean(r.vouched || r.verified),
          verified: Boolean(r.vouched || r.verified),
        };
      });

      const promptText = heard.prompt ?? heard.transformedPrompt;
      const injectedMemorySet = new Set(note.injectedMemoryIds ?? []);
      const injectedChunkSet = new Set(note.injectedChunkIds ?? []);
      const injectedThreadSet = new Set(note.injectedThreadIds ?? []);

      const hasPriorSessionState =
        injectedMemorySet.size > 0 ||
        injectedThreadSet.size > 0 ||
        injectedChunkSet.size > 0 ||
        (note.read ?? 0) > 0;
      const isMidSessionTurn =
        (moment === "prompt-submit" || moment === "session-start") &&
        Boolean(session) &&
        hasPriorSessionState;
      // Delta-only prompt injection on mid-session turns: skip memories, threads, and chunks
      // already injected earlier in the same session, unless a memory diverged.
      const resultsForContext = isMidSessionTurn
        ? results.filter((r) => {
            if (!r.memoryId) return true;
            if (r.diverged) return true;
            return !injectedMemorySet.has(r.memoryId);
          })
        : results;

      const rawMatchedThread = answer?.matchedThread ?? null;
      const rawActiveThreads = answer?.activeThreads ?? [];
      const rawDocChunks = answer?.chunks ?? answer?.documentChunks ?? [];

      const isSameSessionThread = Boolean(
        session &&
        rawMatchedThread &&
        (rawMatchedThread.externalSessionId === session || rawMatchedThread.id === session),
      );
      if (isSameSessionThread && rawMatchedThread?.id) {
        injectedThreadSet.add(rawMatchedThread.id);
      }

      const chunkKeyOf = (c: RecalledDocumentChunk): string =>
        c.id || `${c.documentId}:${c.heading ?? ""}:${c.content.slice(0, 48)}`;

      const extrasForContext: AsContextExtras = {
        matchedThread:
          rawMatchedThread &&
          !isSameSessionThread &&
          (!isMidSessionTurn || !injectedThreadSet.has(rawMatchedThread.id))
            ? rawMatchedThread
            : null,
        activeThreads: (isMidSessionTurn
          ? rawActiveThreads.filter((t) => !injectedThreadSet.has(t.id))
          : rawActiveThreads
        ).filter((t) => !(session && (t.externalSessionId === session || t.id === session))),
        documentChunks: isMidSessionTurn
          ? rawDocChunks.filter((c) => !injectedChunkSet.has(chunkKeyOf(c)))
          : rawDocChunks,
      };

      const hasExtras =
        Boolean(extrasForContext.matchedThread) ||
        (extrasForContext.activeThreads?.length ?? 0) > 0 ||
        (extrasForContext.documentChunks?.length ?? 0) > 0;

      if (resultsForContext.length > 0 || hasExtras) {
        result.context = asContext(resultsForContext, project.space, promptText, extrasForContext);

        // If the current hook moment cannot directly inject context into the harness
        // (e.g. Cursor's beforeSubmitPrompt), stage the recalled context into pendingGuidance
        // so the very next after-act (postToolUse) delivers it instead of dropping it.
        const adapter = adapterFor(program);
        const spoken = adapter
          ? adapter.speak(moment, result.context, result.heard)
          : result.context;
        if (!spoken) {
          note.pendingGuidance = note.pendingGuidance
            ? `${note.pendingGuidance}\n\n${result.context}`
            : result.context;
        }

        for (const r of resultsForContext) {
          if (r.memoryId) injectedMemorySet.add(r.memoryId);
        }
        if (extrasForContext.matchedThread?.id) {
          injectedThreadSet.add(extrasForContext.matchedThread.id);
        }
        for (const t of extrasForContext.activeThreads ?? []) {
          if (t.id) injectedThreadSet.add(t.id);
        }
        for (const c of extrasForContext.documentChunks ?? []) {
          injectedChunkSet.add(chunkKeyOf(c));
        }

        note.injectedMemoryIds = [...injectedMemorySet].slice(-200);
        note.injectedThreadIds = [...injectedThreadSet].slice(-50);
        note.injectedChunkIds = [...injectedChunkSet].slice(-200);
      } else if (isSameSessionThread) {
        note.injectedThreadIds = [...injectedThreadSet].slice(-50);
      } else if (moment === "session-start" && answer?.note) {
        result.context = answer.note;
      }
      if (answer) {
        await logEvent(
          `${tag} · recall · ${resultsForContext.length} served${
            results.length > resultsForContext.length
              ? ` (${results.length - resultsForContext.length} already in session)`
              : ""
          }${answer.note ? ` · ${answer.note}` : ""}`,
        );
      }
    } else {
      await logEvent(`${tag} · recall · nothing to ask`);
    }
  }

  // ── remember, and the report the memory's own answer justifies ─────────
  if (phases.includes("remember")) {
    note.lastRecalledPrompt = null;
    const turn = session ? `${session}:${JSON.stringify(note.read ?? 0)}` : undefined;
    const transcriptDelta: TranscriptDelta = (await adapterFor(program)?.read(
      payload,
      note.read,
    )) ?? {
      text: "",
      touched: [],
      read: note.read,
    };
    const advanced = transcriptDelta.read !== note.read;
    const startedAt = note.read;
    note.read = transcriptDelta.read;

    const mergedActions = mergeUniqueActions(
      transcriptDelta.actions ?? [],
      note.pendingActions ?? [],
      ACTIONS_CAP,
    );
    const mergedTouched = mergeUniqueStrings(
      transcriptDelta.touched,
      note.pendingTouched ?? [],
      TOUCHED_CAP,
    );

    const cleanTranscriptText = stripInjectedMemcellContext(transcriptDelta.text);
    const proseText = cleanTranscriptText.trim();
    const rawPayload =
      proseText.length >= 20
        ? cleanTranscriptText
        : mergedActions.length > 0 || mergedTouched.length > 0
          ? [proseText, formatActionsForDistillation(mergedActions, mergedTouched, program)]
              .filter(Boolean)
              .join("\n\n")
          : cleanTranscriptText;

    const enough = rawPayload.trim().length >= 20;

    if (enough && !advanced) {
      await logEvent(
        `${tag} · remember · read returned transcript delta without advancing — held back`,
      );
    } else if (enough) {
      const hasServedAt = (note.servedAt ?? []).length > 0;
      const handed = await apiCall<{
        accepted?: boolean;
        created?: { memoryId?: string; id?: string }[];
        reinforced?: { memoryId?: string; id?: string }[];
        attributed?: { memoryId?: string; id?: string; outcome: "worked" | "failed" }[];
        diverged?: { memoryId?: string; id?: string; text: string }[];
        superseded?: {
          memoryId?: string;
          id?: string;
          byMemoryId?: string;
        }[];
        note?: string;
      }>(
        project.instance,
        key,
        "remember",
        {
          raw:
            rawPayload.length > MAX_PAYLOAD_CHARS
              ? rawPayload.slice(-MAX_PAYLOAD_CHARS)
              : rawPayload,
          origin: { title: `${program} session` },
          ...(hasServedAt ? { served_at: note.servedAt } : { async: true }),
          ...(mergedTouched.length > 0 ? { touched: mergedTouched } : {}),
          ...(mergedActions.length > 0 ? { actions: mergedActions } : {}),
          ...(session ? { sessionId: session } : {}),
        },
        PAYLOAD_TIMEOUT_MS,
        session,
        agentId,
        turn,
        runtimeModel,
      );
      const kept = handed?.at === "answered" ? handed.body : null;
      if (kept) {
        note.servedAt = [];
        note.pendingActions = [];
        note.pendingTouched = [];
      }
      const queued =
        handed?.at === "answered" && (handed.status === 202 || !Array.isArray(kept?.created));
      if (kept && queued) {
        await logEvent(`${tag} · remember · handed over${kept.note ? ` · ${kept.note}` : ""}`);
      } else if (kept && Array.isArray(kept.created)) {
        const created = kept.created.length;
        const reinforced = kept.reinforced ?? [];
        const superseded = kept.superseded?.length ?? 0;
        await logEvent(
          `${tag} · remember · ${created} kept, ${reinforced.length} reinforced${superseded > 0 ? `, ${superseded} superseded` : ""}${kept.note ? ` · ${kept.note}` : ""}`,
        );
      } else {
        const forGood = handed?.at === "refused" && refusedForGood(handed.status);
        if (!forGood) note.read = startedAt;
        await logEvent(
          forGood
            ? `${tag} · remember · ${formatApiError(handed as Answered<unknown>)} — this turn was refused and is not worth re-sending; moving past it`
            : handed?.at === "refused"
              ? `${tag} · remember · ${formatApiError(handed)} — not captured, holding this turn for the next firing`
              : `${tag} · remember · ${formatApiError(handed)} — no answer, holding this turn for the next firing`,
        );
      }

      // ── report ───────────────────────────────────────────────────────
      if (phases.includes("report")) {
        if (queued) {
          // The judge runs where the reading runs.
        } else if (kept) {
          const attributed = kept.attributed ?? [];
          if (attributed.length > 0) {
            const worked = attributed.filter((a) => a.outcome === "worked").length;
            const failed = attributed.length - worked;
            await logEvent(
              `${tag} · report · ${worked} worked${failed ? `, ${failed} failed` : ""}`,
            );
          } else {
            await logEvent(`${tag} · report · nothing the session bore on`);
          }
          const against = kept.diverged ?? [];
          if (against.length > 0) {
            await logEvent(
              `${tag} · report · went against ${against.length}, re-asserting next turn`,
            );
          }
        } else {
          await logEvent(`${tag} · report · not asked — the payload delivery did not land`);
        }
      }
    } else if (
      advanced &&
      transcriptDelta.read - startedAt >= 1024 &&
      proseText.length === 0 &&
      mergedActions.length === 0 &&
      mergedTouched.length === 0
    ) {
      await logEvent(
        `${tag} · remember · ! transcript schema drift suspected: record advanced by ${transcriptDelta.read - startedAt} (${startedAt} -> ${transcriptDelta.read}) but 0 messages or actions were parsed`,
      );
    } else {
      await logEvent(`${tag} · remember · nothing new to hand over`);
    }
  }

  if (moment === "session-end") await dropSessionCache(sessionId);
  else await keepSessionCache(sessionId, note);

  return result;
}
