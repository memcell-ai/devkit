from __future__ import annotations

import inspect
from typing import Any

TOOL_SCHEMAS: dict[str, dict[str, Any]] = {
    "recall_memory": {
        "description": (
            "Recall verified workspace memories, instructions, active threads, and grounded "
            "document chunks before acting."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural-language task intent or question to recall memories for.",
                },
                "type": {
                    "type": "string",
                    "enum": ["instruction", "decision", "fact", "preference"],
                    "description": "Optional memory type filter.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum memories to return (default 5).",
                },
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    "remember_memory": {
        "description": (
            "Save a verified instruction, decision, fact, or preference to shared workspace memory."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Concise one-sentence instruction, decision, fact, or preference.",
                },
                "content": {
                    "type": "string",
                    "description": "Optional detailed operational specification or rationale.",
                },
                "type": {
                    "type": "string",
                    "enum": ["instruction", "decision", "fact", "preference"],
                    "description": "Memory category (defaults to fact).",
                },
                "enforce": {
                    "type": "boolean",
                    "description": "Set true when saving a standing instruction future runs must follow.",
                },
            },
            "required": ["title"],
            "additionalProperties": False,
        },
    },
    "report_outcome": {
        "description": (
            "Report whether recalled workspace memory worked, failed, or was avoided so confidence "
            "calibrates from real outcomes."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "outcome": {
                    "type": "string",
                    "enum": ["worked", "failed", "avoided"],
                    "description": "Whether the recalled memory worked, failed, or was avoided.",
                },
                "recall_id": {
                    "type": "string",
                    "description": "The recall_id returned from a prior recall call.",
                },
                "memory_id": {
                    "type": "string",
                    "description": "Specific memory ID to attribute the outcome to.",
                },
                "action_taken": {
                    "type": "string",
                    "description": "Summary of the action executed.",
                },
                "reason": {
                    "type": "string",
                    "description": "Explanation of why the approach worked or failed.",
                },
            },
            "required": ["outcome"],
            "additionalProperties": False,
        },
    },
    "search_documents": {
        "description": (
            "Search grounded PDF, DOCX, CSV, HTML, and Markdown document chunks indexed in this workspace."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural-language search query across workspace documents.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum grounded chunks to return (default 5).",
                },
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    },
}


def is_async_scoped(scoped: Any) -> bool:
    return inspect.iscoroutinefunction(getattr(scoped, "recall", None))


def _serialize_recall(res: Any) -> dict[str, Any]:
    return {
        "recall_id": res.recall_id,
        "prompt_context": res.prompt_context,
        "memories": [m.model_dump(mode="json") for m in res.memories],
        "document_chunks": [c.model_dump(mode="json") for c in (res.document_chunks or [])],
    }


def _serialize_remember(res: Any) -> dict[str, Any]:
    return {
        "created": [m.model_dump(mode="json") for m in res.created],
        "evolved": [m.model_dump(mode="json") for m in (res.evolved or [])],
        "note": res.note,
    }


def execute_tool_sync(
    scoped: Any,
    name: str,
    arguments: dict[str, Any],
    *,
    default_scope: str | None = None,
    default_subject: str | None = None,
) -> dict[str, Any]:
    if name == "recall_memory":
        res = scoped.recall(
            query=str(arguments.get("query") or ""),
            type=arguments.get("type"),
            limit=arguments.get("limit"),
            scope=default_scope,
            subject=default_subject,
        )
        return _serialize_recall(res)

    if name == "remember_memory":
        res = scoped.remember(
            title=str(arguments.get("title") or ""),
            content=arguments.get("content"),
            type=arguments.get("type") or "fact",
            enforce=bool(arguments.get("enforce", False)),
            scope=default_scope or "workspace",
            subject=default_subject,
        )
        return _serialize_remember(res)

    if name == "report_outcome":
        res = scoped.report(
            action_taken=str(
                arguments.get("action_taken") or arguments.get("actionTaken") or "tool_report"
            ),
            outcome=arguments.get("outcome") or "worked",
            recall_id=arguments.get("recall_id") or arguments.get("recallId"),
            memory_id=arguments.get("memory_id") or arguments.get("memoryId"),
            reason=arguments.get("reason"),
            subject=default_subject,
        )
        return res.model_dump(mode="json")

    if name == "search_documents":
        res = scoped.documents.search(
            str(arguments.get("query") or ""),
            limit=int(arguments.get("limit") or 5),
        )
        return res.model_dump(mode="json")

    raise ValueError(f'Unknown MemCell tool "{name}".')


async def execute_tool_async(
    scoped: Any,
    name: str,
    arguments: dict[str, Any],
    *,
    default_scope: str | None = None,
    default_subject: str | None = None,
) -> dict[str, Any]:
    if not is_async_scoped(scoped):
        return execute_tool_sync(
            scoped,
            name,
            arguments,
            default_scope=default_scope,
            default_subject=default_subject,
        )

    if name == "recall_memory":
        res = await scoped.recall(
            query=str(arguments.get("query") or ""),
            type=arguments.get("type"),
            limit=arguments.get("limit"),
            scope=default_scope,
            subject=default_subject,
        )
        return _serialize_recall(res)

    if name == "remember_memory":
        res = await scoped.remember(
            title=str(arguments.get("title") or ""),
            content=arguments.get("content"),
            type=arguments.get("type") or "fact",
            enforce=bool(arguments.get("enforce", False)),
            scope=default_scope or "workspace",
            subject=default_subject,
        )
        return _serialize_remember(res)

    if name == "report_outcome":
        res = await scoped.report(
            action_taken=str(
                arguments.get("action_taken") or arguments.get("actionTaken") or "tool_report"
            ),
            outcome=arguments.get("outcome") or "worked",
            recall_id=arguments.get("recall_id") or arguments.get("recallId"),
            memory_id=arguments.get("memory_id") or arguments.get("memoryId"),
            reason=arguments.get("reason"),
            subject=default_subject,
        )
        return res.model_dump(mode="json")

    if name == "search_documents":
        res = await scoped.documents.search(
            str(arguments.get("query") or ""),
            limit=int(arguments.get("limit") or 5),
        )
        return res.model_dump(mode="json")

    raise ValueError(f'Unknown MemCell tool "{name}".')
