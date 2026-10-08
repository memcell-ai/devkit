import { MemcellClient } from "@memcell/sdk";

// Initialize client with environment token or fallback
const token = process.env.MEMCELL_TOKEN || "mc_pat_mock_demo";
const instance = process.env.MEMCELL_URL || "http://localhost:3000";
const namespace = process.env.MEMCELL_WORKSPACE || "acme/operations";

const client = new MemcellClient({ token, baseUrl: instance });

async function main() {
  console.log("=== MemCell Node Quickstart ===");
  console.log(`Connecting to: ${instance} [Workspace: ${namespace}]\n`);

  // 1. File an operational directive memory
  console.log("1. Ingesting operational directive...");
  const title =
    "Always verify recipient IBAN against authorized vendor roster before processing wire transfers";
  const res = await client.remember({
    namespace,
    title,
    type: "directive",
    scope: "workspace",
    context: "Applies to finance, accounts payable, and procurement agents.",
  });
  const memory = res.created[0] || res.evolved[0];
  const memoryId = memory?.id || "";
  if (memoryId) {
    console.log(
      `[OK] Stored memory: [${memoryId}] ${memory?.title || title}\n`,
    );
  } else {
    console.log(`[OK] Ingested memory: ${title}\n`);
  }

  // 2. Recall memory matching an agent's task intent
  const intent =
    "Prepare international wire payment for invoice #9042 from vendor Acme Tech";
  console.log(`2. Recalling memories for intent: "${intent}"...`);
  const recallResult = await client.recall({ namespace, intent });

  console.log(
    `[OK] Retrieved ${recallResult.memories.length} relevant memory nodes.`,
  );
  console.log("\nSynthesized Prompt Context for LLM:");
  console.log("--------------------------------------------------");
  console.log(recallResult.promptContext);
  console.log("--------------------------------------------------\n");

  // 3. Report the outcome after agent execution to update confidence trajectory
  console.log("3. Reporting agent execution outcome...");
  const targetId = memoryId || recallResult.memories[0]?.id;
  await client.report({
    actionTaken: "Verified recipient IBAN against vendor roster",
    namespace,
    memoryId: targetId,
    outcome: "worked",
    reason:
      "Agent validated IBAN with authorized vendor roster before submitting batch file.",
  });
  console.log("[OK] Outcome reported: confidence trajectory reinforced.");
}

main().catch((err) => {
  console.error("Quickstart error:", err);
  process.exit(1);
});
