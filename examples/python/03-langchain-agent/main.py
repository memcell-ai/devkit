import os
from memcell import MemcellClient
from langchain_core.tools import tool

token = os.getenv("MEMCELL_TOKEN", "mc_pat_mock_demo")
instance = os.getenv("MEMCELL_URL", "http://localhost:3000")
namespace = os.getenv("MEMCELL_WORKSPACE", "acme/operations")

client = MemcellClient(token=token, base_url=instance)

@tool
def recall_memory(intent: str) -> str:
    """Retrieve relevant operational directives, policies, and guidelines from MemCell."""
    recall = client.recall.search(namespace, intent=intent)
    return recall.prompt_context or "No relevant directives established in workspace."

@tool
def remember_directive(claim: str, directive_type: str = "directive") -> str:
    """File a newly established policy, guideline, or fact into MemCell workspace memory."""
    mem = client.memories.remember(
        namespace,
        title=claim,
        type=directive_type,
        scope="workspace",
    )
    return f"Successfully filed memory [{mem.id}]: {mem.title}"

def main():
    print("=== LangChain Tool Integration with MemCell ===\n")
    print(f"Initialized tools for workspace: {namespace}\n")

    # 1. Simulate agent invoking the remember_directive tool
    res = remember_directive.invoke({
        "claim": "All international shipments requiring customs clearance must include harmonized tariff codes (HTS)",
        "directive_type": "guard",
    })
    print("Tool Output [remember]:", res)

    # 2. Simulate agent invoking the recall_memory tool
    recalled_context = recall_memory.invoke({
        "intent": "Prepare customs paperwork for outbound shipment to Tokyo",
    })
    print("\nTool Output [recall]:")
    print(recalled_context)

if __name__ == "__main__":
    main()
