import httpx
import pytest

from memcell import MemCell, MemCellError, RateLimitError


def test_rate_limit_warning_header_interception():
    warnings = []

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"recallId": "rec_warn", "memories": []},
            headers={
                "RateLimit-Warning": (
                    '299 - "Approaching rate limit capacity (85% consumed in active window)"'
                ),
            },
        )

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memory = MemCell(
        api_key="mc_live_test",
        http_client=mock_client,
        on_rate_limit_warning=lambda w, r: warnings.append(w),
    )

    res = memory.recall(query="test warning")
    assert res.recall_id == "rec_warn"
    assert len(warnings) == 1
    assert "Approaching rate limit capacity" in warnings[0]


def test_rate_limit_automatic_retry_backoff():
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(
                429,
                json={
                    "error": "rate_limited",
                    "message": "Rate limit exceeded. Please retry in 0s.",
                },
                headers={"Retry-After": "0"},
            )
        return httpx.Response(
            200,
            json={"recallId": "rec_recovered", "memories": []},
        )

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memory = MemCell(
        api_key="mc_live_test",
        http_client=mock_client,
        max_retries=2,
    )

    res = memory.recall(query="test retry")
    assert attempts == 2
    assert res.recall_id == "rec_recovered"


def test_rate_limit_exhausted_raises_typed_error():
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(
            429,
            json={
                "error": "rate_limited",
                "message": "Rate limit exceeded on door 'remember'. Please retry in 15s.",
                "door": "remember",
                "limit": 60,
                "windowSeconds": 60,
                "retryAfter": 15,
            },
            headers={"Retry-After": "0"},
        )

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memory = MemCell(
        api_key="mc_live_test",
        http_client=mock_client,
        max_retries=1,
    )

    with pytest.raises(RateLimitError) as exc_info:
        memory.remember(title="Exhaust retries")

    err = exc_info.value
    assert isinstance(err, MemCellError)
    assert err.door == "remember"
    assert err.limit == 60
    assert err.window_seconds == 60
    assert err.retry_after == 15
    assert err.status == 429
    assert "Rate limit exceeded on door 'remember'" in err.message


def test_non_429_raises_memcell_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            json={"error": "unauthorized", "message": "Invalid API key provided."},
        )

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memory = MemCell(
        api_key="bad_key",
        http_client=mock_client,
    )

    with pytest.raises(MemCellError) as exc_info:
        memory.recall(query="test")

    err = exc_info.value
    assert not isinstance(err, RateLimitError)
    assert err.status == 401
    assert err.code == "unauthorized"
    assert "Invalid API key provided" in err.message
