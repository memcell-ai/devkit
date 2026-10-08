import os
from memcell import MemcellClient

token = os.getenv("MEMCELL_TOKEN", "mc_pat_mock_demo")
instance = os.getenv("MEMCELL_URL", "http://localhost:3000")
namespace = os.getenv("MEMCELL_WORKSPACE", "acme/editorial-crew")

client = MemcellClient(token=token, base_url=instance)

def seed_editorial_standards():
    """Seed workspace memories for the crew."""
    print("Seeding editorial team workspace directives...")
    client.memories.remember(
        namespace,
        title="Tone guideline: Professional, authoritative, and concise; avoid promotional hyperbole",
        type="directive",
        scope="workspace",
    )
    client.memories.remember(
        namespace,
        title="Fact-checking mandate: All statistical claims must cite primary regulatory or peer-reviewed sources",
        type="guard",
        scope="workspace",
        enforce=True,
    )

def main():
    print("=== CrewAI & MemCell Multi-Agent Coordination ===\n")
    seed_editorial_standards()

    # Step 1: Researcher agent gathers context
    research_intent = "Research Q2 enterprise cloud adoption statistics"
    print(f"\n1. Researcher agent queries MemCell for: '{research_intent}'")
    research_recall = client.recall.search(namespace, intent=research_intent)
    print("Injected Directives for Researcher:")
    print(research_recall.prompt_context)

    # Step 2: Writer agent drafts article
    draft_intent = "Draft summary of enterprise cloud survey results"
    print(f"\n2. Writer agent queries MemCell for: '{draft_intent}'")
    writer_recall = client.recall.search(namespace, intent=draft_intent)
    print("Injected Directives for Writer:")
    print(writer_recall.prompt_context)

    print("\n✓ Both agents successfully coordinated against shared workspace memories.")

if __name__ == "__main__":
    main()
