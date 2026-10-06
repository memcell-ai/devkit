<p align="center">
  <img src="https://memcell.ai/icon.svg" width="56" alt="MemCell Logo" />
</p>

<h1 align="center">MemCell Client SDKs</h1>

<p align="center">
  <strong>The official multi-language client libraries for <a href="https://memcell.ai">MemCell</a>.</strong><br />
  Persistent, adaptive memory and reasoning substrate for AI agents, workflows, and pipelines.
</p>

<p align="center">
  <a href="https://github.com/memcell-ai/sdk/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0" /></a>
  <a href="https://memcell.ai/docs"><img src="https://img.shields.io/badge/docs-memcell.ai-blue" alt="Documentation" /></a>
</p>

This monorepo houses the official client libraries for MemCell:

| Language                 | Package                                 | Target                           | Package Link                                                                                                           |
| :----------------------- | :-------------------------------------- | :------------------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| **TypeScript / Node.js** | [`@memcell/sdk`](./packages/typescript) | Node $\ge 18$, Bun, Deno, Edge   | [![npm version](https://img.shields.io/npm/v/@memcell/sdk.svg?style=flat)](https://www.npmjs.com/package/@memcell/sdk) |
| **Python**               | [`memcell`](./packages/python)          | Python $\ge 3.10$ (Sync & Async) | [![PyPI version](https://img.shields.io/pypi/v/memcell.svg?style=flat)](https://pypi.org/project/memcell)              |

---

## Direct Start

### TypeScript / JavaScript

```bash
npm install @memcell/sdk
```

```typescript
import { MemCell } from "@memcell/sdk";

const memory = new MemCell({ apiKey: process.env.MEMCELL_API_KEY! });

// Recall relevant memories before an agent acts:
const { promptContext } = await memory.recall({
  namespace: "acme/support",
  query: "refund verification and escalation thresholds",
});

console.log(promptContext);
```

### Python

```bash
pip install memcell
```

```python
import asyncio
from memcell import AsyncMemCell

async def main():
    async with AsyncMemCell(api_key="mc_live_...") as memory:
        # Recall relevant memories before an agent acts:
        recall = await memory.recall(
            namespace="acme/support",
            query="refund verification and escalation thresholds",
        )
        print(recall.prompt_context)

asyncio.run(main())
```

---

## The Closed-Loop Execution Wrapper

Both SDKs provide an automated execution wrapper (`wrapExecution` in TypeScript, `wrap_execution` in Python) that implements the complete agent learning cycle:

1. **Pre-Flight Recall**: Automatically retrieves relevant memories and directives before agent execution.
2. **In-Flight Context**: Injects verified context into the execution callback.
3. **Post-Flight Reinforcement**: Automatically reports execution outcomes (`worked` on success, `failed` on error) to update Bayesian confidence scores—with zero manual prompt maintenance.

For full examples, see:

- [TypeScript SDK Guide](./packages/typescript/README.md)
- [Python SDK Guide](./packages/python/README.md)

---

## Repository Structure

```
sdk/
├── packages/
│   ├── typescript/        # Modern TypeScript SDK (@memcell/sdk)
│   └── python/            # Modern Python SDK (memcell)
├── .github/workflows/     # Unified CI and multi-package release-please workflows
└── release-please-config.json
```

---

## Development & Testing

### Prerequisites

- Node.js $\ge 20$ & pnpm $\ge 10$
- Python $\ge 3.10$ & pytest / uv

### Running Local Tests

```bash
# Install root Node dependencies
pnpm install

# Run TypeScript tests & type checking
pnpm test:ts
pnpm typecheck

# Run Python tests
pnpm test:py
# or directly:
cd packages/python && pytest
```

---

## License

Apache License 2.0. See [LICENSE](LICENSE) for details.
