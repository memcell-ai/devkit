import { MemcellClient } from "@memcell/sdk";

const adminToken = process.env.MEMCELL_TOKEN || "mc_pat_mock_demo";
const instance = process.env.MEMCELL_URL || "http://localhost:3000";
const namespace = process.env.MEMCELL_WORKSPACE || "acme/fleet-demo";

const adminClient = new MemcellClient({ token: adminToken, baseUrl: instance });

async function main() {
  console.log("=== Multi-Agent Fleet Provisioning & Coordination ===\n");

  // 1. Provision Researcher Agent
  console.log("1. Registering 'Market Researcher' agent identity...");
  const existingAgents = await adminClient.agents.list(namespace);
  let researcher = existingAgents.items.find(
    (a) => a.name === "Market Researcher",
  );
  if (!researcher) {
    researcher = await adminClient.agents.create(namespace, {
      name: "Market Researcher",
      description:
        "Crawls industry publications and ingests provisional observations",
    });
  }
  const researcherKey = await adminClient.agents.createKey(
    namespace,
    researcher.id,
  );
  console.log(
    `[OK] Researcher registered. Key preview: ${researcherKey.preview}\n`,
  );

  // 2. Provision Auditor Agent
  console.log("2. Registering 'Compliance Auditor' agent identity...");
  let auditor = existingAgents.items.find(
    (a) => a.name === "Compliance Auditor",
  );
  if (!auditor) {
    auditor = await adminClient.agents.create(namespace, {
      name: "Compliance Auditor",
      description:
        "Evaluates provisional observations and enforces data policy guards",
    });
  }
  const auditorKey = await adminClient.agents.createKey(namespace, auditor.id);
  console.log(`[OK] Auditor registered. Key preview: ${auditorKey.preview}\n`);

  // 3. Researcher agent runs under its dedicated token
  console.log("3. Researcher operates under its scoped key...");
  const researcherClient = new MemcellClient({
    token: researcherKey.key || adminToken,
    baseUrl: instance,
  });

  const res = await researcherClient.remember({
    namespace,
    title:
      "Competitor Gamma reported 15% drop in enterprise subscription churn",
    type: "fact",
    status: "provisional",
  });
  const observation = res.created[0] || res.evolved[0];
  const observationId = observation?.id || "";
  console.log(`[OK] Filed provisional observation: [${observationId}]\n`);

  // 4. Auditor agent runs under its key, inspecting provisional observations
  console.log("4. Auditor evaluates and confirms observation...");
  const auditorClient = new MemcellClient({
    token: auditorKey.key || adminToken,
    baseUrl: instance,
  });

  if (observationId) {
    await auditorClient.report({
      actionTaken: "Cross-referenced observation against SEC 10-Q filing",
      namespace,
      memoryId: observationId,
      outcome: "worked",
      reason: "Cross-referenced with official SEC 10-Q filing.",
    });
  }
  console.log(
    "[OK] Auditor confirmed and reported outcome to reinforce memory confidence.",
  );
}

main().catch(console.error);
