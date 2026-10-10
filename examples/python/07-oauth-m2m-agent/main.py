import os

from memcell import MemcellClient

# Demonstrates OAuth 2.0 Machine-to-Machine (M2M) authentication using client_id and client_secret
client_id = os.getenv("MEMCELL_CLIENT_ID", "app_m2m_compliance_bot")
client_secret = os.getenv("MEMCELL_CLIENT_SECRET", "sec_live_m2m_demo_secret")
instance = os.getenv("MEMCELL_URL", "http://localhost:3000")
namespace = os.getenv("MEMCELL_WORKSPACE", "acme/compliance")

# Initialize client with OAuth M2M credentials
# The SDK automatically exchanges credentials via /oauth2/token, caches the bearer token,
# and proactively refreshes it 60s before expiration.
client = MemcellClient(
    client_id=client_id,
    client_secret=client_secret,
    base_url=instance,
)


def main():
    print("=== MemCell Python OAuth 2.0 M2M Authentication Example ===")
    print(f"Connecting to: {instance} [Workspace: {namespace}]\n")
    print(f"Client ID: {client_id}\n")

    # 1. Ingest an operational directive statement
    print("1. Ingesting operational directive statement...")
    title = "Mandate dual-signature authorization for transaction reconciliations exceeding $100,000"
    res = client.remember(
        namespace=namespace,
        title=title,
        type="directive",
        scope="workspace",
    )
    memory = (
        res.created[0] if res.created else (res.evolved[0] if res.evolved else None)
    )
    memory_id = memory.id if memory else ""
    print(f"[OK] Stored statement: [{memory_id or 'created'}] {title}\n")

    # 2. Semantic recall with automatic token exchange & in-flight deduplication
    intent = "Reconcile quarterly high-volume liquidity disbursement of $250,000"
    print(f"2. Recalling statements for intent: '{intent}'...")
    recall = client.recall(namespace=namespace, intent=intent)

    print(f"[OK] Retrieved {len(recall.memories)} relevant statement nodes.")
    print("\nSynthesized Prompt Context for LLM:")
    print("--------------------------------------------------")
    print(recall.prompt_context)
    print("--------------------------------------------------\n")

    # 3. Report execution outcome to update Bayesian confidence trajectory
    print("3. Reporting agent outcome to reinforce confidence trajectory...")
    target_id = memory_id or (recall.memories[0].id if recall.memories else None)
    client.report(
        action_taken="Escalated $250k disbursement for secondary compliance officer approval",
        namespace=namespace,
        memory_id=target_id,
        outcome="worked",
        reason="Compliance agent enforced dual-authorization before generating ledger transaction.",
    )
    print("[OK] Outcome reported successfully.\n")
    print("M2M OAuth token lifecycle demonstration completed successfully.")


if __name__ == "__main__":
    main()
