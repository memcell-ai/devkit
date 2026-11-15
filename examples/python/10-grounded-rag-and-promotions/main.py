import os

from memcell import MemCell
from memcell.integrations import build_openai_instructions, dispatch_openai_tool_call

token = os.getenv("MEMCELL_TOKEN", "mc_pat_mock_demo")
instance = os.getenv("MEMCELL_URL", "http://localhost:3000")
namespace = os.getenv("MEMCELL_WORKSPACE", "acme/platform-governance-py")

client = MemCell(token=token, base_url=instance)
platform = client.scope(namespace, subject="canary-release-governance")

SRE_RUNBOOK_MARKDOWN = """# Production Canary Release Runbook

## 1. Canary Traffic Ramp
All production service deployments must route 5% canary traffic for at least 15 minutes before global rollout.

## 2. Error-Budget Gate
Require canary verification and zero error-budget burn before global rollout. Any p99 latency regression over 20% triggers immediate rollback."""


def main() -> None:
    print("=== Grounded RAG Documents + 4-Tier Governance Promotions + Consolidation (Python) ===\n")

    # 1. Ingest a Markdown runbook into grounded RAG + distill atomic instructions
    print("1. [Knowledge Ingestion] Ingesting SRE Runbook with distill=True...")
    ingested = platform.documents.ingest(
        title="Production Canary Release Runbook",
        filename="canary-runbook.md",
        content=SRE_RUNBOOK_MARKDOWN,
        distill=True,
    )
    print(
        f"   [OK] Document [{ingested.document.id}] indexed into {ingested.chunk_count} grounded chunk(s) "
        f"and distilled {ingested.memories_created} enforced memory(s).\n"
    )

    # 2. Worker Subagent discovers a tactical optimization in `user` scope and proposes promotion
    print("2. [Worker Subagent] Recording user-scoped discovery & requesting workspace promotion...")
    subagent_mem = platform.remember(
        title="Pre-warm Redis connection pools on canary pods 60s before shifting 5% traffic",
        type="instruction",
        scope="user",
        status="provisional",
    )
    created = subagent_mem.created[0]
    promo = platform.memories.promote(
        created.id,
        to_scope="workspace",
        reason="Eliminated cold-start p99 latency spikes across 12 canary deploys",
    )
    promo_id = promo.promotion_request.id if promo.promotion_request else "promo_1"
    print(f"   [OK] Submitted promotion request [{promo_id}] for memory [{created.id}].\n")

    # 3. Orchestrator reviews pending promotions, approves, and builds unified OpenAI instructions
    print("3. [Orchestrator] Auditing pending promotions & building unified instructions...")
    pending = platform.promotions.list(status="pending")
    for req in pending.items:
        platform.promotions.approve(
            req.id,
            reason="Approved by Release Orchestrator after verifying p99 metrics",
        )
        print(f"   [Approved Promotion {req.id}]: {req.from_scope} -> {req.to_scope}")

    instructions, recall_id, recall_res = build_openai_instructions(
        platform,
        query="Canary rollout requirements and Redis pre-warming instructions",
        base_instructions="You are the Principal Release Orchestrator.",
    )
    tool_res = dispatch_openai_tool_call(
        platform,
        {
            "id": "call_doc_py_1",
            "function": {
                "name": "search_documents",
                "arguments": '{"query": "canary traffic ramp percentage", "limit": 2}',
            },
        },
    )
    chunks = tool_res["data"].get("chunks", [])
    print(
        f"   [OK] Orchestrator recalled {len(recall_res.memories)} active memories + "
        f"{len(chunks)} grounded RAG chunk(s) (recall_id={recall_id}).\n"
    )

    # 4. Trigger autonomous consolidation sweep
    print("4. [Maintenance] Triggering autonomous workspace consolidation sweep...")
    sweep = platform.consolidate_sweep(min_similarity=0.85, min_cluster_size=2)
    print(f"   [OK] Consolidation sweep scheduled (job_id={sweep.job_id}, status={sweep.status}).")


if __name__ == "__main__":
    main()

