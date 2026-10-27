from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .openai_agents import create_openai_agent_tools


def create_pydantic_ai_tools(
    scoped: Any,
    *,
    default_scope: str | None = None,
    default_subject: str | None = None,
) -> list[Callable[..., Any]]:
    """Return typed plain Python tool functions ready for `pydantic_ai.Agent(..., tools=...)`."""
    raw_tools = create_openai_agent_tools(
        scoped,
        default_scope=default_scope,
        default_subject=default_subject,
    )
    return list(raw_tools)


def register_memcell_tools(
    agent: Any,
    scoped: Any,
    *,
    default_scope: str | None = None,
    default_subject: str | None = None,
) -> Any:
    """Register `recall_memory`, `remember_memory`, `report_outcome`, and `search_documents`
    onto a PydanticAI `Agent` instance via `agent.tool_plain`.
    """
    tools = create_pydantic_ai_tools(
        scoped,
        default_scope=default_scope,
        default_subject=default_subject,
    )
    tool_plain = getattr(agent, "tool_plain", None)
    if callable(tool_plain):
        for fn in tools:
            tool_plain(fn)
    return agent
