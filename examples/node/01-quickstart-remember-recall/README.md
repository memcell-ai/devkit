# 01 — Quickstart: Remember, Recall, & Report (Node.js)

## The Story

A developer building their first AI agent wants to move beyond stateless prompts so the agent remembers operational rules across turns and learns which memories actually help in production.

Using `@memcell/sdk`, this quickstart walks through the core 3-step epistemic loop:
1. **Remember (`client.memories.remember`)**: Store an operational instruction in workspace memory.
2. **Recall (`client.recall.search`)**: Retrieve semantically relevant memories and pre-formatted `<memcell_context>` before the agent acts.
3. **Report (`client.report`)**: Attribute `"worked"` or `"failed"` outcomes back to the `recallId` so high-value memories gain confidence.

---

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/operations"

pnpm start
```
