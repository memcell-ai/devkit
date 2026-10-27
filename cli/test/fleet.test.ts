import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const home = await mkdtemp(join(tmpdir(), "memcell-fleet-home-"));
const projectDir = await mkdtemp(join(tmpdir(), "memcell-fleet-dir-"));

vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => home,
}));

const calls: { url: string; method?: string; body?: Record<string, unknown> }[] = [];
let answer: () => unknown = () => ({});

vi.stubGlobal(
  "fetch",
  async (
    url: string,
    init: { method?: string; body?: string; headers: Record<string, string> },
  ) => {
    calls.push({
      url,
      method: init.method,
      body: init.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
    });
    const ans = answer();
    const text = typeof ans === "string" ? ans : JSON.stringify(ans);
    return { ok: true, status: 200, text: async () => text };
  },
);

const {
  listFleet,
  getFleetAgent,
  registerFleetAgent,
  suspendFleetAgent,
  resumeFleetAgent,
  grantFleetWorkspace,
  revokeFleetWorkspace,
} = await import("../src/commands/fleet.js");
const { listAuditLogs, exportAuditLogs } = await import("../src/commands/audit.js");
const { getEnterpriseInsights } = await import("../src/commands/insights.js");
const { saveCredential } = await import("../src/instance.js");
const { saveProject } = await import("../src/workspace.js");

const instance = "http://memcell.test";
const cwd = process.cwd;

beforeAll(async () => {
  await saveCredential({
    instance,
    token: "test_session_token",
    obtainedAt: new Date().toISOString(),
  });
  await saveProject({ instance, project: "acme/research", space: "acme/research" }, projectDir);
  process.cwd = () => projectDir;
  return () => {
    process.cwd = cwd;
  };
});

beforeEach(() => {
  calls.length = 0;
  answer = () => ({});
});

describe("cli fleet commands", () => {
  it("lists fleet agents for an organization", async () => {
    answer = () => ({
      agents: [
        {
          id: "ag_100",
          name: "Research Agent",
          slug: "research-agent",
          scope: "organization",
          status: "active",
          health: "healthy",
          activeKeyCount: 1,
          projectGrantCount: 0,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const code = await listFleet(instance, { org: "acme" });
    expect(code).toBe(0);
    expect(calls[0]?.url).toContain("/api/v1/organizations/acme/fleet");
  });

  it("inspects fleet agent detail", async () => {
    answer = () => ({
      agent: {
        id: "ag_100",
        name: "Research Agent",
        slug: "research-agent",
        scope: "organization",
        status: "active",
        health: "healthy",
      },
      keys: [{ id: "key_100", keyPrefix: "mc_ag_live", lastUsedAt: new Date().toISOString() }],
      grants: [
        {
          projectId: "proj_42",
          projectName: "backend",
          permission: "write",
          grantedAt: new Date().toISOString(),
        },
      ],
    });

    const code = await getFleetAgent(instance, "ag_100", { org: "acme" });
    expect(code).toBe(0);
    expect(calls[0]?.url).toContain("/api/v1/organizations/acme/fleet/ag_100");
  });

  it("registers a new fleet agent with generated credentials", async () => {
    answer = () => ({
      agent: {
        id: "ag_200",
        name: "Autonomous Analyst",
        slug: "analyst",
        scope: "organization",
        status: "active",
        health: "healthy",
      },
      key: {
        key: "mc_ag_live_secret999",
        keyPrefix: "mc_ag_live",
        keyId: "key_200",
      },
    });

    const code = await registerFleetAgent(instance, "Autonomous Analyst", {
      org: "acme",
      scope: "organization",
    });
    expect(code).toBe(0);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.body?.name).toBe("Autonomous Analyst");
  });

  it("triggers emergency kill-switch with --reason", async () => {
    answer = () => ({
      ok: true,
      agent: {
        id: "ag_100",
        name: "Research Agent",
        status: "suspended",
        suspensionReason: "Rogue query loop",
      },
      message: "Agent suspended",
    });

    const code = await suspendFleetAgent(instance, "ag_100", {
      org: "acme",
      reason: "Rogue query loop",
    });
    expect(code).toBe(0);
    expect(calls[0]?.url).toContain("/fleet/ag_100/suspend");
    expect(calls[0]?.body?.reason).toBe("Rogue query loop");
  });

  it("reactivates a suspended agent", async () => {
    answer = () => ({
      ok: true,
      agent: {
        id: "ag_100",
        name: "Research Agent",
        status: "active",
      },
      message: "Agent resumed",
    });

    const code = await resumeFleetAgent(instance, "ag_100", { org: "acme" });
    expect(code).toBe(0);
    expect(calls[0]?.url).toContain("/fleet/ag_100/resume");
  });

  it("grants and revokes cross-workspace access", async () => {
    answer = () => ({ ok: true, grant: { agentId: "ag_100", workspaceId: "ws_42" } });

    const grantCode = await grantFleetWorkspace(instance, "ag_100", {
      org: "acme",
      workspace: "ws_42",
      permission: "write",
    });
    expect(grantCode).toBe(0);
    expect(calls[0]?.url).toContain("/fleet/ag_100/grant");
    expect(calls[0]?.body?.workspaceId).toBe("ws_42");

    answer = () => ({ ok: true });
    const revokeCode = await revokeFleetWorkspace(instance, "ag_100", {
      org: "acme",
      workspace: "ws_42",
    });
    expect(revokeCode).toBe(0);
    expect(calls[1]?.method).toBe("DELETE");
    expect(calls[1]?.body?.workspaceId).toBe("ws_42");
  });
});

describe("cli audit commands", () => {
  it("lists audit events", async () => {
    answer = () => ({
      events: [
        {
          id: "aud_1",
          organizationId: "org_1",
          action: "agent.suspended",
          targetType: "agent",
          targetId: "ag_100",
          actorType: "user",
          actorName: "Security Lead",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const code = await listAuditLogs(instance, { org: "acme" });
    expect(code).toBe(0);
    expect(calls[0]?.url).toContain("/api/v1/organizations/acme/audit-logs");
  });

  it("exports audit logs formatted as CEF", async () => {
    answer = () => "CEF:0|MemCell|Platform|1.0|agent.suspended|Agent Suspended|8|suser=admin\n";

    const code = await exportAuditLogs(instance, { org: "acme", format: "cef" });
    expect(code).toBe(0);
    expect(calls[0]?.url).toContain("/export");
    expect(calls[0]?.url).toContain("format=cef");
  });
});

describe("cli insights commands", () => {
  it("displays organization operational telemetry, calibration, and governance KPIs", async () => {
    answer = () => ({
      timeframe: "30d",
      kpis: {
        deadEndAvoidanceRate: 98.5,
        recallUtilizationRate: 74.2,
        recallPrecisionRate: 96.0,
        memoryConvergenceRate: 88.0,
        tokensSaved: 450000,
        estimatedCostSavedUsd: 4.5,
        latencyMs: { p50: 12.0, p95: 28.0, p99: 45.0 },
      },
      metrics: {
        totalRecalls: 1500,
        workedRecalls: 1475,
        failedRecalls: 25,
        pendingRecalls: 0,
        totalMemories: 320,
        convergedMemories: 280,
      },
      calibration: {
        totalSamples: 120,
        expectedCalibrationError: 0.023,
        brierScore: 0.061,
        highConfidenceWorkedRate: 96.5,
        lowConfidenceWorkedRate: 51.0,
        reliabilityLiftPct: 45.5,
        buckets: [],
      },
      governance: {
        quarantinedUserScopeCount: 4,
        provisionalCount: 3,
        demotedOrRefutedCount: 2,
        enforcedGuardCount: 16,
        approvedPromotionsCount: 7,
        pendingPromotionsCount: 1,
      },
      timeseries: [],
    });

    const code = await getEnterpriseInsights(instance, { org: "acme", timeframe: "30d" });
    expect(code).toBe(0);
    expect(calls[0]?.url).toContain("/api/v1/organizations/acme/insights?timeframe=30d");
  });

  it("displays workspace insights with confidence calibration and governance shield", async () => {
    answer = () => ({
      timeframe: "24h",
      summary: {
        recalls: { totalHits: 24, totalMisses: 1, hitRate: 96.0, current: 25 },
        taskVerification: { totalWorked: 22, totalFailed: 1, workedRate: 95.7 },
        activeMemoriesCount: 31,
        avgConfidence: 0.89,
      },
      calibration: {
        totalSamples: 23,
        expectedCalibrationError: 0.019,
        brierScore: 0.049,
        highConfidenceWorkedRate: 95.7,
        lowConfidenceWorkedRate: 50.0,
        reliabilityLiftPct: 45.7,
        buckets: [],
      },
      governance: {
        quarantinedUserScopeCount: 2,
        provisionalCount: 1,
        demotedOrRefutedCount: 1,
        enforcedGuardCount: 5,
        approvedPromotionsCount: 3,
        pendingPromotionsCount: 0,
      },
    });

    const code = await getEnterpriseInsights(instance, {
      workspace: "acme/research",
      timeframe: "24h",
    });
    expect(code).toBe(0);
    expect(calls[0]?.url).toContain("/api/v1/acme/research/insights?timeframe=24h");
  });
});
