from typing import Any


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
