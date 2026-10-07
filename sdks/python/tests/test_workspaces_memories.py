import httpx
import pytest

from memcell import (
    MEMORY_SCOPES,
    MEMORY_TYPES,
    AsyncMemCell,
    MemCell,
    MemoryItem,
    WorkspaceItem,
)


def test_models_ontology_exports():
    assert "workspace" in MEMORY_SCOPES
    assert "directive" in MEMORY_TYPES
    assert MemoryItem is not None
    assert WorkspaceItem is not None


def test_sync_client_workspaces_and_memories():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/workspaces":
            return httpx.Response(
                200,
                json={
                    "workspaces": [
                        {
                            "id": "ws-1",
                            "slug": "backend",
                            "name": "Backend Service",
                            "visibility": "private",
                        }
                    ],
                    "pagination": {"page": 1, "per_page": 30, "total": 1, "has_more": False},
                },
            )
        if request.url.path == "/api/v1/acme/backend/memories":
            return httpx.Response(
                200,
                json={
                    "memories": [
                        {
                            "id": "mem-1",
                            "title": "Use PostgreSQL 16",
                            "type": "directive",
                            "confidence": 0.95,
                        }
                    ],
                    "pagination": {"page": 1, "per_page": 30, "total": 1, "has_more": False},
                },
            )
        return httpx.Response(404)

    client = MemCell(
        api_key="test-key",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    assert hasattr(client, "workspaces")
    assert hasattr(client, "memories")
    assert hasattr(client, "workspace")

    workspaces = client.workspaces.list()
    assert len(workspaces.items) == 1
    assert workspaces.items[0].name == "Backend Service"

    memories = client.memories.list("acme/backend")
    assert len(memories.items) == 1
    assert memories.items[0].title == "Use PostgreSQL 16"

    ws_scoped = client.workspace("acme/backend")
    assert ws_scoped.namespace == "acme/backend"


@pytest.mark.asyncio
async def test_async_client_workspaces_and_memories():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/workspaces":
            return httpx.Response(
                200,
                json={
                    "workspaces": [
                        {
                            "id": "ws-1",
                            "slug": "backend",
                            "name": "Backend Service",
                            "visibility": "private",
                        }
                    ],
                    "pagination": {"page": 1, "per_page": 30, "total": 1, "has_more": False},
                },
            )
        return httpx.Response(404)

    async_client = AsyncMemCell(
        api_key="test-key",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )

    assert hasattr(async_client, "workspaces")
    assert hasattr(async_client, "memories")
    assert hasattr(async_client, "workspace")

    workspaces = await async_client.workspaces.list()
    assert len(workspaces.items) == 1
    assert workspaces.items[0].name == "Backend Service"

    ws_scoped = async_client.workspace("acme/backend")
    assert ws_scoped.namespace == "acme/backend"
