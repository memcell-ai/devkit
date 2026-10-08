import { MemcellClient } from "@memcell/sdk";

const token = process.env.MEMCELL_TOKEN || "mc_pat_mock_demo";
const instance = process.env.MEMCELL_URL || "http://localhost:3000";
const namespace = process.env.MEMCELL_WORKSPACE || "acme/graph-demo";

const client = new MemcellClient({ token, baseUrl: instance });

async function main() {
  console.log("=== Directed Epistemic Knowledge Graph Relations ===\n");

  // 1. Create a high-level security guard memory
  console.log("1. Creating high-level security policy guard...");
  const securityGuard = await client.memories.remember(namespace, {
    title:
      "Financial disbursements exceeding $100,000 require dual-officer biometric cryptographic authorization",
    type: "guard",
    scope: "workspace",
    enforce: true,
  });
  console.log(`✓ Stored guard: [${securityGuard.id}]\n`);

  // 2. Create an automated wire execution directive memory
  console.log("2. Creating operational wire execution directive...");
  const wireDirective = await client.memories.remember(namespace, {
    title: "Automated vendor batch disbursements run nightly at 23:00 UTC",
    type: "directive",
    scope: "workspace",
  });
  console.log(`✓ Stored directive: [${wireDirective.id}]\n`);

  // 3. Link memories with a directed `limits` relation
  console.log(
    "3. Declaring directed 'limits' relation edge: [Security Guard] ──limits──► [Wire Directive]",
  );
  await client.relations.relate(namespace, {
    sourceId: securityGuard.id,
    targetId: wireDirective.id,
    type: "limits",
  });
  console.log("✓ Epistemic edge created.\n");

  // 4. Query relations for the operational directive
  console.log("4. Inspecting relation graph attached to wire directive...");
  const graph = await client.relations.list(namespace, wireDirective.id);
  console.log(
    `✓ Incoming constraints on directive (${graph.incoming?.length || 0}):`,
  );
  for (const edge of graph.incoming || []) {
    console.log(`  ← [${edge.relationType}] constrained by ${edge.sourceId}`);
  }

  // 5. Semantic recall traversing the relation edge
  console.log("\n5. Recalling context for scheduled batch payment...");
  const recall = await client.recall.search(namespace, {
    intent: "Execute scheduled nightly wire batch run",
  });

  console.log(
    "\nSynthesized Epistemic Prompt Context (Guard + Directive combined):",
  );
  console.log(
    "------------------------------------------------------------------",
  );
  console.log(recall.promptContext);
  console.log(
    "------------------------------------------------------------------",
  );
}

main().catch(console.error);
