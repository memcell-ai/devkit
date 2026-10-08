from __future__ import annotations

import re
import pytest
from memcell import MemcellClient, AsyncMemcellClient


def test_compounded_live_lifecycle_flow(env):
    """
    Evaluates the MemCell Python SDK as a continuous, realistic lifecycle flow:
    - Stage 1: Workspace Verification & Metadata Update
    - Stage 2: Autonomous Agent Registration & Dedicated Key Minting
    - Stage 3: Agent Authentication & Scoped Client Binding
    - Stage 4: Cold State Check on Fresh Workspace
    - Stage 5: Epistemic Ingestion Across Types, Scopes, and Statuses
    - Stage 6: Epistemic Knowledge Graph Relations
    - Stage 7: Semantic Recall, Graph Synthesis, & Provisional Filtering
    - Stage 8: Execution Outcome Reporting & Confidence Trajectory
    - Stage 9: Epistemic Governance & Memory Promotion Workflow
    - Stage 10: Memory Evolution, Lineage History & Star Toggling
    - Stage 11: Security Gate: Agent Key Revocation
    """

    # ── Stage 1: Workspace Verification & Metadata Update ──
    ws = env.client.workspaces.get(env.namespace)
    assert ws.slug == env.ws_slug

    updated_ws = env.client.workspaces.update(
        env.namespace,
        description="Compounded Python Flow: Automated Customer Operations",
    )
    assert updated_ws.description == "Compounded Python Flow: Automated Customer Operations"

    # ── Stage 2: Autonomous Agent Registration & Dedicated Key Minting ──
    agent = env.client.agents.create(
        env.namespace,
        name="Triage Dispatcher",
        description="Autonomous refund evaluation and customer operations agent",
    )
    assert agent.id
    assert agent.name == "Triage Dispatcher"

    key_record = env.client.agents.create_key(env.namespace, agent.id)
    assert key_record.id
    assert key_record.key.startswith("mc_ag_")
    assert key_record.preview.startswith("mc_ag_")

    agent_id = agent.id
    agent_key_id = key_record.id
    agent_token = key_record.key

    # ── Stage 3: Agent Authentication & Scoped Client Binding ──
    agent_client = MemcellClient(
        base_url=env.instance_url,
        token=agent_token,
    )
    scoped_agent = agent_client.workspace(env.namespace)
    assert scoped_agent is not None

    # ── Stage 4: Cold State Check on Fresh Workspace ──
    cold_recall = scoped_agent.recall(intent="Process customer wire refund payment")
    assert len(cold_recall.memories) == 0
    assert cold_recall.prompt_context == ""

    # ── Stage 5: Epistemic Ingestion Across Types, Scopes, and Statuses ──
    # 1. Enforced guard memory
    guard = scoped_agent.memories.create(
        title="Direct disbursements exceeding $500 require dual-officer supervisory authorization",
        type="guard",
        scope="workspace",
        enforce=True,
    )
    assert guard.id
    assert guard.type == "guard"
    guard_id = guard.id

    # 2. Operational directive memory
    directive = scoped_agent.memories.create(
        title="Verify customer IBAN and identity records prior to processing refund dispatches",
        type="directive",
        scope="workspace",
    )
    assert directive.id
    directive_id = directive.id
    initial_version = directive.version or 1

    # 3. User-scoped personal preference memory
    personal = scoped_agent.memories.create(
        title="Format all customer transaction audit summaries with markdown bullet points and ISO timestamps",
        type="preference",
        scope="user",
    )
    assert personal.id
    personal_id = personal.id

    # 4. Provisional unverified observation
    provisional = scoped_agent.memories.create(
        title="Suspected European central bank routing code realignment pending regulatory confirmation",
        type="observation",
        status="provisional",
        scope="workspace",
    )
    assert provisional.id
    assert provisional.status == "provisional"
    provisional_id = provisional.id

    # ── Stage 6: Epistemic Knowledge Graph Relations ──
    # Connect directive -> guard with `limits` relation (directive constrains guard)
    rel = env.client.relations.relate(
        env.namespace,
        source_id=directive_id,
        target_id=guard_id,
        type="limits",
    )
    assert rel.get("ok") is True

    # Inspect relations on directive
    graph = env.client.relations.list(env.namespace, directive_id)
    outgoing_targets = [
        r.target_id for r in graph.outgoing if r.relation_type == "limits"
    ]
    assert guard_id in outgoing_targets

    # ── Stage 7: Semantic Recall, Graph Synthesis, & Provisional Filtering ──
    recall = scoped_agent.recall(
        intent="Issue a $750 wire refund disbursement to customer Jane Doe"
    )
    assert len(recall.memories) >= 1
    assert len(recall.prompt_context) > 0
    assert re.search(r"disbursement|refund|authorization", recall.prompt_context, re.IGNORECASE)

    # Provisional memory must be excluded by default
    recalled_ids = [m.id for m in recall.memories]
    assert provisional_id not in recalled_ids

    # Recalling with allow_provisional=True includes the provisional observation
    recall_prov = agent_client.recall(
        namespace=env.namespace,
        intent="European banking routing code verification",
        allow_provisional=True,
        min_confidence=0.1,
    )
    prov_ids = [m.id for m in recall_prov.memories]
    assert provisional_id in prov_ids

    # ── Stage 8: Execution Outcome Reporting & Confidence Trajectory ──
    report_res = scoped_agent.report(
        memory_id=guard_id,
        outcome="worked",
        reason="Agent redirected $750 refund to supervisor for dual-officer signature per guard policy.",
    )
    assert report_res.outcome == "worked"
    assert report_res.attributed is not None

    # ── Stage 9: Epistemic Governance & Memory Promotion Workflow ──
    promo = env.client.promotions.request(
        env.namespace,
        memory_id=personal_id,
        to_scope="workspace",
        reason="Standardizing markdown audit summary format across all workspace agents",
    )
    assert promo is not None

    if not promo.promoted:
        pending_list = env.client.promotions.list(env.namespace, status="pending")
        target_req = next((p for p in pending_list.items if p.memory_id == personal_id), None)
        if target_req:
            approved = env.client.promotions.approve(env.namespace, target_req.id)
            assert approved.get("approved") is True or approved.get("status") == "approved"

    # ── Stage 10: Memory Evolution, Lineage History & Star Toggling ──
    updated_dir = env.client.memories.update(
        env.namespace,
        directive_id,
        title="Verify customer IBAN, identity records, and tax exemption status prior to refund dispatches",
    )
    assert (updated_dir.version or 1) > initial_version

    history = env.client.memories.history(env.namespace, directive_id)
    assert history.total_versions >= 2
    assert len(history.history) >= 2

    star_res = env.client.memories.star(env.namespace, directive_id, starred=True)
    assert star_res.starred is True

    unstar_res = env.client.memories.star(env.namespace, directive_id, starred=False)
    assert unstar_res.starred is False

    # ── Stage 11: Security Gate: Agent Key Revocation ──
    env.client.agents.revoke_key(env.namespace, agent_id, agent_key_id)

    # Subsequent recall calls using revoked agent client must be rejected with 401/403
    with pytest.raises(Exception):
        agent_client.recall(
            namespace=env.namespace,
            intent="Attempt recall after key revocation",
        )

    agent_client.close()


@pytest.mark.asyncio
async def test_async_compounded_live_flow(env):
    """
    Evaluates the MemCell Python Async SDK client on the live workspace:
    - Scoped async handle binding
    - Async memory creation
    - Async recall and promptContext synthesis
    - Async outcome reporting
    """
    async_client = env.async_client
    scoped = async_client.workspace(env.namespace)

    # 1. Async memory ingestion
    fact = await scoped.memories.create(
        title="High-priority operations wire transfers are processed via TARGET2 network",
        type="fact",
        scope="workspace",
    )
    assert fact.id
    assert fact.type == "fact"

    # 2. Async semantic recall
    recall_res = await scoped.recall(
        intent="What payment network routes high-priority operations wire transfers?",
        min_confidence=0.1,
    )
    assert len(recall_res.memories) >= 1
    assert "TARGET2" in recall_res.prompt_context

    # 3. Async outcome reporting
    report_res = await scoped.report(
        memory_id=fact.id,
        outcome="worked",
        reason="Agent routed payment via TARGET2 correctly.",
    )
    assert report_res.outcome == "worked"
