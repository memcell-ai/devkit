import json

import httpx
import pytest

from memcell import AsyncMemCell, MemCell


def test_threads_and_documents_sync():
    recorded: list[tuple[str, str, dict | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)
        method = request.method
        body = json.loads(request.content.decode("utf-8")) if request.content else None
        recorded.append((method, url_str, body))

        if request.url.path == "/api/v1/acme/apex/recall" and method == "POST":
            return httpx.Response(
                200,
                json={
                    "recallId": "rec_td_1",
                    "promptContext": "<memcell/>",
                    "memories": [],
                    "profile": "Acme Apex Workspace Profile",
                    "matchedThread": {
                        "id": "thr_1",
                        "workspaceId": "ws_1",
                        "title": "Gateway Routing",
                        "status": "active",
                        "scope": "workspace",
                        "summary": "Implementing edge routing",
                        "currentObjective": "Ship edge worker gateway",
                        "milestones": [
                            {"title": "Phase 1", "summary": "Defined routing specification"}
                        ],
                        "resources": ["docs/routing.md"],
                        "turnCount": 2,
                    },
                    "activeThreads": [
                        {
                            "id": "thr_2",
                            "workspaceId": "ws_1",
                            "title": "Billing Webhooks",
                            "status": "active",
                            "scope": "user",
                        }
                    ],
                    "documentChunks": [
                        {
                            "id": "chk_1",
                            "documentId": "doc_1",
                            "documentTitle": "Routing Spec",
                            "sourceUri": "docs/routing.md",
                            "chunkIndex": 0,
                            "content": "All tenant traffic routes through edge workers.",
                            "score": 0.96,
                        }
                    ],
                },
            )

        if request.url.path == "/api/v1/acme/apex/threads" and method == "GET":
            return httpx.Response(
                200,
                json={
                    "threads": [
                        {
                            "id": "thr_1",
                            "workspaceId": "ws_1",
                            "title": "Gateway Routing",
                            "status": "active",
                            "scope": "workspace",
                            "currentObjective": "Ship edge worker gateway",
                            "turnCount": 2,
                        }
                    ],
                    "pagination": {"page": 1, "perPage": 10, "total": 1, "hasMore": False},
                },
            )

        if request.url.path == "/api/v1/acme/apex/threads/thr_1" and method == "GET":
            return httpx.Response(
                200,
                json={
                    "thread": {
                        "id": "thr_1",
                        "workspaceId": "ws_1",
                        "title": "Gateway Routing",
                        "status": "active",
                        "scope": "workspace",
                        "summary": "Implementing edge routing",
                    },
                    "turns": [
                        {
                            "id": "turn_1",
                            "threadId": "thr_1",
                            "workspaceId": "ws_1",
                            "turnIndex": 1,
                            "userIntent": "Design gateway routing",
                            "agentOutcome": "Drafted routing spec",
                        }
                    ],
                    "memories": [],
                },
            )

        if request.url.path == "/api/v1/acme/apex/threads/thr_1" and method == "PATCH":
            return httpx.Response(
                200,
                json={
                    "thread": {
                        "id": "thr_1",
                        "workspaceId": "ws_1",
                        "title": "Gateway Routing",
                        "status": body.get("status", "completed"),
                        "scope": "workspace",
                        "currentObjective": body.get("currentObjective"),
                    }
                },
            )

        if request.url.path == "/api/v1/acme/apex/threads/thr_1" and method == "DELETE":
            return httpx.Response(200, json={"deleted": True})

        if request.url.path == "/api/v1/acme/apex/documents" and method == "POST":
            return httpx.Response(
                201,
                json={
                    "document": {
                        "id": "doc_1",
                        "workspaceId": "ws_1",
                        "title": body["title"],
                        "sourceUri": body.get("sourceUri"),
                        "sourceType": "markdown",
                        "contentHash": "sha256_xyz",
                        "chunkCount": 3,
                        "content": body["content"],
                    },
                    "chunkCount": 3,
                    "deduplicated": False,
                    "distilled": {
                        "created": [
                            {
                                "id": "mem_1",
                                "title": "Route tenant traffic through edge workers",
                                "type": "decision",
                                "confidence": 0.9,
                            }
                        ]
                    },
                },
            )

        if (
            request.url.path == "/api/v1/acme/apex/documents"
            and method == "GET"
            and request.url.params.get("chunks") == "true"
        ):
            assert request.url.params.get("q") == "edge workers"
            assert request.url.params.get("limit") == "4"
            return httpx.Response(
                200,
                json={
                    "chunks": [
                        {
                            "id": "chk_1",
                            "documentId": "doc_1",
                            "documentTitle": "Routing Spec",
                            "sourceUri": "docs/routing.md",
                            "chunkIndex": 0,
                            "content": "All tenant traffic routes through edge workers.",
                            "score": 0.95,
                        }
                    ]
                },
            )

        if request.url.path == "/api/v1/acme/apex/documents" and method == "GET":
            return httpx.Response(
                200,
                json={
                    "documents": [
                        {
                            "id": "doc_1",
                            "workspaceId": "ws_1",
                            "title": "Routing Spec",
                            "sourceUri": "docs/routing.md",
                            "sourceType": "markdown",
                            "contentHash": "sha256_xyz",
                            "chunkCount": 3,
                        }
                    ],
                    "pagination": {"page": 1, "perPage": 25, "total": 1, "hasMore": False},
                },
            )

        if request.url.path == "/api/v1/acme/apex/documents/doc_1" and method == "GET":
            return httpx.Response(
                200,
                json={
                    "document": {
                        "id": "doc_1",
                        "workspaceId": "ws_1",
                        "title": "Routing Spec",
                        "sourceUri": "docs/routing.md",
                        "sourceType": "markdown",
                        "contentHash": "sha256_xyz",
                        "chunkCount": 1,
                    },
                    "chunks": [
                        {
                            "id": "chk_1",
                            "documentId": "doc_1",
                            "chunkIndex": 0,
                            "content": "All tenant traffic routes through edge workers.",
                            "tokenCount": 8,
                        }
                    ],
                    "memories": [],
                },
            )

        if request.url.path == "/api/v1/acme/apex/documents/doc_1" and method == "DELETE":
            return httpx.Response(200, json={"deleted": True})

        return httpx.Response(404)

    http = httpx.Client(transport=httpx.MockTransport(handler))
    client = MemCell(api_key="mc_test_key", http_client=http)
    assert client.base_url == "https://memcell.ai"
    apex = client.scope("acme/apex")

    # Recall parses string profile, matched_thread, active_threads, and document_chunks
    recalled = apex.recall(query="continue gateway routing", session_id="sess_1")
    assert recalled.profile == "Acme Apex Workspace Profile"
    assert recalled.matched_thread is not None
    assert recalled.matched_thread.title == "Gateway Routing"
    assert recalled.matched_thread.scope == "workspace"
    assert len(recalled.active_threads or []) == 1
    assert len(recalled.document_chunks or []) == 1
    assert recalled.document_chunks[0].path == "docs/routing.md"

    # Threads CRUD
    threads_page = apex.threads.list(status="active", per_page=10)
    assert len(threads_page.items) == 1
    assert threads_page.items[0].id == "thr_1"

    detail = apex.threads.get("thr_1")
    assert detail.thread.summary == "Implementing edge routing"
    assert len(detail.turns) == 1
    assert detail.turns[0].user_intent == "Design gateway routing"

    updated = apex.threads.update(
        "thr_1",
        status="completed",
        current_objective="Gateway shipped",
    )
    assert updated.status == "completed"
    assert updated.current_objective == "Gateway shipped"

    deleted_thread = apex.threads.delete("thr_1")
    assert deleted_thread["deleted"] is True

    # Documents CRUD + search
    ingested = apex.documents.ingest(
        path="docs/routing.md",
        title="Routing Spec",
        content="# Routing\nAll tenant traffic routes through edge workers.",
        distill_memories=True,
    )
    assert ingested.chunk_count == 3
    assert ingested.memories_created == 1
    assert ingested.document.path == "docs/routing.md"

    search_res = apex.documents.search("edge workers", limit=4)
    assert len(search_res.chunks) == 1
    assert search_res.chunks[0].source_path == "docs/routing.md"

    docs_page = apex.documents.list(per_page=25)
    assert len(docs_page.items) == 1

    doc_detail = apex.documents.get("doc_1")
    assert doc_detail.document.id == "doc_1"
    assert len(doc_detail.chunks) == 1

    deleted_doc = apex.documents.delete("doc_1")
    assert deleted_doc["deleted"] is True


@pytest.mark.asyncio
async def test_threads_and_documents_async():
    def handler(request: httpx.Request) -> httpx.Response:
        if (
            request.url.path == "/api/v1/acme/apex/documents"
            and request.method == "GET"
            and request.url.params.get("chunks") == "true"
        ):
            return httpx.Response(
                200,
                json={
                    "chunks": [
                        {
                            "id": "chk_async_1",
                            "documentId": "doc_async_1",
                            "documentTitle": "Async Doc",
                            "sourceUri": "docs/async.md",
                            "chunkIndex": 0,
                            "content": "Async chunk content.",
                            "score": 0.91,
                        }
                    ]
                },
            )
        if request.url.path == "/api/v1/acme/apex/threads" and request.method == "GET":
            return httpx.Response(
                200,
                json={
                    "threads": [
                        {
                            "id": "thr_async_1",
                            "workspaceId": "ws_1",
                            "title": "Async Workstream",
                            "status": "active",
                            "scope": "user",
                        }
                    ],
                    "pagination": {"page": 1, "perPage": 10, "total": 1, "hasMore": False},
                },
            )
        return httpx.Response(404)

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    async with AsyncMemCell(api_key="mc_test_key", http_client=http) as client:
        assert client.base_url == "https://memcell.ai"
        apex = client.scope("acme/apex")
        threads_page = await apex.threads.list(status="active")
        assert len(threads_page.items) == 1
        assert threads_page.items[0].title == "Async Workstream"

        search_res = await apex.documents.search("async chunk", limit=2)
        assert len(search_res.chunks) == 1
        assert search_res.chunks[0].path == "docs/async.md"
