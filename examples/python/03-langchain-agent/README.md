# 03 — LangChain Tools & LangGraph State Workflow (`memcell.integrations`)

## The Story

A logistics engineering team runs a LangGraph workflow where an **Orchestrator** routes international freight tasks to specialized **Customs Subagents**. Previously, developers had to write custom `@tool` wrappers for every memory operation and manually thread `recall_id` through graph state to close the feedback loop.

With `memcell.integrations`, the team uses `create_langchain_tools(scoped)` to expose typed `StructuredTool` instances (`recall_memory`, `remember_memory`, `report_outcome`, `search_documents`) with validated Pydantic schemas, and wires `create_langgraph_nodes(scoped)` (`recall_node`, `wrap_node`, `report_node`) directly into their graph state.

## SDK Capabilities Demonstrated

- **`create_langchain_tools`**: Auto-upgrades to `langchain_core.tools.StructuredTool` with Pydantic `args_schema` when `langchain-core` is installed (or zero-dependency fallback descriptors).
- **`create_langgraph_nodes`**: Drop-in `recall_node`, `wrap_node`, and `report_node` functions for synchronous and asynchronous LangGraph `StateGraph` pipelines.

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/operations"

python main.py
```
