import { MemCell } from "@memcell/sdk";
import {
  cosineSimilarity,
  type BenchmarkFeedbackEvent,
  type BenchmarkMemorySeed,
  type BenchmarkProbe,
} from "./dataset.js";

export interface ProbeEvaluation {
  probeId: string;
  selectedMemoryId: string | null;
  passed: boolean;
  poisonedServed: boolean;
  latencyMs: number;
}

export interface BenchmarkArm {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  resetEpisode(): Promise<void> | void;
  ingest(seeds: readonly BenchmarkMemorySeed[]): Promise<void> | void;
  feedback(events: readonly BenchmarkFeedbackEvent[]): Promise<void> | void;
  evaluate(probe: BenchmarkProbe): Promise<ProbeEvaluation> | ProbeEvaluation;
}

/**
 * Arm 1: Append-Only Markdown (`MEMORY.md` / static wiki file)
 *
 * Appends learned notes into a local file loaded into the system prompt window
 * (bounded to the 6 most recent entries). Has no runtime confidence demotion,
 * no user-scope quarantine when auto-appending, and is unavailable to remote
 * cloud worker harnesses without local filesystem access.
 */
export class AppendOnlyMarkdownArm implements BenchmarkArm {
  readonly id = "append_only_markdown";
  readonly name = "Append-Only Markdown";
  readonly tagline = "Flat file prompt dump (MEMORY.md / wiki)";

  private entries: BenchmarkMemorySeed[] = [];
  private readonly maxPromptWindowEntries = 6;

  resetEpisode(): void {
    this.entries = [];
  }

  ingest(seeds: readonly BenchmarkMemorySeed[]): void {
    for (const seed of seeds) {
      if (seed.allowMarkdownAppend) {
        this.entries.push({ ...seed });
      }
    }
  }

  feedback(_events: readonly BenchmarkFeedbackEvent[]): void {
    // Static Markdown files do not automatically demote or refute entries from runtime telemetry.
  }

  evaluate(probe: BenchmarkProbe): ProbeEvaluation {
    const start = performance.now();
    if (probe.remoteWorker) {
      return {
        probeId: probe.id,
        selectedMemoryId: null,
        passed: false,
        poisonedServed: false,
        latencyMs: performance.now() - start,
      };
    }

    const windowSlice = this.entries.slice(-this.maxPromptWindowEntries);
    if (windowSlice.length === 0) {
      return {
        probeId: probe.id,
        selectedMemoryId: null,
        passed: false,
        poisonedServed: false,
        latencyMs: performance.now() - start,
      };
    }

    // Latest matching entry in the prompt window takes precedence (recency bias in flat files)
    let best: BenchmarkMemorySeed | null = null;
    let bestSim = -1;
    for (let i = windowSlice.length - 1; i >= 0; i--) {
      const candidate = windowSlice[i]!;
      if (candidate.isRawToolNoise) continue;
      const sim = cosineSimilarity(probe.queryEmbedding, candidate.embedding);
      if (sim > bestSim + 0.05) {
        bestSim = sim;
        best = candidate;
      }
    }

    const selectedId = best?.id ?? null;
    return {
      probeId: probe.id,
      selectedMemoryId: selectedId,
      passed: selectedId === probe.expectedMemoryId,
      poisonedServed: Boolean(best?.isPoisoned),
      latencyMs: performance.now() - start,
    };
  }
}

/**
 * Arm 2: Naive Vector Store (Top-K Cosine Chunk Retrieval)
 *
 * Indexes every turn and chunk into a single shared vector index and ranks
 * purely by cosine similarity (threshold 0.75), without outcome confidence
 * updates, user-scope quarantine, turn compaction, or pre-action guard attributes.
 */
export class NaiveVectorStoreArm implements BenchmarkArm {
  readonly id = "naive_vector_store";
  readonly name = "Naive Vector Store";
  readonly tagline = "Top-K cosine chunk retrieval without governance";

  private store: BenchmarkMemorySeed[] = [];

  resetEpisode(): void {
    this.store = [];
  }

  ingest(seeds: readonly BenchmarkMemorySeed[]): void {
    for (const seed of seeds) {
      this.store.push({ ...seed });
    }
  }

  feedback(_events: readonly BenchmarkFeedbackEvent[]): void {
    // Standard vector stores have no outcome feedback loop.
  }

  evaluate(probe: BenchmarkProbe): ProbeEvaluation {
    const start = performance.now();
    let best: BenchmarkMemorySeed | null = null;
    let bestScore = 0.75;

    for (const item of this.store) {
      const score = cosineSimilarity(probe.queryEmbedding, item.embedding);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }

    const selectedId = best?.id ?? null;
    return {
      probeId: probe.id,
      selectedMemoryId: selectedId,
      passed: selectedId === probe.expectedMemoryId,
      poisonedServed: Boolean(best?.isPoisoned),
      latencyMs: performance.now() - start,
    };
  }
}

/**
 * Arm 3: Single-Vendor Siloed Memory
 *
 * Built-in chat memory locked inside a single model provider's ecosystem.
 * Isolates private 1:1 chats in some flows, applies only weak heuristic
 * down-weighting on negative chat turns, and provides 0% continuity when a
 * workflow hands off to an agent running on a different model vendor.
 */
export class SingleVendorSiloArm implements BenchmarkArm {
  readonly id = "single_vendor_silo";
  readonly name = "Single-Vendor Siloed Memory";
  readonly tagline = "Built-in model-vendor chat memory";

  private byVendor = new Map<
    string,
    Array<BenchmarkMemorySeed & { penalty: number }>
  >();

  resetEpisode(): void {
    this.byVendor.clear();
  }

  ingest(seeds: readonly BenchmarkMemorySeed[]): void {
    for (const seed of seeds) {
      if (seed.isRawToolNoise) continue;
      const list = this.byVendor.get(seed.vendor) ?? [];
      list.push({ ...seed, penalty: 1.0 });
      this.byVendor.set(seed.vendor, list);
    }
  }

  feedback(events: readonly BenchmarkFeedbackEvent[]): void {
    const failedIds = new Set(
      events.filter((e) => e.outcome === "failed").map((e) => e.memoryId),
    );
    for (const list of this.byVendor.values()) {
      for (const item of list) {
        if (failedIds.has(item.id)) {
          item.penalty = 0.97;
        }
      }
    }
  }

  evaluate(probe: BenchmarkProbe): ProbeEvaluation {
    const start = performance.now();
    const vendorItems = this.byVendor.get(probe.callerVendor) ?? [];
    let best: (BenchmarkMemorySeed & { penalty: number }) | null = null;
    let bestScore = 0.75;

    for (const item of vendorItems) {
      if (item.isolatedVendorChat && item.userId !== probe.callerUserId) {
        continue;
      }
      if (probe.actionClass && item.enforce && !probe.remoteWorker) {
        return {
          probeId: probe.id,
          selectedMemoryId: item.id,
          passed: item.id === probe.expectedMemoryId,
          poisonedServed: Boolean(item.isPoisoned),
          latencyMs: performance.now() - start,
        };
      }
      const score =
        cosineSimilarity(probe.queryEmbedding, item.embedding) * item.penalty;
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }

    const selectedId = best?.id ?? null;
    return {
      probeId: probe.id,
      selectedMemoryId: selectedId,
      passed: selectedId === probe.expectedMemoryId,
      poisonedServed: Boolean(best?.isPoisoned),
      latencyMs: performance.now() - start,
    };
  }
}

/**
 * Arm 4: MemCell Governed Memory
 *
 * Vendor-neutral shared memory engine with:
 * 1. Scope isolation (`scope: "user"` quarantined to author until promoted)
 * 2. Provisional status gating (`status: "provisional"` excluded from shared defaults)
 * 3. Outcome-calibrated confidence updates (`worked` reinforces, `failed` demotes/refutes)
 * 4. Compacted thread handoff (ignores raw uncompacted tool-output noise)
 * 5. Deterministic `<1ms` pre-action boundary enforcement (`enforce: true` + `appliesAt`)
 */
export class MemCellGovernedArm implements BenchmarkArm {
  readonly id = "memcell_governed";
  readonly name = "MemCell Governed Memory";
  readonly tagline = "Outcome-verified + scope gates + <1ms guards";

  private memories = new Map<string, BenchmarkMemorySeed>();

  resetEpisode(): void {
    this.memories.clear();
  }

  ingest(seeds: readonly BenchmarkMemorySeed[]): void {
    for (const seed of seeds) {
      if (seed.isRawToolNoise) {
        // MemCell compacts turns into structured milestones instead of indexing raw tool logs.
        continue;
      }
      this.memories.set(seed.id, { ...seed });
    }
  }

  feedback(events: readonly BenchmarkFeedbackEvent[]): void {
    for (const ev of events) {
      const target = this.memories.get(ev.memoryId);
      if (!target) continue;
      if (ev.outcome === "worked") {
        const nextConf = Math.min(
          0.99,
          target.confidence + (1 - target.confidence) * 0.35,
        );
        this.memories.set(ev.memoryId, {
          ...target,
          confidence: nextConf,
          status: target.status === "provisional" ? "active" : target.status,
        });
      } else {
        const nextConf = target.confidence * 0.42;
        this.memories.set(ev.memoryId, {
          ...target,
          confidence: nextConf,
          status: nextConf < 0.45 ? "refuted" : target.status,
        });
      }
    }
  }

  evaluate(probe: BenchmarkProbe): ProbeEvaluation {
    const start = performance.now();

    // 1. Deterministic <1ms pre-action guard check for side-effecting action classes
    if (probe.actionClass) {
      for (const mem of this.memories.values()) {
        if (mem.status === "refuted") continue;
        if (mem.scope === "user" && mem.userId !== probe.callerUserId) continue;
        if (mem.enforce && mem.appliesAt.includes(probe.actionClass)) {
          return {
            probeId: probe.id,
            selectedMemoryId: mem.id,
            passed: mem.id === probe.expectedMemoryId,
            poisonedServed: Boolean(mem.isPoisoned),
            latencyMs: performance.now() - start,
          };
        }
      }
    }

    // 2. Hybrid semantic + outcome-calibrated confidence ranking with scope & provisional gates
    let best: BenchmarkMemorySeed | null = null;
    let bestScore = 0;

    for (const mem of this.memories.values()) {
      if (mem.status === "refuted") continue;
      if (mem.status === "provisional") continue;
      if (mem.scope === "user" && mem.userId !== probe.callerUserId) continue;

      const sim = cosineSimilarity(probe.queryEmbedding, mem.embedding);
      if (sim < 0.5) continue;

      const score = sim * mem.confidence;
      if (score > bestScore) {
        bestScore = score;
        best = mem;
      }
    }

    const selectedId = best?.id ?? null;
    return {
      probeId: probe.id,
      selectedMemoryId: selectedId,
      passed: selectedId === probe.expectedMemoryId,
      poisonedServed: Boolean(best?.isPoisoned),
      latencyMs: performance.now() - start,
    };
  }
}

/**
 * Optional Live Workspace Arm (`--live`)
 *
 * Executes benchmark probes against a live MemCell workspace via `@memcell/sdk`
 * when `MEMCELL_API_KEY` and `MEMCELL_WORKSPACE` are provided.
 */
export class MemCellLiveApiArm implements BenchmarkArm {
  readonly id = "memcell_live_api";
  readonly name = "MemCell Live Workspace API";
  readonly tagline = "End-to-end live SDK verification";

  private readonly client: MemCell;
  private readonly namespace: string;
  private idMap = new Map<string, string>();
  private createdRemoteIds: string[] = [];

  constructor(options: {
    apiKey: string;
    namespace: string;
    baseUrl?: string;
  }) {
    this.client = new MemCell({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    });
    this.namespace = options.namespace;
  }

  async resetEpisode(): Promise<void> {
    const scoped = this.client.scope(this.namespace);
    for (const remoteId of this.createdRemoteIds) {
      await scoped.memories.delete(remoteId).catch(() => undefined);
    }
    this.idMap.clear();
    this.createdRemoteIds = [];
  }

  async ingest(seeds: readonly BenchmarkMemorySeed[]): Promise<void> {
    const scoped = this.client.scope(this.namespace);
    for (const seed of seeds) {
      if (seed.isRawToolNoise) continue;
      const created = await scoped.memories.create({
        title: seed.title,
        content: seed.content,
        type: seed.type,
        scope: seed.scope,
        status: seed.status === "refuted" ? "decayed" : seed.status,
        enforce: seed.enforce,
        confidence: seed.confidence,
        tags: ["benchmark", seed.domain],
      });
      this.idMap.set(seed.id, created.id);
      this.createdRemoteIds.push(created.id);
    }
  }

  async feedback(events: readonly BenchmarkFeedbackEvent[]): Promise<void> {
    const scoped = this.client.scope(this.namespace);
    for (const ev of events) {
      const remoteId = this.idMap.get(ev.memoryId);
      if (!remoteId) continue;
      await scoped.feedback({
        memoryId: remoteId,
        outcome: ev.outcome,
        reason: ev.reason,
      });
    }
  }

  async evaluate(probe: BenchmarkProbe): Promise<ProbeEvaluation> {
    const start = performance.now();
    const scoped = this.client.scope(this.namespace);
    const res = await scoped.recall({
      query: probe.queryText,
      limit: 3,
      tags: ["benchmark", probe.domain],
    });
    const topRemoteId = res.memories[0]?.id ?? null;
    let matchedSeedId: string | null = null;
    for (const [seedId, remoteId] of this.idMap.entries()) {
      if (remoteId === topRemoteId) {
        matchedSeedId = seedId;
        break;
      }
    }
    return {
      probeId: probe.id,
      selectedMemoryId: matchedSeedId,
      passed: matchedSeedId === probe.expectedMemoryId,
      poisonedServed: false,
      latencyMs: performance.now() - start,
    };
  }
}
