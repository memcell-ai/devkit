# 04 — Vercel AI SDK Native Integration (`@memcell/sdk/vercel`)

## The Story

A team building an AI analyst with the Vercel AI SDK (`generateText` / `streamText`) wants every LLM call to automatically inherit workspace instructions and cite grounded documents—without manually stitching `recall()` strings into prompts or writing boilerplate `report()` calls after every stream finishes.

Using `@memcell/sdk/vercel`, they attach `createMemCellMiddleware(scoped)` directly to their model and pass `createMemCellTools(scoped)` to `tools`. The middleware intercepts the prompt before generation, injects verified `<memcell_context>`, and automatically reports `"worked"` (or `"failed"` on exception) once generation or streaming completes.

## SDK Capabilities Demonstrated

- **`createMemCellMiddleware`**: Zero-dependency Vercel AI SDK middleware (`transformParams`, `wrapGenerate`, `wrapStream`).
- **`createMemCellTools`**: Ready-to-use JSON Schema tools (`recall_memory`, `remember_memory`, `report_outcome`, `search_documents`).
- **`withMemCellVercelTurn`**: Closed-loop turn execution wrapper.

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/operations"

pnpm start
```
