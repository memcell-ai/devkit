import json

import httpx
import pytest

from memcell import AsyncMemCell, MemCell


def test_sync_client_recall_and_remember():
    requests_log = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests_log.append(request)
        if request.url.path == "/api/v1/acme/backend/recall":
            return httpx.Response(
                200,
                json={
                    "recallId": "rec_sync_1",
                    "promptContext": "<memcell>Context</memcell>",
                    "memories": [
                        {
                            "id": "st_sync_1",
                            "title": "Never skip verification",
                            "type": "directive",
                            "confidence": 0.95,
                        }
                    ],
                },
            )
        if request.url.path == "/api/v1/acme/backend/remember":
            return httpx.Response(
                200,
                json={
                    "created": [
                        {
                            "id": "st_sync_2",
                            "title": "Always test locally",
                            "type": "directive",
                            "confidence": 0.8,
                        }
                    ]
                },
            )
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memory = MemCell(api_key="mc_live_test", http_client=mock_client)

    # Recall
    recall = memory.recall(
        namespace="acme/backend",
        query="deploy procedure",
        metadata={"threadId": "thr_42"},
        include_metadata=True,
    )
    assert recall.recall_id == "rec_sync_1"
    assert recall.prompt_context == "<memcell>Context</memcell>"
    assert len(recall.memories) == 1
    assert recall.memories[0].title == "Never skip verification"
    assert recall.memories[0].type == "directive"
    sent_payload = json.loads(requests_log[0].content.decode("utf-8"))
    assert sent_payload["metadata"] == {"threadId": "thr_42"}
    assert sent_payload["include_metadata"] is True

    # Remember
    remember = memory.remember(namespace="acme/backend", title="Always test locally")
    assert len(remember.created) == 1
    assert remember.created[0].id == "st_sync_2"


def test_sync_scoped_memcell_wrap_execution():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/recall"):
            calls.append("recall")
            return httpx.Response(
                200,
                json={
                    "recallId": "rec_wrap_1",
                    "promptContext": "<memcell>Guards loaded</memcell>",
                    "memories": [],
                },
            )
        if request.url.path.endswith("/report"):
            calls.append("report")
            body = json.loads(request.content.decode("utf-8"))
            assert body["outcome"] == "worked"
            assert body["action_taken"] == "deploy_service"
            return httpx.Response(200, json={"outcome": "worked", "attributed": []})
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memory = MemCell(api_key="mc_live_test", http_client=mock_client)
    devops = memory.scope("acme/devops", subject="pipeline")

    exec_result = devops.wrap_execution(
        action="deploy_service",
        fn=lambda ctx: calls.append("action") or {"status": "ok"},
    )

    assert calls == ["recall", "action", "report"]
    assert exec_result.result == {"status": "ok"}
    assert exec_result.report.outcome == "worked"


def test_sync_organization_memcell():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/organizations":
            return httpx.Response(
                200,
                json={
                    "ok": True,
                    "organizations": [
                        {
                            "id": "o1",
                            "slug": "acme-corp",
                            "name": "Acme Corporation",
                            "role": "owner",
                        }
                    ],
                },
            )
        if request.url.path == "/api/v1/acme-corp/backend/recall":
            return httpx.Response(
                200,
                json={"recallId": "rec_org_1", "promptContext": "<org>", "memories": []},
            )
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memory = MemCell(api_key="mc_live_test", http_client=mock_client)

    orgs = memory.organizations.list()
    assert len(orgs) == 1
    assert orgs[0].slug == "acme-corp"

    acme = memory.for_organization("acme-corp")
    assert acme.org_slug == "acme-corp"

    recall = acme.recall(namespace="backend", query="auth flow")
    assert recall.recall_id == "rec_org_1"


@pytest.mark.asyncio
async def test_async_client_lifecycle():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/recall"):
            calls.append("recall")
            return httpx.Response(
                200,
                json={
                    "recallId": "rec_async_1",
                    "promptContext": "<xml>Async</xml>",
                    "memories": [],
                },
            )
        if request.url.path.endswith("/report"):
            calls.append("report")
            return httpx.Response(200, json={"outcome": "worked", "attributed": []})
        return httpx.Response(404)

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    async with AsyncMemCell(api_key="mc_live_test", http_client=mock_client) as memory:
        scoped = memory.scope("acme/infra")
        res = await scoped.wrap_execution(
            action="provision_database",
            fn=lambda ctx: calls.append("action") or 42,
        )

    assert calls == ["recall", "action", "report"]
    assert res.result == 42
    assert res.recall.recall_id == "rec_async_1"


def test_streaming_job_completion():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/jobs/job_101/stream":
            sse_data = (
                b'data: {"step":"distilling","progress":25,"message":"Distilling..."}\n\n'
                b'data: {"step":"completed","progress":100,"message":"Complete."}\n\n'
            )
            return httpx.Response(
                200, content=sse_data, headers={"content-type": "text/event-stream"}
            )
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memory = MemCell(api_key="mc_live_test", http_client=mock_client)

    events = []
    final_event = memory.wait_for_job("job_101", on_progress=lambda e: events.append(e))

    assert final_event.step == "completed"
    assert final_event.progress == 100
    assert len(events) == 2
    assert events[0].step == "distilling"


def test_memories_resource_sync():
    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method

        if "/memories?" in u and method == "GET":
            return httpx.Response(
                200,
                json={
                    "memories": [
                        {
                            "id": "stmt_1",
                            "title": "Direct connection pool setup",
                            "type": "directive",
                            "status": "active",
                        }
                    ],
                    "pagination": {"page": 2, "perPage": 15, "total": 25, "hasMore": False},
                },
            )
        if u.endswith("/memories") and method == "POST":
            body = json.loads(request.content.decode("utf-8"))
            return httpx.Response(
                201,
                json={
                    "memory": {
                        "id": "stmt_new",
                        "title": body["title"],
                        "type": body.get("type", "directive"),
                    }
                },
            )
        if u.endswith("/memories/stmt_new") and method == "GET":
            return httpx.Response(
                200,
                json={"memory": {"id": "stmt_new", "title": "Existing", "type": "directive"}},
            )
        if u.endswith("/memories/stmt_new") and method == "PATCH":
            body = json.loads(request.content.decode("utf-8"))
            return httpx.Response(
                200,
                json={"memory": {"id": "stmt_new", "title": body["title"], "type": "directive"}},
            )
        if "/memories/stmt_new" in u and method == "DELETE":
            all_v = "allVersions=true" in u
            return httpx.Response(
                200,
                json={
                    "status": "deleted",
                    "deletedCount": 2 if all_v else 1,
                    "deletedScope": "memory" if all_v else "version",
                    "nextId": None if all_v else "stmt_v1",
                    "restoredVersion": None if all_v else 1,
                    "message": "Deleted memory" if all_v else "Deleted latest version of memory",
                },
            )
        if u.endswith("/star") and method == "PUT":
            return httpx.Response(200, json={"rootId": "root_1", "starred": True, "starCount": 1})
        if u.endswith("/history") and method == "GET":
            return httpx.Response(
                200,
                json={
                    "rootId": "root_1",
                    "totalVersions": 2,
                    "history": [
                        {"id": "stmt_v2", "rootId": "root_1", "version": 2, "title": "V2"},
                        {"id": "stmt_v1", "rootId": "root_1", "version": 1, "title": "V1"},
                    ],
                },
            )
        if u.endswith("/adopt") and method == "POST":
            return httpx.Response(
                200,
                json={
                    "ok": True,
                    "sourceMemoryId": "stmt_1",
                    "adopted": [{"projectId": "p2", "memoryId": "stmt_2", "alreadyExisted": False}],
                },
            )
        if u.endswith("/promote") and method == "POST":
            return httpx.Response(
                200,
                json={
                    "promoted": True,
                    "memory": {"id": "stmt_1", "title": "Promoted", "status": "active"},
                },
            )
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memcell = MemCell(api_key="mc_key", http_client=mock_client)

    listed = memcell.memories.list("acme/backend", page=2, per_page=15, type="directive")
    assert len(listed.items) == 1
    assert listed.items[0].id == "stmt_1"
    assert listed.pagination.total == 25

    created = memcell.memories.create("acme/backend", title="Memory A", type="directive")
    assert created.id == "stmt_new"

    fetched = memcell.memories.get("acme/backend", "stmt_new")
    assert fetched.title == "Existing"

    updated = memcell.memories.update("acme/backend", "stmt_new", title="Updated Title")
    assert updated.title == "Updated Title"

    del_res = memcell.memories.delete("acme/backend", "stmt_new")
    assert del_res.status == "deleted"
    assert del_res.deleted_count == 1
    assert del_res.deleted_scope == "version"
    assert del_res.next_id == "stmt_v1"
    assert del_res.restored_version == 1

    del_all = memcell.memories.delete("acme/backend", "stmt_new", all_versions=True)
    assert del_all.deleted_count == 2
    assert del_all.deleted_scope == "memory"

    star_res = memcell.memories.star("acme/backend", "stmt_1", starred=True)
    assert star_res.starred is True

    hist_res = memcell.memories.history("acme/backend", "stmt_1")
    assert len(hist_res.history) == 2

    adopt_res = memcell.memories.adopt("acme/backend", "stmt_1", ["p2"])
    assert adopt_res.adopted[0].memory_id == "stmt_2"

    promote_res = memcell.memories.promote("acme/backend", "stmt_1", to_scope="common")
    assert promote_res.promoted is True


@pytest.mark.asyncio
async def test_memories_resource_async():
    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method
        if "/memories" in u and method == "GET":
            return httpx.Response(
                200,
                json={
                    "memories": [
                        {
                            "id": "stmt_1",
                            "title": "Direct connection pool setup",
                            "type": "directive",
                            "status": "active",
                        }
                    ],
                    "pagination": {"page": 1, "perPage": 10, "total": 1, "hasMore": False},
                },
            )
        if u.endswith("/memories") and method == "POST":
            return httpx.Response(
                201,
                json={"memory": {"id": "stmt_async", "title": "Async Title", "type": "fact"}},
            )
        if "/memories/stmt_async" in u and method == "DELETE":
            return httpx.Response(
                200,
                json={
                    "status": "deleted",
                    "deletedCount": 1,
                    "deletedScope": "version",
                    "nextId": "stmt_v0",
                    "restoredVersion": 1,
                    "message": "Deleted latest version of memory",
                },
            )
        return httpx.Response(404)

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    async with AsyncMemCell(api_key="mc_key", http_client=mock_client) as memcell:
        listed = await memcell.memories.list("acme/backend")
        assert len(listed.items) == 1
        assert listed.items[0].id == "stmt_1"

        created = await memcell.memories.create("acme/backend", title="Async Title", type="fact")
        assert created.id == "stmt_async"

        del_res = await memcell.memories.delete("acme/backend", "stmt_async")
        assert del_res.status == "deleted"
        assert del_res.deleted_scope == "version"
        assert del_res.restored_version == 1


def test_projects_resource_sync():
    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method

        if "/api/v1/workspaces?" in u and method == "GET":
            return httpx.Response(
                200,
                json={
                    "projects": [
                        {"id": "p1", "name": "Core", "slug": "core", "visibility": "public"}
                    ],
                    "pagination": {"page": 1, "perPage": 30, "total": 1, "hasMore": False},
                },
            )
        if "/api/v1/acme/workspaces?" in u and method == "GET":
            return httpx.Response(
                200,
                json={
                    "owner": "acme",
                    "projects": [
                        {"id": "p2", "name": "Backend", "slug": "backend", "visibility": "private"}
                    ],
                    "pagination": {"page": 1, "perPage": 10, "total": 1, "hasMore": False},
                },
            )
        if u.endswith("/api/v1/workspaces") and method == "POST":
            return httpx.Response(
                201,
                json={
                    "ok": True,
                    "project": {
                        "id": "p_new",
                        "name": "New Project",
                        "slug": "new-project",
                        "visibility": "private",
                    },
                },
            )
        if u.endswith("/api/v1/acme/backend") and method == "GET":
            return httpx.Response(
                200,
                json={
                    "project": {
                        "id": "p1",
                        "name": "Backend",
                        "slug": "backend",
                        "visibility": "private",
                    }
                },
            )
        if u.endswith("/api/v1/acme/backend") and method == "PATCH":
            return httpx.Response(
                200,
                json={
                    "project": {
                        "id": "p1",
                        "name": "Backend V2",
                        "slug": "backend",
                        "visibility": "public",
                    }
                },
            )
        if u.endswith("/api/v1/acme/backend") and method == "DELETE":
            return httpx.Response(200, json={"ok": True})
        if u.endswith("/api/v1/acme/backend/transfer") and method == "POST":
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memcell = MemCell(api_key="mc_key", http_client=mock_client)

    caller_projects = memcell.workspaces.list(page=1, per_page=30)
    assert caller_projects.items[0].slug == "core"

    owner_projects = memcell.workspaces.list_for_owner("acme", page=1, per_page=10)
    assert owner_projects.items[0].slug == "backend"

    created = memcell.workspaces.create(name="New Project")
    assert created.id == "p_new"

    got = memcell.workspaces.get("acme/backend")
    assert got.name == "Backend"

    updated = memcell.workspaces.update("acme/backend", name="Backend V2")
    assert updated.name == "Backend V2"

    memcell.workspaces.delete("acme/backend")
    memcell.workspaces.transfer("acme/backend", target_owner="new-owner")


@pytest.mark.asyncio
async def test_projects_resource_async():
    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        if "/api/v1/workspaces" in u:
            return httpx.Response(
                200,
                json={
                    "projects": [
                        {"id": "p1", "name": "Core", "slug": "core", "visibility": "public"}
                    ],
                    "pagination": {"page": 1, "perPage": 30, "total": 1, "hasMore": False},
                },
            )
        return httpx.Response(404)

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    async with AsyncMemCell(api_key="mc_key", http_client=mock_client) as memcell:
        res = await memcell.workspaces.list()
        assert len(res.items) == 1
        assert res.items[0].slug == "core"


def test_agents_resource_sync():
    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method

        if "/api/v1/acme/backend/agents" in u and "/keys" not in u and method == "GET":
            return httpx.Response(
                200,
                json={
                    "agents": [
                        {
                            "id": "ag_1",
                            "name": "Agent Alpha",
                            "slug": "agent-alpha",
                            "status": "active",
                        }
                    ],
                    "pagination": {"page": 1, "perPage": 30, "total": 1, "hasMore": False},
                },
            )
        if u.endswith("/api/v1/acme/backend/agents") and method == "POST":
            return httpx.Response(
                201,
                json={
                    "agent": {
                        "id": "ag_2",
                        "name": "Agent Beta",
                        "slug": "agent-beta",
                        "status": "active",
                    }
                },
            )
        if u.endswith("/api/v1/acme/backend/agents/ag_1/keys") and method == "POST":
            return httpx.Response(
                201,
                json={
                    "ok": True,
                    "key": {"id": "k_1", "key": "mc_ag_secret", "preview": "mc_ag_123..."},
                },
            )
        if u.endswith("/api/v1/acme/backend/agents/ag_1/keys/k_1") and method == "DELETE":
            return httpx.Response(200, json={"revoked": True})
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memcell = MemCell(api_key="mc_key", http_client=mock_client)

    agents = memcell.agents.list("acme/backend")
    assert len(agents.items) == 1
    assert agents.items[0].name == "Agent Alpha"

    created = memcell.agents.create("acme/backend", name="Agent Beta")
    assert created.id == "ag_2"

    key = memcell.agents.create_key("acme/backend", "ag_1")
    assert key.key == "mc_ag_secret"

    memcell.agents.revoke_key("acme/backend", "ag_1", "k_1")


def test_collaborators_resource_sync():
    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method

        if "/api/v1/acme/backend/collaborators" in u and method == "GET":
            return httpx.Response(
                200,
                json={
                    "collaborators": [
                        {
                            "id": "c1",
                            "userId": "u1",
                            "name": "Alice",
                            "role": "write",
                            "source": "direct",
                            "inherited": False,
                        }
                    ],
                    "pendingInvitations": [],
                    "pagination": {"page": 1, "perPage": 30, "total": 1, "hasMore": False},
                },
            )
        if u.endswith("/api/v1/acme/backend/collaborators") and method == "POST":
            return httpx.Response(
                201,
                json={
                    "ok": True,
                    "invitation": {"id": "inv_1", "email": "bob@acme.com", "role": "read"},
                },
            )
        if u.endswith("/api/v1/acme/backend/collaborators/u1") and method == "PATCH":
            return httpx.Response(200, json={"ok": True})
        if u.endswith("/api/v1/acme/backend/collaborators/u1") and method == "DELETE":
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memcell = MemCell(api_key="mc_key", http_client=mock_client)

    collabs = memcell.collaborators.list("acme/backend")
    assert len(collabs.collaborators) == 1
    assert collabs.collaborators[0].name == "Alice"

    inv = memcell.collaborators.invite("acme/backend", identifier="bob@acme.com", role="read")
    assert inv.id == "inv_1"

    memcell.collaborators.update_role("acme/backend", "u1", role="admin")
    memcell.collaborators.remove("acme/backend", "u1")


def test_organizations_expanded_sync():
    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method

        if "/api/v1/organizations/acme/members" in u and method == "GET":
            return httpx.Response(
                200,
                json={
                    "ok": True,
                    "members": [{"id": "m1", "userId": "u1", "name": "Alice", "role": "owner"}],
                    "pagination": {"page": 1, "perPage": 30, "total": 1, "hasMore": False},
                },
            )
        if u.endswith("/api/v1/organizations/acme/invitations") and method == "GET":
            return httpx.Response(
                200,
                json={
                    "ok": True,
                    "invitations": [{"id": "inv_1", "email": "charlie@acme.com", "role": "member"}],
                },
            )
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memcell = MemCell(api_key="mc_key", http_client=mock_client)

    members = memcell.organizations.list_members("acme")
    assert len(members.items) == 1
    assert members.items[0].name == "Alice"

    invites = memcell.organizations.list_invitations("acme")
    assert len(invites) == 1
    assert invites[0].email == "charlie@acme.com"


def test_usage_resource_sync():
    def handler(request: httpx.Request) -> httpx.Response:
        assert "/api/v1/acme/usage?timeframe=30d" in str(request.url)
        return httpx.Response(
            200,
            json={
                "owner": {"type": "org", "slug": "acme", "name": "Acme Corp"},
                "timeframe": "30d",
                "quotas": {
                    "memories": {
                        "total": 100,
                        "limit": 1000,
                        "percent": 10,
                        "types": {
                            "directive": 40,
                            "fact": 30,
                            "preference": 20,
                            "observation": 10,
                            "provisional": 5,
                        },
                    },
                    "apiRequests": {"total": 500, "limit": 10000, "percent": 5, "windowDays": 30},
                },
                "rateLimits": {
                    "tier": "pro",
                    "recallRpm": 600,
                    "rememberRpm": 300,
                    "defaultRpm": 300,
                    "concurrentLimit": 20,
                },
            },
        )

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memcell = MemCell(api_key="mc_key", http_client=mock_client)

    usage = memcell.usage.get("acme", timeframe="30d")
    assert usage.quotas.memories.types.directive == 40
    assert usage.quotas.memories.types.fact == 30
    assert usage.quotas.memories.types.preference == 20
    assert usage.quotas.memories.types.observation == 10


def test_account_resource_sync():
    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method

        if u.endswith("/api/v1/account/profile") and method == "GET":
            return httpx.Response(
                200,
                json={
                    "profile": {
                        "id": "u1",
                        "email": "user@test.com",
                        "name": "User One",
                        "role": "member",
                    }
                },
            )
        if u.endswith("/api/v1/account/tokens") and method == "GET":
            return httpx.Response(
                200,
                json={"tokens": [{"id": "tok_1", "name": "CLI Token", "preview": "mc_pat_123..."}]},
            )
        if u.endswith("/api/v1/account/tokens") and method == "POST":
            return httpx.Response(
                201,
                json={
                    "success": True,
                    "token": {
                        "id": "tok_2",
                        "name": "New Token",
                        "token": "mc_pat_secret",
                        "preview": "mc_pat_456...",
                    },
                },
            )
        if u.endswith("/api/v1/account/tokens/tok_1") and method == "DELETE":
            return httpx.Response(200, json={"success": True})
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memcell = MemCell(api_key="mc_key", http_client=mock_client)

    profile = memcell.account.get()
    assert profile.email == "user@test.com"

    tokens = memcell.account.tokens.list()
    assert len(tokens) == 1
    assert tokens[0].name == "CLI Token"

    created_tok = memcell.account.tokens.create(name="New Token")
    assert created_tok.token == "mc_pat_secret"

    memcell.account.tokens.revoke("tok_1")


def test_scoped_memcell_bound_namespaces():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        calls.append(u)

        if "/memories" in u:
            return httpx.Response(
                200,
                json={
                    "memories": [],
                    "pagination": {"page": 1, "perPage": 30, "total": 0, "hasMore": False},
                },
            )
        if "/agents" in u:
            return httpx.Response(
                200,
                json={
                    "agents": [],
                    "pagination": {"page": 1, "perPage": 30, "total": 0, "hasMore": False},
                },
            )
        if "/collaborators" in u:
            return httpx.Response(
                200,
                json={
                    "collaborators": [],
                    "pendingInvitations": [],
                    "pagination": {"page": 1, "perPage": 30, "total": 0, "hasMore": False},
                },
            )
        if "/scopes" in u:
            return httpx.Response(
                200,
                json={"scopes": [{"name": "common", "count": 5}]},
            )
        return httpx.Response(404)

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    memcell = MemCell(api_key="mc_key", http_client=mock_client)
    scoped = memcell.scope("acme/backend")

    scoped.memories.list()
    scoped.agents.list()
    scoped.collaborators.list()
    scopes = scoped.scopes.list()

    assert scopes[0].name == "common"
    assert all("/acme/backend/" in c for c in calls)
