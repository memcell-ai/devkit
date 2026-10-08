# LangChain Agent Memory Tools (Python)

Demonstrates creating custom `@tool` functions that connect LangChain agents directly to MemCell:

1. `recall_memory`: Allows an agent to fetch dynamic guidance relevant to its current plan.
2. `remember_directive`: Enables an agent to persist newly established knowledge.

---

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/operations"

python main.py
```
