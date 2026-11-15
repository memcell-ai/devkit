import os

from memcell import MemCell

token = os.getenv("MEMCELL_TOKEN", "mc_pat_mock_demo")
instance = os.getenv("MEMCELL_URL", "http://localhost:3000")
namespace = os.getenv("MEMCELL_WORKSPACE", "acme/compliance")

client = MemCell(token=token, base_url=instance)
compliance = client.scope(namespace, subject="international-wire-compliance")


class ComplianceViolationError(Exception):
    pass


def audit_wire_transaction(amount: float, beneficiary_country: str) -> str:
    print(f"\nAuditing wire transfer: ${amount:,.2f} to '{beneficiary_country}'...")

    def _evaluate(ctx) -> str:
        print(f"  [Recalled {len(ctx.memories)} enforced compliance instructions]")
        for mem in ctx.memories:
            if mem.type == "instruction" and mem.enforce:
                if (
                    "high-risk jurisdiction" in mem.title.lower()
                    and beneficiary_country in ["North Korea", "Iran", "Syria"]
                ):
                    raise ComplianceViolationError(
                        f"Blocked by enforced instruction [{mem.id}]: Jurisdiction sanctions policy."
                    )
                if "10,000" in mem.title and amount > 10000:
                    print(
                        f"  [COMPLIANCE GATE]: Transaction exceeds $10,000. Re-routing for dual-officer signature per [{mem.id}]."
                    )
                    return "PENDING_DUAL_APPROVAL"

        print("  [OK] Compliance audit passed. Wire approved for execution.")
        return "APPROVED"

    wrapped = compliance.wrap_execution(
        action="audit_international_wire",
        query=f"Authorize international wire payment of ${amount} to {beneficiary_country}",
        fn=_evaluate,
    )
    print(f"  [Outcome Reported]: '{wrapped.report.outcome}' -> status={wrapped.result}")
    return wrapped.result


def main() -> None:
    print("=== Financial Compliance Auditor: Enforced Instructions & Closed-Loop Audit ===\n")

    # Seed strict compliance instructions with enforce=True
    compliance.remember(
        title="Direct disbursements exceeding $10,000 require dual-officer authorization",
        type="instruction",
        scope="workspace",
        enforce=True,
    )
    compliance.remember(
        title="Prohibit any fund transfers to high-risk jurisdiction sanction lists",
        type="instruction",
        scope="workspace",
        enforce=True,
    )

    audit_wire_transaction(4500.00, "Germany")
    audit_wire_transaction(25000.00, "Japan")


if __name__ == "__main__":
    main()
