# 08 — Cross-Vendor Governed Operations (`memcell` Python SDK)

## The Story

Enterprise AI teams frequently combine **Anthropic Claude** for support triage with **OpenAI / LangGraph** for billing operations. Sharing a single governed MemCell workspace lets instructions recorded by one vendor immediately guide the other—while keeping unverified `user` or `provisional` shortcuts quarantined from production recalls.

## What This Demonstrates

1. **Cross-Vendor Shared Memory**: An Anthropic support lead agent records an operational billing policy and enforced instruction (`enforce=True`, `applies_at=["send", "record"]`), which an OpenAI / LangGraph billing agent immediately recalls.
2. **Poison-Quarantine Isolation**: Unverified `scope="user"` and `status="provisional"` shortcuts remain isolated from workspace-scoped production recalls.
3. **Outcome-Verified Calibration**: Reporting `worked` / `failed` updates empirical confidence and powers the live **Confidence Calibration Curve** (`scoped.insights("24h")`).

## Running this Example

```bash
export MEMCELL_API_KEY="mc_..."
export MEMCELL_WORKSPACE="acme/support-ops"
uv run python main.py
```
