import json

import httpx
import pytest

from memcell import AsyncMemCell, MemCell


def test_promotions_sync():
    recorded = []

    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method
        body = json.loads(request.content.decode()) if request.content else None
        recorded.append({"method": method, "url": u, "body": body})

        # list promotions
        if method == "GET" and "/api/v1/acme/backend/promotions" in u:
            return httpx.Response(
                200,
                json={
                    "promotionRequests": [
                        {
                            "id": "req_1",
                            "memoryId": "stmt_1",
                            "fromScope": "user",
                            "toScope": "project",
                            "status": "pending",
                            "requesterId": "user_alice",
                            "requesterReason": "Team standard",
                            "reviewerId": None,
                            "reviewedAt": None,
                            "reviewReason": None,
                            "createdAt": "2026-10-01T10:00:00Z",
                            "updatedAt": "2026-10-01T10:00:00Z",
                            "memory": {
                                "id": "stmt_1",
                                "title": "Check types strictly",
                                "body": "All types must pass strictly.",
                                "type": "directive",
                                "scope": "user",
                            },
                        }
                    ],
                    "total": 1,
                },
            )

        # approve
        if method == "POST" and "/api/v1/acme/backend/promotions/req_1/approve" in u:
            return httpx.Response(
                200,
                json={
                    "approved": True,
                    "promotionRequest": {
                        "id": "req_1",
                        "memoryId": "stmt_1",
                        "fromScope": "user",
                        "toScope": "project",
                        "status": "approved",
                        "requesterId": "user_alice",
                        "requesterReason": "Team standard",
                        "reviewerId": "user_lead",
                        "reviewedAt": "2026-10-01T11:00:00Z",
                        "reviewReason": "Approved for project",
                        "createdAt": "2026-10-01T10:00:00Z",
                        "updatedAt": "2026-10-01T11:00:00Z",
                    },
                    "memory": {
                        "id": "stmt_1",
                        "title": "Check types strictly",
                        "body": "All types must pass strictly.",
                        "type": "directive",
                        "scope": "project",
                        "scopePromotedAt": "2026-10-01T11:00:00Z",
                        "scopePromotedBy": "user_lead",
                    },
                },
            )

        # reject
        if method == "POST" and "/api/v1/acme/backend/promotions/req_1/reject" in u:
            return httpx.Response(
                200,
                json={
                    "rejected": True,
                    "promotionRequest": {
                        "id": "req_1",
                        "memoryId": "stmt_1",
                        "fromScope": "user",
                        "toScope": "project",
                        "status": "rejected",
                        "requesterId": "user_alice",
                        "requesterReason": "Team standard",
                        "reviewerId": "user_lead",
                        "reviewedAt": "2026-10-01T11:00:00Z",
                        "reviewReason": "Not applicable",
                        "createdAt": "2026-10-01T10:00:00Z",
                        "updatedAt": "2026-10-01T11:00:00Z",
                    },
                },
            )

        # direct promote or promotion request creation
        if method == "POST" and "/api/v1/acme/backend/memories/stmt_1/promote" in u:
            if body and body.get("toScope") == "organization":
                return httpx.Response(
                    202,
                    json={
                        "promoted": False,
                        "promotionRequest": {
                            "id": "req_2",
                            "memoryId": "stmt_1",
                            "fromScope": "project",
                            "toScope": "organization",
                            "status": "pending",
                            "requesterId": "user_alice",
                            "createdAt": "2026-10-01T10:00:00Z",
                            "updatedAt": "2026-10-01T10:00:00Z",
                        },
                    },
                )
            return httpx.Response(
                200,
                json={
                    "promoted": True,
                    "memory": {
                        "id": "stmt_1",
                        "title": "Check types strictly",
                        "body": "All types must pass strictly.",
                        "type": "directive",
                        "scope": "project",
                    },
                },
            )

        return httpx.Response(404, json={"error": "not found"})

    client = MemCell(
        api_key="test-key",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    # 1. client.promotions.list
    res = client.promotions.list("acme/backend", status="pending")
    assert len(res.items) == 1
    assert res.items[0].id == "req_1"
    assert res.items[0].status == "pending"
    assert res.items[0].memory is not None
    assert res.items[0].memory.title == "Check types strictly"

    # 2. client.promotions.approve
    approved = client.promotions.approve(
        "acme/backend",
        "req_1",
        reason="Approved for project",
    )
    assert approved["promotionRequest"].status == "approved"
    assert approved["memory"].scope == "project"
    assert approved["memory"].scope_promoted_by == "user_lead"

    # 3. client.promotions.reject
    rejected = client.promotions.reject(
        "acme/backend",
        "req_1",
        reason="Not applicable",
    )
    assert rejected["promotionRequest"].status == "rejected"

    # 4. client.memories.promote (direct promotion)
    promo_direct = client.memories.promote("acme/backend", "stmt_1", to_scope="project")
    assert promo_direct.promoted is True
    assert promo_direct.memory is not None
    assert promo_direct.memory.scope == "project"
    assert promo_direct.promotion_request is None

    # 5. client.memories.promote (request pending review)
    promo_pending = client.memories.promote(
        "acme/backend",
        "stmt_1",
        to_scope="organization",
        reason="Needs org-wide visibility",
    )
    assert promo_pending.promoted is False
    assert promo_pending.memory is None
    assert promo_pending.promotion_request is not None
    assert promo_pending.promotion_request.to_scope == "organization"

    # 6. Scoped client promotions & memories.promote
    scoped = client.scope("acme/backend")
    scoped_list = scoped.promotions.list(status="pending")
    assert len(scoped_list.items) == 1
    assert scoped_list.items[0].id == "req_1"

    scoped_promo = scoped.memories.promote("stmt_1", to_scope="project")
    assert scoped_promo.promoted is True
    assert scoped_promo.memory is not None
    assert scoped_promo.memory.scope == "project"


@pytest.mark.asyncio
async def test_promotions_async():
    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method

        if method == "GET" and "/api/v1/acme/backend/promotions" in u:
            return httpx.Response(
                200,
                json={
                    "promotionRequests": [
                        {
                            "id": "req_async_1",
                            "memoryId": "stmt_1",
                            "fromScope": "user",
                            "toScope": "project",
                            "status": "pending",
                            "requesterId": "user_bob",
                            "createdAt": "2026-10-01T10:00:00Z",
                            "updatedAt": "2026-10-01T10:00:00Z",
                        }
                    ],
                    "total": 1,
                },
            )

        if method == "POST" and "/api/v1/acme/backend/promotions/req_async_1/approve" in u:
            return httpx.Response(
                200,
                json={
                    "approved": True,
                    "promotionRequest": {
                        "id": "req_async_1",
                        "memoryId": "stmt_1",
                        "fromScope": "user",
                        "toScope": "project",
                        "status": "approved",
                        "requesterId": "user_bob",
                        "reviewerId": "user_lead",
                        "reviewedAt": "2026-10-01T11:00:00Z",
                        "createdAt": "2026-10-01T10:00:00Z",
                        "updatedAt": "2026-10-01T11:00:00Z",
                    },
                    "memory": {
                        "id": "stmt_1",
                        "title": "Check types strictly",
                        "body": "All types must pass strictly.",
                        "type": "directive",
                        "scope": "project",
                    },
                },
            )

        if method == "POST" and "/api/v1/acme/backend/memories/stmt_1/promote" in u:
            return httpx.Response(
                200,
                json={
                    "promoted": True,
                    "memory": {
                        "id": "stmt_1",
                        "title": "Check types strictly",
                        "body": "All types must pass strictly.",
                        "type": "directive",
                        "scope": "project",
                    },
                },
            )

        return httpx.Response(404, json={"error": "not found"})

    client = AsyncMemCell(
        api_key="test-key",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )

    res = await client.promotions.list("acme/backend")
    assert len(res.items) == 1
    assert res.items[0].id == "req_async_1"

    approved = await client.promotions.approve("acme/backend", "req_async_1", reason="Approved")
    assert approved["promotionRequest"].status == "approved"

    promo = await client.memories.promote("acme/backend", "stmt_1", to_scope="project")
    assert promo.promoted is True
    assert promo.memory.scope == "project"

    scoped = client.scope("acme/backend")
    scoped_list = await scoped.promotions.list()
    assert len(scoped_list.items) == 1
