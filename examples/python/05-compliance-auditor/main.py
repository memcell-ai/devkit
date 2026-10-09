import os

from memcell import MemcellClient

token = os.getenv("MEMCELL_TOKEN", "mc_pat_mock_demo")
instance = os.getenv("MEMCELL_URL", "http://localhost:3000")
namespace = os.getenv("MEMCELL_WORKSPACE", "acme/compliance")

client = MemcellClient(token=token, base_url=instance)


class ComplianceViolationError(Exception):
    pass


def audit_wire_transaction(amount: float, beneficiary_country: str):
    print(
        f"\nAuditing wire transfer: ${amount:,.2f} to country: '{beneficiary_country}'..."
    )

    # High-stakes recall: require 0.80 minimum confidence floor
    recall = client.recall(
        namespace=namespace,
        intent=f"Authorize international wire payment of ${amount} to {beneficiary_country}",
        min_confidence=0.80,
    )

    print(f"Recalled {len(recall.memories)} compliance policy guards:")
    print(recall.prompt_context)

    # Verify enforced guards
    for mem in recall.memories:
        if (mem.type in ["guard", "directive"]) and mem.enforce:
            # Check sanction list policy
            if (
                "high-risk jurisdiction" in mem.title.lower()
                and beneficiary_country in ["North Korea", "Iran", "Syria"]
            ):
                raise ComplianceViolationError(
                    f"Blocked by guard [{mem.id}]: Jurisdiction sanctions policy."
                )
            # Check dual-approval threshold
            if "10,000" in mem.title and amount > 10000:
                print(
                    f"[COMPLIANCE GATE]: Transaction exceeds $10,000. Re-routing for dual-officer signature per guard [{mem.id}]."
                )
                return "PENDING_APPROVAL"

    print("[OK] Compliance audit passed. Wire approved for execution.")
    return "APPROVED"


def main():
    print("=== Financial Compliance Auditor: Guard Memories ===\n")

    # Seed strict compliance guards
    client.remember(
        namespace=namespace,
        title="Direct disbursements exceeding $10,000 require dual-officer authorization",
        type="guard",
        scope="workspace",
        enforce=True,
    )
    client.remember(
        namespace=namespace,
        title="Prohibit any fund transfers to high-risk jurisdiction sanction lists",
        type="guard",
        scope="workspace",
        enforce=True,
    )

    audit_wire_transaction(4500.00, "Germany")
    audit_wire_transaction(25000.00, "Japan")


if __name__ == "__main__":
    main()
