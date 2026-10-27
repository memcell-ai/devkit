import { describe, expect, it, vi } from "vitest";
import { MemCell } from "../src/index.js";
import {
  createLangChainTools,
  createLangGraphMemoryNodes,
  createMemCellMiddleware,
  createMemCellTools,
  createOpenAIMemoryTools,
  createOpenAIResponsesTools,
  executeOpenAIMemoryTool,
  runWithOpenAIMemory,
} from "../src/integrations/index.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MemCell Node SDK — Multi-Format Documents, Sources & Framework Integrations", () => {
  describe("documents.ingest binary file upload & sources namespace", () => {
    it("encodes Uint8Array binary files to fileBase64 and forwards filename/mimeType", async () => {
      const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
      const mockFetch = vi.fn(
        async (url: string | URL | Request, init?: RequestInit) => {
          calls.push({
            url: String(url),
            body: JSON.parse(String(init?.body || "{}")),
          });
          return jsonResponse({
            document: {
              id: "doc_pdf_1",
              workspaceId: "ws_1",
              title: "sla-handbook.pdf",
              sourceUri: "sla-handbook.pdf",
              sourceType: "pdf",
              contentType: "application/pdf",
              contentHash: "hash1",
              chunkCount: 6,
              sizeBytes: 1024,
            },
            chunkCount: 6,
            distilledMemoriesCount: 2,
          });
        },
      );

      const client = new MemCell({
        apiKey: "mc_live_test",
        baseUrl: "https://memcell.ai",
        fetch: mockFetch as unknown as typeof fetch,
      });

      const ops = client.workspace("acme/operations");
      const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
      const res = await ops.documents.ingest({
        file: bytes,
        filename: "sla-handbook.pdf",
        mimeType: "application/pdf",
        distillMemories: true,
      });

      expect(res.chunkCount).toBe(6);
      expect(res.memoriesCreated).toBe(2);
      expect(calls[0]?.url).toBe(
        "https://memcell.ai/api/v1/acme/operations/documents",
      );
      expect(calls[0]?.body.fileBase64).toBe(
        Buffer.from(bytes).toString("base64"),
      );
      expect(calls[0]?.body.filename).toBe("sla-handbook.pdf");
      expect(calls[0]?.body.mimeType).toBe("application/pdf");
    });

    it("fails fast when neither content nor file/fileBase64 is supplied", async () => {
      const client = new MemCell({
        apiKey: "mc_live_test",
        fetch: vi.fn() as unknown as typeof fetch,
      });
      await expect(
        client.documents.ingest("acme/operations", { title: "Empty" }),
      ).rejects.toThrow(
        "Provide either 'content' or binary 'file'/'fileBase64'",
      );
    });

    it("manages url and webhook sources end-to-end", async () => {
      const requests: Array<{
        url: string;
        method: string;
        headers: Record<string, string>;
        body?: Record<string, unknown>;
      }> = [];

      const mockFetch = vi.fn(
        async (url: string | URL | Request, init?: RequestInit) => {
          const u = String(url);
          const method = init?.method || "GET";
          const headers = (init?.headers || {}) as Record<string, string>;
          const body = init?.body ? JSON.parse(String(init.body)) : undefined;
          requests.push({ url: u, method, headers, body });

          if (u.endsWith("/sources") && method === "POST") {
            return jsonResponse(
              {
                source: {
                  id: "src_wh_1",
                  workspaceId: "ws_1",
                  type: body?.type ?? "webhook",
                  name: body?.name ?? "Support Helpdesk",
                  status: "ready",
                  documentCount: 0,
                  memoryCount: 0,
                },
                webhookSecret: "whsrc_secret_abc",
                ingestPath: "/api/v1/acme/operations/sources/src_wh_1/ingest",
              },
              201,
            );
          }

          if (u.endsWith("/sources/src_wh_1/ingest") && method === "POST") {
            return jsonResponse({
              status: "ready",
              ingestedDocuments: 1,
              skippedDocuments: 0,
              totalChunks: 3,
              totalMemories: 1,
              documents: [
                {
                  id: "doc_1",
                  title: "Ticket Playbook",
                  chunkCount: 3,
                  deduplicated: false,
                },
              ],
            });
          }

          if (u.endsWith("/sources/src_url_1/sync") && method === "POST") {
            return jsonResponse({
              status: "ready",
              syncedFiles: 4,
              skippedFiles: 0,
              totalChunks: 18,
              totalMemories: 5,
            });
          }

          if (u.endsWith("/sources") && method === "GET") {
            return jsonResponse({
              sources: [
                {
                  id: "src_wh_1",
                  workspaceId: "ws_1",
                  type: "webhook",
                  name: "Support Helpdesk",
                  status: "ready",
                  documentCount: 1,
                  memoryCount: 1,
                },
              ],
            });
          }

          return jsonResponse({ deleted: true });
        },
      );

      const client = new MemCell({
        apiKey: "mc_live_test",
        baseUrl: "https://memcell.ai",
        fetch: mockFetch as unknown as typeof fetch,
      });
      const ops = client.workspace("acme/operations");

      const created = await ops.sources.create({
        type: "webhook",
        name: "Support Helpdesk",
      });
      expect(created.source.type).toBe("webhook");
      expect(created.webhookSecret).toBe("whsrc_secret_abc");

      const pushed = await ops.sources.ingest("src_wh_1", {
        title: "Ticket Playbook",
        content: "# Escalations\nAlways notify Tier 2 within 15 minutes.",
        secret: created.webhookSecret!,
      });
      expect(pushed.ingestedDocuments).toBe(1);
      expect(requests[1]?.headers["x-memcell-webhook-secret"]).toBe(
        "whsrc_secret_abc",
      );

      const synced = await ops.sources.sync("src_url_1", { maxPages: 10 });
      expect(synced.syncedFiles).toBe(4);

      const listed = await ops.sources.list();
      expect(listed.sources).toHaveLength(1);
    });
  });

  describe("Vercel AI SDK, OpenAI Agents & LangGraph adapters", () => {
    function createMockClient() {
      const apiCalls: Array<{ path: string; body: Record<string, unknown> }> =
        [];
      const mockFetch = vi.fn(
        async (url: string | URL | Request, init?: RequestInit) => {
          const u = new URL(String(url));
          const body = init?.body ? JSON.parse(String(init.body)) : {};
          apiCalls.push({ path: u.pathname, body });

          if (u.pathname.endsWith("/recall")) {
            return jsonResponse({
              recallId: "rec_101",
              promptContext:
                "<memcell_context>Escalate SEV1 in 15m</memcell_context>",
              memories: [
                {
                  id: "mem_1",
                  title: "Escalate SEV1 incidents within 15 minutes",
                  type: "instruction",
                  confidence: 0.92,
                },
              ],
            });
          }

          if (u.pathname.endsWith("/remember")) {
            return jsonResponse({
              created: [
                {
                  id: "mem_new_1",
                  title: String(body.title || ""),
                  type: String(body.type || "fact"),
                },
              ],
              evolved: [],
            });
          }

          if (u.pathname.endsWith("/report")) {
            return jsonResponse({
              outcome: body.outcome || "worked",
              attributed: [
                {
                  memoryId: "mem_1",
                  title: "Escalate SEV1 incidents within 15 minutes",
                  from: 0.92,
                  to: 0.95,
                  evidenceId: "ev_1",
                },
              ],
            });
          }

          if (u.pathname.endsWith("/documents")) {
            return jsonResponse({
              chunks: [
                {
                  id: "chk_1",
                  documentId: "doc_1",
                  documentTitle: "SLA Policy",
                  chunkIndex: 0,
                  content: "SEV1 response target is 15 minutes.",
                  score: 0.89,
                },
              ],
            });
          }

          return jsonResponse({});
        },
      );

      const client = new MemCell({
        apiKey: "mc_live_test",
        baseUrl: "https://memcell.ai",
        fetch: mockFetch as unknown as typeof fetch,
      });
      return { client, scoped: client.workspace("acme/support"), apiCalls };
    }

    it("injects recalled promptContext and reports outcome in Vercel AI SDK middleware", async () => {
      const { scoped, apiCalls } = createMockClient();
      const mw = createMemCellMiddleware(scoped, { action: "triage_ticket" });

      const transformed = await mw.transformParams({
        params: {
          prompt: [
            { role: "system", content: "You are a support lead." },
            {
              role: "user",
              content: "Customer reported a production SEV1 outage.",
            },
          ],
        },
      });

      expect(transformed.prompt?.[0]?.content).toContain(
        "You are a support lead.",
      );
      expect(transformed.prompt?.[0]?.content).toContain(
        "Escalate SEV1 in 15m",
      );

      const genResult = await mw.wrapGenerate({
        params: transformed,
        doGenerate: async () => ({
          text: "Paging on-call engineer immediately.",
        }),
      });

      expect(genResult.text).toContain("Paging");
      // Recall ran once (cached across transformParams -> wrapGenerate) and report ran once
      const recallCalls = apiCalls.filter((c) => c.path.endsWith("/recall"));
      const reportCalls = apiCalls.filter((c) => c.path.endsWith("/report"));
      expect(recallCalls).toHaveLength(1);
      expect(reportCalls).toHaveLength(1);
      expect(reportCalls[0]?.body.outcome).toBe("worked");
      expect(reportCalls[0]?.body.recall_id).toBe("rec_101");
    });

    it("reports outcome after Vercel AI SDK stream finishes", async () => {
      const { scoped, apiCalls } = createMockClient();
      const mw = createMemCellMiddleware(scoped, { action: "stream_reply" });

      const sourceStream = new ReadableStream<string>({
        start(controller) {
          controller.enqueue("Hello ");
          controller.enqueue("world");
          controller.close();
        },
      });

      const wrapped = await mw.wrapStream({
        params: {
          prompt: [{ role: "user", content: "Stream support update" }],
        },
        doStream: async () => ({ stream: sourceStream }),
      });

      const reader = wrapped.stream.getReader();
      const chunks: unknown[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(chunks).toEqual(["Hello ", "world"]);
      const reportCalls = apiCalls.filter((c) => c.path.endsWith("/report"));
      expect(reportCalls).toHaveLength(1);
      expect(reportCalls[0]?.body.outcome).toBe("worked");
    });

    it("executes OpenAI Chat & Responses tool calls and closed-loop turn wrapper", async () => {
      const { scoped, apiCalls } = createMockClient();
      const chatTools = createOpenAIMemoryTools(scoped);
      const responsesTools = createOpenAIResponsesTools(scoped);

      expect(chatTools.map((t) => t.function.name)).toEqual([
        "recall_memory",
        "remember_memory",
        "report_outcome",
        "search_documents",
      ]);
      expect(responsesTools.map((t) => t.name)).toContain("remember_memory");

      const execRes = await executeOpenAIMemoryTool(scoped, {
        id: "call_1",
        function: {
          name: "remember_memory",
          arguments: JSON.stringify({
            title: "Enterprise accounts route to #vip-support",
            type: "instruction",
            enforce: true,
          }),
        },
      });
      expect(execRes.toolCallId).toBe("call_1");
      expect(execRes.output).toContain("mem_new_1");

      const turn = await runWithOpenAIMemory(
        scoped,
        {
          action: "handle_vip_request",
          query: "Route VIP support ticket",
          baseInstructions: "Follow workspace SOPs.",
        },
        async (ctx) => {
          expect(ctx.instructions).toContain("Follow workspace SOPs.");
          expect(ctx.instructions).toContain("Escalate SEV1 in 15m");
          return "Routed to #vip-support";
        },
      );
      expect(turn.result).toBe("Routed to #vip-support");
      expect(apiCalls.some((c) => c.path.endsWith("/report"))).toBe(true);
    });

    it("supports LangGraph recallNode, reportNode, wrapNode, and createLangChainTools", async () => {
      const { scoped } = createMockClient();
      const { recallNode, reportNode, wrapNode } = createLangGraphMemoryNodes(
        scoped,
        {
          action: "ops_graph",
        },
      );

      const recalledState = await recallNode({
        messages: [{ role: "user", content: "Check SEV1 escalation SLA" }],
      });
      expect(recalledState.recallId).toBe("rec_101");
      expect(recalledState.memoryContext).toContain("Escalate SEV1 in 15m");

      const reportedState = await reportNode({
        ...recalledState,
        outcome: "worked",
      });
      expect(reportedState.memoryReported).toBe(true);

      const wrappedAgentNode = wrapNode("single_step_node", async (state) => ({
        ...state,
        output: `Handled with ${state.recalledMemories.length} memories`,
      }));
      const singleOut = await wrappedAgentNode({
        task: "Run SLA check",
      } as { task: string; output?: string });
      expect(singleOut.output).toBe("Handled with 1 memories");

      const lcTools = createLangChainTools(scoped);
      const searchTool = lcTools.find((t) => t.name === "search_documents")!;
      const searchJson = await searchTool.invoke({ query: "SEV1 SLA" });
      expect(searchJson).toContain("SEV1 response target is 15 minutes.");
    });

    it("exposes createMemCellTools for direct tool invocation", async () => {
      const { scoped } = createMockClient();
      const tools = createMemCellTools(scoped);
      const res = await tools.recall_memory.execute({ query: "SEV1 outage" });
      expect(res).toMatchObject({ recallId: "rec_101" });
    });
  });
});
