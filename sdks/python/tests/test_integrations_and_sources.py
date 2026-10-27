import base64
import json
from pathlib import Path

import httpx
import pytest

from memcell import AsyncMemCell, MemCell
from memcell.integrations import (
    adispatch_openai_tool_call,
    arun_with_openai_memory,
    create_crewai_task_callback,
    create_crewai_tools,
    create_langchain_tools,
    create_langgraph_nodes,
    create_openai_agent_tools,
    create_openai_chat_tools,
    create_openai_responses_tools,
    dispatch_openai_tool_call,
    register_memcell_tools,
)


def _mock_handler(recorded: list[tuple[str, str, dict, dict | None]]):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method
        headers = dict(request.headers)
        body = json.loads(request.content.decode("utf-8")) if request.content else None
        recorded.append((method, path, headers, body))

        if path == "/api/v1/acme/ops/documents" and method == "POST":
            return httpx.Response(
                201,
                json={
                    "document": {
                        "id": "doc_pdf_1",
                        "workspaceId": "ws_1",
                        "title": body.get("title", "sla.pdf") if body else "sla.pdf",
                        "sourceUri": body.get("sourceUri", "sla.pdf") if body else "sla.pdf",
                        "sourceType": "pdf",
                        "contentType": "application/pdf",
                        "contentHash": "hash_pdf",
                        "chunkCount": 5,
                        "sizeBytes": 1200,
                    },
                    "chunkCount": 5,
                    "distilledMemoriesCount": 2,
                },
            )

        if path == "/api/v1/acme/ops/documents" and method == "GET":
            return httpx.Response(
                200,
                json={
                    "chunks": [
                        {
                            "id": "chk_1",
                            "documentId": "doc_pdf_1",
                            "documentTitle": "SLA Policy",
                            "chunkIndex": 0,
                            "content": "Enterprise SEV1 response SLA is 15 minutes.",
                            "score": 0.94,
                        }
                    ]
                },
            )

        if path == "/api/v1/acme/ops/sources" and method == "POST":
            return httpx.Response(
                201,
                json={
                    "source": {
                        "id": "src_wh_1",
                        "workspaceId": "ws_1",
                        "type": body.get("type", "webhook") if body else "webhook",
                        "name": body.get("name", "Helpdesk") if body else "Helpdesk",
                        "status": "ready",
                        "documentCount": 0,
                        "memoryCount": 0,
                    },
                    "webhookSecret": "whsrc_py_secret",
                    "ingestPath": "/api/v1/acme/ops/sources/src_wh_1/ingest",
                },
            )

        if path == "/api/v1/acme/ops/sources/src_wh_1/ingest" and method == "POST":
            return httpx.Response(
                200,
                json={
                    "status": "ready",
                    "ingestedDocuments": 1,
                    "skippedDocuments": 0,
                    "totalChunks": 4,
                    "totalMemories": 1,
                    "documents": [
                        {
                            "id": "doc_wh_1",
                            "title": "Escalation Playbook",
                            "chunkCount": 4,
                            "deduplicated": False,
                        }
                    ],
                },
            )

        if path == "/api/v1/acme/ops/sources/src_url_1/sync" and method == "POST":
            return httpx.Response(
                200,
                json={
                    "status": "ready",
                    "syncedFiles": 3,
                    "skippedFiles": 0,
                    "totalChunks": 12,
                    "totalMemories": 4,
                },
            )

        if path == "/api/v1/acme/ops/sources" and method == "GET":
            return httpx.Response(
                200,
                json={
                    "sources": [
                        {
                            "id": "src_wh_1",
                            "workspaceId": "ws_1",
                            "type": "webhook",
                            "name": "Helpdesk",
                            "status": "ready",
                            "documentCount": 1,
                            "memoryCount": 1,
                        }
                    ]
                },
            )

        if path == "/api/v1/acme/ops/recall" and method == "POST":
            return httpx.Response(
                200,
                json={
                    "recallId": "rec_py_1",
                    "promptContext": "<memcell_context>Escalate SEV1 in 15m</memcell_context>",
                    "memories": [
                        {
                            "id": "mem_1",
                            "title": "Escalate SEV1 incidents within 15 minutes",
                            "type": "instruction",
                            "confidence": 0.93,
                        }
                    ],
                },
            )

        if path == "/api/v1/acme/ops/remember" and method == "POST":
            return httpx.Response(
                201,
                json={
                    "created": [
                        {
                            "id": "mem_2",
                            "title": body.get("title", "") if body else "",
                            "type": body.get("type", "fact") if body else "fact",
                        }
                    ],
                    "evolved": [],
                },
            )

        if path == "/api/v1/acme/ops/report" and method == "POST":
            return httpx.Response(
                200,
                json={
                    "outcome": body.get("outcome", "worked") if body else "worked",
                    "attributed": [],
                },
            )

        return httpx.Response(200, json={"deleted": True})

    return handler


def test_sync_binary_document_ingest_sources_and_integrations(tmp_path: Path):
    recorded: list[tuple[str, str, dict, dict | None]] = []
    transport = httpx.MockTransport(_mock_handler(recorded))
    client = MemCell(
        api_key="mc_live_py",
        base_url="https://memcell.ai",
        http_client=httpx.Client(transport=transport),
    )
    ops = client.workspace("acme/ops")

    # 1. Binary PDF ingest via file_path
    pdf_file = tmp_path / "sla-policy.pdf"
    raw_pdf = b"%PDF-1.7 sample bytes"
    pdf_file.write_bytes(raw_pdf)

    ingested = ops.documents.ingest(file_path=pdf_file, mime_type="application/pdf", distill=True)
    assert ingested.chunk_count == 5
    assert ingested.memories_created == 2
    assert recorded[0][3] is not None
    assert recorded[0][3]["fileBase64"] == base64.b64encode(raw_pdf).decode("ascii")
    assert recorded[0][3]["filename"] == "sla-policy.pdf"

    with pytest.raises(ValueError, match="Provide either 'content'"):
        ops.documents.ingest(title="Empty")

    # 2. Webhook & URL sources
    created = ops.sources.create(type="webhook", name="Helpdesk")
    assert created.source.type == "webhook"
    assert created.webhook_secret == "whsrc_py_secret"

    pushed = ops.sources.ingest(
        "src_wh_1",
        title="Escalation Playbook",
        content="# Escalations\nPage Tier 2 immediately.",
        secret=created.webhook_secret,
    )
    assert pushed.ingested_documents == 1
    assert recorded[2][2].get("x-memcell-webhook-secret") == "whsrc_py_secret"

    synced = ops.sources.sync("src_url_1", max_pages=10)
    assert synced.synced_files == 3
    assert len(ops.sources.list()) == 1

    # 3. OpenAI, LangGraph, CrewAI, PydanticAI adapters (sync)
    chat_tools = create_openai_chat_tools()
    resp_tools = create_openai_responses_tools()
    assert len(chat_tools) == 4
    assert len(resp_tools) == 4

    dispatched = dispatch_openai_tool_call(
        ops,
        {
            "id": "call_py_1",
            "function": {
                "name": "remember_memory",
                "arguments": json.dumps(
                    {
                        "title": "VIP customers route to dedicated Slack channel",
                        "type": "instruction",
                        "enforce": True,
                    }
                ),
            },
        },
    )
    assert dispatched["tool_call_id"] == "call_py_1"
    assert "mem_2" in dispatched["output"]

    nodes = create_langgraph_nodes(ops, action="triage_flow")
    state_after_recall = nodes["recall_node"](
        {"messages": [{"role": "user", "content": "SEV1 incident reported"}]}
    )
    assert state_after_recall["recall_id"] == "rec_py_1"
    state_after_report = nodes["report_node"]({**state_after_recall, "outcome": "worked"})
    assert state_after_report["memory_reported"] is True

    lc_tools = create_langchain_tools(ops)
    search_tool = next(t for t in lc_tools if t.name == "search_documents")
    assert "15 minutes" in search_tool.invoke({"query": "SEV1 SLA"})

    crew_tools = create_crewai_tools(ops)
    crew_recall = next(t for t in crew_tools if t.name == "recall_memory")
    assert "rec_py_1" in crew_recall.run(query="SEV1 escalation")

    cb = create_crewai_task_callback(ops, recall_id="rec_py_1")
    cb(type("FakeTaskOutput", (), {"description": "Resolved ticket"})())

    registered: list[str] = []

    class DummyPydanticAgent:
        def tool_plain(self, fn):
            registered.append(fn.__name__)
            return fn

    register_memcell_tools(DummyPydanticAgent(), ops)
    assert registered == [
        "recall_memory",
        "remember_memory",
        "report_outcome",
        "search_documents",
    ]


@pytest.mark.asyncio
async def test_async_sources_and_integrations():
    recorded: list[tuple[str, str, dict, dict | None]] = []
    transport = httpx.MockTransport(_mock_handler(recorded))
    async with AsyncMemCell(
        api_key="mc_live_py",
        base_url="https://memcell.ai",
        http_client=httpx.AsyncClient(transport=transport),
    ) as client:
        ops = client.workspace("acme/ops")

        ingested = await ops.documents.ingest(
            file_bytes=b"id,tier\n1,enterprise\n",
            filename="accounts.csv",
            mime_type="text/csv",
        )
        assert ingested.chunk_count == 5

        created = await ops.sources.create(type="url", url="https://docs.acme.com/sitemap.xml")
        assert created.source.id == "src_wh_1"

        agent_tools = create_openai_agent_tools(ops)
        assert len(agent_tools) == 4
        recalled_str = await agent_tools[0]("Check enterprise SLA")
        assert "rec_py_1" in recalled_str

        dispatched = await adispatch_openai_tool_call(
            ops,
            {"call_id": "c_async", "name": "search_documents", "arguments": '{"query": "SLA"}'},
        )
        assert dispatched["tool_call_id"] == "c_async"
        assert "15 minutes" in dispatched["output"]

        turn = await arun_with_openai_memory(
            ops,
            action="resolve_vip_ticket",
            query="Handle enterprise outage",
            base_instructions="You are an SRE coordinator.",
            fn=lambda ctx: f"Context len={len(ctx['instructions'])}",
        )
        assert turn.result.startswith("Context len=")

        nodes = create_langgraph_nodes(ops, action="async_graph")
        wrapped_step = nodes["wrap_node"](
            "triage_step",
            lambda st: {"summary": f"Memories={len(st['recalled_memories'])}"},
        )
        step_out = await wrapped_step({"task": "Check SEV1 rules"})
        assert step_out["summary"] == "Memories=1"
