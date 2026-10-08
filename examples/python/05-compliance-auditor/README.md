# Financial Compliance Auditor with Guard Memories (Python)

Demonstrates how autonomous financial workflows use MemCell's enforced `guard` memories:

1. Ingests absolute policy constraints with `type="guard"` and `enforce=True`.
2. Queries MemCell with a high confidence threshold (`min_confidence=0.80`).
3. Fails closed when transactions exceed operational limits or violate sanction guards.

---

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/compliance"

python main.py
```
