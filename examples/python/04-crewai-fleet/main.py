import json
import os

from memcell import MemCell
from memcell.integrations import create_crewai_task_callback, create_crewai_tools

token = os.getenv("MEMCELL_TOKEN", "mc_pat_mock_demo")
instance = os.getenv("MEMCELL_URL", "http://localhost:3000")
namespace = os.getenv("MEMCELL_WORKSPACE", "acme/editorial-crew")

client = MemCell(token=token, base_url=instance)
session_id = "crew_q2_cloud_report"
editorial = client.scope(namespace, subject="q2-cloud-adoption-brief")


def main() -> None:
    print("=== CrewAI Multi-Agent Fleet: Orchestrator <-> Subagent Memory Sync ===\n")

    # 1. Editor-in-Chief (Orchestrator) seeds standing editorial instructions & enforced guards
    print("1. [Orchestrator Editor] Seeding enforced workspace editorial rules...")
    editorial.remember(
        title="Tone guideline: Professional, authoritative, and concise; avoid promotional hyperbole",
        type="instruction",
        scope="workspace",
        session_id=session_id,
    )
    guard_res = editorial.remember(
        title="Fact-checking mandate: All statistical claims must cite primary regulatory or peer-reviewed sources",
        type="instruction",
        scope="workspace",
        enforce=True,
        session_id=session_id,
    )
    guard_id = guard_res.created[0].id if guard_res.created else ""
    print(f"   [OK] Enforced editorial instruction active: [{guard_id}]\n")

    # 2. Researcher Subagent uses CrewAI tools (`create_crewai_tools`) to recall rules & file a provisional finding
    print("2. [Researcher Subagent] Running with CrewAI tools (`create_crewai_tools`)...")
    crew_tools = create_crewai_tools(editorial)
    tool_map = {t.name: t for t in crew_tools}

    recall_json = json.loads(
        tool_map["recall_memory"].run(query="Research Q2 enterprise cloud adoption statistics")
    )
    print(
        f"   [Researcher Tool: recall_memory] Loaded {len(recall_json['memories'])} workspace instructions (recall_id={recall_json['recall_id']})."
    )

    # Researcher records raw finding as `provisional` on the shared session thread
    finding_res = editorial.remember(
        title="Gartner Q2 survey: 74% of Fortune 500 workloads now run multi-cloud architectures",
        type="fact",
        status="provisional",
        scope="workspace",
        session_id=session_id,
        touched=["https://gartner.com/reports/2026-q2-cloud"],
        actions=[
            {
                "type": "tool_call",
                "name": "verify_primary_source",
                "summary": "Cross-checked Q2 survey sample size (N=1,200 CIOs)",
                "outcome": "success",
            }
        ],
    )
    finding = finding_res.created[0]
    print(f"   [Researcher] Filed provisional fact [{finding.id}] on session '{session_id}'.\n")

    # 3. Orchestrator inspects the shared session thread, promotes the verified fact, and dispatches Writer Subagent
    print("3. [Orchestrator Editor] Promoting verified Researcher finding for Writer Subagent...")
    promo = editorial.memories.promote(
        finding.id,
        to_scope="workspace",
        reason="Primary source citation verified by Editor-in-Chief",
    )
    if promo.promotion_request:
        editorial.promotions.approve(
            promo.promotion_request.id,
            reason="Approved for publication",
        )

    # 4. Writer Subagent recalls promoted facts + session thread and reports completion via `create_crewai_task_callback`
    print("4. [Writer Subagent] Recalling synchronized context and firing CrewAI task callback...")
    writer_recall = editorial.recall(
        query="Draft executive summary of Q2 enterprise cloud survey results",
        session_id=session_id,
    )
    print(
        f"   [Writer Context]: {len(writer_recall.memories)} verified memories | Active Thread Turns: {writer_recall.matched_thread.turn_count if writer_recall.matched_thread else 1}"
    )

    task_callback = create_crewai_task_callback(
        editorial,
        action="draft_q2_cloud_brief",
        recall_id=writer_recall.recall_id,
    )
    task_output = type(
        "CrewTaskOutput",
        (),
        {"description": "Completed Q2 cloud executive brief adhering to tone and citation mandates"},
    )()
    task_callback(task_output)
    print("   [OK] CrewAI task_callback reported outcome='worked' and reinforced fleet memories.")


if __name__ == "__main__":
    main()
