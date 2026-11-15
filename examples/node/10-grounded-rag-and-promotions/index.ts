import { MemCell } from "@memcell/sdk";
import { createLangGraphMemoryNodes } from "@memcell/sdk/langgraph";
import { runWithOpenAIMemory } from "@memcell/sdk/openai";

const token = process.env.MEMCELL_TOKEN || "mc_pat_mock_demo";
const instance = process.env.MEMCELL_URL || "http://localhost:3000";
const namespace = process.env.MEMCELL_WORKSPACE || "acme/platform-governance";

const client = new MemCell({ token, baseUrl: instance });
const platform = client.scope(namespace, { subject: "canary-release-governance" });

const SRE_RUNBOOK_MARKDOWN = `# Production Canary Release Runbook

## 1. Canary Traffic Ramp
All production service deployments must route 5% canary traffic for at least 15 minutes before global rollout.

## 2. Error-Budget Gate
Require canary verification and zero error-budget burn before global rollout. Any p99 latency regression over 20% triggers immediate rollback.`;

async function main() {
  console.log(
    "=== Grounded RAG Documents + 4-Tier Governance Promotions + Consolidation ===\n",
  );

  // 1. Ingest a Markdown runbook into grounded RAG + distill atomic instructions
  console.log(
    "1. [Knowledge Ingestion] Ingesting SRE Runbook with distill=true...",
  );
  const ingested = await platform.documents.ingest({
    title: "Production Canary Release Runbook",
    filename: "canary-runbook.md",
    content: SRE_RUNBOOK_MARKDOWN,
    distill: true,
  });
  console.log(
    `   [OK] Document [${ingested.document.id}] indexed into ${ingested.chunkCount} grounded chunk(s) and distilled ${ingested.memoriesCreated} enforced memory(s).\n`,
  );

  // 2. Worker Subagent (LangGraph Node) discovers a tactical optimization in `user` scope
  console.log(
    "2. [Worker Subagent — LangGraph] Running state node & proposing user-scoped discovery...",
  );
  const { wrapNode } = createLangGraphMemoryNodes(platform, {
    action: "canary_health_check",
  });

  const runCanaryNode = wrapNode("verify_canary_metrics", async (state) => {
    const subagentMem = await platform.remember({
      title:
        "Pre-warm Redis connection pools on canary pods 60s before shifting 5% traffic",
      type: "instruction",
      scope: "user",
      status: "provisional",
    });
    const created = subagentMem.created[0]!;

    // Propose promoting this discovery from `user` scope to `workspace` scope
    const promo = await platform.memories.promote(created.id, {
      toScope: "workspace",
      reason: "Eliminated cold-start p99 latency spikes across 12 canary deploys",
    });

    return {
      ...state,
      proposedMemoryId: created.id,
      promotionId: promo.promotionRequest?.id,
    };
  });

  const graphState = await runCanaryNode({
    query: "Canary deployment traffic ramp and error budget rules",
  });
  console.log(
    `   [OK] LangGraph node recalled ${graphState.recalledMemories?.length ?? 0} memories and submitted promotion request [${graphState.promotionId}].\n`,
  );

  // 3. Orchestrator Lead (OpenAI Agents Turn) reviews pending promotions, approves, and runs unified recall
  console.log(
    "3. [Orchestrator — OpenAI Memory Turn] Auditing pending promotions & running unified recall...",
  );
  const pending = await platform.promotions.list({ status: "pending" });
  for (const req of pending.items) {
    await platform.promotions.approve(req.id, {
      reason: "Approved by Release Orchestrator after verifying p99 metrics",
    });
    console.log(
      `   [Approved Promotion ${req.id}]: ${req.fromScope} -> ${req.toScope}`,
    );
  }

  const turn = await runWithOpenAIMemory(
    platform,
    {
      action: "authorize_global_rollout",
      query: "Canary rollout requirements and Redis pre-warming instructions",
      baseInstructions: "You are the Principal Release Orchestrator.",
    },
    async (ctx) => {
      // Also search grounded document chunks via the built-in OpenAI tool dispatcher
      const toolRes = await ctx.executeToolCall({
        id: "call_doc_1",
        name: "search_documents",
        arguments: { query: "canary traffic ramp percentage", limit: 2 },
      });
      return {
        recalledCount: ctx.memories.length,
        groundedChunksCount: (toolRes.data as any)?.chunks?.length ?? 0,
      };
    },
  );
  console.log(
    `   [OK] Orchestrator turn verified ${turn.result.recalledCount} active memories + ${turn.result.groundedChunksCount} grounded RAG chunk(s).\n`,
  );

  // 4. Schedule an autonomous consolidation sweep to deduplicate parallel subagent memories
  console.log(
    "4. [Maintenance] Triggering autonomous workspace consolidation sweep...",
  );
  const sweep = await platform.consolidateSweep({
    minSimilarity: 0.85,
    minClusterSize: 2,
  });
  console.log(
    `   [OK] Consolidation sweep scheduled (jobId=${sweep.jobId}, status=${sweep.status}).`,
  );
}

main().catch((err) => {
  console.error("Grounded RAG & promotions example failed:", err);
  process.exit(1);
});

