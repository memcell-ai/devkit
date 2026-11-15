# 04 — CrewAI Multi-Agent Fleet: Orchestrator ↔ Subagent Sync

## The Story

An editorial content crew consists of an **Editor-in-Chief (Orchestrator)**, a **Researcher Subagent**, and a **Writer Subagent**. When the Researcher discovers a new statistic, the Writer needs both the standing editorial rules and the verified statistic—without inheriting unverified rumors or losing the citation trail.

Using `memcell.integrations.crewai`:

1. The **Editor-in-Chief** seeds standing instructions (`enforce=True`) on a shared `session_id`.
2. The **Researcher Subagent** uses `create_crewai_tools(editorial)` (Pydantic-typed `BaseTool` wrappers) and saves its raw finding with `status="provisional"` and `touched` source URLs.
3. The **Editor-in-Chief** verifies the source and promotes the finding (`memories.promote` → `promotions.approve`).
4. The **Writer Subagent** recalls the promoted fact alongside the `matched_thread` history, and `create_crewai_task_callback` automatically attributes `outcome="worked"` when the CrewAI task finishes.

## SDK Capabilities Demonstrated

- **`create_crewai_tools`**: Native `crewai.tools.BaseTool` subclasses with strict Pydantic `args_schema` (or zero-dependency fallback).
- **`create_crewai_task_callback`**: Automatic post-task `report(outcome="worked")` hook for `Crew(..., task_callback=...)`.
- **Orchestrator ↔ Subagent Promotion (`provisional` → `promote` → `approve`)**.

## Running this Example

```bash
export MEMCELL_TOKEN="mc_pat_..."
export MEMCELL_WORKSPACE="acme/editorial-crew"

python main.py
```
