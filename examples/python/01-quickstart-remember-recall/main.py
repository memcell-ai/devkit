import os
from memcell import MemcellClient

token = os.getenv("MEMCELL_TOKEN", "mc_pat_mock_demo")
instance = os.getenv("MEMCELL_URL", "http://localhost:3000")
namespace = os.getenv("MEMCELL_WORKSPACE", "acme/operations")

client = MemcellClient(token=token, base_url=instance)

def main():
    print("=== MemCell Python Quickstart ===")
    print(f"Connecting to: {instance} [Workspace: {namespace}]\n")

    # 1. Ingest an operational directive memory
    print("1. Ingesting operational directive...")
    memory = client.memories.remember(
        namespace,
        title="Escalate supplier contract renewals over $50,000 to legal counsel",
        type="directive",
        scope="workspace",
    )
    print(f"✓ Stored memory: [{memory.id}] {memory.title}\n")

    # 2. Semantic recall
    intent = "Review vendor software renewal agreement for $75,000"
    print(f"2. Recalling memories for intent: '{intent}'...")
    recall = client.recall.search(namespace, intent=intent)

    print(f"✓ Retrieved {len(recall.memories)} relevant memories.")
    print("\nSynthesized Prompt Context for LLM:")
    print("--------------------------------------------------")
    print(recall.prompt_context)
    print("--------------------------------------------------\n")

    # 3. Report execution outcome
    print("3. Reporting agent outcome to reinforce confidence...")
    client.report(
        namespace,
        memory_id=memory.id,
        outcome="upheld",
        reason="Agent flagged contract exceeding $50k and generated legal escalation draft.",
    )
    print("✓ Outcome reported successfully.")

if __name__ == "__main__":
    main()
