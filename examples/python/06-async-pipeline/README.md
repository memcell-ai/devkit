# High-Throughput Async Memory Pipeline (Python)

Demonstrates concurrent, asynchronous memory ingestion and recall using `AsyncMemcellClient` and Python's `asyncio`:

1. Ingests batches of operational memories concurrently using `asyncio.gather()`.
2. Concurrently retrieves multiple semantic intent queries without blocking the event loop.

---

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/async-batch"

python main.py
```
