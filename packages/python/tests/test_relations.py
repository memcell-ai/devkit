import json

import httpx
import pytest

from memcell import AsyncMemCell, MemCell


def test_relations_sync():
    recorded = []

    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method
        body = json.loads(request.content.decode()) if request.content else None
        recorded.append({"method": method, "url": u, "body": body})

        if method == "POST" and "/memories/stmt_g1/relations" in u:
            return httpx.Response(
                201,
                json={
                    "relation": {
                        "id": "rel_1",
                        "projectId": "proj_1",
                        "sourceId": "stmt_g1",
                        "targetId": body.get("targetId"),
                        "relationType": body.get("relationType"),
                        "confidence": body.get("confidence", 0.9),
                        "metadata": body.get("metadata", {}),
                        "createdAt": "2026-09-30T10:00:00Z",
                        "updatedAt": "2026-09-30T10:00:00Z",
                    }
                },
            )
        if method == "GET" and "/memories/stmt_g1/relations" in u:
            return httpx.Response(
                200,
                json={
                    "incoming": [],
                    "outgoing": [
                        {
                            "id": "rel_1",
                            "projectId": "proj_1",
                            "sourceId": "stmt_g1",
                            "targetId": "stmt_d1",
                            "relationType": "constrains",
                            "confidence": 0.95,
                            "targetMemory": {
                                "id": "stmt_d1",
                                "title": "Deploy workers",
                                "type": "directive",
                            },
                        }
                    ],
                },
            )
        if method == "DELETE" and "/memories/stmt_g1/relations/rel_1" in u:
            return httpx.Response(200, json={"ok": True})

        if method == "GET" and "/api/v1/acme/backend/relations" in u:
            return httpx.Response(
                200,
                json={
                    "relations": [
                        {
                            "id": "rel_1",
                            "projectId": "proj_1",
                            "sourceId": "stmt_g1",
                            "targetId": "stmt_d1",
                            "relationType": "constrains",
                            "confidence": 0.95,
                        }
                    ],
                    "pagination": {"page": 1, "perPage": 10, "total": 1, "hasMore": False},
                },
            )
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memcell = MemCell(api_key="mc_key", http_client=mock_client)

    # 1. Create relation
    rel = memcell.memories.create_relation(
        "acme/backend",
        memory_id="stmt_g1",
        target_id="stmt_d1",
        relation_type="constrains",
        confidence=0.95,
    )
    assert rel.id == "rel_1"
    assert rel.relation_type == "constrains"
    assert rel.source_id == "stmt_g1"
    assert rel.target_id == "stmt_d1"

    # 2. List relations on memory
    relations = memcell.memories.list_relations("acme/backend", "stmt_g1")
    assert len(relations.incoming) == 0
    assert len(relations.outgoing) == 1
    assert relations.outgoing[0].target_memory is not None
    assert relations.outgoing[0].target_memory.title == "Deploy workers"

    # 3. List project relations
    proj_relations = memcell.memories.list_project_relations(
        "acme/backend", page=1, per_page=10, relation_type="constrains"
    )
    assert len(proj_relations.items) == 1
    assert proj_relations.pagination.total == 1

    # 4. Delete relation
    memcell.memories.delete_relation("acme/backend", "stmt_g1", "rel_1")

    # 5. ScopedMemCell relations proxy
    scoped = memcell.scope("acme/backend")
    scoped_rel = scoped.memories.relations.create(
        "stmt_g1", target_id="stmt_d1", relation_type="constrains"
    )
    assert scoped_rel.id == "rel_1"


@pytest.mark.asyncio
async def test_relations_async():
    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method
        body = json.loads(request.content.decode()) if request.content else None

        if method == "POST" and "/memories/stmt_g1/relations" in u:
            return httpx.Response(
                201,
                json={
                    "relation": {
                        "id": "rel_async_1",
                        "projectId": "proj_1",
                        "sourceId": "stmt_g1",
                        "targetId": body.get("targetId"),
                        "relationType": body.get("relationType"),
                        "confidence": 0.9,
                        "metadata": {},
                    }
                },
            )
        if method == "GET" and "/memories/stmt_g1/relations" in u:
            return httpx.Response(
                200,
                json={"incoming": [], "outgoing": []},
            )
        return httpx.Response(404)

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    async with AsyncMemCell(api_key="mc_key", http_client=mock_client) as memcell:
        rel = await memcell.memories.create_relation(
            "acme/backend",
            memory_id="stmt_g1",
            target_id="stmt_d1",
            relation_type="constrains",
        )
        assert rel.id == "rel_async_1"

        rels = await memcell.memories.list_relations("acme/backend", "stmt_g1")
        assert len(rels.incoming) == 0

        # Async scoped
        scoped = memcell.scope("acme/backend")
        scoped_rel = await scoped.memories.relations.create(
            "stmt_g1", target_id="stmt_d1", relation_type="constrains"
        )
        assert scoped_rel.id == "rel_async_1"
