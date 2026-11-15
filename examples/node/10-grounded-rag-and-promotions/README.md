# 10 — Grounded RAG + 4-Tier Governance Promotions (`documents`, `promotions`, `sweep`)

## The Story

Engineering teams usually have to maintain two disconnected systems: a static RAG vector store for markdown runbooks/PDFs, and a separate prompt/memory store for agent instructions. Worse, when worker subagents discover useful operational tips during a run, there is no governed pipeline for an orchestrator to review and promote those discoveries into team-wide memory.

This example combines both in one workflow:
1. **Grounded RAG + Distillation (`scoped.documents.ingest({ distill: true })`)**: Ingests an SRE Markdown Runbook, indexing grounded chunks for exact citation while automatically distilling enforceable `instruction` memories.
2. **Subagent Promotion Request (`@memcell/sdk/langgraph` + `memories.promote`)**: A LangGraph worker node records a `user`-scoped optimization and requests promotion to `workspace` scope.
3. **Orchestrator Approval (`@memcell/sdk/openai` + `promotions.approve` + `consolidateSweep`)**: The release orchestrator approves the promotion, runs a closed-loop OpenAI turn combining distilled memories and `search_documents` chunks, and triggers `consolidateSweep()` to deduplicate overlapping agent memories.

## SDK Capabilities Demonstrated

- **`scoped.documents.ingest({ distill: true })` & `scoped.documents.search()`**
- **`createLangGraphMemoryNodes` (`@memcell/sdk/langgraph`)**
- **`runWithOpenAIMemory` & `executeOpenAIMemoryTool` (`@memcell/sdk/openai`)**
- **4-Tier Governance (`scoped.memories.promote`, `scoped.promotions.list` / `approve`)**
- **Autonomous Consolidation (`scoped.consolidateSweep`)**

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/platform-governance"

pnpm start
```

