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
  const memory = await client.memories.remember(namespace, {
    title:
      "Always verify recipient IBAN against authorized vendor roster before processing wire transfers",
    type: "directive",
    scope: "workspace",
    context: "Applies to finance, accounts payable, and procurement agents.",
  });
  console.log(`✓ Stored memory: [${memory.id}] ${memory.title}\n`);

  // 2. Recall memory matching an agent's task intent
  const intent =
    "Prepare international wire payment for invoice #9042 from vendor Acme Tech";
  console.log(`2. Recalling memories for intent: "${intent}"...`);
  const recallResult = await client.recall.search(namespace, { intent });

  console.log(
    `✓ Retrieved ${recallResult.memories.length} relevant memory nodes.`,
  );
  console.log("\nSynthesized Prompt Context for LLM:");
  console.log("--------------------------------------------------");
  console.log(recallResult.promptContext);
  console.log("--------------------------------------------------\n");

  // 3. Report the outcome after agent execution to update confidence trajectory
  console.log("3. Reporting agent execution outcome...");
  await client.report(namespace, {
    memoryId: memory.id,
    outcome: "upheld",
    reason:
      "Agent validated IBAN with authorized vendor roster before submitting batch file.",
  });
  console.log("✓ Outcome reported: confidence trajectory reinforced.");
}

main().catch((err) => {
  console.error("Quickstart error:", err);
  process.exit(1);
});
