# Vercel AI SDK Integration (Node.js)

Demonstrates how to integrate MemCell's dynamic recall directly into Vercel AI SDK Core (`ai`).

1. Queries MemCell for semantic context matching the user's intent.
2. Formats `recallResult.promptContext` directly into the system prompt.
3. Generates the completion using `generateText` and OpenAI/Anthropic models.

---

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/operations"
export OPENAI_API_KEY="sk-..."

pnpm start
```
