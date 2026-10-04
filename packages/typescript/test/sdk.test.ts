import { describe, expect, it, vi } from "vitest";
import {
  MemCell,
  ScopedMemCell,
  AuthManager,
  MemCellError,
  RateLimitError,
} from "../src/index.js";

describe("MemCell SDK (cli package export)", () => {
  describe("AuthManager", () => {
    it("returns Bearer with API key directly", async () => {
      const auth = new AuthManager(
        { apiKey: "mc_live_123" },
        "https://api.memcell.io",
      );
      const header = await auth.getAuthorizationHeader();
      expect(header).toBe("Bearer mc_live_123");
    });

    it("returns Bearer with accessToken directly", async () => {
      const auth = new AuthManager(
        { accessToken: "jwt_token_abc" },
        "https://api.memcell.io",
      );
      const header = await auth.getAuthorizationHeader();
      expect(header).toBe("Bearer jwt_token_abc");
    });

    it("exchanges client_credentials and caches M2M token", async () => {
      let callCount = 0;
      const mockFetch = vi.fn(
        async (url: string | URL | Request, init?: RequestInit) => {
          if (String(url).endsWith("/oauth2/token")) {
            callCount++;
            const body = String(init?.body);
            expect(body).toContain("grant_type=client_credentials");
            expect(body).toContain("client_id=client_xyz");
            expect(body).toContain("client_secret=secret_xyz");
            expect(body).toContain("scope=memory%3Aread");
            return new Response(
              JSON.stringify({
                access_token: "m2m_token_001",
                token_type: "Bearer",
                expires_in: 3600,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response("Not Found", { status: 404 });
        },
      );

      const auth = new AuthManager(
        {
          clientId: "client_xyz",
          clientSecret: "secret_xyz",
          scope: "memory:read",
        },
        "https://api.memcell.io",
        mockFetch as any,
      );

      const header1 = await auth.getAuthorizationHeader();
      expect(header1).toBe("Bearer m2m_token_001");
      expect(callCount).toBe(1);

      const header2 = await auth.getAuthorizationHeader();
      expect(header2).toBe("Bearer m2m_token_001");
      expect(callCount).toBe(1);

      auth.clearCache();
      const header3 = await auth.getAuthorizationHeader();
      expect(header3).toBe("Bearer m2m_token_001");
      expect(callCount).toBe(2);
    });

    it("refreshes M2M token proactively when within 60s pre-expiry window", async () => {
      let tokenIndex = 1;
      const mockFetch = vi.fn(async () => {
        const token = `m2m_token_00${tokenIndex++}`;
        return new Response(
          JSON.stringify({
            access_token: token,
            token_type: "Bearer",
            expires_in: 50,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const auth = new AuthManager(
        { clientId: "cid", clientSecret: "csec" },
        "https://api.memcell.io",
        mockFetch as any,
      );

      const header1 = await auth.getAuthorizationHeader();
      expect(header1).toBe("Bearer m2m_token_001");

      const header2 = await auth.getAuthorizationHeader();
      expect(header2).toBe("Bearer m2m_token_002");
    });
  });

  describe("MemCell Client", () => {
    it("handles baseUrl and endpoint routing for scoped and unscoped namespaces", async () => {
      const requests: Array<{ url: string; body: any }> = [];

      const mockFetch = vi.fn(
        async (url: string | URL | Request, init?: RequestInit) => {
          requests.push({
            url: String(url),
            body: init?.body ? JSON.parse(String(init.body)) : null,
          });

          return new Response(
            JSON.stringify({
              recallId: "rec_123",
              promptContext: "<memcell>Context</memcell>",
              statements: [
                {
                  id: "st_1",
                  title: "Never skip verification",
                  kind: "invariant",
                  confidence: 0.95,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
      );

      const memcell = new MemCell({
        auth: { apiKey: "key_1" },
        baseUrl: "https://custom.memcell.io///",
        fetch: mockFetch as any,
      });

      expect(memcell.baseUrl).toBe("https://custom.memcell.io");

      const res1 = await memcell.recall({
        namespace: "org/repo",
        query: "deploy procedure",
        kind: ["invariant", "reflex"],
        minConfidence: 0.8,
      });

      expect(res1.recallId).toBe("rec_123");
      expect(res1.statements).toHaveLength(1);
      expect(requests[0]?.url).toBe(
        "https://custom.memcell.io/api/v1/org/repo/recall",
      );
      expect(requests[0]?.body.intent).toBe("deploy procedure");
    });

    it("ScopedMemCell & wrapExecution lifecycle", async () => {
      const calls: string[] = [];
      let reportedPayload: any;

      const mockFetch = vi.fn(
        async (url: string | URL | Request, init?: RequestInit) => {
          const u = String(url);
          if (u.endsWith("/recall")) {
            calls.push("recall");
            return new Response(
              JSON.stringify({
                recallId: "rec_run_42",
                promptContext: "<memcell>Guards loaded</memcell>",
                statements: [
                  {
                    id: "st_1",
                    title: "Validate env before deploy",
                    kind: "invariant",
                    isInvariant: true,
                  },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          if (u.endsWith("/report")) {
            calls.push("report");
            reportedPayload = JSON.parse(String(init?.body));
            return new Response(
              JSON.stringify({
                outcome: "worked",
                attributed: [
                  {
                    statementId: "st_1",
                    title: "Validate env",
                    from: 0.8,
                    to: 0.85,
                  },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response("Not found", { status: 404 });
        },
      );

      const memcell = new MemCell({
        auth: { apiKey: "k" },
        fetch: mockFetch as any,
      });
      const devops = memcell.scope("acme/devops", { subject: "pipeline" });

      const execResult = await devops.wrapExecution(
        {
          action: "deploy_service",
          externalRef: "deploy_job_101",
        },
        async (ctx) => {
          calls.push("action");
          expect(ctx.recallId).toBe("rec_run_42");
          return { status: "ok" };
        },
      );

      expect(calls).toEqual(["recall", "action", "report"]);
      expect(execResult.result).toEqual({ status: "ok" });
      expect(reportedPayload.action_taken).toBe("deploy_service");
      expect(reportedPayload.outcome).toBe("worked");
    });

    it("handles async remember and waitForJob telemetry tracking", async () => {
      const progressUpdates: any[] = [];
      const mockFetch = vi.fn(
        async (url: string | URL | Request, init?: RequestInit) => {
          const u = String(url);
          if (u.endsWith("/remember")) {
            const body = JSON.parse(String(init?.body));
            expect(body.async).toBe(true);
            return new Response(
              JSON.stringify({
                accepted: true,
                jobId: "job_async_99",
                status: "queued",
              }),
              { status: 202, headers: { "Content-Type": "application/json" } },
            );
          }
          if (u.endsWith("/jobs/job_async_99/stream")) {
            const stream = new ReadableStream({
              start(controller) {
                const encoder = new TextEncoder();
                controller.enqueue(
                  encoder.encode(
                    'data: {"step":"distilling","progress":25,"message":"Distilling facts..."}\n\n',
                  ),
                );
                controller.enqueue(
                  encoder.encode(
                    'data: {"step":"reconciling","progress":75,"message":"Checking contradictions..."}\n\n',
                  ),
                );
                controller.enqueue(
                  encoder.encode(
                    'data: {"step":"completed","progress":100,"message":"Done."}\n\n',
                  ),
                );
                controller.close();
              },
            });
            return new Response(stream, {
              status: 200,
              headers: { "Content-Type": "text/event-stream" },
            });
          }
          return new Response("Not found", { status: 404 });
        },
      );

      const memcell = new MemCell({
        auth: { apiKey: "k" },
        fetch: mockFetch as any,
      });
      const devops = memcell.scope("acme/devops");

      const res = await devops.remember({
        raw: "Document text to distill into atomic invariants",
        async: true,
      } as any);

      expect(res.accepted).toBe(true);
      expect(res.jobId).toBe("job_async_99");

      const finalEvent = await devops.waitForJob(res.jobId!, {
        onProgress: (evt) => {
          progressUpdates.push(evt);
        },
      });

      expect(finalEvent.step).toBe("completed");
      expect(finalEvent.progress).toBe(100);
      expect(progressUpdates.length).toBe(3);
      expect(progressUpdates[0].step).toBe("distilling");
      expect(progressUpdates[1].step).toBe("reconciling");
      expect(progressUpdates[2].step).toBe("completed");
    });

    it("manages organizations via memory.organizations and forOrganization", async () => {
      const requests: Array<{ url: string; method?: string; body: any }> = [];

      const mockFetch = vi.fn(
        async (url: string | URL | Request, init?: RequestInit) => {
          const urlStr = String(url);
          requests.push({
            url: urlStr,
            method: init?.method,
            body: init?.body ? JSON.parse(String(init.body)) : null,
          });

          if (
            urlStr.endsWith("/api/v1/organizations") &&
            init?.method === "GET"
          ) {
            return new Response(
              JSON.stringify({
                ok: true,
                organizations: [
                  {
                    id: "o1",
                    slug: "acme-corp",
                    name: "Acme Corporation",
                    role: "owner",
                  },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          if (
            urlStr.endsWith("/api/v1/organizations") &&
            init?.method === "POST"
          ) {
            return new Response(
              JSON.stringify({
                ok: true,
                organization: {
                  id: "o2",
                  slug: "robotics",
                  name: "Robotics AI Lab",
                  role: "owner",
                },
              }),
              { status: 201, headers: { "Content-Type": "application/json" } },
            );
          }

          if (urlStr.endsWith("/api/v1/organizations/acme-corp")) {
            return new Response(
              JSON.stringify({
                ok: true,
                organization: {
                  id: "o1",
                  slug: "acme-corp",
                  name: "Acme Corporation",
                  role: "owner",
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          if (urlStr.endsWith("/api/v1/acme-corp/backend/recall")) {
            return new Response(
              JSON.stringify({
                recallId: "rec_123",
                promptContext: "<xml></xml>",
                statements: [],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          return new Response("Not found", { status: 404 });
        },
      );

      const memcell = new MemCell({
        auth: { apiKey: "k" },
        fetch: mockFetch as any,
      });

      // List
      const orgs = await memcell.organizations.list();
      expect(orgs).toHaveLength(1);
      expect(orgs[0]?.slug).toBe("acme-corp");

      // Create
      const created = await memcell.organizations.create({
        name: "Robotics AI Lab",
        slug: "robotics",
      });
      expect(created.slug).toBe("robotics");

      // Get
      const fetched = await memcell.organizations.get("acme-corp");
      expect(fetched.name).toBe("Acme Corporation");

      // forOrganization
      const acmeOrg = memcell.forOrganization("acme-corp");
      expect(acmeOrg.orgSlug).toBe("acme-corp");

      const scopedBackend = acmeOrg.scope("backend");
      expect(scopedBackend.namespace).toBe("acme-corp/backend");

      const recallRes = await acmeOrg.recall({
        namespace: "backend",
        query: "authentication flow",
      });
      expect(recallRes.recallId).toBe("rec_123");
      expect(
        requests.some((r) =>
          r.url.endsWith("/api/v1/acme-corp/backend/recall"),
        ),
      ).toBe(true);
    });

    it("intercepts RateLimit-Warning header and invokes onRateLimitWarning callback", async () => {
      const warningHandler = vi.fn();
      const mockFetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({ recallId: "rec_warning", statements: [] }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "RateLimit-Warning":
                '299 - "Approaching rate limit capacity (85% consumed in active window)"',
            },
          },
        );
      });

      const memcell = new MemCell({
        auth: { apiKey: "mc_live_test" },
        fetch: mockFetch as any,
        onRateLimitWarning: warningHandler,
      });

      const res = await memcell.recall({ query: "test warning" });
      expect(res.recallId).toBe("rec_warning");
      expect(warningHandler).toHaveBeenCalledWith(
        expect.stringContaining("Approaching rate limit capacity"),
        expect.anything(),
      );
    });

    it("automatically retries on HTTP 429 using Retry-After backoff", async () => {
      let attempts = 0;
      const mockFetch = vi.fn(async () => {
        attempts++;
        if (attempts === 1) {
          return new Response(
            JSON.stringify({ error: "rate_limited", message: "Retry later" }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "0",
              },
            },
          );
        }
        return new Response(
          JSON.stringify({ recallId: "rec_recovered", statements: [] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      });

      const memcell = new MemCell({
        auth: { apiKey: "mc_live_test" },
        fetch: mockFetch as any,
        maxRetries: 2,
      });

      const res = await memcell.recall({ query: "test retry" });
      expect(attempts).toBe(2);
      expect(res.recallId).toBe("rec_recovered");
    });

    it("throws typed RateLimitError with door and retryAfter when 429 retries are exhausted", async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: "rate_limited",
            message:
              "Rate limit exceeded on door 'remember'. Please retry in 15s.",
            door: "remember",
            limit: 60,
            windowSeconds: 60,
            retryAfter: 15,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "0",
            },
          },
        );
      });

      const memcell = new MemCell({
        auth: { apiKey: "mc_live_test" },
        fetch: mockFetch as any,
        maxRetries: 1,
      });

      let caughtError: unknown = null;
      try {
        await memcell.remember({ title: "Exhaust retries" });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(RateLimitError);
      expect(caughtError).toBeInstanceOf(MemCellError);
      const rlError = caughtError as RateLimitError;
      expect(rlError.door).toBe("remember");
      expect(rlError.limit).toBe(60);
      expect(rlError.windowSeconds).toBe(60);
      expect(rlError.retryAfter).toBe(15);
      expect(rlError.status).toBe(429);
      expect(rlError.message).toContain(
        "Rate limit exceeded on door 'remember'",
      );
    });

    it("throws typed MemCellError on non-429 API errors", async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: "unauthorized",
            message: "Invalid API key provided",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      });

      const memcell = new MemCell({
        auth: { apiKey: "bad_key" },
        fetch: mockFetch as any,
      });

      let caughtError: unknown = null;
      try {
        await memcell.recall({ query: "failing request" });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(MemCellError);
      expect(caughtError).not.toBeInstanceOf(RateLimitError);
      const memError = caughtError as MemCellError;
      expect(memError.status).toBe(401);
      expect(memError.code).toBe("unauthorized");
      expect(memError.message).toContain("Invalid API key provided");
    });

    it("initializes with direct apiKey and baseUrl without auth wrapper", async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({ recallId: "r1", promptContext: "", statements: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const memcell = new MemCell({
        apiKey: "mc_direct_123",
        fetch: mockFetch as any,
      });

      await memcell.recall({ query: "test" });
      const authHeader = await memcell.authManager.getAuthorizationHeader();
      expect(authHeader).toBe("Bearer mc_direct_123");
    });

    describe("Statements Resource", () => {
      it("lists statements with pagination and filters", async () => {
        const mockFetch = vi.fn(async (url: string | URL | Request) => {
          const u = String(url);
          expect(u).toContain("/api/v1/acme/backend/statements?");
          expect(u).toContain("page=2");
          expect(u).toContain("per_page=15");
          expect(u).toContain("type=directive");
          return new Response(
            JSON.stringify({
              statements: [
                {
                  id: "stmt_1",
                  title: "Direct connection pool setup",
                  type: "directive",
                  status: "active",
                },
              ],
              pagination: { page: 2, perPage: 15, total: 25, hasMore: false },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        });

        const memcell = new MemCell({
          apiKey: "mc_key",
          fetch: mockFetch as any,
        });
        const res = await memcell.statements.list("acme/backend", {
          page: 2,
          perPage: 15,
          type: "directive",
        });

        expect(res.items).toHaveLength(1);
        expect(res.items[0]!.id).toBe("stmt_1");
        expect(res.pagination.total).toBe(25);
      });

      it("creates, retrieves, updates, and deletes statements", async () => {
        const recorded: Array<{ method: string; url: string; body?: unknown }> =
          [];
        const mockFetch = vi.fn(
          async (url: string | URL | Request, init?: RequestInit) => {
            const method = init?.method || "GET";
            const body = init?.body ? JSON.parse(String(init.body)) : undefined;
            recorded.push({ method, url: String(url), body });

            if (method === "POST" && String(url).endsWith("/statements")) {
              return new Response(
                JSON.stringify({
                  statement: {
                    id: "stmt_new",
                    title: body.title,
                    type: body.type,
                  },
                }),
                {
                  status: 201,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (
              method === "GET" &&
              String(url).endsWith("/statements/stmt_new")
            ) {
              return new Response(
                JSON.stringify({
                  statement: {
                    id: "stmt_new",
                    title: "Existing",
                    type: "directive",
                  },
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (
              method === "PATCH" &&
              String(url).endsWith("/statements/stmt_new")
            ) {
              return new Response(
                JSON.stringify({
                  statement: {
                    id: "stmt_new",
                    title: body.title,
                    type: "directive",
                  },
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (method === "DELETE" && String(url).includes("/stmt_new")) {
              return new Response(
                JSON.stringify({ ok: true, statementId: "stmt_new" }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            return new Response("Not Found", { status: 404 });
          },
        );

        const memcell = new MemCell({
          apiKey: "mc_key",
          fetch: mockFetch as any,
        });
        const created = await memcell.statements.create("acme/backend", {
          title: "Statement A",
          type: "directive",
        });
        expect(created.id).toBe("stmt_new");

        const fetched = await memcell.statements.get(
          "acme/backend",
          "stmt_new",
        );
        expect(fetched.title).toBe("Existing");

        const updated = await memcell.statements.update(
          "acme/backend",
          "stmt_new",
          {
            title: "Updated Title",
          },
        );
        expect(updated.title).toBe("Updated Title");

        await memcell.statements.delete("acme/backend", "stmt_new");
        const deleteCall = recorded.find((r) => r.method === "DELETE");
        expect(deleteCall).toBeDefined();
        expect(deleteCall!.url).toBe(
          "https://api.memcell.io/api/v1/acme/backend/statements/stmt_new",
        );

        await memcell.memories.delete("acme/backend", "stmt_new", {
          allVersions: true,
        });
        const deleteAllCall = recorded.find(
          (r) => r.method === "DELETE" && r.url.includes("allVersions=true"),
        );
        expect(deleteAllCall).toBeDefined();
        expect(deleteAllCall!.url).toBe(
          "https://api.memcell.io/api/v1/acme/backend/memories/stmt_new?allVersions=true",
        );
      });

      it("handles stars, history, adopt, and promote", async () => {
        const mockFetch = vi.fn(
          async (url: string | URL | Request, init?: RequestInit) => {
            const u = String(url);
            const method = init?.method || "GET";

            if (u.endsWith("/star") && method === "PUT") {
              return new Response(
                JSON.stringify({
                  rootId: "root_1",
                  starred: true,
                  starCount: 1,
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (u.endsWith("/history")) {
              return new Response(
                JSON.stringify({
                  rootId: "root_1",
                  totalVersions: 2,
                  history: [
                    {
                      id: "stmt_v2",
                      rootId: "root_1",
                      version: 2,
                      title: "V2",
                    },
                    {
                      id: "stmt_v1",
                      rootId: "root_1",
                      version: 1,
                      title: "V1",
                    },
                  ],
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (u.endsWith("/adopt") && method === "POST") {
              return new Response(
                JSON.stringify({
                  ok: true,
                  sourceStatementId: "stmt_1",
                  adopted: [
                    {
                      projectId: "p2",
                      statementId: "stmt_2",
                      alreadyExisted: false,
                    },
                  ],
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (u.endsWith("/promote") && method === "POST") {
              return new Response(
                JSON.stringify({
                  promoted: true,
                  statement: {
                    id: "stmt_1",
                    title: "Promoted",
                    status: "active",
                  },
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            return new Response("Not Found", { status: 404 });
          },
        );

        const memcell = new MemCell({
          apiKey: "mc_key",
          fetch: mockFetch as any,
        });
        const starRes = await memcell.statements.star(
          "acme/backend",
          "stmt_1",
          true,
        );
        expect(starRes.starred).toBe(true);

        const historyRes = await memcell.statements.history(
          "acme/backend",
          "stmt_1",
        );
        expect(historyRes.history).toHaveLength(2);

        const adoptRes = await memcell.statements.adopt(
          "acme/backend",
          "stmt_1",
          {
            targetProjectIds: ["p2"],
          },
        );
        expect(adoptRes.adopted[0]!.statementId).toBe("stmt_2");

        const promoteRes = await memcell.statements.promote(
          "acme/backend",
          "stmt_1",
          {
            toScope: "common",
          },
        );
        expect(promoteRes.promoted).toBe(true);
      });
    });

    describe("Projects Resource", () => {
      it("lists caller projects and owner projects with pagination", async () => {
        const mockFetch = vi.fn(async (url: string | URL | Request) => {
          const u = String(url);
          if (u.includes("/api/v1/projects?")) {
            return new Response(
              JSON.stringify({
                projects: [
                  {
                    id: "p1",
                    name: "Core",
                    slug: "core",
                    visibility: "public",
                  },
                ],
                pagination: { page: 1, perPage: 30, total: 1, hasMore: false },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          if (u.includes("/api/v1/acme/projects?")) {
            return new Response(
              JSON.stringify({
                owner: "acme",
                projects: [
                  {
                    id: "p2",
                    name: "Backend",
                    slug: "backend",
                    visibility: "private",
                  },
                ],
                pagination: { page: 1, perPage: 10, total: 1, hasMore: false },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response("Not Found", { status: 404 });
        });

        const memcell = new MemCell({
          apiKey: "mc_key",
          fetch: mockFetch as any,
        });
        const callerProjects = await memcell.projects.list({
          page: 1,
          perPage: 30,
        });
        expect(callerProjects.items[0]!.slug).toBe("core");

        const ownerProjects = await memcell.projects.listForOwner("acme", {
          page: 1,
          perPage: 10,
        });
        expect(ownerProjects.items[0]!.slug).toBe("backend");
      });

      it("creates, gets, updates, deletes, and transfers projects", async () => {
        const mockFetch = vi.fn(
          async (url: string | URL | Request, init?: RequestInit) => {
            const u = String(url);
            const method = init?.method || "GET";

            if (u.endsWith("/api/v1/projects") && method === "POST") {
              return new Response(
                JSON.stringify({
                  ok: true,
                  project: {
                    id: "p_new",
                    name: "New Project",
                    slug: "new-project",
                    visibility: "private",
                  },
                }),
                {
                  status: 201,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (u.endsWith("/api/v1/acme/backend") && method === "GET") {
              return new Response(
                JSON.stringify({
                  project: {
                    id: "p1",
                    name: "Backend",
                    slug: "backend",
                    visibility: "private",
                  },
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (u.endsWith("/api/v1/acme/backend") && method === "PATCH") {
              return new Response(
                JSON.stringify({
                  project: {
                    id: "p1",
                    name: "Backend V2",
                    slug: "backend",
                    visibility: "public",
                  },
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (u.endsWith("/api/v1/acme/backend") && method === "DELETE") {
              return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
            if (
              u.endsWith("/api/v1/acme/backend/transfer") &&
              method === "POST"
            ) {
              return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
            return new Response("Not Found", { status: 404 });
          },
        );

        const memcell = new MemCell({
          apiKey: "mc_key",
          fetch: mockFetch as any,
        });
        const created = await memcell.projects.create({ name: "New Project" });
        expect(created.id).toBe("p_new");

        const got = await memcell.projects.get("acme/backend");
        expect(got.name).toBe("Backend");

        const updated = await memcell.projects.update("acme/backend", {
          name: "Backend V2",
        });
        expect(updated.name).toBe("Backend V2");

        await memcell.projects.delete("acme/backend");
        await memcell.projects.transfer("acme/backend", {
          targetOwner: "new-owner",
        });
      });
    });

    describe("Agents Resource", () => {
      it("lists, creates, updates, and manages agent keys", async () => {
        const mockFetch = vi.fn(
          async (url: string | URL | Request, init?: RequestInit) => {
            const u = String(url);
            const method = init?.method || "GET";

            if (
              u.includes("/api/v1/acme/backend/agents") &&
              !u.includes("/keys") &&
              method === "GET"
            ) {
              return new Response(
                JSON.stringify({
                  agents: [
                    {
                      id: "ag_1",
                      name: "Agent Alpha",
                      slug: "agent-alpha",
                      status: "active",
                    },
                  ],
                  pagination: {
                    page: 1,
                    perPage: 30,
                    total: 1,
                    hasMore: false,
                  },
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (
              u.endsWith("/api/v1/acme/backend/agents") &&
              method === "POST"
            ) {
              return new Response(
                JSON.stringify({
                  agent: {
                    id: "ag_2",
                    name: "Agent Beta",
                    slug: "agent-beta",
                    status: "active",
                  },
                }),
                {
                  status: 201,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (
              u.endsWith("/api/v1/acme/backend/agents/ag_1/keys") &&
              method === "POST"
            ) {
              return new Response(
                JSON.stringify({
                  ok: true,
                  key: {
                    id: "k_1",
                    key: "mc_ag_secret",
                    preview: "mc_ag_123...",
                  },
                }),
                {
                  status: 201,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (
              u.endsWith("/api/v1/acme/backend/agents/ag_1/keys/k_1") &&
              method === "DELETE"
            ) {
              return new Response(JSON.stringify({ revoked: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
            return new Response("Not Found", { status: 404 });
          },
        );

        const memcell = new MemCell({
          apiKey: "mc_key",
          fetch: mockFetch as any,
        });
        const list = await memcell.agents.list("acme/backend");
        expect(list.items).toHaveLength(1);

        const created = await memcell.agents.create("acme/backend", {
          name: "Agent Beta",
        });
        expect(created.id).toBe("ag_2");

        const key = await memcell.agents.createKey("acme/backend", "ag_1");
        expect(key.key).toBe("mc_ag_secret");

        await memcell.agents.revokeKey("acme/backend", "ag_1", "k_1");
      });
    });

    describe("Collaborators Resource", () => {
      it("lists, invites, updates role, and removes collaborators", async () => {
        const mockFetch = vi.fn(
          async (url: string | URL | Request, init?: RequestInit) => {
            const u = String(url);
            const method = init?.method || "GET";

            if (
              u.includes("/api/v1/acme/backend/collaborators") &&
              method === "GET"
            ) {
              return new Response(
                JSON.stringify({
                  collaborators: [
                    {
                      id: "c1",
                      userId: "u1",
                      name: "Alice",
                      role: "write",
                      source: "direct",
                      inherited: false,
                    },
                  ],
                  pendingInvitations: [],
                  pagination: {
                    page: 1,
                    perPage: 30,
                    total: 1,
                    hasMore: false,
                  },
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (
              u.endsWith("/api/v1/acme/backend/collaborators") &&
              method === "POST"
            ) {
              return new Response(
                JSON.stringify({
                  ok: true,
                  invitation: {
                    id: "inv_1",
                    email: "bob@acme.com",
                    role: "read",
                  },
                }),
                {
                  status: 201,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (
              u.endsWith("/api/v1/acme/backend/collaborators/u1") &&
              method === "PATCH"
            ) {
              return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
            if (
              u.endsWith("/api/v1/acme/backend/collaborators/u1") &&
              method === "DELETE"
            ) {
              return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
            return new Response("Not Found", { status: 404 });
          },
        );

        const memcell = new MemCell({
          apiKey: "mc_key",
          fetch: mockFetch as any,
        });
        const list = await memcell.collaborators.list("acme/backend");
        expect(list.collaborators).toHaveLength(1);

        const invite = await memcell.collaborators.invite("acme/backend", {
          identifier: "bob@acme.com",
          role: "read",
        });
        expect(invite.id).toBe("inv_1");

        await memcell.collaborators.updateRole("acme/backend", "u1", "admin");
        await memcell.collaborators.remove("acme/backend", "u1");
      });
    });

    describe("Organizations Expanded Resource", () => {
      it("manages members and invitations", async () => {
        const mockFetch = vi.fn(
          async (url: string | URL | Request, init?: RequestInit) => {
            const u = String(url);
            const method = init?.method || "GET";

            if (
              u.includes("/api/v1/organizations/acme/members") &&
              method === "GET"
            ) {
              return new Response(
                JSON.stringify({
                  ok: true,
                  members: [
                    { id: "m1", userId: "u1", name: "Alice", role: "owner" },
                  ],
                  pagination: {
                    page: 1,
                    perPage: 30,
                    total: 1,
                    hasMore: false,
                  },
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (
              u.endsWith("/api/v1/organizations/acme/invitations") &&
              method === "GET"
            ) {
              return new Response(
                JSON.stringify({
                  ok: true,
                  invitations: [
                    { id: "inv_1", email: "charlie@acme.com", role: "member" },
                  ],
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            return new Response("Not Found", { status: 404 });
          },
        );

        const memcell = new MemCell({
          apiKey: "mc_key",
          fetch: mockFetch as any,
        });
        const members = await memcell.organizations.listMembers("acme");
        expect(members.items).toHaveLength(1);

        const invitations = await memcell.organizations.listInvitations("acme");
        expect(invitations).toHaveLength(1);
      });
    });

    describe("Usage Resource", () => {
      it("retrieves usage with canonical statement type quotas", async () => {
        const mockFetch = vi.fn(async (url: string | URL | Request) => {
          expect(String(url)).toContain("/api/v1/acme/usage?timeframe=30d");
          return new Response(
            JSON.stringify({
              owner: { type: "org", slug: "acme", name: "Acme Corp" },
              timeframe: "30d",
              quotas: {
                statements: {
                  total: 100,
                  limit: 1000,
                  percent: 10,
                  types: {
                    directive: 40,
                    fact: 30,
                    preference: 20,
                    observation: 10,
                    provisional: 5,
                  },
                },
                apiRequests: {
                  total: 500,
                  limit: 10000,
                  percent: 5,
                  windowDays: 30,
                },
              },
              rateLimits: {
                tier: "pro",
                recallRpm: 600,
                rememberRpm: 300,
                defaultRpm: 300,
                concurrentLimit: 20,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        });

        const memcell = new MemCell({
          apiKey: "mc_key",
          fetch: mockFetch as any,
        });
        const usage = await memcell.usage.get("acme", { timeframe: "30d" });
        expect(usage.quotas.statements.types.directive).toBe(40);
        expect(usage.quotas.statements.types.fact).toBe(30);
      });
    });

    describe("Account Resource", () => {
      it("retrieves profile, updates profile, and manages personal tokens", async () => {
        const mockFetch = vi.fn(
          async (url: string | URL | Request, init?: RequestInit) => {
            const u = String(url);
            const method = init?.method || "GET";

            if (u.endsWith("/api/v1/account/profile") && method === "GET") {
              return new Response(
                JSON.stringify({
                  profile: {
                    id: "u1",
                    email: "user@test.com",
                    name: "User One",
                    role: "member",
                  },
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (u.endsWith("/api/v1/account/tokens") && method === "GET") {
              return new Response(
                JSON.stringify({
                  tokens: [
                    {
                      id: "tok_1",
                      name: "CLI Token",
                      preview: "mc_pat_123...",
                    },
                  ],
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (u.endsWith("/api/v1/account/tokens") && method === "POST") {
              return new Response(
                JSON.stringify({
                  success: true,
                  token: {
                    id: "tok_2",
                    name: "New Token",
                    token: "mc_pat_secret",
                    preview: "mc_pat_456...",
                  },
                }),
                {
                  status: 201,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (
              u.endsWith("/api/v1/account/tokens/tok_1") &&
              method === "DELETE"
            ) {
              return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
            return new Response("Not Found", { status: 404 });
          },
        );

        const memcell = new MemCell({
          apiKey: "mc_key",
          fetch: mockFetch as any,
        });
        const profile = await memcell.account.get();
        expect(profile.email).toBe("user@test.com");

        const tokens = await memcell.account.tokens.list();
        expect(tokens).toHaveLength(1);

        const created = await memcell.account.tokens.create({
          name: "New Token",
        });
        expect(created.token).toBe("mc_pat_secret");

        await memcell.account.tokens.revoke("tok_1");
      });
    });

    describe("ScopedMemCell Bound Namespaces", () => {
      it("invokes statements, agents, collaborators, and scopes with bound namespace", async () => {
        const calls: string[] = [];
        const mockFetch = vi.fn(async (url: string | URL | Request) => {
          const u = String(url);
          calls.push(u);

          if (u.includes("/statements")) {
            return new Response(
              JSON.stringify({
                statements: [],
                pagination: { page: 1, perPage: 30, total: 0, hasMore: false },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          if (u.includes("/agents")) {
            return new Response(
              JSON.stringify({
                agents: [],
                pagination: { page: 1, perPage: 30, total: 0, hasMore: false },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          if (u.includes("/collaborators")) {
            return new Response(
              JSON.stringify({
                collaborators: [],
                pendingInvitations: [],
                pagination: { page: 1, perPage: 30, total: 0, hasMore: false },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          if (u.includes("/scopes")) {
            return new Response(
              JSON.stringify({ scopes: [{ name: "common", count: 5 }] }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response("Not Found", { status: 404 });
        });

        const memcell = new MemCell({
          apiKey: "mc_key",
          fetch: mockFetch as any,
        });
        const scoped = memcell.scope("acme/backend");

        await scoped.statements.list();
        await scoped.agents.list();
        await scoped.collaborators.list();
        const scopes = await scoped.scopes.list();

        expect(scopes[0]!.name).toBe("common");
        expect(calls.every((c) => c.includes("/acme/backend/"))).toBe(true);
      });
    });
  });
});
