# Quickstart: Remember, Recall, & Report (Node.js)

Demonstrates the core epistemic loop in MemCell using the official `@memcell/sdk`:

1. Ingesting an operational directive with `client.memories.remember()`.
2. Performing semantic intent recall with `client.recall.search()`.
3. Feeding back execution results with `client.report()`.

---

## Running this Example

```bash
# Set your credentials
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/operations"

# Run with tsx or node
pnpm start
```
