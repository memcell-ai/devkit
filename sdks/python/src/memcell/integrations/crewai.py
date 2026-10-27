from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from ._tools import TOOL_SCHEMAS, execute_tool_sync


class MemCellCrewTool:
    """Zero-dependency CrewAI compatible tool wrapper."""

    def __init__(
        self,
        name: str,
        description: str,
        scoped: Any,
        *,
        default_scope: str | None = None,
        default_subject: str | None = None,
    ) -> None:
        self.name = name
        self.description = description
        self._scoped = scoped
        self._default_scope = default_scope
        self._default_subject = default_subject

    def _run(self, **kwargs: Any) -> str:
        res = execute_tool_sync(
            self._scoped,
            self.name,
            kwargs,
            default_scope=self._default_scope,
            default_subject=self._default_subject,
        )
        return json.dumps(res)

    def run(self, **kwargs: Any) -> str:
        return self._run(**kwargs)


def create_crewai_tools(
    scoped: Any,
    *,
    default_scope: str | None = None,
    default_subject: str | None = None,
) -> list[Any]:
    """Create CrewAI tools backed by a synchronous `ScopedMemCell` handle.

    Upgrades to `crewai.tools.BaseTool` subclasses automatically if `crewai` is installed.
    """
    wrappers = [
        MemCellCrewTool(
            name=name,
            description=spec["description"],
            scoped=scoped,
            default_scope=default_scope,
            default_subject=default_subject,
        )
        for name, spec in TOOL_SCHEMAS.items()
    ]

    try:
        from crewai.tools import BaseTool  # type: ignore[import-not-found]

        crew_tools: list[Any] = []
        for w in wrappers:

            class _NativeCrewTool(BaseTool):  # type: ignore[misc]
                name: str = w.name
                description: str = w.description

                def _run(self, _w: MemCellCrewTool = w, **kwargs: Any) -> str:
                    return _w._run(**kwargs)

            crew_tools.append(_NativeCrewTool())
        return crew_tools
    except ImportError:
        return wrappers


def create_crewai_task_callback(
    scoped: Any,
    *,
    action: str = "crewai_task",
    recall_id: str | None = None,
) -> Callable[[Any], None]:
    """Return a `task_callback` for CrewAI `Crew(..., task_callback=...)` that reports task outcomes."""

    def _on_task_complete(task_output: Any) -> None:
        raw_desc = getattr(task_output, "description", None) or action
        scoped.report(
            action_taken=str(raw_desc),
            outcome="worked",
            recall_id=recall_id,
        )

    return _on_task_complete
