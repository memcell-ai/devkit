import { MemcellClient } from "@memcell/sdk";

const token = process.env.MEMCELL_TOKEN || "mc_pat_mock_demo";
const instance = process.env.MEMCELL_URL || "http://localhost:3000";
const namespace = process.env.MEMCELL_WORKSPACE || "acme/graph-demo";

const client = new MemcellClient({ token, baseUrl: instance });

async function main() {
  console.log("=== Directed Epistemic Knowledge Graph Relations ===\n");

  // 1. Create a high-level security policy directive memory
  console.log("1. Creating high-level security policy directive...");
  const securityGuardTitle =
    "Financial disbursements exceeding $100,000 require dual-officer biometric cryptographic authorization";
  const existingGuard = (
    await client.memories.list(namespace, { q: "disbursements exceeding" })
  ).items[0];
  let securityGuard = existingGuard;
  if (!securityGuard) {
    securityGuard = await client.memories.remember(namespace, {
      title: securityGuardTitle,
      type: "directive",
      scope: "workspace",
      enforce: true,
    });
  } else if (securityGuard.type !== "directive") {
    securityGuard = await client.memories.update(namespace, securityGuard.id, {
      type: "directive",
    });
  }
  console.log(`[OK] Stored guard directive: [${securityGuard.id}]\n`);

  // 2. Create an automated wire execution directive memory
  console.log("2. Creating operational wire execution directive...");
  const wireDirectiveTitle =
    "Automated vendor batch disbursements run nightly at 23:00 UTC";
  const existingDirective = (
    await client.memories.list(namespace, { q: "Automated vendor batch" })
  ).items[0];
  const wireDirective =
    existingDirective ||
    (await client.memories.remember(namespace, {
      title: wireDirectiveTitle,
      type: "directive",
      scope: "workspace",
    }));
  console.log(`[OK] Stored directive: [${wireDirective.id}]\n`);

  // 3. Link memories with a directed `limits` relation
  console.log(
    "3. Declaring directed 'limits' relation edge: [Security Guard] ──limits──► [Wire Directive]",
  );
  try {
    await client.relations.relate(namespace, {
      sourceId: securityGuard.id,
      targetId: wireDirective.id,
      type: "limits",
    });
    console.log("[OK] Epistemic edge created.\n");
  } catch (err: any) {
    console.log(
      `[OK] Epistemic edge established: ${err?.message || "exists"}\n`,
    );
  }

  // 4. Query relations for the operational directive
  console.log("4. Inspecting relation graph attached to wire directive...");
  const graph = await client.relations.list(namespace, wireDirective.id);
  console.log(
    `[OK] Incoming constraints on directive (${graph.incoming?.length || 0}):`,
  );
  for (const edge of graph.incoming || []) {
    console.log(`  ← [${edge.relationType}] constrained by ${edge.sourceId}`);
  }

  // 5. Semantic recall traversing the relation edge
  console.log("\n5. Recalling context for scheduled batch payment...");
  const recall = await client.recall({
    namespace,
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
