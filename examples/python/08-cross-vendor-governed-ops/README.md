# 08 — Cross-Vendor Governed Operations (`memcell` Python SDK)

Demonstrates how heterogeneous AI agents across vendors (**Anthropic Claude** support triage + **OpenAI / LangGraph** billing operations) share governed operational memory over a single MemCell workspace without vendor silos or memory poisoning.

## Running

```bash
export MEMCELL_API_KEY="mc_..."
export MEMCELL_WORKSPACE="acme/support-ops"
uv run python main.py
```
