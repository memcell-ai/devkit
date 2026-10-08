# Customer Support Operations Agent (Node.js)

Demonstrates how an automated customer support agent utilizes MemCell to:

1. Dynamically retrieve SLAs, guidelines, and refund limits matching incoming ticket messages.
2. Adhere to enforced `guard` memories (e.g. refund ceilings requiring human escalation).
3. Report outcomes to reinforce confidence trajectories.

---

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/support"

pnpm start
```
