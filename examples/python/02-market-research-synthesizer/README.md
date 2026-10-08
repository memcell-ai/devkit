# Market Research Synthesizer (Python)

Demonstrates how to safely handle unverified external market data without polluting downstream agent prompts:

1. Ingests raw signals with `status="provisional"`.
2. Verifies that standard recall automatically excludes unverified observations.
3. Allows provisional exploration on-demand using `allow_provisional=True`.

---

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/market-research"

python main.py
```
