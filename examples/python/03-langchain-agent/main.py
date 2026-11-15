import json
import os
from typing import Any

from memcell import MemCell
from memcell.integrations import create_langchain_tools, create_langgraph_nodes

token = os.getenv("MEMCELL_TOKEN", "mc_pat_mock_demo")
instance = os.getenv("MEMCELL_URL", "http://localhost:3000")
namespace = os.getenv("MEMCELL_WORKSPACE", "acme/operations")

client = MemCell(token=token, base_url=instance)
ops = client.scope(namespace, subject="customs-shipment-clearance")


def main() -> None:
    print("=== LangChain Tools & LangGraph Multi-Node Memory Integration ===\n")

    # 1. Build native LangChain tools (`recall_memory`, `remember_memory`, `report_outcome`, `search_documents`)
    tools = create_langchain_tools(ops)
    tool_by_name = {t.name: t for t in tools}
    print(f"1. Initialized {len(tools)} native MemCell LangChain tools: {list(tool_by_name.keys())}")

    # Subagent uses `remember_memory` tool to store a standing customs rule
    saved_raw = tool_by_name["remember_memory"].invoke(
        {
            "title": "All international shipments requiring customs clearance must include 10-digit Harmonized Tariff Schedule (HTS) codes",
            "type": "instruction",
            "enforce": True,
        }
    )
    saved = json.loads(saved_raw)
    mem_id = saved["created"][0]["id"] if saved.get("created") else "created"
    print(f"   [Tool: remember_memory] Stored enforced instruction [{mem_id}]\n")

    # 2. Orchestrator uses drop-in LangGraph StateGraph nodes (`recall_node`, `wrap_node`, `report_node`)
    print("2. Executing LangGraph State Workflow (`recall_node` -> `wrap_node` -> `report_node`)...")
    nodes = create_langgraph_nodes(ops, action="prepare_tokyo_shipment")

    # Step A: Pre-flight recall node populates `memory_context`, `recall_id`, `recalled_memories`
    state: dict[str, Any] = {
        "messages": [{"role": "user", "content": "Prepare customs paperwork for outbound shipment to Tokyo"}]
    }
    state.update(nodes["recall_node"](state))
    print(f"   [recall_node] Recalled {len(state['recalled_memories'])} memory(s) (recall_id={state['recall_id']})")

    # Step B: Subagent execution wrapped in `wrap_node`
    customs_subagent_node = nodes["wrap_node"](
        "validate_hts_codes",
        lambda st: {
            "paperwork_status": "READY_WITH_HTS_8471_50",
            "outcome": "worked",
        },
    )
    state.update(customs_subagent_node(state))
    print(f"   [wrap_node] Subagent completed customs validation: {state['paperwork_status']}")

    # Step C: Post-flight report node attributes outcome back to the recalled memories
    state.update(nodes["report_node"](state))
    print(f"   [report_node] Outcome reported: memory_reported={state['memory_reported']}")


if __name__ == "__main__":
    main()
