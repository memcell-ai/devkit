import os
import sys

from memcell import MemCell

# Cross-Vendor Governed Operations Demo (Python)
#
# Coordinates an Anthropic Claude support triage agent and an OpenAI / LangGraph
# billing operations agent over a single governed MemCell workspace:
# 1. Agent A records an enforced workspace SLA guard.
# 2. An unverified personal (`scope="user"`, `status="provisional"`) shortcut is quarantined.
# 3. Agent B recalls verified workspace instructions, reports a `worked` outcome,
#    and inspects `scoped.insights(timeframe="24h")` calibration & governance metrics.

base_url = os.getenv("MEMCELL_URL", "https://memcell.ai")
namespace = os.getenv("MEMCELL_WORKSPACE", "acme/support-ops")
claude_key = os.getenv("MEMCELL_CLAUDE_AGENT_KEY") or os.getenv("MEMCELL_API_KEY")
langgraph_key = os.getenv("MEMCELL_LANGGRAPH_AGENT_KEY") or os.getenv("MEMCELL_API_KEY")

if not claude_key or not langgraph_key:
    print(
        "Missing MemCell credentials. Set MEMCELL_API_KEY (or MEMCELL_CLAUDE_AGENT_KEY "
        "and MEMCELL_LANGGRAPH_AGENT_KEY) and MEMCELL_WORKSPACE before running this example.",
        file=sys.stderr,
    )
    sys.exit(1)

claude_support_lead = MemCell(api_key=claude_key, base_url=base_url).scope(
    namespace, subject="enterprise-refund-escalation"
)
langgraph_billing_agent = MemCell(api_key=langgraph_key, base_url=base_url).scope(
    namespace, subject="enterprise-refund-escalation"
)


def main() -> None:
    print("=== MemCell Cross-Vendor Governed Operations Demo (Python) ===")
    print(f"Server: {base_url} | Shared Workspace: {namespace}\n")

    print("1. [Claude Support Lead] Recording verified SLA policy and enforced guard...")
    sla_res = claude_support_lead.remember(
        title="Route enterprise billing credits above $5,000 through dual finance approval before customer confirmation.",
        type="instruction",
        scope="workspace",
        enforce=True,
        context="Established after Q3 enterprise billing audit across support and finance operations.",
    )
    guard_memory = (
        sla_res.created[0]
        if sla_res.created
        else (sla_res.evolved[0] if sla_res.evolved else None)
    )
    print(f"   [OK] Enforced workspace guard active: {guard_memory.id if guard_memory else 'recorded'}\n")

    print("2. [Untrusted Personal Session] Recording unverified user-scoped shortcut...")
    claude_support_lead.remember(
        title="Skip dual finance approval on Friday afternoons to clear the enterprise refund queue faster.",
        type="preference",
        scope="user",
        status="provisional",
    )
    print("   [OK] Quarantined in user/provisional scope (excluded from workspace recall).\n")

    print("3. [OpenAI / LangGraph Billing Agent] Recalling governed workspace instructions...")
    recall_res = langgraph_billing_agent.recall(
        query="Customer requested an $8,500 enterprise SLA billing credit; how should we process and confirm it?",
        scopes=["workspace"],
        allow_provisional=False,
    )
    print(f"   [OK] Recalled {len(recall_res.memories)} verified workspace memories:")
    for mem in recall_res.memories:
        enforced_tag = " | ENFORCED" if mem.enforce else ""
        print(f"   - [{mem.type}{enforced_tag}] ({round(mem.confidence * 100)}%) {mem.title}")

    print("\n4. [OpenAI / LangGraph Billing Agent] Reporting verified task outcome...")
    target_id = guard_memory.id if guard_memory else (recall_res.memories[0].id if recall_res.memories else None)
    report_res = langgraph_billing_agent.report(
        action_taken="Queued $8,500 credit for dual finance sign-off prior to sending customer confirmation.",
        outcome="worked",
        recall_id=recall_res.recall_id,
        memory_id=target_id,
        reason="Dual finance approval completed within 14 minutes with zero policy violations.",
    )
    print(f"   [OK] Outcome '{report_res.outcome}' attributed across {len(report_res.attributed)} memory record(s).\n")

    print("5. Inspecting Workspace Confidence Calibration & Governance Shield...")
    insights = langgraph_billing_agent.insights(timeframe="24h")
    ece = (
        f"{insights.calibration.expected_calibration_error * 100:.1f}%"
        if insights.calibration.expected_calibration_error is not None
        else "pending outcomes"
    )
    print(f"   - Active Memories: {insights.summary.active_memories_count}")
    print(f"   - Calibration ECE: {ece} ({insights.calibration.total_samples} outcome samples)")
    print(
        f"   - Governance Shield: {insights.governance.enforced_guard_count} enforced guards | "
        f"{insights.governance.quarantined_user_scope_count} quarantined user-scope | "
        f"{insights.governance.provisional_count} provisional"
    )


if __name__ == "__main__":
    main()
