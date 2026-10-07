<p align="center">
  <img src="https://memcell.ai/icon.svg" width="56" alt="MemCell Logo" />
</p>

<h1 align="center">MemCell DevKit</h1>

<p align="center">
  <strong>The official developer toolkit for <a href="https://memcell.ai">MemCell</a>.</strong><br />
  Living, persistent memory for AI agents across any harness, workflow, or pipeline.
</p>

<p align="center">
  <a href="https://github.com/memcell-ai/devkit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0" /></a>
  <a href="https://memcell.ai/docs"><img src="https://img.shields.io/badge/docs-memcell.ai-blue" alt="Documentation" /></a>
</p>

This monorepo houses the official developer surfaces and client libraries for MemCell:

| Component                    | Package                       | Directory     | Distribution                                                                                                           |
| :--------------------------- | :---------------------------- | :------------ | :--------------------------------------------------------------------------------------------------------------------- |
| **TypeScript / Node.js SDK** | [`@memcell/sdk`](./sdks/node) | `sdks/node`   | [![npm version](https://img.shields.io/npm/v/@memcell/sdk.svg?style=flat)](https://www.npmjs.com/package/@memcell/sdk) |
| **Python SDK**               | [`memcell`](./sdks/python)    | `sdks/python` | [![PyPI version](https://img.shields.io/pypi/v/memcell.svg?style=flat)](https://pypi.org/project/memcell)              |
| **Developer CLI**            | [`memcell`](./cli)            | `cli`         | [![npm version](https://img.shields.io/npm/v/memcell.svg?style=flat)](https://www.npmjs.com/package/memcell)           |

---

## Direct Start

### 1. Developer CLI

```bash
# Wire a workspace in your current directory
npx memcell connect

# Inspect living memory status
npx memcell status

# Recall memories before taking action
npx memcell recall "customer refund policy"
```

### 2. TypeScript / JavaScript SDK

```bash
npm install @memcell/sdk
```

```typescript
import { MemCell } from "@memcell/sdk";

const memory = new MemCell({ apiKey: process.env.MEMCELL_API_KEY! });

// Recall relevant memories before an agent acts:
const { promptContext } = await memory.recall({
  workspace: "acme/support",
  query: "refund verification and escalation thresholds",
});

console.log(promptContext);
```

### 3. Python SDK

```bash
pip install memcell
```

```python
import asyncio
from memcell import AsyncMemCell

async def main():
    async with AsyncMemCell(api_key="mc_live_...") as memory:
        # Recall relevant memories before an agent acts:
        res = await memory.recall(
            workspace="acme/support",
            query="refund verification and escalation thresholds",
        )
        print(res.prompt_context)

asyncio.run(main())
```

---

## Monorepo Development

```bash
# Install all dependencies across the workspace
pnpm install

# Build all TypeScript packages (sdks/node and cli)
pnpm run build

# Run all test suites across Node, CLI, and Python
pnpm test

# Run type checks
pnpm run typecheck

# Check code formatting
pnpm run format:check
```

---

## Ecosystem

- **Engine**: Core cognitive memory service at [memcell-ai/memcell](https://github.com/memcell-ai/memcell)
- **MCP Server & Registry**: [memcell-ai/mcp](https://github.com/memcell-ai/mcp)
- **Documentation**: [memcell.ai/docs](https://memcell.ai/docs)

## License

Apache-2.0
