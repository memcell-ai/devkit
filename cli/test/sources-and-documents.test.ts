import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const home = await mkdtemp(join(tmpdir(), "memcell-srcdoc-home-"));
const workspaceDir = await mkdtemp(join(tmpdir(), "memcell-srcdoc-ws-"));

vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => home,
}));

const calls: { url: string; method?: string; body?: Record<string, unknown> }[] = [];
let answer: (url: string, init?: { method?: string; body?: string }) => unknown = () => ({});

vi.stubGlobal(
  "fetch",
  async (
    url: string,
    init: { method?: string; body?: string; headers?: Record<string, string> },
  ) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
    });
    const ans = answer(url, init);
    return new Response(JSON.stringify(ans), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
);

const { ingestDocuments } = await import("../src/commands/documents.js");
const { addSource, listSources, syncSource, deleteSource } =
  await import("../src/commands/sources.js");
const { saveCredential } = await import("../src/instance.js");
const { saveProject } = await import("../src/workspace.js");

const instance = "http://memcell.test";
const originalCwd = process.cwd;

beforeAll(async () => {
  await saveCredential({
    instance,
    token: "test_session_token",
    obtainedAt: new Date().toISOString(),
  });
  await saveProject({ instance, project: "acme/ops", space: "acme/ops" }, workspaceDir);
  return () => {
    process.cwd = originalCwd;
  };
});

beforeEach(() => {
  calls.length = 0;
  process.cwd = () => workspaceDir;
});

describe("multi-format document ingest and source CLI commands", () => {
  it("ingests binary PDF and structured CSV files with fileBase64 and contentType", async () => {
    const pdfPath = join(workspaceDir, "sla-handbook.pdf");
    const csvPath = join(workspaceDir, "accounts.csv");
    const pdfBytes = Buffer.from("%PDF-1.7 test binary");
    await writeFile(pdfPath, pdfBytes);
    await writeFile(csvPath, "account,tier\nacme,enterprise\n", "utf8");

    answer = (url) => {
      if (url.endsWith("/documents")) {
        return {
          document: {
            id: "doc_1",
            workspaceId: "ws_1",
            title: "uploaded",
            contentType: "application/pdf",
            contentHash: "h1",
            chunkCount: 3,
            sizeBytes: 64,
          },
          chunkCount: 3,
          distilledMemoriesCount: 1,
        };
      }
      return {};
    };

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const exitCode = await ingestDocuments(instance, [pdfPath, csvPath], {
        workspace: "acme/ops",
      });
      expect(exitCode).toBe(0);
    } finally {
      spy.mockRestore();
    }

    const docPosts = calls.filter((c) => c.url.endsWith("/api/v1/acme/ops/documents"));
    expect(docPosts).toHaveLength(2);
    expect(docPosts[0]?.body?.fileBase64).toBe(pdfBytes.toString("base64"));
    expect(docPosts[0]?.body?.mimeType).toBe("application/pdf");
    expect(docPosts[1]?.body?.contentType).toBe("text/csv");
  });

  it("supports --dry-run without sending network uploads", async () => {
    const mdPath = join(workspaceDir, "runbook.md");
    await writeFile(mdPath, "# Runbook\nVerify health endpoints.", "utf8");

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = await ingestDocuments(instance, [mdPath], {
        workspace: "acme/ops",
        "dry-run": true,
      });
      expect(code).toBe(0);
      expect(calls).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("connects, lists, syncs, and deletes workspace knowledge sources", async () => {
    answer = (url, init) => {
      if (url.endsWith("/sources") && init?.method === "POST") {
        return {
          source: {
            id: "src_wh_1",
            workspaceId: "ws_1",
            type: "webhook",
            name: "Support Desk",
            status: "ready",
            documentCount: 0,
            memoryCount: 0,
          },
          webhookSecret: "whsrc_cli_secret",
          ingestPath: "/api/v1/acme/ops/sources/src_wh_1/ingest",
        };
      }
      if (url.endsWith("/sources") && (!init?.method || init.method === "GET")) {
        return {
          sources: [
            {
              id: "src_url_1",
              workspaceId: "ws_1",
              type: "url",
              name: "Docs Sitemap",
              status: "ready",
              documentCount: 5,
              memoryCount: 9,
            },
          ],
        };
      }
      if (url.endsWith("/sources/src_url_1/sync")) {
        return {
          status: "ready",
          syncedFiles: 5,
          totalChunks: 22,
          totalMemories: 9,
        };
      }
      return { deleted: true };
    };

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(
        await addSource(instance, undefined, {
          workspace: "acme/ops",
          type: "webhook",
          name: "Support Desk",
        }),
      ).toBe(0);
      expect(await listSources(instance, { workspace: "acme/ops" })).toBe(0);
      expect(await syncSource(instance, "src_url_1", { workspace: "acme/ops" })).toBe(0);
      expect(await deleteSource(instance, "src_url_1", { workspace: "acme/ops" })).toBe(0);
    } finally {
      spy.mockRestore();
    }

    expect(calls.some((c) => c.url.endsWith("/sources") && c.method === "POST")).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/sources/src_url_1/sync"))).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/sources/src_url_1") && c.method === "DELETE")).toBe(
      true,
    );
  });
});
