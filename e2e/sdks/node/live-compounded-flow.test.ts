import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MemcellClient } from "../../../sdks/node/src/index.js";
import {
  setupNodeSdkEnvironment,
  type SdkTestEnvironment,
} from "./test-helpers.js";

describe("Node SDK Compounded Live Lifecycle E2E", () => {
  let env: SdkTestEnvironment | null = null;

  // Track state created across steps
  let agentId: string;
  let agentKeyId: string;
  let agentToken: string;
  let agentClient: MemcellClient;
  let scopedAgent: ReturnType<MemcellClient["workspace"]>;

  let guardMemoryId: string;
  let directiveMemoryId: string;
  let initialDirectiveVersion: number;
  let personalMemoryId: string;
  let provisionalMemoryId: string;

  beforeAll(async () => {
    env = await setupNodeSdkEnvironment("compounded-flow");
    if (!env) {
      console.warn(
        "[e2e] Backend not reachable or no credentials. Skipping Node SDK compounded flow.",
      );
    }
  });

  afterAll(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  // Stage 1: Workspace Verification & Metadata Update
  it("Stage 1: verifies workspace details and updates settings", async () => {
    if (!env) return;

    const ws = await env.client.workspaces.get(env.namespace);
    expect(ws.slug).toBe(env.wsSlug);

    const updated = await env.client.workspaces.update(env.namespace, {
      description: "Compounded E2E Flow: Automated Operations Workspace",
    });
    expect(updated.description).toBe(
      "Compounded E2E Flow: Automated Operations Workspace",
    );
  });

  // Stage 2: Autonomous Agent Registration & Key Minting
  it("Stage 2: registers an autonomous agent and mints a dedicated agent key", async () => {
    if (!env) return;

    const agent = await env.client.agents.create(env.namespace, {
      name: "Triage Dispatcher",
      description: "Autonomous refund evaluation and customer operations agent",
    });
    expect(agent.id).toBeDefined();
    expect(agent.name).toBe("Triage Dispatcher");
    agentId = agent.id;

    const keyRecord = await env.client.agents.createKey(
      env.namespace,
      agent.id,
    );
    expect(keyRecord.id).toBeDefined();
    expect(keyRecord.key).toMatch(/^mc_ag_/);
    expect(keyRecord.preview).toMatch(/^mc_ag_/);

    agentKeyId = keyRecord.id;
    agentToken = keyRecord.key;
  });

  // Stage 3: Agent Authentication & Scoped Client Binding
  it("Stage 3: authenticates a secondary client as the autonomous agent", () => {
    if (!env || !agentToken) return;

    agentClient = new MemcellClient({
      token: agentToken,
      baseUrl: env.instanceUrl,
    });
    scopedAgent = agentClient.workspace(env.namespace);
    expect(scopedAgent).toBeDefined();
  });

  // Stage 4: Cold State Check on Fresh Workspace
  it("Stage 4: confirms cold workspace returns empty promptContext and zero memories", async () => {
    if (!env || !scopedAgent) return;

    const coldRecall = await scopedAgent.recall({
      intent: "Process customer wire refund payment",
    });
    expect(coldRecall.memories.length).toBe(0);
    expect(coldRecall.promptContext).toBe("");
  });

  // Stage 5: Epistemic Ingestion Across Types, Scopes, and Statuses
  it("Stage 5: agent ingests guards, directives, personal preferences, and provisional observations", async () => {
    if (!env || !scopedAgent) return;

    // 1. Enforced guard memory
    const guard = await scopedAgent.memories.create({
      title:
        "Direct disbursements exceeding $500 require dual-officer supervisory authorization",
      type: "guard",
      scope: "workspace",
      enforce: true,
    });
    expect(guard.id).toBeDefined();
    expect(guard.type).toBe("guard");
    guardMemoryId = guard.id;

    // 2. Operational directive memory
    const directive = await scopedAgent.memories.create({
      title:
        "Verify customer IBAN and identity records prior to processing refund dispatches",
      type: "directive",
      scope: "workspace",
    });
    expect(directive.id).toBeDefined();
    directiveMemoryId = directive.id;
    initialDirectiveVersion = directive.version || 1;

    // 3. User-scoped personal preference memory
    const personal = await scopedAgent.memories.create({
      title:
        "Format all customer transaction audit summaries with markdown bullet points and ISO timestamps",
      type: "preference",
      scope: "user",
    });
    expect(personal.id).toBeDefined();
    personalMemoryId = personal.id;

    // 4. Provisional unverified observation
    const provisional = await scopedAgent.memories.create({
      title:
        "Suspected European central bank routing code realignment pending regulatory confirmation",
      type: "observation",
      status: "provisional",
      scope: "workspace",
    });
    expect(provisional.id).toBeDefined();
    expect(provisional.status).toBe("provisional");
    provisionalMemoryId = provisional.id;
  });

  // Stage 6: Epistemic Knowledge Graph Relations
  it("Stage 6: declares directed epistemic limits edge and inspects relation graph", async () => {
    if (!env || !guardMemoryId || !directiveMemoryId) return;

    // Connect directive -> guard with `limits` relation (directive constrains guard)
    const rel = await env.client.relations.relate(env.namespace, {
      sourceId: directiveMemoryId,
      targetId: guardMemoryId,
      type: "limits",
    });
    expect(rel.ok).toBe(true);

    // Inspect relations on directive
    const graph = await env.client.relations.list(
      env.namespace,
      directiveMemoryId,
    );
    const hasOutgoing = (graph.outgoing || []).some(
      (r: any) =>
        (r.targetId === guardMemoryId || r.target_id === guardMemoryId) &&
        (r.relationType === "limits" || r.relation_type === "limits"),
    );
    expect(hasOutgoing).toBe(true);
  });

  // Stage 7: Semantic Recall, Graph Synthesis, & Provisional Filtering
  it("Stage 7: recalls relevant directives, prioritizes guards, and filters provisional noise", async () => {
    if (!env || !scopedAgent) return;

    // Semantic recall for refund disbursement intent
    const recall = await scopedAgent.recall({
      intent: "Issue a $750 wire refund disbursement to customer Jane Doe",
    });

    expect(recall.memories.length).toBeGreaterThanOrEqual(1);
    expect(recall.promptContext.length).toBeGreaterThan(0);

    // Prompt context should contain synthesized epistemic directives
    expect(recall.promptContext).toMatch(/disbursement|refund|authorization/i);

    // Provisional memory must be excluded by default from standard recall
    const returnedIds = recall.memories.map((m) => m.id);
    expect(returnedIds).not.toContain(provisionalMemoryId);

    // Recalling with allowProvisional: true includes the provisional observation
    const recallWithProvisional = await agentClient.recall({
      namespace: env.namespace,
      intent: "European banking routing code verification",
      allowProvisional: true,
      minConfidence: 0.1,
    });
    const provIds = recallWithProvisional.memories.map((m) => m.id);
    expect(provIds).toContain(provisionalMemoryId);
  });

  // Stage 8: Execution Outcome Reporting & Confidence Trajectory
  it("Stage 8: agent reports execution outcome to update memory confidence", async () => {
    if (!env || !scopedAgent || !guardMemoryId) return;

    const reportRes = await scopedAgent.report({
      memoryId: guardMemoryId,
      outcome: "worked",
      reason:
        "Agent redirected $750 refund to supervisor for dual-officer signature per guard policy.",
    });
    expect(reportRes.outcome).toBe("worked");
    expect(reportRes.attributed).toBeDefined();
  });

  // Stage 9: Epistemic Governance & Memory Promotion Workflow
  it("Stage 9: requests promotion of personal preference to workspace scope and approves it", async () => {
    if (!env || !personalMemoryId) return;

    // Agent requests elevation to workspace scope
    const promo = await env.client.promotions.request(env.namespace, {
      memoryId: personalMemoryId,
      toScope: "workspace",
      reason:
        "Standardizing markdown audit summary format across all workspace agents",
    });
    expect(promo).toBeDefined();

    // If pending review, administrator approves the request
    if (promo.status === "pending" || !promo.promoted) {
      const pendingList = await env.client.promotions.list(env.namespace, {
        status: "pending",
      });
      const targetRequest = pendingList.items.find(
        (p) => p.memoryId === personalMemoryId,
      );
      if (targetRequest) {
        const approved = await env.client.promotions.approve(
          env.namespace,
          targetRequest.id,
        );
        expect(approved.status).toBe("approved");
      }
    }
  });

  // Stage 10: Memory Evolution, Lineage History & Star Toggling
  it("Stage 10: updates memory content, verifies version lineage, and stars/unstars", async () => {
    if (!env || !directiveMemoryId) return;

    // Update memory
    const updated = await env.client.memories.update(
      env.namespace,
      directiveMemoryId,
      {
        title:
          "Verify customer IBAN, identity records, and tax exemption status prior to refund dispatches",
      },
    );
    expect(updated.version).toBeGreaterThan(initialDirectiveVersion);

    // Inspect cryptographic revision history
    const history = await env.client.memories.history(
      env.namespace,
      directiveMemoryId,
    );
    expect(history.totalVersions).toBeGreaterThanOrEqual(2);
    expect((history.history || history.items)!.length).toBeGreaterThanOrEqual(
      2,
    );

    // Star memory
    const starRes = await env.client.memories.star(
      env.namespace,
      directiveMemoryId,
      true,
    );
    expect(starRes.starred).toBe(true);

    // Unstar memory
    const unstarRes = await env.client.memories.star(
      env.namespace,
      directiveMemoryId,
      false,
    );
    expect(unstarRes.starred).toBe(false);
  });

  // Stage 11: Security Gate: Agent Key Revocation
  it("Stage 11: administrator revokes agent key and confirms subsequent agent calls are refused", async () => {
    if (!env || !agentId || !agentKeyId || !agentClient) return;

    // Admin revokes agent key
    await env.client.agents.revokeKey(env.namespace, agentId, agentKeyId);

    // Agent client should now be turned away with 401 / 403 refusal
    await expect(
      agentClient.recall({
        namespace: env.namespace,
        intent: "Attempt recall after key revocation",
      }),
    ).rejects.toThrow();
  });
});
