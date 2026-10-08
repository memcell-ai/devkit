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
    res = client.remember(
        namespace=namespace,
        title="Escalate supplier contract renewals over $50,000 to legal counsel",
        type="directive",
        scope="workspace",
    )
    memory = (
        res.created[0] if res.created else (res.evolved[0] if res.evolved else None)
    )
    memory_id = memory.id if memory else ""
    memory_title = (
        memory.title
        if memory
        else "Escalate supplier contract renewals over $50,000 to legal counsel"
    )
    if memory_id:
        print(f"[OK] Stored memory: [{memory_id}] {memory_title}\n")
    else:
        print(f"[OK] Ingested memory: {memory_title}\n")

    # 2. Semantic recall
    intent = "Review vendor software renewal agreement for $75,000"
    print(f"2. Recalling memories for intent: '{intent}'...")
    recall = client.recall(namespace=namespace, intent=intent)

    print(f"[OK] Retrieved {len(recall.memories)} relevant memories.")
    print("\nSynthesized Prompt Context for LLM:")
    print("--------------------------------------------------")
    print(recall.prompt_context)
    print("--------------------------------------------------\n")

    # 3. Report execution outcome
    print("3. Reporting agent outcome to reinforce confidence...")
    target_id = memory_id or (recall.memories[0].id if recall.memories else None)
    client.report(
        action_taken="Escalate supplier contract renewals over $50,000 to legal counsel",
        namespace=namespace,
        memory_id=target_id,
        outcome="worked",
        reason="Agent flagged contract exceeding $50k and generated legal escalation draft.",
    )
    print("[OK] Outcome reported successfully.")


if __name__ == "__main__":
    main()
