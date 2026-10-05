import { describe, expect, it, vi } from "vitest";
import { MemCell } from "../src/index.js";

describe("Workspaces and Memories Ontology", () => {
  it("exposes client.workspaces and client.memories", () => {
    const client = new MemCell({ apiKey: "test-api-key" });

    expect(client.workspaces).toBeDefined();
    expect(client.memories).toBeDefined();
    expect(typeof client.workspace).toBe("function");
    expect(typeof client.scope).toBe("function");
  });

  it("client.workspaces lists and creates workspaces using workspace endpoints", async () => {
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/api/v1/workspaces") && init?.method === "GET") {
          return new Response(
            JSON.stringify({
              workspaces: [
                {
                  id: "w-1",
                  slug: "backend",
                  name: "Backend Service",
                  visibility: "private",
                },
              ],
              pagination: { page: 1, perPage: 30, total: 1, hasMore: false },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (u.includes("/api/v1/workspaces") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          return new Response(
            JSON.stringify({
              ok: true,
              workspace: {
                id: "w-2",
                slug: body.slug ?? "new-workspace",
                name: body.name,
                visibility: body.visibility ?? "private",
              },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      },
    );

    const client = new MemCell({
      apiKey: "test-api-key",
      fetch: mockFetch as any,
    });

    const listResult = await client.workspaces.list();
    expect(listResult.items).toHaveLength(1);
    expect(listResult.items[0]!.name).toBe("Backend Service");

    const created = await client.workspaces.create({
      name: "Frontend Service",
      slug: "frontend",
    });
    expect(created.slug).toBe("frontend");
  });

  it("client.memories remembers and lists memories via /memories endpoints", async () => {
    const mockFetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        if (
          u.includes("/api/v1/acme/backend/memories") &&
          init?.method === "POST"
        ) {
          const body = JSON.parse(String(init.body));
          return new Response(
            JSON.stringify({
              memory: {
                id: "m-1",
                title: body.title,
                type: body.type ?? "fact",
                confidence: 0.9,
                status: "active",
              },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        }
        if (
          u.includes("/api/v1/acme/backend/memories") &&
          init?.method === "GET"
        ) {
          return new Response(
            JSON.stringify({
              memories: [
                {
                  id: "m-1",
                  title: "Postgres 16 is default",
                  type: "fact",
                  confidence: 0.9,
                  status: "active",
                },
              ],
              pagination: { page: 1, perPage: 30, total: 1, hasMore: false },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      },
    );

    const client = new MemCell({
      apiKey: "test-api-key",
      fetch: mockFetch as any,
    });

    const memory = await client.memories.remember("acme/backend", {
      title: "Postgres 16 is default",
      type: "fact",
    });
    expect(memory.id).toBe("m-1");
    expect(memory.title).toBe("Postgres 16 is default");

    const list = await client.memories.list("acme/backend");
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.id).toBe("m-1");
  });

  it("client.workspace(namespace) returns a scoped handle with memories recall/remember", () => {
    const client = new MemCell({ apiKey: "test-api-key" });
    const ws = client.workspace("acme/backend", { subject: "deploy" });
    expect(ws.namespace).toBe("acme/backend");
    expect(typeof ws.recall).toBe("function");
    expect(typeof ws.remember).toBe("function");
    expect(typeof ws.wrapExecution).toBe("function");
  });
});
