# 05 — Multi-Agent Fleet: Orchestrator ↔ Subagent Memory Sync

## The Story

In a multi-agent system, an **Orchestrator** delegates market research to a **Researcher Subagent** and verification to a **Compliance Verifier Subagent**. Passing raw 50-page transcripts between agents wastes tokens, while letting unverified subagent outputs write directly into shared memory risks poisoning the entire fleet with hallucinations.

With MemCell:

1. The **Orchestrator** provisions dedicated Agent Keys (`mc_ag_...`) and opens a shared `sessionId` and `subject`.
2. The **Researcher Subagent** records raw findings with `status: "provisional"` alongside `touched` resources and `actions` on the shared `sessionId`. Standard fleet recalls (`allowProvisional: false`) stay protected from unverified claims.
3. The **Verifier Subagent** recalls with `allowProvisional: true` on the same `sessionId`, inspects the synthesized `matchedThread` (touched files and milestones), links the finding with a `justifies` relation, and promotes it (`memories.promote` → `promotions.approve`) so the **Orchestrator** immediately recalls the verified fact.

## SDK Capabilities Demonstrated

- **Agent Identities & Scoped Keys (`client.agents.create`, `createKey`)**
- **Provisional Quarantine (`status: "provisional"` vs `allowProvisional: true`)**
- **Session Thread Continuity (`sessionId`, `touched`, `actions`, `matchedThread`)**
- **Epistemic Promotion (`scoped.memories.promote` & `scoped.promotions.approve`)**

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/fleet-demo"

pnpm start
```
