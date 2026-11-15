# 10 — Grounded RAG + 4-Tier Governance Promotions (`documents`, `promotions`, `sweep`)

## The Story

Engineering teams usually have to maintain two disconnected systems: a static RAG vector store for markdown runbooks/PDFs, and a separate prompt/memory store for agent instructions. Worse, when worker subagents discover useful operational tips during a run, there is no governed pipeline for an orchestrator to review and promote those discoveries into team-wide memory.

This example combines both in one workflow:
1. **Grounded RAG + Distillation (`scoped.documents.ingest(distill=True)`)**: Ingests an SRE Markdown Runbook, indexing grounded chunks for exact citation while automatically distilling enforceable `instruction` memories.
2. **Subagent Promotion Request (`memories.promote`)**: A worker subagent records a `user`-scoped optimization and requests promotion to `workspace` scope.
3. **Orchestrator Approval (`promotions.approve` + `build_openai_instructions` + `consolidate_sweep`)**: The release orchestrator approves the promotion, combines distilled memories and `search_documents` chunks in a single turn, and triggers `consolidate_sweep()` to deduplicate overlapping agent memories.

## SDK Capabilities Demonstrated

- **`scoped.documents.ingest(distill=True)` & `scoped.documents.search()`**
- **`build_openai_instructions` & `dispatch_openai_tool_call` (`memcell.integrations`)**
- **4-Tier Governance (`scoped.memories.promote`, `scoped.promotions.list` / `approve`)**
- **Autonomous Consolidation (`scoped.consolidate_sweep`)**

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/platform-governance-py"

python main.py
```

