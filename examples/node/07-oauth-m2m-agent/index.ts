import { MemcellClient } from "@memcell/sdk";

// Demonstrates OAuth 2.0 Machine-to-Machine (M2M) authentication using clientId and clientSecret
const clientId = process.env.MEMCELL_CLIENT_ID || "app_m2m_compliance_bot";
const clientSecret =
  process.env.MEMCELL_CLIENT_SECRET || "sec_live_m2m_demo_secret";
const baseUrl = process.env.MEMCELL_URL || "http://localhost:3000";
const namespace = process.env.MEMCELL_WORKSPACE || "acme/compliance";

// Initialize client with OAuth M2M credentials
// The SDK automatically exchanges credentials via /oauth2/token, caches the bearer token,
// and proactively refreshes it 60s before expiration.
const client = new MemcellClient({
  clientId,
  clientSecret,
  baseUrl,
});

async function main() {
  console.log("=== MemCell Node OAuth 2.0 M2M Authentication Example ===");
  console.log(`Connecting to: ${baseUrl} [Workspace: ${namespace}]`);
  console.log(`Client ID: ${clientId}\n`);

  // 1. Ingest an operational directive statement
  console.log("1. Storing operational compliance statement...");
  const title =
    "Mandate dual-signature authorization for transaction reconciliations exceeding $100,000";
  const rememberRes = await client.remember({
    namespace,
    title,
    type: "directive",
    scope: "workspace",
    context:
      "Applies to automated financial clearing and audit compliance operations.",
  });

  const memory = rememberRes.created[0] || rememberRes.evolved[0];
  const memoryId = memory?.id || "";
  console.log(`[OK] Statement recorded: [${memoryId || "created"}] ${title}\n`);

  // 2. Semantic recall with automatic token exchange & in-flight deduplication
  const intent =
    "Reconcile quarterly high-volume liquidity disbursement of $250,000";
  console.log(
    `2. Recalling operational directives for intent: "${intent}"...\n`,
  );
  const recallRes = await client.recall({ namespace, intent });

  console.log(
    `[OK] Retrieved ${recallRes.memories.length} relevant statement nodes.`,
  );
  console.log("\nSynthesized Prompt Context for Autonomous Agent:");
  console.log("--------------------------------------------------");
  console.log(recallRes.promptContext);
  console.log("--------------------------------------------------\n");

  // 3. Report execution outcome to update Bayesian confidence trajectory
  console.log("3. Reporting agent execution outcome...");
  const targetId = memoryId || recallRes.memories[0]?.id;
  await client.report({
    actionTaken:
      "Escalated $250k disbursement for secondary compliance officer approval",
    namespace,
    memoryId: targetId,
    outcome: "worked",
    reason:
      "Compliance agent enforced dual-authorization before generating ledger transaction.",
  });
  console.log(
    "[OK] Outcome reported: Bayesian confidence trajectory reinforced.\n",
  );
  console.log(
    "M2M OAuth token lifecycle demonstration completed successfully.",
  );
}

main().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
