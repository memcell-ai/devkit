# MemCell DevKit Examples

Runnable examples demonstrating real-world integration of MemCell with autonomous AI agents across TypeScript/Node.js, Python, and CLI shell automation.

Every example includes a **"The Story"** section explaining the real-world engineering scenario it solves—from single-agent quickstarts to **Orchestrator ↔ Subagent memory synchronization**, **self-healing execution loops**, and **grounded RAG + 4-tier governance promotions**.

---

## Example Catalog

### TypeScript / Node.js (`examples/node/`)

| Directory                                                                               | Description                                                                                                                   | Frameworks / Libraries                                          | Level        |
| :-------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------- | :----------- |
| [**`01-quickstart-remember-recall`**](./node/01-quickstart-remember-recall/README.md)   | Baseline memory ingestion, semantic recall, and confidence outcome reporting.                                                 | `@memcell/sdk`                                                  | Beginner     |
| [**`02-customer-support-agent`**](./node/02-customer-support-agent/README.md)           | Support ticket triage agent using enforced instructions (`enforce: true`) and `wrapExecution()`.                              | `@memcell/sdk`                                                  | Intermediate |
| [**`03-executive-assistant`**](./node/03-executive-assistant/README.md)                 | Personal scheduling assistant tracking user preferences and immutable revision lineage.                                       | `@memcell/sdk`                                                  | Intermediate |
| [**`04-vercel-ai-sdk`**](./node/04-vercel-ai-sdk/README.md)                             | Native Vercel AI SDK integration (`createMemCellMiddleware`, `createMemCellTools`, `withMemCellVercelTurn`).                  | `@memcell/sdk/vercel`, `ai`                                     | Intermediate |
| [**`05-multi-agent-fleet`**](./node/05-multi-agent-fleet/README.md)                     | Orchestrator ↔ Subagent memory synchronization: scoped Agent Keys, `provisional` quarantine, `sessionId` threads, promotions. | `@memcell/sdk`                                                  | Advanced     |
| [**`06-knowledge-graph-relations`**](./node/06-knowledge-graph-relations/README.md)     | Directed epistemic knowledge graph relations (`limits`, `refines`, `requires`, `supersedes`, `justifies`).                    | `@memcell/sdk`                                                  | Advanced     |
| [**`07-oauth-m2m-agent`**](./node/07-oauth-m2m-agent/README.md)                         | OAuth 2.0 Machine-to-Machine (`client_credentials`) authentication with proactive token refresh.                              | `@memcell/sdk`                                                  | Advanced     |
| [**`08-cross-vendor-governed-ops`**](./node/08-cross-vendor-governed-ops/README.md)     | Cross-vendor Claude + OpenAI/LangGraph governed memory, poison quarantine, and live confidence calibration curve.             | `@memcell/sdk`                                                  | Flagship     |
| [**`09-self-healing-execution-loop`**](./node/09-self-healing-execution-loop/README.md) | "Fail Once, Never Again": `wrapExecution` failure attribution, `autoDistill: true`, and cross-subagent self-healing.          | `@memcell/sdk`                                                  | Flagship     |
| [**`10-grounded-rag-and-promotions`**](./node/10-grounded-rag-and-promotions/README.md) | Grounded RAG (`documents.ingest({ distill: true })`), 4-tier `promotions.approve`, and `consolidateSweep()`.                  | `@memcell/sdk`, `@memcell/sdk/langgraph`, `@memcell/sdk/openai` | Flagship     |

---

### Python (`examples/python/`)

| Directory                                                                                 | Description                                                                                                                 | Frameworks / Libraries                                 | Level        |
| :---------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------- | :----------- |
| [**`01-quickstart-remember-recall`**](./python/01-quickstart-remember-recall/README.md)   | Minimal Python setup: storing instructions, retrieving contextual prompts, and reporting outcomes.                          | `memcell`                                              | Beginner     |
| [**`02-market-research-synthesizer`**](./python/02-market-research-synthesizer/README.md) | Quarantining unverified analyst findings with `status="provisional"` vs `allow_provisional=True`.                           | `memcell`                                              | Intermediate |
| [**`03-langchain-agent`**](./python/03-langchain-agent/README.md)                         | Native `create_langchain_tools` (Pydantic `StructuredTool`) and `create_langgraph_nodes` (`recall_node`, `wrap_node`).      | `memcell.integrations`, `langchain`, `langgraph`       | Intermediate |
| [**`04-crewai-fleet`**](./python/04-crewai-fleet/README.md)                               | CrewAI multi-agent Orchestrator ↔ Subagent sync with `create_crewai_tools`, `session_id` threads, and `task_callback`.      | `memcell.integrations`, `crewai`                       | Advanced     |
| [**`05-compliance-auditor`**](./python/05-compliance-auditor/README.md)                   | Enforcing compliance instructions (`enforce=True`) with closed-loop `scoped.wrap_execution()`.                              | `memcell`                                              | Advanced     |
| [**`06-async-pipeline`**](./python/06-async-pipeline/README.md)                           | High-throughput async batch ingestion and concurrent recall with `AsyncMemCell` and `asyncio`.                              | `memcell`, `asyncio`                                   | Advanced     |
| [**`07-oauth-m2m-agent`**](./python/07-oauth-m2m-agent/README.md)                         | OAuth 2.0 Machine-to-Machine (`client_credentials`) authentication in Python.                                               | `memcell`                                              | Advanced     |
| [**`08-cross-vendor-governed-ops`**](./python/08-cross-vendor-governed-ops/README.md)     | Cross-vendor Claude + OpenAI/LangGraph governed memory, poison quarantine, and live confidence calibration curve.           | `memcell`                                              | Flagship     |
| [**`09-self-healing-execution-loop`**](./python/09-self-healing-execution-loop/README.md) | "Fail Once, Never Again": `AsyncScopedMemCell.wrap_execution`, `arun_with_openai_memory`, and PydanticAI tool registration. | `memcell.integrations`, `openai-agents`, `pydantic-ai` | Flagship     |
| [**`10-grounded-rag-and-promotions`**](./python/10-grounded-rag-and-promotions/README.md) | Grounded RAG (`documents.ingest(distill=True)`), 4-tier `promotions.approve`, and `consolidate_sweep()`.                    | `memcell`, `memcell.integrations`                      | Flagship     |

---

### CLI Shell Automation (`examples/cli/`)

| Directory                                                                      | Description                                                                        | Level        |
| :----------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- | :----------- |
| [**`01-workspace-bootstrapping`**](./cli/01-workspace-bootstrapping/README.md) | Shell script to provision workspaces, configure scopes, and seed initial memories. | Beginner     |
| [**`02-export-automation`**](./cli/02-export-automation/README.md)             | Automated multi-agent context exports (`agents-md`, `json`, `claude-md`).          | Intermediate |
