# 01 — Quickstart: Remember, Recall, & Report (Python)

## The Story

A Python developer building an AI agent wants persistent operational memory that improves over time instead of resetting on every script invocation.

This quickstart demonstrates the foundational 3-step epistemic loop using the `memcell` Python SDK:

1. **Remember (`client.memories.remember`)**: Store an operational instruction in workspace memory.
2. **Recall (`client.recall.search`)**: Retrieve contextual memories and formatted `<memcell_context>` before acting.
3. **Report (`client.report`)**: Attribute `"worked"` or `"failed"` outcomes back to the `recall_id` to calibrate confidence.

---

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/operations"

python main.py
```
