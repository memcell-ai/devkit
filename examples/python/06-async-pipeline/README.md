# 06 — High-Throughput Async Memory Pipeline (Python)

## The Story

A FastAPI backend or high-concurrency agent orchestrator handles dozens of parallel requests per second and cannot block the Python event loop on synchronous HTTP calls.

This example demonstrates concurrent, non-blocking memory ingestion and recall using `AsyncMemCell` and `asyncio`:

1. Ingests batches of operational memories concurrently using `asyncio.gather()`.
2. Executes parallel semantic recall queries without blocking the event loop.

---

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/async-batch"

python main.py
```
