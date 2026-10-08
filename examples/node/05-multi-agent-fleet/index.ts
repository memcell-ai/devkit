import { MemcellClient } from "@memcell/sdk";

const adminToken = process.env.MEMCELL_TOKEN || "mc_pat_mock_demo";
const instance = process.env.MEMCELL_URL || "http://localhost:3000";
const namespace = process.env.MEMCELL_WORKSPACE || "acme/fleet-demo";

const adminClient = new MemcellClient({ token: adminToken, baseUrl: instance });

async function main() {
  console.log("=== Multi-Agent Fleet Provisioning & Coordination ===\n");

  // 1. Provision Researcher Agent
  console.log("1. Registering 'Market Researcher' agent identity...");
  const researcher = await adminClient.agents.create(namespace, {
    name: "Market Researcher",
    description:
      "Crawls industry publications and ingests provisional observations",
  });
  const researcherKey = await adminClient.agents.createKey(
    namespace,
    researcher.id,
  );
  console.log(
    `✓ Researcher registered. Key preview: ${researcherKey.preview}\n`,
  );

  // 2. Provision Auditor Agent
  console.log("2. Registering 'Compliance Auditor' agent identity...");
  const auditor = await adminClient.agents.create(namespace, {
    name: "Compliance Auditor",
    description:
      "Evaluates provisional observations and enforces data policy guards",
  });
  const auditorKey = await adminClient.agents.createKey(namespace, auditor.id);
  console.log(`✓ Auditor registered. Key preview: ${auditorKey.preview}\n`);

  // 3. Researcher agent runs under its dedicated token
  console.log("3. Researcher operates under its scoped key...");
  const researcherClient = new MemcellClient({
    token: researcherKey.key || adminToken,
    baseUrl: instance,
  });

  const observation = await researcherClient.memories.remember(namespace, {
    title:
      "Competitor Gamma reported 15% drop in enterprise subscription churn",
    type: "observation",
    status: "provisional",
  });
  console.log(`✓ Filed provisional observation: [${observation.id}]\n`);

  // 4. Auditor agent runs under its key, inspecting provisional observations
  console.log("4. Auditor evaluates and confirms observation...");
  const auditorClient = new MemcellClient({
    token: auditorKey.key || adminToken,
    baseUrl: instance,
  });

  await auditorClient.report(namespace, {
    memoryId: observation.id,
    outcome: "upheld",
    reason: "Cross-referenced with official SEC 10-Q filing.",
  });
  console.log(
    "✓ Auditor confirmed and reported outcome to reinforce memory confidence.",
  );
}

main().catch(console.error);
