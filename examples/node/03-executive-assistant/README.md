# 03 — Executive Assistant: Preferences & Revision History (Node.js)

## The Story

An executive scheduling assistant tracks a user's evolving calendar preferences (such as shifting deep-work blocks from mornings to afternoons). When preferences change, the assistant must always recall the latest rule without losing an immutable audit trail of prior revisions.

This example demonstrates:
1. Ingesting user-scoped (`scope: "user"`) scheduling preferences.
2. Updating preferences while preserving version lineage with `client.memories.history()`.
3. Recalling only the active revision when resolving scheduling conflicts.

---

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/assistant"

pnpm start
```
