import json

import httpx
import pytest

from memcell import AsyncMemCell, MemCell


def test_sweep_consolidate_sync():
    recorded = []

    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method
        body = json.loads(request.content.decode()) if request.content else None
        recorded.append({"method": method, "url": u, "body": body})

        if method == "POST" and "/api/v1/acme/backend/lifecycle/sweep/consolidate" in u:
            return httpx.Response(
                202,
                json={
                    "ok": True,
                    "jobId": "job_sweep_py_123",
                    "status": "queued",
                    "message": "Consolidation sweep job enqueued for background execution.",
                    "phases": [
                        "clustering",
                        "synthesizing",
                        "fusing",
                        "linking_edges",
                        "surfacing_tensions",
                        "refreshing_profile",
                        "completed",
                    ],
                },
            )
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memcell = MemCell(api_key="mc_key", http_client=mock_client)

    # 1. Trigger via client.sweep.consolidate
    res = memcell.sweep.consolidate("acme/backend", min_similarity=0.85, min_cluster_size=2)

    assert len(recorded) == 1
    assert recorded[0]["method"] == "POST"
    assert recorded[0]["body"]["minSimilarity"] == 0.85
    assert recorded[0]["body"]["minClusterSize"] == 2

    assert res.ok is True
    assert res.job_id == "job_sweep_py_123"
    assert res.status == "queued"
    assert "clustering" in res.phases
    assert "fusing" in res.phases
    assert "completed" in res.phases

    # 2. Trigger via ScopedMemCell
    scoped = memcell.scope("acme/backend")
    scoped_res = scoped.consolidate_sweep()
    assert scoped_res.job_id == "job_sweep_py_123"


@pytest.mark.asyncio
async def test_sweep_consolidate_async():
    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method
        if method == "POST" and "/api/v1/acme/backend/lifecycle/sweep/consolidate" in u:
            return httpx.Response(
                202,
                json={
                    "ok": True,
                    "jobId": "job_sweep_async_456",
                    "status": "queued",
                    "message": "Consolidation sweep queued.",
                    "phases": ["clustering", "completed"],
                },
            )
        return httpx.Response(404)

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    async with AsyncMemCell(api_key="mc_key", http_client=mock_client) as memcell:
        res = await memcell.sweep.consolidate("acme/backend")
        assert res.job_id == "job_sweep_async_456"
        assert res.status == "queued"

        scoped = memcell.scope("acme/backend")
        scoped_res = await scoped.consolidate_sweep()
        assert scoped_res.job_id == "job_sweep_async_456"
