import json
from typing import Any

import httpx
import pytest

from memcell import AsyncMemCell, MemCell


def test_fleet_and_governance_sync():
    recorded: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method
        body = json.loads(request.content.decode()) if request.content else None
        recorded.append({"method": method, "url": u, "body": body})

        # POST /api/v1/organizations/acme/fleet
        if (
            method == "POST"
            and "/api/v1/organizations/acme/fleet" in u
            and not any(x in u for x in ["/suspend", "/resume", "/grant"])
        ):
            return httpx.Response(
                201,
                json={
                    "agent": {
                        "id": "ag_100",
                        "name": body.get("name", "Research Agent"),
                        "slug": "research-agent",
                        "scope": body.get("scope", "organization"),
                        "framework": body.get("framework"),
                        "status": "active",
                        "health": "healthy",
                        "organizationId": "org_1",
                        "activeKeyCount": 1,
                        "workspaceGrantCount": 0,
                        "createdAt": "2026-10-02T12:00:00Z",
                    },
                    "key": {
                        "key": "mc_ag_live_secret123",
                        "keyPrefix": "mc_ag_live",
                        "keyId": "key_100",
                    },
                },
            )

        # GET /api/v1/organizations/acme/fleet
        if method == "GET" and "/api/v1/organizations/acme/fleet" in u and "/ag_100" not in u:
            return httpx.Response(
                200,
                json={
                    "agents": [
                        {
                            "id": "ag_100",
                            "name": "Research Agent",
                            "slug": "research-agent",
                            "scope": "organization",
                            "status": "active",
                            "health": "healthy",
                            "organizationId": "org_1",
                            "activeKeyCount": 1,
                            "workspaceGrantCount": 0,
                            "createdAt": "2026-10-02T12:00:00Z",
                        }
                    ]
                },
            )

        # GET /api/v1/organizations/acme/fleet/ag_100
        if method == "GET" and "/api/v1/organizations/acme/fleet/ag_100" in u:
            return httpx.Response(
                200,
                json={
                    "agent": {
                        "id": "ag_100",
                        "name": "Research Agent",
                        "slug": "research-agent",
                        "scope": "organization",
                        "status": "active",
                        "health": "healthy",
                        "organizationId": "org_1",
                    },
                    "keys": [{"id": "key_100", "keyPrefix": "mc_ag_live"}],
                    "grants": [],
                },
            )

        # POST /api/v1/organizations/acme/fleet/ag_100/suspend
        if method == "POST" and "/api/v1/organizations/acme/fleet/ag_100/suspend" in u:
            return httpx.Response(
                200,
                json={
                    "agent": {
                        "id": "ag_100",
                        "name": "Research Agent",
                        "slug": "research-agent",
                        "status": "suspended",
                        "suspensionReason": body.get("reason", "manual"),
                        "suspendedAt": "2026-10-02T12:05:00Z",
                    }
                },
            )

        # POST /api/v1/organizations/acme/fleet/ag_100/resume
        if method == "POST" and "/api/v1/organizations/acme/fleet/ag_100/resume" in u:
            return httpx.Response(
                200,
                json={
                    "agent": {
                        "id": "ag_100",
                        "name": "Research Agent",
                        "slug": "research-agent",
                        "status": "active",
                        "suspensionReason": None,
                        "suspendedAt": None,
                    }
                },
            )

        # POST /api/v1/organizations/acme/fleet/ag_100/grant
        if method == "POST" and "/api/v1/organizations/acme/fleet/ag_100/grant" in u:
            return httpx.Response(
                200,
                json={
                    "grant": {
                        "agentId": "ag_100",
                        "workspaceId": body.get("workspaceId"),
                        "grantedAt": "2026-10-02T12:10:00Z",
                    }
                },
            )

        # DELETE /api/v1/organizations/acme/fleet/ag_100/grant
        if method == "DELETE" and "/api/v1/organizations/acme/fleet/ag_100/grant" in u:
            return httpx.Response(200, json={"ok": True})

        # GET /api/v1/organizations/acme/audit-logs/export
        if method == "GET" and "/api/v1/organizations/acme/audit-logs/export" in u:
            if "format=cef" in u:
                return httpx.Response(
                    200,
                    text="CEF:0|MemCell|Platform|1.0|agent.suspended|Agent Suspended|8|suser=admin\n",
                    headers={"Content-Type": "text/plain"},
                )
            return httpx.Response(
                200,
                text="id,action,actor_name\naud_1,agent.suspended,admin\n",
                headers={"Content-Type": "text/csv"},
            )

        # GET /api/v1/organizations/acme/audit-logs
        if (
            method == "GET"
            and "/api/v1/organizations/acme/audit-logs" in u
            and "/destinations" not in u
        ):
            return httpx.Response(
                200,
                json={
                    "events": [
                        {
                            "id": "aud_1",
                            "organizationId": "org_1",
                            "action": "agent.suspended",
                            "targetType": "agent",
                            "targetId": "ag_100",
                            "actorType": "user",
                            "actorName": "Admin User",
                            "createdAt": "2026-10-02T12:05:00Z",
                        }
                    ]
                },
            )

        # GET /api/v1/organizations/acme/insights
        if method == "GET" and "/api/v1/organizations/acme/insights" in u:
            return httpx.Response(
                200,
                json={
                    "timeframe": "30d",
                    "kpis": {
                        "deadEndAvoidanceRate": 98.5,
                        "recallUtilizationRate": 74.2,
                        "recallPrecisionRate": 96.0,
                        "memoryConvergenceRate": 88.0,
                        "tokensSaved": 450000,
                        "estimatedCostSavedUsd": 4.50,
                        "latencyMs": {"p50": 12.0, "p95": 28.0, "p99": 45.0},
                    },
                    "metrics": {
                        "totalRecalls": 1500,
                        "workedRecalls": 1475,
                        "failedRecalls": 25,
                        "pendingRecalls": 0,
                        "totalMemories": 320,
                        "convergedMemories": 280,
                    },
                    "timeseries": [],
                },
            )

        # GET /api/v1/organizations/acme/teams
        if method == "GET" and "/api/v1/organizations/acme/teams" in u:
            return httpx.Response(
                200,
                json={
                    "teams": [
                        {
                            "id": "team_1",
                            "name": "Research Engineering",
                            "organizationId": "org_1",
                            "memberCount": 5,
                            "workspaceCount": 2,
                            "agentCount": 3,
                        }
                    ]
                },
            )

        return httpx.Response(404, json={"detail": "Not found"})

    transport = httpx.MockTransport(handler)
    http = httpx.Client(transport=transport, base_url="https://api.memcell.io")
    client = MemCell(api_key="test-key", http_client=http)

    org = client.organization("acme")

    # 1. Fleet registration & listing
    created = org.fleet.register(name="Research Agent", scope="organization")
    assert created.agent.id == "ag_100"
    assert created.key is not None
    assert created.key.key == "mc_ag_live_secret123"

    agents = org.fleet.list()
    assert len(agents) == 1
    assert agents[0].slug == "research-agent"

    detail = org.fleet.get("ag_100")
    assert detail.agent.id == "ag_100"
    assert len(detail.keys) == 1

    # 2. Emergency Kill-Switch & Resumption
    suspended = org.fleet.suspend("ag_100", reason="Behavioral deviation detected")
    assert suspended.status == "suspended"
    assert suspended.suspension_reason == "Behavioral deviation detected"

    resumed = org.fleet.resume("ag_100")
    assert resumed.status == "active"
    assert resumed.suspension_reason is None

    # 3. Workspace grant and revoke
    grant = org.fleet.grant_workspace("ag_100", "ws_42")
    assert grant["grant"]["workspaceId"] == "ws_42"

    org.fleet.revoke_workspace("ag_100", "ws_42")

    # 4. Enterprise Audit Logs & Export
    audit_events = org.audit.list()
    assert len(audit_events) == 1
    assert audit_events[0].action == "agent.suspended"

    cef_export = org.audit.export(format="cef")
    assert "CEF:0|MemCell|Platform" in cef_export

    # 5. Enterprise Insights
    insights = org.insights.get(timeframe="30d")
    assert insights.kpis.dead_end_avoidance_rate == 98.5
    assert insights.kpis.latency_ms.p50 == 12.0
    assert insights.metrics.total_recalls == 1500

    # 6. Teams
    teams = org.teams.list()
    assert len(teams) == 1
    assert teams[0].name == "Research Engineering"


@pytest.mark.asyncio
async def test_fleet_and_governance_async():
    def handler(request: httpx.Request) -> httpx.Response:
        u = str(request.url)
        method = request.method

        if method == "GET" and "/api/v1/organizations/acme/fleet" in u:
            return httpx.Response(
                200,
                json={
                    "agents": [
                        {
                            "id": "ag_200",
                            "name": "Async Agent",
                            "slug": "async-agent",
                            "scope": "organization",
                            "status": "active",
                            "health": "healthy",
                            "organizationId": "org_1",
                        }
                    ]
                },
            )

        if method == "GET" and "/api/v1/organizations/acme/insights" in u:
            return httpx.Response(
                200,
                json={
                    "timeframe": "7d",
                    "kpis": {
                        "deadEndAvoidanceRate": 99.0,
                        "recallUtilizationRate": 80.0,
                        "recallPrecisionRate": 97.0,
                        "memoryConvergenceRate": 90.0,
                        "tokensSaved": 100000,
                        "estimatedCostSavedUsd": 1.0,
                        "latencyMs": {"p50": 10.0, "p95": 20.0, "p99": 35.0},
                    },
                    "metrics": {
                        "totalRecalls": 500,
                        "workedRecalls": 495,
                        "failedRecalls": 5,
                        "pendingRecalls": 0,
                        "totalMemories": 100,
                        "convergedMemories": 90,
                    },
                    "timeseries": [],
                },
            )

        return httpx.Response(404, json={"detail": "Not found"})

    transport = httpx.MockTransport(handler)
    http = httpx.AsyncClient(transport=transport, base_url="https://api.memcell.io")
    client = AsyncMemCell(api_key="test-key", http_client=http)

    org = client.organization("acme")

    agents = await org.fleet.list()
    assert len(agents) == 1
    assert agents[0].name == "Async Agent"

    insights = await org.insights.get(timeframe="7d")
    assert insights.kpis.dead_end_avoidance_rate == 99.0
