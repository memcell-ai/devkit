# MemCell DevKit Examples

Runnable examples demonstrating real-world integration of MemCell with autonomous AI agents across TypeScript/Node.js, Python, and CLI shell automation.

All examples use **domain-agnostic agent scenarios** (customer support, market research, executive personal assistance, financial compliance, and multi-agent coordination).

---

## Example Catalog

### TypeScript / Node.js (`examples/node/`)

| Directory                                                                                                                                 | Description                                                                          | Frameworks / Libraries | Level        |
| :---------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- | :--------------------- | :----------- |
| [**`01-quickstart-remember-recall`**](file:///Users/akshay/projects/openori/devkit/examples/node/01-quickstart-remember-recall/README.md) | Baseline memory ingestion, semantic recall, and confidence outcome reporting.        | `@memcell/sdk`         | Beginner     |
| [**`02-customer-support-agent`**](file:///Users/akshay/projects/openori/devkit/examples/node/02-customer-support-agent/README.md)         | Support ticket triage agent combining user personal preferences with workspace SLAs. | `@memcell/sdk`         | Intermediate |
| [**`03-executive-assistant`**](file:///Users/akshay/projects/openori/devkit/examples/node/03-executive-assistant/README.md)               | Personal scheduling assistant tracking user preferences and memory revisions.        | `@memcell/sdk`         | Intermediate |
| [**`04-vercel-ai-sdk`**](file:///Users/akshay/projects/openori/devkit/examples/node/04-vercel-ai-sdk/README.md)                           | Native integration with Vercel AI SDK Core (`generateText`, `streamText`).           | `@memcell/sdk`, `ai`   | Intermediate |
| [**`05-multi-agent-fleet`**](file:///Users/akshay/projects/openori/devkit/examples/node/05-multi-agent-fleet/README.md)                   | Autonomous multi-agent team operating under dedicated Agent Keys (`mc_ag_...`).      | `@memcell/sdk`         | Advanced     |
| [**`06-knowledge-graph-relations`**](file:///Users/akshay/projects/openori/devkit/examples/node/06-knowledge-graph-relations/README.md)   | Directed epistemic knowledge graph (`limits`, `refines`, `requires`).                | `@memcell/sdk`         | Advanced     |

---

### Python (`examples/python/`)

| Directory                                                                                                                                     | Description                                                                 | Frameworks / Libraries | Level        |
| :-------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------- | :--------------------- | :----------- |
| [**`01-quickstart-remember-recall`**](file:///Users/akshay/projects/openori/devkit/examples/python/01-quickstart-remember-recall/README.md)   | Minimal Python setup: storing facts and retrieving contextual prompts.      | `memcell`              | Beginner     |
| [**`02-market-research-synthesizer`**](file:///Users/akshay/projects/openori/devkit/examples/python/02-market-research-synthesizer/README.md) | Ingesting unstructured analyst findings with `status="provisional"`.        | `memcell`              | Intermediate |
| [**`03-langchain-agent`**](file:///Users/akshay/projects/openori/devkit/examples/python/03-langchain-agent/README.md)                         | LangChain tool integration giving agents dynamic memory recall and storage. | `memcell`, `langchain` | Intermediate |
| [**`04-crewai-fleet`**](file:///Users/akshay/projects/openori/devkit/examples/python/04-crewai-fleet/README.md)                               | CrewAI multi-agent crew coordinating around a shared MemCell workspace.     | `memcell`, `crewai`    | Advanced     |
| [**`05-compliance-auditor`**](file:///Users/akshay/projects/openori/devkit/examples/python/05-compliance-auditor/README.md)                   | Enforcing immutable guard memories on automated operational workflows.      | `memcell`              | Advanced     |
| [**`06-async-pipeline`**](file:///Users/akshay/projects/openori/devkit/examples/python/06-async-pipeline/README.md)                           | High-throughput async batch processing with `AsyncMemcellClient`.           | `memcell`, `asyncio`   | Advanced     |

---

### CLI Shell Automation (`examples/cli/`)

| Directory                                                                                                                          | Description                                                                        | Level        |
| :--------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- | :----------- |
| [**`01-workspace-bootstrapping`**](file:///Users/akshay/projects/openori/devkit/examples/cli/01-workspace-bootstrapping/README.md) | Shell script to provision workspaces, configure scopes, and seed initial memories. | Beginner     |
| [**`02-export-automation`**](file:///Users/akshay/projects/openori/devkit/examples/cli/02-export-automation/README.md)             | Automated multi-agent context exports (`agents-md`, `json`, `claude-md`).          | Intermediate |
