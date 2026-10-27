from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

from ._tools import TOOL_SCHEMAS, execute_tool_async, execute_tool_sync, is_async_scoped


def create_openai_chat_tools() -> list[dict[str, Any]]:
    """Return OpenAI Chat Completions `tools=[...]` function definitions."""
    return [
        {
            "type": "function",
            "function": {
                "name": name,
                "description": spec["description"],
                "parameters": spec["parameters"],
            },
        }
        for name, spec in TOOL_SCHEMAS.items()
    ]


def create_openai_responses_tools() -> list[dict[str, Any]]:
    """Return OpenAI Responses API `tools=[...]` function definitions."""
    return [
        {
            "type": "function",
            "name": name,
            "description": spec["description"],
            "parameters": spec["parameters"],
        }
        for name, spec in TOOL_SCHEMAS.items()
    ]


def _extract_tool_call(tool_call: Any) -> tuple[str | None, str, dict[str, Any]]:
    if isinstance(tool_call, dict):
        if "function" in tool_call and isinstance(tool_call["function"], dict):
            fn = tool_call["function"]
            name = str(fn.get("name") or "")
            raw_args = fn.get("arguments")
            call_id = tool_call.get("id")
        else:
            name = str(tool_call.get("name") or "")
            raw_args = tool_call.get("arguments")
            call_id = tool_call.get("call_id") or tool_call.get("id")
    else:
        fn_obj = getattr(tool_call, "function", None)
        if fn_obj is not None:
            name = str(getattr(fn_obj, "name", "") or "")
            raw_args = getattr(fn_obj, "arguments", None)
            call_id = getattr(tool_call, "id", None)
        else:
            name = str(getattr(tool_call, "name", "") or "")
            raw_args = getattr(tool_call, "arguments", None)
            call_id = getattr(tool_call, "call_id", None) or getattr(tool_call, "id", None)

    if isinstance(raw_args, str):
        parsed = json.loads(raw_args) if raw_args.strip() else {}
    elif isinstance(raw_args, dict):
        parsed = raw_args
    else:
        parsed = {}

    return (str(call_id) if call_id is not None else None, name, parsed)


def dispatch_openai_tool_call(
    scoped: Any,
    tool_call: Any,
    *,
    default_scope: str | None = None,
    default_subject: str | None = None,
) -> dict[str, Any]:
    """Execute an OpenAI Chat Completions or Responses tool call synchronously."""
    call_id, name, parsed = _extract_tool_call(tool_call)
    data = execute_tool_sync(
        scoped,
        name,
        parsed,
        default_scope=default_scope,
        default_subject=default_subject,
    )
    return {
        "tool_call_id": call_id,
        "name": name,
        "output": json.dumps(data),
        "data": data,
    }


async def adispatch_openai_tool_call(
    scoped: Any,
    tool_call: Any,
    *,
    default_scope: str | None = None,
    default_subject: str | None = None,
) -> dict[str, Any]:
    """Execute an OpenAI Chat Completions or Responses tool call asynchronously."""
    call_id, name, parsed = _extract_tool_call(tool_call)
    data = await execute_tool_async(
        scoped,
        name,
        parsed,
        default_scope=default_scope,
        default_subject=default_subject,
    )
    return {
        "tool_call_id": call_id,
        "name": name,
        "output": json.dumps(data),
        "data": data,
    }


def create_openai_agent_tools(
    scoped: Any,
    *,
    default_scope: str | None = None,
    default_subject: str | None = None,
) -> list[Any]:
    """Create ready-to-use tools for the OpenAI Agents SDK (`agents.Agent(tools=...)`).

    Automatically wraps functions with `@agents.function_tool` when `openai-agents` is installed,
    and falls back cleanly to typed async/sync Python callables with zero extra dependencies.
    """
    use_async = is_async_scoped(scoped)

    if use_async:

        async def recall_memory(query: str, type: str | None = None, limit: int = 5) -> str:
            """Recall verified workspace memories, instructions, and grounded document chunks."""
            res = await execute_tool_async(
                scoped,
                "recall_memory",
                {"query": query, "type": type, "limit": limit},
                default_scope=default_scope,
                default_subject=default_subject,
            )
            return json.dumps(res)

        async def remember_memory(
            title: str,
            content: str | None = None,
            type: str = "fact",
            enforce: bool = False,
        ) -> str:
            """Save a verified instruction, decision, fact, or preference to workspace memory."""
            res = await execute_tool_async(
                scoped,
                "remember_memory",
                {"title": title, "content": content, "type": type, "enforce": enforce},
                default_scope=default_scope,
                default_subject=default_subject,
            )
            return json.dumps(res)

        async def report_outcome(
            outcome: str,
            recall_id: str | None = None,
            memory_id: str | None = None,
            action_taken: str = "agent_turn",
            reason: str | None = None,
        ) -> str:
            """Report whether recalled workspace memory worked, failed, or was avoided."""
            res = await execute_tool_async(
                scoped,
                "report_outcome",
                {
                    "outcome": outcome,
                    "recall_id": recall_id,
                    "memory_id": memory_id,
                    "action_taken": action_taken,
                    "reason": reason,
                },
                default_scope=default_scope,
                default_subject=default_subject,
            )
            return json.dumps(res)

        async def search_documents(query: str, limit: int = 5) -> str:
            """Search grounded PDF, DOCX, CSV, HTML, and Markdown workspace document chunks."""
            res = await execute_tool_async(
                scoped,
                "search_documents",
                {"query": query, "limit": limit},
                default_scope=default_scope,
                default_subject=default_subject,
            )
            return json.dumps(res)

        funcs: list[Callable[..., Any]] = [
            recall_memory,
            remember_memory,
            report_outcome,
            search_documents,
        ]
    else:

        def recall_memory_sync(query: str, type: str | None = None, limit: int = 5) -> str:
            """Recall verified workspace memories, instructions, and grounded document chunks."""
            res = execute_tool_sync(
                scoped,
                "recall_memory",
                {"query": query, "type": type, "limit": limit},
                default_scope=default_scope,
                default_subject=default_subject,
            )
            return json.dumps(res)

        recall_memory_sync.__name__ = "recall_memory"

        def remember_memory_sync(
            title: str,
            content: str | None = None,
            type: str = "fact",
            enforce: bool = False,
        ) -> str:
            """Save a verified instruction, decision, fact, or preference to workspace memory."""
            res = execute_tool_sync(
                scoped,
                "remember_memory",
                {"title": title, "content": content, "type": type, "enforce": enforce},
                default_scope=default_scope,
                default_subject=default_subject,
            )
            return json.dumps(res)

        remember_memory_sync.__name__ = "remember_memory"

        def report_outcome_sync(
            outcome: str,
            recall_id: str | None = None,
            memory_id: str | None = None,
            action_taken: str = "agent_turn",
            reason: str | None = None,
        ) -> str:
            """Report whether recalled workspace memory worked, failed, or was avoided."""
            res = execute_tool_sync(
                scoped,
                "report_outcome",
                {
                    "outcome": outcome,
                    "recall_id": recall_id,
                    "memory_id": memory_id,
                    "action_taken": action_taken,
                    "reason": reason,
                },
                default_scope=default_scope,
                default_subject=default_subject,
            )
            return json.dumps(res)

        report_outcome_sync.__name__ = "report_outcome"

        def search_documents_sync(query: str, limit: int = 5) -> str:
            """Search grounded PDF, DOCX, CSV, HTML, and Markdown workspace document chunks."""
            res = execute_tool_sync(
                scoped,
                "search_documents",
                {"query": query, "limit": limit},
                default_scope=default_scope,
                default_subject=default_subject,
            )
            return json.dumps(res)

        search_documents_sync.__name__ = "search_documents"

        funcs = [
            recall_memory_sync,
            remember_memory_sync,
            report_outcome_sync,
            search_documents_sync,
        ]

    try:
        from agents import function_tool  # type: ignore[import-not-found]

        return [function_tool(f) for f in funcs]
    except ImportError:
        return funcs


def build_openai_instructions(
    scoped: Any,
    query: str,
    base_instructions: str = "",
    **recall_kwargs: Any,
) -> tuple[str, str, Any]:
    """Recall workspace memories synchronously and return `(instructions, recall_id, recall_response)`."""
    recalled = scoped.recall(query=query, **recall_kwargs)
    parts = [p for p in (base_instructions.strip(), recalled.prompt_context.strip()) if p]
    return "\n\n".join(parts), recalled.recall_id, recalled


async def abuild_openai_instructions(
    scoped: Any,
    query: str,
    base_instructions: str = "",
    **recall_kwargs: Any,
) -> tuple[str, str, Any]:
    """Recall workspace memories asynchronously and return `(instructions, recall_id, recall_response)`."""
    recalled = await scoped.recall(query=query, **recall_kwargs)
    parts = [p for p in (base_instructions.strip(), recalled.prompt_context.strip()) if p]
    return "\n\n".join(parts), recalled.recall_id, recalled


async def arun_with_openai_memory(
    scoped: Any,
    *,
    action: str,
    query: str | None = None,
    base_instructions: str = "",
    fn: Callable[[dict[str, Any]], Awaitable[Any] | Any],
) -> Any:
    """Run an async OpenAI Agents or Responses turn inside MemCell's recall + outcome verification loop."""
    tools = create_openai_agent_tools(scoped)
    wrapped = await scoped.wrap_execution(
        action=action,
        query=query or action,
        fn=lambda ctx: fn(
            {
                "instructions": "\n\n".join(
                    [p for p in (base_instructions.strip(), ctx.prompt_context.strip()) if p]
                ),
                "prompt_context": ctx.prompt_context,
                "recall_id": ctx.recall_id,
                "memories": ctx.memories,
                "tools": tools,
            }
        ),
    )
    return wrapped
