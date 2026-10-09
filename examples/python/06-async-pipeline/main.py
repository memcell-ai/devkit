import asyncio
import os

from memcell import AsyncMemcellClient

token = os.getenv("MEMCELL_TOKEN", "mc_pat_mock_demo")
instance = os.getenv("MEMCELL_URL", "http://localhost:3000")
namespace = os.getenv("MEMCELL_WORKSPACE", "acme/async-batch")

BATCH_CLAIMS = [
    "Customer Service Tier 1: Max escalation turnaround time is 4 business hours",
    "Customer Service Tier 2: Dedicated technical account manager assigned to accounts over $100k ARR",
    "Product Support: Standard SLA for severity-1 outages is 30 minutes response time",
    "Billing Operations: Automatic invoice generation occurs on the 1st of each calendar month",
    "Data Protection: Personal data retention period is 90 days following account closure",
]


async def ingest_claim(client: AsyncMemcellClient, claim: str):
    res = await client.remember(
        namespace=namespace,
        title=claim,
        type="directive",
        scope="workspace",
    )
    mem = res.created[0] if res.created else (res.evolved[0] if res.evolved else None)
    mem_id = mem.id if mem else ""
    print(f"[OK] Ingested [{mem_id}]: {claim[:50]}...")
    return mem


async def main():
    print("=== High-Throughput Async Ingestion Pipeline ===\n")
    print(f"Connecting async client to {instance} [Workspace: {namespace}]...\n")

    async with AsyncMemcellClient(token=token, base_url=instance) as client:
        # Concurrent batch remember
        tasks = [ingest_claim(client, claim) for claim in BATCH_CLAIMS]
        memories = await asyncio.gather(*tasks)

        print(f"\nSuccessfully ingested {len(memories)} memories concurrently.")

        # Concurrent batch recall
        query_intents = [
            "Handle critical system outage report",
            "Customer requested GDPR account deletion timeline",
        ]

        print("\nExecuting concurrent recalls...")
        recall_tasks = [
            client.recall(namespace=namespace, intent=intent)
            for intent in query_intents
        ]
        results = await asyncio.gather(*recall_tasks)

        for intent, res in zip(query_intents, results):
            print(f"\n--- Intent: '{intent}' ---")
            print(res.prompt_context)


if __name__ == "__main__":
    asyncio.run(main())
