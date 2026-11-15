import { MemCell } from "@memcell/sdk";

const adminToken = process.env.MEMCELL_TOKEN || "mc_pat_mock_demo";
const instance = process.env.MEMCELL_URL || "http://localhost:3000";
const namespace = process.env.MEMCELL_WORKSPACE || "acme/fleet-demo";

const orchestratorClient = new MemCell({
  token: adminToken,
  baseUrl: instance,
});

async function provisionAgentIdentity(name: string, description: string) {
  const existing = await orchestratorClient.agents.list(namespace);
  let agent = existing.items.find((a) => a.name === name);
  if (!agent) {
    agent = await orchestratorClient.agents.create(namespace, {
      name,
      description,
    });
  }
  const key = await orchestratorClient.agents.createKey(namespace, agent.id);
  return { agent, key };
}

async function main() {
  console.log("=== Orchestrator <-> Subagent Memory Synchronization ===\n");

  const sessionId = "session_q3_vendor_audit";
  const subject = "vendor-churn-analysis";
  const orchestrator = orchestratorClient.scope(namespace, { subject });

  // 1. Orchestrator provisions dedicated identities & scoped keys (`mc_ag_...`) for subagents
  console.log("1. [Orchestrator] Provisioning scoped subagent identities...");
  const researcherId = await provisionAgentIdentity(
    "Market Researcher Subagent",
    "Ingests provisional market signals and attaches session telemetry",
  );
  const verifierId = await provisionAgentIdentity(
    "Compliance Verifier Subagent",
    "Audits provisional subagent findings against primary filings and promotes verified facts",
  );
  console.log(
    `   [OK] Researcher (${researcherId.key.preview}) & Verifier (${verifierId.key.preview}) ready.\n`,
  );

  // 2. Orchestrator seeds standing workspace instructions for the fleet
  console.log("2. [Orchestrator] Recording standing fleet instructions...");
  const policyRes = await orchestrator.remember({
    title:
      "Subagent market claims must remain provisional until cross-checked against SEC 10-Q filings",
    type: "instruction",
    scope: "workspace",
    enforce: true,
    sessionId,
  });
  const policyMemory = policyRes.created[0]!;

  // 3. Subagent A (Researcher) operates under its own key and writes a PROVISIONAL finding
  console.log(
    "3. [Researcher Subagent] Discovering signal and saving as 'provisional' on shared sessionId...",
  );
  const researcherScope = new MemCell({
    token: researcherId.key.key || adminToken,
    baseUrl: instance,
  }).scope(namespace, { subject });

  const provisionalRes = await researcherScope.remember({
    title:
      "Competitor Gamma enterprise net-retention dropped 15% in Q3 per earnings transcript",
    type: "fact",
    status: "provisional",
    scope: "workspace",
    sessionId,
    touched: ["sec-edgar://gamma/2026-q3-10q.pdf"],
    actions: [
      {
        type: "tool_call",
        name: "fetch_earnings_transcript",
        summary: "Extracted Q3 retention metrics from Gamma filing",
        outcome: "success",
      },
    ],
  });
  const provisionalFact = provisionalRes.created[0]!;
  console.log(
    `   [OK] Quarantined provisional finding [${provisionalFact.id}] (confidence=${provisionalFact.confidence}).`,
  );

  // Verify that standard workspace recall does NOT leak unverified provisional subagent claims
  const standardRecall = await orchestrator.recall({
    query: "Competitor Gamma retention metrics",
    allowProvisional: false,
  });
  const leaked = standardRecall.memories.some(
    (m) => m.id === provisionalFact.id,
  );
  console.log(
    `   [Isolation Check] Provisional claim visible to general fleet before verification? ${leaked}\n`,
  );

  // 4. Subagent B (Verifier) inspects provisional memories + living session thread inside wrapExecution
  console.log(
    "4. [Verifier Subagent] Recalling shared session thread with allowProvisional=true...",
  );
  const verifierScope = new MemCell({
    token: verifierId.key.key || adminToken,
    baseUrl: instance,
  }).scope(namespace, { subject });

  await verifierScope.wrapExecution(
    {
      action: "verify_subagent_finding",
      query: "Verify Competitor Gamma Q3 churn and retention claims",
    },
    async () => {
      const deepRecall = await verifierScope.recall({
        query: "Competitor Gamma Q3 retention",
        allowProvisional: true,
        sessionId,
      });

      console.log(
        `   [Thread Sync] Active session '${deepRecall.matchedThread?.externalSessionId}' has ${deepRecall.matchedThread?.turnCount ?? 1} turn(s), touched: ${deepRecall.matchedThread?.resources?.join(", ")}`,
      );

      // Link the standing policy to the finding via an epistemic relation
      await verifierScope.memories.relations.create(provisionalFact.id, {
        targetId: policyMemory.id,
        relationType: "justifies",
        confidence: 0.95,
      });

      // Promote the verified finding from provisional to active workspace memory
      const promo = await verifierScope.memories.promote(provisionalFact.id, {
        toScope: "workspace",
        reason: "Verified against SEC 10-Q Table 4 (page 28)",
      });
      if (promo.promotionRequest?.id) {
        await orchestrator.promotions.approve(promo.promotionRequest.id, {
          reason: "Orchestrator confirmed SEC 10-Q citation",
        });
      }
      console.log(
        `   [OK] Promoted finding [${provisionalFact.id}] to active workspace memory.\n`,
      );
    },
  );

  // 5. Orchestrator performs final synthesis — verified subagent memory is now active and high-confidence!
  console.log(
    "5. [Orchestrator] Running final synthesis recall across verified workspace memory...",
  );
  const finalRecall = await orchestrator.recall({
    query: "Competitor Gamma Q3 retention and churn analysis",
    sessionId,
  });
  for (const mem of finalRecall.memories) {
    console.log(
      `   - [${mem.type} | status=${mem.status} | conf=${mem.confidence}] ${mem.title}`,
    );
  }
}

main().catch((err) => {
  console.error("Fleet coordination error:", err);
  process.exit(1);
});
