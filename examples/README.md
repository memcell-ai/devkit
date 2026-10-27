# MemCell DevKit Examples

Runnable examples demonstrating real-world integration of MemCell with autonomous AI agents across TypeScript/Node.js, Python, and CLI shell automation.

All examples use **domain-agnostic agent scenarios** (customer support, market research, executive personal assistance, financial compliance, and cross-vendor multi-agent coordination).

---

## Example Catalog

### TypeScript / Node.js (`examples/node/`)

| Directory                                                                             | Description                                                                                                       | Frameworks / Libraries | Level        |
| :------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------- | :--------------------- | :----------- |
| [**`01-quickstart-remember-recall`**](./node/01-quickstart-remember-recall/README.md) | Baseline memory ingestion, semantic recall, and confidence outcome reporting.                                     | `@memcell/sdk`         | Beginner     |
| [**`02-customer-support-agent`**](./node/02-customer-support-agent/README.md)         | Support ticket triage agent combining user personal preferences with workspace SLAs.                              | `@memcell/sdk`         | Intermediate |
| [**`03-executive-assistant`**](./node/03-executive-assistant/README.md)               | Personal scheduling assistant tracking user preferences and memory revisions.                                     | `@memcell/sdk`         | Intermediate |
| [**`04-vercel-ai-sdk`**](./node/04-vercel-ai-sdk/README.md)                           | Native integration with Vercel AI SDK Core (`generateText`, `streamText`).                                        | `@memcell/sdk`, `ai`   | Intermediate |
| [**`05-multi-agent-fleet`**](./node/05-multi-agent-fleet/README.md)                   | Autonomous multi-agent team operating under dedicated Agent Keys (`mc_ag_...`).                                   | `@memcell/sdk`         | Advanced     |
| [**`06-knowledge-graph-relations`**](./node/06-knowledge-graph-relations/README.md)   | Directed knowledge graph relations (`limits`, `refines`, `requires`, `supersedes`).                               | `@memcell/sdk`         | Advanced     |
| [**`07-oauth-m2m-agent`**](./node/07-oauth-m2m-agent/README.md)                       | OAuth 2.0 Machine-to-Machine (`client_credentials`) authentication with proactive token refresh.                  | `@memcell/sdk`         | Advanced     |
| [**`08-cross-vendor-governed-ops`**](./node/08-cross-vendor-governed-ops/README.md)   | Cross-vendor Claude + OpenAI/LangGraph governed memory, poison quarantine, and live confidence calibration curve. | `@memcell/sdk`         | Flagship     |

---

### Python (`examples/python/`)

| Directory                                                                                 | Description                                                                                                       | Frameworks / Libraries | Level        |
| :---------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- | :--------------------- | :----------- |
| [**`01-quickstart-remember-recall`**](./python/01-quickstart-remember-recall/README.md)   | Minimal Python setup: storing facts and retrieving contextual prompts.                                            | `memcell`              | Beginner     |
| [**`02-market-research-synthesizer`**](./python/02-market-research-synthesizer/README.md) | Ingesting unstructured analyst findings with `status="provisional"`.                                              | `memcell`              | Intermediate |
| [**`03-langchain-agent`**](./python/03-langchain-agent/README.md)                         | LangChain tool integration giving agents dynamic memory recall and storage.                                       | `memcell`, `langchain` | Intermediate |
| [**`04-crewai-fleet`**](./python/04-crewai-fleet/README.md)                               | CrewAI multi-agent crew coordinating around a shared MemCell workspace.                                           | `memcell`, `crewai`    | Advanced     |
| [**`05-compliance-auditor`**](./python/05-compliance-auditor/README.md)                   | Enforcing action guard memories on automated operational workflows.                                               | `memcell`              | Advanced     |
| [**`06-async-pipeline`**](./python/06-async-pipeline/README.md)                           | High-throughput async batch processing with `AsyncMemcellClient`.                                                 | `memcell`, `asyncio`   | Advanced     |
| [**`07-oauth-m2m-agent`**](./python/07-oauth-m2m-agent/README.md)                         | OAuth 2.0 Machine-to-Machine (`client_credentials`) authentication in Python.                                     | `memcell`              | Advanced     |
| [**`08-cross-vendor-governed-ops`**](./python/08-cross-vendor-governed-ops/README.md)     | Cross-vendor Claude + OpenAI/LangGraph governed memory, poison quarantine, and live confidence calibration curve. | `memcell`              | Flagship     |

---

### CLI Shell Automation (`examples/cli/`)

| Directory                                                                      | Description                                                                        | Level        |
| :----------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- | :----------- |
| [**`01-workspace-bootstrapping`**](./cli/01-workspace-bootstrapping/README.md) | Shell script to provision workspaces, configure scopes, and seed initial memories. | Beginner     |
| [**`02-export-automation`**](./cli/02-export-automation/README.md)             | Automated multi-agent context exports (`agents-md`, `json`, `claude-md`).          | Intermediate |
