import { describe, expect, it, vi } from "vitest";
import { MemCell } from "../src/client.js";

describe("Sweep & Consolidation API (ADR 0075)", () => {
  it("triggers consolidation sweep via client.sweep.consolidate", async () => {
    const recorded: Array<{ method: string; url: string; body?: any }> = [];
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        recorded.push({ method, url: u, body });

        if (
          method === "POST" &&
          u.includes("/api/v1/acme/backend/lifecycle/sweep/consolidate")
        ) {
          return new Response(
            JSON.stringify({
              ok: true,
              jobId: "job_sweep_test_123",
              status: "queued",
              message:
                "Consolidation sweep job enqueued for background execution.",
              phases: [
                "clustering",
                "synthesizing",
                "fusing",
                "linking_edges",
                "surfacing_tensions",
                "refreshing_profile",
                "completed",
              ],
            }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      },
    );

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const res = await memcell.sweep.consolidate("acme/backend", {
      minSimilarity: 0.85,
      minClusterSize: 2,
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.method).toBe("POST");
    expect(recorded[0]!.url).toContain(
      "/api/v1/acme/backend/lifecycle/sweep/consolidate",
    );
    expect(recorded[0]!.body.minSimilarity).toBe(0.85);
    expect(recorded[0]!.body.minClusterSize).toBe(2);

    expect(res.ok).toBe(true);
    expect(res.jobId).toBe("job_sweep_test_123");
    expect(res.status).toBe("queued");
    expect(res.phases).toContain("clustering");
    expect(res.phases).toContain("fusing");
    expect(res.phases).toContain("completed");
  });

  it("triggers consolidation sweep through ScopedMemCell", async () => {
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || "GET";
        if (
          method === "POST" &&
          u.includes("/api/v1/acme/backend/lifecycle/sweep/consolidate")
        ) {
          return new Response(
            JSON.stringify({
              ok: true,
              jobId: "job_scoped_sweep_456",
              status: "queued",
              message: "Consolidation sweep queued.",
              phases: ["clustering", "completed"],
            }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      },
    );

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const scoped = memcell.scope("acme/backend");
    const res = await scoped.consolidateSweep();

    expect(res.jobId).toBe("job_scoped_sweep_456");
    expect(res.status).toBe("queued");
  });
});
