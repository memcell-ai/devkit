# 08 — Cross-Vendor Governed Operations (`@memcell/sdk`)

Demonstrates how heterogeneous AI agents across vendors (**Anthropic Claude** support triage + **OpenAI / LangGraph** billing operations) coordinate safely over a single governed MemCell workspace without vendor silos or memory poisoning.

## What This Demonstrates

1. **Cross-Vendor Shared Memory**: An Anthropic support lead agent records an operational billing policy and enforced action guard (`enforce: true`, `appliesAt: ["send", "record"]`), which an OpenAI / LangGraph billing agent immediately recalls.
2. **Poison-Quarantine Isolation**: Unverified `scope: "user"` and `status: "provisional"` shortcuts remain isolated from workspace-scoped production recalls (`scopes: ["workspace"]`, `allowProvisional: false`).
3. **Outcome-Verified Calibration**: Reporting `worked` / `failed` updates empirical confidence and powers the live **Confidence Calibration Curve** and **Governance Shield** (`scoped.insights("24h")`).

## Running

```bash
export MEMCELL_API_KEY="mc_..."
export MEMCELL_WORKSPACE="acme/support-ops"
pnpm start
```
