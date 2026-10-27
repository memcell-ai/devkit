from __future__ import annotations

import inspect
import json
from collections.abc import Callable
from typing import Any

from ._tools import TOOL_SCHEMAS, execute_tool_async, execute_tool_sync, is_async_scoped


def _extract_state_query(state: dict[str, Any]) -> str:
    for key in ("query", "task", "input"):
        val = state.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()

    messages = state.get("messages")
    if isinstance(messages, list):
        for msg in reversed(messages):
            content = msg.get("content") if isinstance(msg, dict) else getattr(msg, "content", None)
            if isinstance(content, str) and content.strip():
                return content.strip()
            if isinstance(content, list):
                parts: list[str] = []
                for item in content:
                    if isinstance(item, dict) and isinstance(item.get("text"), str):
                        text = item["text"].strip()
                        if text:
                            parts.append(text)
                if parts:
                    return "\n".join(parts)

    return ""


def create_langgraph_nodes(
    scoped: Any,
    *,
    action: str = "langgraph_run",
    subject: str | None = None,
    type: str | list[str] | None = None,
    scope: str | None = None,
    min_confidence: float | None = None,
    limit: int | None = None,
    format: str = "xml",
) -> dict[str, Callable[..., Any]]:
    """Create drop-in `recall_node`, `report_node`, and `wrap_node` callables for LangGraph StateGraphs.

    Supports both synchronous (`ScopedMemCell`) and asynchronous (`AsyncScopedMemCell`) handles.
    """
    use_async = is_async_scoped(scoped)

    if use_async:

        async def recall_node(state: dict[str, Any]) -> dict[str, Any]:
            query = _extract_state_query(state) or action
            recalled = await scoped.recall(
                query=query,
                subject=subject,
                type=type,
                scope=scope,
                min_confidence=min_confidence,
                limit=limit,
                format=format,
            )
            return {
                "memory_context": recalled.prompt_context,
                "recall_id": recalled.recall_id,
                "recalled_memories": [m.model_dump(mode="json") for m in recalled.memories],
            }

        async def report_node(state: dict[str, Any]) -> dict[str, Any]:
            recall_id = state.get("recall_id") or state.get("recallId")
            if not recall_id:
                return {"memory_reported": False}
            outcome = state.get("outcome") or ("failed" if state.get("error") else "worked")
            report = await scoped.report(
                action_taken=action,
                outcome=outcome,
                recall_id=str(recall_id),
                subject=subject,
                reason=str(state["error"]) if state.get("error") else None,
            )
            return {
                "memory_reported": True,
                "memory_report": report.model_dump(mode="json"),
            }

        def wrap_node(
            node_action: str, node_fn: Callable[[dict[str, Any]], Any]
        ) -> Callable[..., Any]:
            async def _wrapped(state: dict[str, Any]) -> dict[str, Any]:
                query = _extract_state_query(state) or node_action

                async def _run_with_ctx(ctx: Any) -> dict[str, Any]:
                    enriched = {
                        **state,
                        "memory_context": ctx.prompt_context,
                        "recall_id": ctx.recall_id,
                        "recalled_memories": [m.model_dump(mode="json") for m in ctx.memories],
                    }
                    out = node_fn(enriched)
                    if inspect.isawaitable(out):
                        out = await out
                    return dict(out)

                wrapped = await scoped.wrap_execution(
                    action=node_action,
                    query=query,
                    subject=subject,
                    fn=_run_with_ctx,
                )
                return {
                    **wrapped.result,
                    "memory_context": wrapped.recall.prompt_context,
                    "recall_id": wrapped.recall.recall_id,
                }

            return _wrapped

        return {
            "recall_node": recall_node,
            "report_node": report_node,
            "wrap_node": wrap_node,
        }

    def recall_node_sync(state: dict[str, Any]) -> dict[str, Any]:
        query = _extract_state_query(state) or action
        recalled = scoped.recall(
            query=query,
            subject=subject,
            type=type,
            scope=scope,
            min_confidence=min_confidence,
            limit=limit,
            format=format,
        )
        return {
            "memory_context": recalled.prompt_context,
            "recall_id": recalled.recall_id,
            "recalled_memories": [m.model_dump(mode="json") for m in recalled.memories],
        }

    def report_node_sync(state: dict[str, Any]) -> dict[str, Any]:
        recall_id = state.get("recall_id") or state.get("recallId")
        if not recall_id:
            return {"memory_reported": False}
        outcome = state.get("outcome") or ("failed" if state.get("error") else "worked")
        report = scoped.report(
            action_taken=action,
            outcome=outcome,
            recall_id=str(recall_id),
            subject=subject,
            reason=str(state["error"]) if state.get("error") else None,
        )
        return {
            "memory_reported": True,
            "memory_report": report.model_dump(mode="json"),
        }

    def wrap_node_sync(
        node_action: str, node_fn: Callable[[dict[str, Any]], dict[str, Any]]
    ) -> Callable[[dict[str, Any]], dict[str, Any]]:
        def _wrapped(state: dict[str, Any]) -> dict[str, Any]:
            query = _extract_state_query(state) or node_action
            wrapped = scoped.wrap_execution(
                action=node_action,
                query=query,
                subject=subject,
                fn=lambda ctx: dict(
                    node_fn(
                        {
                            **state,
                            "memory_context": ctx.prompt_context,
                            "recall_id": ctx.recall_id,
                            "recalled_memories": [m.model_dump(mode="json") for m in ctx.memories],
                        }
                    )
                ),
            )
            return {
                **wrapped.result,
                "memory_context": wrapped.recall.prompt_context,
                "recall_id": wrapped.recall.recall_id,
            }

        return _wrapped

    return {
        "recall_node": recall_node_sync,
        "report_node": report_node_sync,
        "wrap_node": wrap_node_sync,
    }


class MemCellLangChainTool:
    """Zero-dependency LangChain / LangGraph compatible tool descriptor."""

    def __init__(
        self,
        name: str,
        description: str,
        parameters: dict[str, Any],
        scoped: Any,
        *,
        default_scope: str | None = None,
        default_subject: str | None = None,
    ) -> None:
        self.name = name
        self.description = description
        self.args_schema = parameters
        self._scoped = scoped
        self._default_scope = default_scope
        self._default_subject = default_subject

    def invoke(self, tool_input: dict[str, Any] | str) -> str:
        args = json.loads(tool_input) if isinstance(tool_input, str) else dict(tool_input)
        res = execute_tool_sync(
            self._scoped,
            self.name,
            args,
            default_scope=self._default_scope,
            default_subject=self._default_subject,
        )
        return json.dumps(res)

    async def ainvoke(self, tool_input: dict[str, Any] | str) -> str:
        args = json.loads(tool_input) if isinstance(tool_input, str) else dict(tool_input)
        res = await execute_tool_async(
            self._scoped,
            self.name,
            args,
            default_scope=self._default_scope,
            default_subject=self._default_subject,
        )
        return json.dumps(res)


def create_langchain_tools(
    scoped: Any,
    *,
    default_scope: str | None = None,
    default_subject: str | None = None,
) -> list[Any]:
    """Create LangChain / LangGraph tools backed by MemCell.

    Returns native `langchain_core.tools.StructuredTool` instances if `langchain-core` is installed,
    or compatible `MemCellLangChainTool` descriptors otherwise.
    """
    descriptors = [
        MemCellLangChainTool(
            name=name,
            description=spec["description"],
            parameters=spec["parameters"],
            scoped=scoped,
            default_scope=default_scope,
            default_subject=default_subject,
        )
        for name, spec in TOOL_SCHEMAS.items()
    ]

    try:
        from langchain_core.tools import StructuredTool  # type: ignore[import-not-found]

        native_tools: list[Any] = []
        for desc in descriptors:
            native_tools.append(
                StructuredTool.from_function(
                    name=desc.name,
                    description=desc.description,
                    func=None if is_async_scoped(scoped) else (lambda d=desc, **kw: d.invoke(kw)),
                    coroutine=(lambda d=desc, **kw: d.ainvoke(kw)),
                )
            )
        return native_tools
    except ImportError:
        return descriptors
