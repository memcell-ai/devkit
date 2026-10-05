import { describe, expect, it, vi } from "vitest";
import { MemCell } from "../src/client.js";

describe("Memories Relations API", () => {
  it("creates a memory relation", async () => {
    const recorded: Array<{ method: string; url: string; body?: any }> = [];
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        recorded.push({ method, url: u, body });

        if (method === "POST" && u.includes("/memories/stmt_g1/relations")) {
          return new Response(
            JSON.stringify({
              relation: {
                id: "rel_1",
                projectId: "proj_1",
                sourceId: "stmt_g1",
                targetId: body.targetId,
                relationType: body.relationType,
                confidence: body.confidence ?? 0.9,
                metadata: body.metadata ?? {},
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
    const rel = await memcell.memories.relations.create(
      "acme/backend",
      "stmt_g1",
      {
        targetId: "stmt_d1",
        relationType: "constrains",
        confidence: 0.95,
      },
    );

    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.method).toBe("POST");
    expect(recorded[0]!.url).toContain(
      "/api/v1/acme/backend/memories/stmt_g1/relations",
    );
    expect(recorded[0]!.body.targetId).toBe("stmt_d1");
    expect(recorded[0]!.body.relationType).toBe("constrains");
    expect(rel.id).toBe("rel_1");
    expect(rel.relationType).toBe("constrains");
    expect(rel.sourceId).toBe("stmt_g1");
    expect(rel.targetId).toBe("stmt_d1");
  });

  it("lists memory incoming and outgoing relations", async () => {
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      expect(u).toContain("/api/v1/acme/backend/memories/stmt_g1/relations");
      return new Response(
        JSON.stringify({
          incoming: [],
          outgoing: [
            {
              id: "rel_1",
              projectId: "proj_1",
              sourceId: "stmt_g1",
              targetId: "stmt_d1",
              relationType: "constrains",
              confidence: 0.95,
              targetMemory: {
                id: "stmt_d1",
                title: "Use background queue",
                type: "directive",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const res = await memcell.memories.relations.list(
      "acme/backend",
      "stmt_g1",
    );

    expect(res.incoming).toHaveLength(0);
    expect(res.outgoing).toHaveLength(1);
    expect(res.outgoing[0]!.relationType).toBe("constrains");
    expect(res.outgoing[0]!.targetMemory?.title).toBe("Use background queue");
  });

  it("deletes a memory relation", async () => {
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        expect(init?.method).toBe("DELETE");
        expect(u).toContain(
          "/api/v1/acme/backend/memories/stmt_g1/relations/rel_1",
        );
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    );

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    await expect(
      memcell.memories.relations.delete("acme/backend", "stmt_g1", "rel_1"),
    ).resolves.toBeUndefined();
  });

  it("lists project-wide relations with filtering and pagination", async () => {
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      expect(u).toContain("/api/v1/acme/backend/relations?");
      expect(u).toContain("page=1");
      expect(u).toContain("per_page=20");
      expect(u).toContain("relation_type=justifies");
      return new Response(
        JSON.stringify({
          relations: [
            {
              id: "rel_2",
              projectId: "proj_1",
              sourceId: "stmt_f1",
              targetId: "stmt_g1",
              relationType: "justifies",
              confidence: 0.9,
            },
          ],
          pagination: {
            page: 1,
            perPage: 20,
            total: 1,
            hasMore: false,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const res = await memcell.memories.relations.listWorkspace("acme/backend", {
      page: 1,
      perPage: 20,
      relationType: "justifies",
    });

    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.relationType).toBe("justifies");
    expect(res.pagination.total).toBe(1);
  });

  it("operates through ScopedMemCell bound namespace", async () => {
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || "GET";
        if (
          method === "POST" &&
          u.includes("/api/v1/acme/backend/memories/stmt_g1/relations")
        ) {
          return new Response(
            JSON.stringify({
              relation: {
                id: "rel_scoped_1",
                projectId: "proj_1",
                sourceId: "stmt_g1",
                targetId: "stmt_d1",
                relationType: "refines",
                confidence: 0.88,
              },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      },
    );

    const memcell = new MemCell({ apiKey: "mc_key", fetch: mockFetch as any });
    const scoped = memcell.scope("acme/backend");
    const rel = await scoped.memories.relations.create("stmt_g1", {
      targetId: "stmt_d1",
      relationType: "refines",
    });

    expect(rel.id).toBe("rel_scoped_1");
    expect(rel.relationType).toBe("refines");
  });
});
