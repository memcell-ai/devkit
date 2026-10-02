import { describe, expect, it, vi } from "vitest";
import { MemCell } from "../src/client.js";

describe("Fleet Management, Audit, Insights & Teams SDK", () => {
  it("lists fleet agents and supports emergency kill-switch suspension", async () => {
    const recorded: Array<{ method: string; url: string; body?: any }> = [];
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        recorded.push({ method, url: u, body });

        if (
          method === "GET" &&
          u.includes("/api/v1/organizations/acme/fleet")
        ) {
          return new Response(
            JSON.stringify({
              agents: [
                {
                  id: "ag-1",
                  name: "Report Synthesizer",
                  slug: "report-synthesizer",
                  scope: "organization",
                  framework: "LangChain",
                  model: "claude-3-5-sonnet",
                  status: "active",
                  health: "healthy",
                  description: "Cross-functional reporting agent",
                  organizationId: "org-1",
                  teamId: null,
                  projectId: null,
                  lastActiveAt: new Date().toISOString(),
                  activeKeyCount: 2,
                  projectGrantCount: 5,
                  suspensionReason: null,
                  suspendedAt: null,
                  createdAt: new Date().toISOString(),
                },
              ],
              total: 1,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (
          method === "POST" &&
          u.includes("/api/v1/organizations/acme/fleet/ag-1/suspend")
        ) {
          return new Response(
            JSON.stringify({
              ok: true,
              agent: {
                id: "ag-1",
                status: "suspended",
                health: "suspended",
                suspensionReason: body.reason,
              },
              message: "Emergency kill-switch activated.",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response("Not found", { status: 404 });
      },
    );

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const { agents } = await memcell.organizations.fleet.list("acme", {
      status: "active",
    });

    expect(agents).toHaveLength(1);
    expect(agents[0]!.name).toBe("Report Synthesizer");
    expect(recorded[0]!.url).toContain(
      "/api/v1/organizations/acme/fleet?status=active",
    );

    // Activate Kill-Switch
    const suspendRes = await memcell.organizations.fleet.suspend(
      "acme",
      "ag-1",
      "Behavior drift detected",
    );
    expect(suspendRes.ok).toBe(true);
    expect(suspendRes.agent.status).toBe("suspended");
    expect(recorded[1]!.body.reason).toBe("Behavior drift detected");
  });

  it("exports immutable enterprise audit logs in CEF format", async () => {
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (
        u.includes("/api/v1/organizations/acme/audit-logs/export") &&
        u.includes("format=cef")
      ) {
        return new Response(
          "CEF:0|MemCell|Platform|1.0|fleet.agent_kill_switch_activated|fleet.agent_kill_switch_activated|8|src=127.0.0.1 msg=drift",
          { status: 200, headers: { "Content-Type": "text/plain" } },
        );
      }
      return new Response("Not found", { status: 404 });
    });

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const cefLog = await memcell.organizations.audit.export("acme", "cef");

    expect(cefLog.startsWith("CEF:0|MemCell|Platform|1.0|")).toBe(true);
    expect(cefLog).toContain("fleet.agent_kill_switch_activated");
  });

  it("retrieves enterprise cognitive insights and the 5 core KPIs", async () => {
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/api/v1/organizations/acme/insights")) {
        return new Response(
          JSON.stringify({
            timeframe: "30d",
            kpis: {
              deadEndAvoidanceRate: 98.5,
              recallUtilizationRate: 85.2,
              recallPrecisionRate: 94.0,
              memoryConvergenceRate: 72.8,
              tokensSaved: 154000,
              estimatedCostSavedUsd: 0.46,
              latencyMs: { p50: 14, p95: 42, p99: 88 },
            },
            metrics: {
              totalRecalls: 40,
              workedRecalls: 38,
              failedRecalls: 2,
              pendingRecalls: 0,
              totalStatements: 120,
              convergedStatements: 87,
            },
            timeseries: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    });

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const scopedOrg = memcell.organization("acme");
    const insights = await scopedOrg.insights.get({ timeframe: "30d" });

    expect(insights.kpis.deadEndAvoidanceRate).toBe(98.5);
    expect(insights.kpis.latencyMs.p50).toBe(14);
    expect(insights.metrics.totalRecalls).toBe(40);
  });

  it("manages organization teams and members", async () => {
    const recorded: Array<{ method: string; url: string; body?: any }> = [];
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        recorded.push({ method, url: u, body });

        if (
          method === "POST" &&
          u.includes("/api/v1/organizations/acme/teams")
        ) {
          return new Response(
            JSON.stringify({
              ok: true,
              team: {
                id: "tm-devops",
                name: "DevOps Core",
                organizationId: "org-1",
                memberCount: 0,
                projectCount: 0,
                agentCount: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      },
    );

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const team = await memcell.organizations.teams.create(
      "acme",
      "DevOps Core",
    );

    expect(team.id).toBe("tm-devops");
    expect(team.name).toBe("DevOps Core");
    expect(recorded[0]!.method).toBe("POST");
    expect(recorded[0]!.body.name).toBe("DevOps Core");
  });
});
