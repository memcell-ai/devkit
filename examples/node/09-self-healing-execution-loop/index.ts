import { MemCell } from "@memcell/sdk";

const token = process.env.MEMCELL_TOKEN || "mc_pat_mock_demo";
const instance = process.env.MEMCELL_URL || "http://localhost:3000";
const namespace = process.env.MEMCELL_WORKSPACE || "acme/sre-self-healing";

const client = new MemCell({ token, baseUrl: instance });
const sre = client.scope(namespace, { subject: "partner-payout-webhook-dispatch" });

/**
 * Simulated external partner payout gateway:
 * Rejects requests unless an `Idempotency-Key` header is included.
 */
async function callPartnerPayoutGateway(headers: Record<string, string>) {
  if (!headers["Idempotency-Key"]) {
    throw new Error(
      "HTTP 422 Unprocessable Entity: Partner gateway requires an 'Idempotency-Key' header on all POST /v2/payouts requests",
    );
  }
  return { status: 200, transactionId: "tx_live_99812" };
}

async function main() {
  console.log("=== 'Fail Once, Never Again': Self-Healing Multi-Agent Loop ===\n");
  const sessionId = "inc_payout_dispatch_42";

  // 1. Seed an outdated assumption in workspace memory
  console.log("1. Seeding initial (outdated) API integration assumption...");
  const initialRes = await sre.remember({
    title: "Dispatch POST /v2/payouts with standard Bearer authorization header",
    type: "instruction",
    scope: "workspace",
    confidence: 0.85,
    sessionId,
  });
  const outdatedMem = initialRes.created[0]!;
  console.log(
    `   [OK] Initial memory [${outdatedMem.id}] confidence=${outdatedMem.confidence}\n`,
  );

  // 2. Turn 1: Subagent A runs inside wrapExecution and hits a production failure
  console.log(
    "2. [Turn 1 — Subagent A] Attempting payout dispatch inside wrapExecution()...",
  );
  try {
    await sre.wrapExecution(
      {
        action: "dispatch_partner_payout",
        query: "Required headers for POST /v2/payouts partner gateway",
        autoDistill: true,
      },
      async (ctx) => {
        const needsIdempotencyKey = ctx.memories.some((m) =>
          m.title.toLowerCase().includes("idempotency-key"),
        );
        const headers: Record<string, string> = {
          Authorization: "Bearer partner_secret",
        };
        if (needsIdempotencyKey) {
          headers["Idempotency-Key"] = "idem_2026_001";
        }
        return await callPartnerPayoutGateway(headers);
      },
    );
  } catch (err: any) {
    console.log(`   [Subagent A Caught Error]: ${err.message}`);
    console.log(
      "   -> wrapExecution automatically reported outcome='failed' and triggered autoDistill!\n",
    );
  }

  // 3. Turn 2: Subagent B is spawned by the orchestrator moments later for the same task
  console.log(
    "3. [Turn 2 — Subagent B] Retrying task inside wrapExecution() with self-healed memory...",
  );
  const recoveryTurn = await sre.wrapExecution(
    {
      action: "dispatch_partner_payout",
      query: "Required headers for POST /v2/payouts partner gateway",
      autoDistill: true,
    },
    async (ctx) => {
      console.log(`   [Recalled ${ctx.memories.length} memories for Turn 2]:`);
      for (const m of ctx.memories) {
        console.log(
          `   - [${m.id} | enforce=${Boolean(m.enforce)} | conf=${m.confidence}] ${m.title}`,
        );
      }

      const needsIdempotencyKey = ctx.memories.some((m) =>
        m.title.toLowerCase().includes("idempotency-key"),
      );
      const headers: Record<string, string> = {
        Authorization: "Bearer partner_secret",
      };
      if (needsIdempotencyKey) {
        headers["Idempotency-Key"] = "idem_2026_002";
      }

      return await callPartnerPayoutGateway(headers);
    },
  );

  console.log(
    `\n   [OK] Subagent B succeeded on first attempt! Transaction: ${recoveryTurn.result.transactionId}`,
  );
  console.log(
    `   [OK] Post-flight outcome '${recoveryTurn.report.outcome}' reinforced across ${recoveryTurn.report.attributed.length} memories.`,
  );
}

main().catch((err) => {
  console.error("Self-healing example failed:", err);
  process.exit(1);
});

