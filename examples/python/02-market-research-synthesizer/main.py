import os

from memcell import MemcellClient

token = os.getenv("MEMCELL_TOKEN", "mc_pat_mock_demo")
instance = os.getenv("MEMCELL_URL", "http://localhost:3000")
namespace = os.getenv("MEMCELL_WORKSPACE", "acme/market-research")

client = MemcellClient(token=token, base_url=instance)

UNSTRUCTURED_SIGNALS = [
    "Rumor from trade conference: Competitor Alpha plans 25% price reduction on enterprise tier.",
    "Analyst memo: Renewable energy sector investments projected to accelerate 18% in EMEA.",
    "Verified Q2 survey: 78% of enterprise respondents mandate SOC2 Type II certification for all vendors.",
]


def main():
    print("=== Market Research Synthesizer: Provisional Memory Pipeline ===\n")

    # 1. Ingest unverified industry signals as provisional observations
    for signal in UNSTRUCTURED_SIGNALS[:2]:
        res = client.remember(
            namespace=namespace,
            title=signal,
            type="fact",
            status="provisional",
        )
        mem = (
            res.created[0] if res.created else (res.evolved[0] if res.evolved else None)
        )
        mem_id = mem.id if mem else ""
        mem_title = mem.title if mem else signal
        print(f"Filed provisional observation: [{mem_id}] {mem_title[:60]}...")

    # 2. Ingest verified industry standard as active fact
    res_verified = client.remember(
        namespace=namespace,
        title=UNSTRUCTURED_SIGNALS[2],
        type="fact",
        status="active",
        scope="workspace",
    )
    verified_mem = (
        res_verified.created[0]
        if res_verified.created
        else (res_verified.evolved[0] if res_verified.evolved else None)
    )
    v_id = verified_mem.id if verified_mem else ""
    v_title = verified_mem.title if verified_mem else UNSTRUCTURED_SIGNALS[2]
    print(f"Filed verified active fact: [{v_id}] {v_title[:60]}...\n")

    # 3. Standard recall ignores provisional memories by default to prevent hallucination
    intent = "Draft market analysis report on enterprise purchasing criteria"
    print(
        f"Recalling context for intent: '{intent}' (default: active memories only)..."
    )
    recall_standard = client.recall(namespace=namespace, intent=intent)
    print(f"Found {len(recall_standard.memories)} active memory node(s).")
    print("Standard Prompt Context:")
    print(recall_standard.prompt_context)

    # 4. Deep research turn allows provisional signals
    print("\nRecalling context with allow_provisional=True...")
    recall_deep = client.recall(
        namespace=namespace, intent=intent, allow_provisional=True
    )
    print(
        f"Found {len(recall_deep.memories)} memory node(s) including provisional signals."
    )
    print("Deep Research Prompt Context:")
    print(recall_deep.prompt_context)


if __name__ == "__main__":
    main()
