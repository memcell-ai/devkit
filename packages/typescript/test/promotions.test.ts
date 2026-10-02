import { describe, expect, it, vi } from "vitest";
import { MemCell } from "../src/client.js";

describe("4-Tier Scopes & Epistemic Promotions API", () => {
  it("lists pending promotions via client.promotions.list", async () => {
    const recorded: Array<{ method: string; url: string; body?: any }> = [];
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        recorded.push({ method, url: u, body });

        if (method === "GET" && u.includes("/api/v1/acme/backend/promotions")) {
          return new Response(
            JSON.stringify({
              promotionRequests: [
                {
                  id: "promo-1",
                  statementId: "stmt-1",
                  fromScope: "user",
                  toScope: "project",
                  status: "pending",
                  requesterId: "usr-alice",
                  requesterReason: "Ready for team baseline",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
              total: 1,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      },
    );

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const res = await memcell.promotions.list("acme/backend", {
      status: "pending",
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.method).toBe("GET");
    expect(recorded[0]!.url).toContain(
      "/api/v1/acme/backend/promotions?status=pending",
    );
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.id).toBe("promo-1");
    expect(res.items[0]!.fromScope).toBe("user");
    expect(res.items[0]!.toScope).toBe("project");
    expect(res.pagination.total).toBe(1);
  });

  it("approves and rejects promotion requests via client.promotions and scoped handle", async () => {
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;

        if (
          method === "POST" &&
          u.includes("/api/v1/acme/backend/promotions/promo-1/approve")
        ) {
          return new Response(
            JSON.stringify({
              approved: true,
              statement: {
                id: "stmt-promoted-1",
                title: "Always use TLS 1.3",
                scope: "project",
                requiredRoles: ["security-lead"],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (
          method === "POST" &&
          u.includes("/api/v1/acme/backend/promotions/promo-2/reject")
        ) {
          return new Response(
            JSON.stringify({
              rejected: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response("Not found", { status: 404 });
      },
    );

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const scoped = memcell.scope("acme/backend");

    const approved = await scoped.promotions.approve("promo-1", {
      reason: "Verified by lead reviewer",
    });
    expect(approved.approved).toBe(true);
    expect(approved.statement.scope).toBe("project");

    const rejected = await scoped.promotions.reject("promo-2", {
      reason: "Does not meet team guidelines",
    });
    expect(rejected.rejected).toBe(true);
  });

  it("sends scopes and myMemory in recall payload", async () => {
    let capturedBody: any = null;
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        capturedBody = init?.body ? JSON.parse(String(init.body)) : undefined;
        return new Response(
          JSON.stringify({
            recallId: "rec-123",
            promptContext: "<memcell_context></memcell_context>",
            statements: [
              {
                id: "stmt-1",
                title: "Use connection pooling",
                scope: "organization",
                requiredRoles: ["admin"],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const res = await memcell.recall({
      namespace: "acme/backend",
      query: "database connection",
      scopes: ["organization", "project"],
      myMemory: true,
    });

    expect(capturedBody.scopes).toEqual(["organization", "project"]);
    expect(capturedBody.my_memory).toBe(true);
    expect(res.statements[0]!.scope).toBe("organization");
    expect(res.statements[0]!.requiredRoles).toEqual(["admin"]);
  });

  it("sends scope and requiredRoles in remember payload", async () => {
    let capturedBody: any = null;
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        capturedBody = init?.body ? JSON.parse(String(init.body)) : undefined;
        return new Response(
          JSON.stringify({
            created: [
              {
                id: "stmt-rem-1",
                title: "Org security baseline",
                scope: "organization",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const res = await memcell.remember({
      namespace: "acme/backend",
      title: "Org security baseline",
      scope: "organization",
      requiredRoles: ["sec-ops"],
    });

    expect(capturedBody.scope).toBe("organization");
    expect(capturedBody.required_roles).toEqual(["sec-ops"]);
    expect(res.created).toHaveLength(1);
    expect(res.created[0]!.scope).toBe("organization");
  });
});
