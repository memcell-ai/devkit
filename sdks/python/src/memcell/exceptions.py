from typing import Any

PRICING_URL = "https://memcell.ai/pricing"


class MemCellError(Exception):
    """Base exception thrown by the MemCell SDK on API and network failures."""

    def __init__(
        self,
        message: str,
        status: int = 0,
        code: str | None = None,
        details: Any | None = None,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status_code if status_code is not None else status
        self.status_code = self.status
        self.code = code
        self.details = details

    def __repr__(self) -> str:
        return f"MemCellError(status={self.status}, code={self.code!r}, message={self.message!r})"


class RateLimitError(MemCellError):
    """Exception thrown when an API request is rejected with HTTP 429 per ADR 057."""

    def __init__(
        self,
        message: str,
        door: str | None = None,
        limit: int | None = None,
        window_seconds: int | None = None,
        retry_after: int = 1,
        details: Any | None = None,
    ) -> None:
        super().__init__(
            message=message,
            status=429,
            code="rate_limited",
            details=details,
        )
        self.door = door
        self.limit = limit
        self.window_seconds = window_seconds
        self.retry_after = retry_after

    def __repr__(self) -> str:
        return (
            f"RateLimitError(door={self.door!r}, limit={self.limit}, "
            f"window_seconds={self.window_seconds}, retry_after={self.retry_after}, "
            f"message={self.message!r})"
        )


class PlanLimitError(MemCellError):
    """Exception thrown when an API request is rejected with HTTP 402 `plan_limit`.

    The account has reached its plan's limit. Never retried, because only more room
    fixes it. `message` is the server's own; `upgrade_url` says where to go next.
    """

    def __init__(
        self,
        message: str,
        limit: int | None = None,
        used: int | None = None,
        plan: str | None = None,
        details: Any | None = None,
    ) -> None:
        super().__init__(
            message=message,
            status=402,
            code="plan_limit",
            details=details,
        )
        self.limit = limit
        self.used = used
        self.plan = plan
        self.upgrade_url = PRICING_URL

    def __repr__(self) -> str:
        return (
            f"PlanLimitError(limit={self.limit}, used={self.used}, plan={self.plan!r}, "
            f"upgrade_url={self.upgrade_url!r}, message={self.message!r})"
        )
