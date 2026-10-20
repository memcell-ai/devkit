import { patchPaths, pathOf } from "../adapters/capture.js";
import type { Guard, ActClass } from "../adapters/surface.js";
import { actsOf } from "./act.js";
import type { ActiveMemory } from "./session.js";

const VALID_ACTS: ActClass[] = ["read", "change", "record", "send", "answer"];

export function isActClass(val: string): val is ActClass {
  return VALID_ACTS.includes(val as ActClass);
}

export interface RawMemoryRelation {
  id?: string;
  sourceId?: string;
  targetId?: string;
  relationType: string;
  direction?: "outgoing" | "incoming";
  targetMemoryId?: string;
  targetTitle?: string;
  targetType?: string;
  targetMemory?: { id: string; title: string; type?: string };
  sourceMemory?: { id: string; title: string; type?: string };
}

export interface RawMemoryInput {
  id?: string;
  memoryId?: string;
  title?: string;
  text?: string;
  content?: string | null;
  context?: string | null;
  observation?: string | null;
  resources?: string[];
  enforce?: boolean;
  tags?: string[];
  entities?: string[];
  relations?: RawMemoryRelation[];
  confidence?: number;
  stability?: number;
  reinforcementCount?: number;
  appliesAt?: string[];
  refuses?: boolean;
  type?: string;
  layer?: string;
  contested?: boolean;
  diverged?: boolean;
  violated?: boolean;
  vouched?: boolean;
  verified?: boolean;
}

/**
 * Normalizes memories from recall
 * and stages memories bearing on actions for pre-act gating.
 */
export function stageMemoriesFromRecall(
  memories: RawMemoryInput[],
  guardMode: "strict" | "advisory" = "strict",
): ActiveMemory[] {
  const staged: ActiveMemory[] = [];

  for (const mem of memories) {
    const memoryId = mem.id ?? mem.memoryId;
    if (!memoryId) continue;

    const title = mem.title ?? mem.text ?? "";
    const context = mem.context ?? "";
    const text = mem.title ? (context ? `${mem.title}: ${context}` : mem.title) : (mem.text ?? "");
    const tags = Array.isArray(mem.tags) ? mem.tags.map((t) => t.toLowerCase()) : [];

    // 1. Determine if this memory is a Hard Guard vs. Instruction vs. Decision vs. Convention
    const isGuard =
      mem.type === "guard" ||
      tags.includes("guard") ||
      tags.includes("security") ||
      mem.refuses === true;

    const isInstruction = mem.type === "instruction" || mem.enforce === true;
    const isDecision = mem.type === "decision";

    const isConvention =
      mem.type === "preference" ||
      tags.includes("convention") ||
      tags.includes("style") ||
      tags.includes("guideline");

    // 2. Determine target ActClasses (appliesAt)
    let appliesAt: ActClass[] = [];

    // Check explicit appliesAt field
    if (Array.isArray(mem.appliesAt) && mem.appliesAt.length > 0) {
      appliesAt = mem.appliesAt.filter(isActClass);
    }

    // Check tags for act classes (e.g. #change, #send, #read, #record, #answer)
    const actsFromTags = tags.filter(isActClass);
    if (actsFromTags.length > 0) {
      appliesAt = Array.from(new Set([...appliesAt, ...actsFromTags]));
    }

    // If no explicit acts declared, apply intelligent defaults based on memory category
    if (appliesAt.length === 0) {
      if (isGuard) {
        // Guard defaults to modifying / durable / external acts
        appliesAt = ["change", "record", "send"];
      } else if (isInstruction || isDecision || isConvention) {
        // Instructions, decisions, and conventions default to modifications and records
        appliesAt = ["change", "record"];
      }
    }

    // If memory doesn't bear on any acts, it's general knowledge and not staged for tool-time
    if (appliesAt.length === 0) {
      continue;
    }

    // 3. Determine refusal behavior based on guardMode:
    // A memory is a hard refusal gate ONLY if it is a Guard (type === 'guard', #guard tag, or mem.refuses === true)
    // AND guardMode is "strict".
    // In "advisory" mode, guards degrade to soft advisories (refuses: false).
    // Instructions, decisions, conventions, and other memories are ALWAYS soft advisories (refuses: false).
    const refuses = isGuard && guardMode === "strict";

    staged.push({
      memoryId,
      title: mem.title ?? title,
      text,
      ...(mem.content ? { content: mem.content } : {}),
      ...(Array.isArray(mem.resources) && mem.resources.length > 0
        ? { resources: mem.resources }
        : {}),
      tags,
      appliesAt,
      refuses,
    });
  }

  return staged;
}

export interface PreActOptions {
  tool: string;
  input: Record<string, unknown> | undefined;
  guard: Guard;
  activeMemories?: ActiveMemory[];
  firedMap?: Record<string, number>;
}

export type PreActResult =
  | { verdict: "pass" }
  | {
      verdict: "refuse";
      act: ActClass;
      reason: string;
      stops: ActiveMemory[];
      pairs: { memoryId: string; act: string; tool: string; became: string }[];
    }
  | {
      verdict: "advise";
      act: ActClass;
      guidance: string;
      bears: ActiveMemory[];
      pairs: { memoryId: string; act: string; tool: string; became: string }[];
    };

function extractTargetResource(input: Record<string, unknown> | undefined): string | null {
  if (!input) return null;
  const direct = pathOf(input);
  if (direct) return direct.toLowerCase();

  if (typeof input.file === "string" && input.file.trim()) {
    return input.file.trim().toLowerCase();
  }

  const patch =
    typeof input.patch === "string"
      ? input.patch
      : typeof input.input === "string"
        ? input.input
        : "";
  if (patch) {
    const patched = patchPaths(patch);
    if (patched.length > 0) {
      return patched.join(" ").toLowerCase();
    }
  }

  for (const key of ["command", "CommandLine", "commandLine", "cmd", "script"]) {
    const val = input[key];
    if (typeof val === "string" && val.trim()) {
      return val.trim().toLowerCase();
    }
  }
  return null;
}

function matchesResourceScope(mem: ActiveMemory, targetResource: string | null): boolean {
  if (!targetResource || !Array.isArray(mem.resources) || mem.resources.length === 0) {
    return true;
  }
  return mem.resources.some((res) => {
    const lower = res.toLowerCase().trim();
    if (!lower) return false;
    const baseName = lower.split("/").pop() || lower;
    return (
      targetResource.includes(lower) ||
      (targetResource.length >= 4 && lower.includes(targetResource)) ||
      (baseName.length >= 4 && targetResource.includes(baseName))
    );
  });
}

function matchesMultiActMemory(mem: ActiveMemory, targetResource: string | null): boolean {
  if (!targetResource || !Array.isArray(mem.resources) || mem.resources.length === 0) {
    return false;
  }
  return matchesResourceScope(mem, targetResource);
}

function formatAdvisoryLine(r: ActiveMemory): string {
  const lines = [`· ${r.text || r.title}`];
  if (r.content && r.content.trim()) {
    lines.push(`  Specification: ${r.content.trim()}`);
  }
  if (Array.isArray(r.resources) && r.resources.length > 0) {
    lines.push(`  Applies to: ${r.resources.slice(0, 5).join(", ")}`);
  }
  return lines.join("\n");
}

const ACT_PRIORITY: ActClass[] = ["send", "record", "change", "answer", "read"];

/**
 * Fast in-memory Pre-Act Guard evaluator (< 1ms).
 * Decides whether to refuse, advise, or pass before a tool call.
 */
export function evaluatePreAct(options: PreActOptions): PreActResult {
  const { tool, input, guard, firedMap = {} } = options;
  const memories = options.activeMemories ?? [];

  if (!tool || !guard) {
    return { verdict: "pass" };
  }

  const candidateActs = actsOf(tool, guard);
  if (candidateActs.length === 0) {
    return { verdict: "pass" };
  }

  const targetResource = extractTargetResource(input);
  const isSingleActTool = candidateActs.length === 1;

  const bears = memories.filter((r) => {
    const sharesAct = r.appliesAt.some((a) => candidateActs.includes(a as ActClass));
    if (!sharesAct) return false;
    return isSingleActTool
      ? matchesResourceScope(r, targetResource)
      : matchesMultiActMemory(r, targetResource);
  });

  if (bears.length === 0) {
    return { verdict: "pass" };
  }

  const act: ActClass = isSingleActTool
    ? candidateActs[0]!
    : (ACT_PRIORITY.find(
        (candidate) =>
          candidateActs.includes(candidate) && bears.some((r) => r.appliesAt.includes(candidate)),
      ) ?? candidateActs[0]!);

  // 1. Check for hard refusals (Hard Gates)
  // On file edits ('change'), a generic 3-act default guard without a specific 'change' target
  // advises rather than blindly blocking all file edits; on 'record'/'send' or explicit 'change' guards, it refuses.
  const stops = bears.filter((r) => {
    if (!r.refuses) return false;
    if (
      act === "change" &&
      r.appliesAt.length === 3 &&
      r.appliesAt.includes("change") &&
      r.appliesAt.includes("record") &&
      r.appliesAt.includes("send") &&
      (!r.resources || r.resources.length === 0)
    ) {
      return false;
    }
    return true;
  });

  if (stops.length > 0) {
    const reason = stops.map((r) => r.text || r.title).join(" · ");
    const pairs = stops.map((r) => ({
      memoryId: r.memoryId,
      act,
      tool,
      became: "refused",
    }));

    return {
      verdict: "refuse",
      act,
      reason,
      stops,
      pairs,
    };
  }

  // 2. Soft Guidance (Advisories)
  // Check if already fired for this act in this session (avoid spamming every edit/command)
  const saidKey = `said:${act}`;
  if (firedMap[saidKey]) {
    return { verdict: "pass" };
  }

  const guidance = [
    `memcell — standing here, for what you are about to do:`,
    ...bears.map((r) => formatAdvisoryLine(r)),
  ].join("\n");

  const pairs = bears.map((r) => ({
    memoryId: r.memoryId,
    act,
    tool,
    became: "served",
  }));

  return {
    verdict: "advise",
    act,
    guidance,
    bears,
    pairs,
  };
}
