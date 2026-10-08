# Multi-Agent Fleet Provisioning & Coordination (Node.js)

Demonstrates how to run multiple specialized autonomous agents under dedicated identities:

1. Provisions `Market Researcher` and `Compliance Auditor` agents with `client.agents.create()`.
2. Mints scoped agent API keys (`mc_ag_...`) with `client.agents.createKey()`.
3. Coordinates memory creation (`status: "provisional"`) and verification (`report()`) across agents.

---

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/fleet-demo"

pnpm start
```
