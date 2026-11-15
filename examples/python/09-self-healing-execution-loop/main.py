import asyncio
import os

from memcell import AsyncMemCell
from memcell.integrations import arun_with_openai_memory, register_memcell_tools

token = os.getenv("MEMCELL_TOKEN", "mc_pat_mock_demo")
instance = os.getenv("MEMCELL_URL", "http://localhost:3000")
namespace = os.getenv("MEMCELL_WORKSPACE", "acme/sre-self-healing-py")


def call_partner_payout_gateway(headers: dict[str, str]) -> dict[str, str]:
    if "Idempotency-Key" not in headers:
        raise RuntimeError(
            "HTTP 422 Unprocessable Entity: Partner gateway requires an 'Idempotency-Key' header on POST /v2/payouts"
        )
    return {"status": "200", "transaction_id": "tx_py_live_8841"}


async def main() -> None:
    print("=== 'Fail Once, Never Again': Self-Healing Multi-Agent Loop (Python) ===\n")

    async with AsyncMemCell(token=token, base_url=instance) as client:
        sre = client.scope(namespace, subject="partner-payout-webhook-dispatch")

        # 1. Seed initial (outdated) assumption
        print("1. Seeding initial (outdated) API integration assumption...")
        initial = await sre.remember(
            title="Dispatch POST /v2/payouts with standard Bearer authorization header",
            type="instruction",
            scope="workspace",
            confidence=0.85,
            session_id="inc_payout_py_01",
        )
        outdated = initial.created[0]
        print(f"   [OK] Initial memory [{outdated.id}] confidence={outdated.confidence}\n")

        # 2. Turn 1: Subagent A runs inside wrap_execution and hits an exception
        print("2. [Turn 1 — Subagent A] Attempting payout dispatch inside wrap_execution()...")
        try:

            def _attempt_turn_1(ctx):
                needs_idem = any("idempotency-key" in m.title.lower() for m in ctx.memories)
                headers = {"Authorization": "Bearer partner_secret"}
                if needs_idem:
                    headers["Idempotency-Key"] = "idem_py_001"
                return call_partner_payout_gateway(headers)

            await sre.wrap_execution(
                action="dispatch_partner_payout",
                query="Required headers for POST /v2/payouts partner gateway",
                fn=_attempt_turn_1,
            )
        except RuntimeError as err:
            print(f"   [Subagent A Caught Error]: {err}")
            print(
                "   -> wrap_execution automatically reported outcome='failed' and triggered auto_distill!\n"
            )

        # 3. Turn 2: Subagent B runs via OpenAI Agents closed-loop wrapper (`arun_with_openai_memory`)
        print(
            "3. [Turn 2 — Subagent B] Retrying via arun_with_openai_memory() with self-healed memory..."
        )

        async def _attempt_turn_2(turn_ctx: dict) -> dict[str, str]:
            memories = turn_ctx["memories"]
            print(f"   [Recalled {len(memories)} memories for Turn 2]:")
            for m in memories:
                print(f"   - [{m.id} | enforce={m.enforce} | conf={m.confidence}] {m.title}")

            needs_idem = any("idempotency-key" in m.title.lower() for m in memories)
            headers = {"Authorization": "Bearer partner_secret"}
            if needs_idem:
                headers["Idempotency-Key"] = "idem_py_002"
            return call_partner_payout_gateway(headers)

        recovery = await arun_with_openai_memory(
            sre,
            action="dispatch_partner_payout",
            query="Required headers for POST /v2/payouts partner gateway",
            base_instructions="You are an SRE payout subagent.",
            fn=_attempt_turn_2,
        )

        print(
            f"\n   [OK] Subagent B succeeded on first attempt! Transaction: {recovery.result['transaction_id']}"
        )
        print(
            f"   [OK] Post-flight outcome '{recovery.report.outcome}' reinforced across {len(recovery.report.attributed)} memories."
        )

        # 4. Also demonstrate PydanticAI plain-callable tool registration (`register_memcell_tools`)
        registered: list[str] = []

        class MockPydanticAIAgent:
            def tool_plain(self, fn):
                registered.append(fn.__name__)
                return fn

        register_memcell_tools(MockPydanticAIAgent(), sre)
        print(f"   [PydanticAI Integration]: Registered tools {registered}")


if __name__ == "__main__":
    asyncio.run(main())

