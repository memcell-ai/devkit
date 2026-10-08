# Executive Assistant: Preferences & Revision History (Node.js)

Demonstrates how a personal assistant agent tracks evolving user preferences over time:

1. Ingests user-scoped (`scope: "user"`) scheduling preferences.
2. Updates preferences while maintaining an immutable version lineage with `client.memories.history()`.
3. Recalls the latest active revision when handling scheduling conflicts.

---

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/assistant"

pnpm start
```
