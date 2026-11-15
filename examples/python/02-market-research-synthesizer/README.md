# 02 — Market Research Synthesizer (Python)

## The Story

An autonomous research agent scrapes third-party earnings rumors and analyst commentary. Writing unverified external claims directly into active workspace memory would risk contaminating downstream synthesis agents with hallucinations.

This example demonstrates how to quarantine unverified signals safely:
1. Ingests raw signals with `status="provisional"`.
2. Verifies that standard workspace recall (`allow_provisional=False`) automatically excludes unverified observations.
3. Enables on-demand provisional inspection (`allow_provisional=True`) for verification workflows.

---

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/market-research"

python main.py
```
