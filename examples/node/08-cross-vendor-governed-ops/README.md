# 08 — Cross-Vendor Governed Operations (`@memcell/sdk`)

## The Story

Enterprise AI teams frequently run **Anthropic Claude** for customer-facing triage and **OpenAI / LangGraph** for back-office billing automation. Without a shared governed memory layer, instructions learned in one vendor stack never reach the other—or worse, unverified user shortcuts poison production billing agents.

## What This Demonstrates

1. **Cross-Vendor Shared Memory**: An Anthropic support lead agent records an operational billing policy and enforced instruction (`enforce: true`, `appliesAt: ["send", "record"]`), which an OpenAI / LangGraph billing agent immediately recalls.
2. **Poison-Quarantine Isolation**: Unverified `scope: "user"` and `status: "provisional"` shortcuts remain isolated from workspace-scoped production recalls (`scopes: ["workspace"]`, `allowProvisional: false`).
3. **Outcome-Verified Calibration**: Reporting `worked` / `failed` updates empirical confidence and powers the live **Confidence Calibration Curve** and **Governance Shield** (`scoped.insights("24h")`).

## Running this Example

```bash
export MEMCELL_API_KEY="mc_..."
export MEMCELL_WORKSPACE="acme/support-ops"
pnpm start
```
