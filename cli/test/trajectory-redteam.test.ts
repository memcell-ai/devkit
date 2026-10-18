import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { adapterFor } from "../src/adapters/index.js";
import { can, type Guard } from "../src/adapters/surface.js";
import { saveAgentKey } from "../src/keyring.js";
import { runMoment } from "../src/loop/hook.js";
import { evaluatePreAct, stageMemoriesFromRecall } from "../src/loop/pre-act.js";
import { projectLogFile, sessionCacheFor } from "../src/loop/session.js";
import { saveWorkspace } from "../src/workspace.js";

function mockStdin(payload: Record<string, unknown>): void {
  const stream = Readable.from([JSON.stringify(payload)]) as Readable & { isTTY?: boolean };
  stream.isTTY = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.spyOn(process, "stdin", "get").mockReturnValue(stream as any);
}

describe("Practical Trajectory Replay, Behavioral Invariants & Red-Team Chaos Suite", () => {
  let tmpRoot: string;
  let homeDir: string;
  let workspaceDir: string;
  const originalHome = process.env.HOME;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "memcell-trajectory-"));
    homeDir = join(tmpRoot, "home");
    workspaceDir = join(tmpRoot, "workspace");
    await mkdir(homeDir, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });
    process.env.HOME = homeDir;

    await saveWorkspace(
      {
        instance: "http://memcell.test",
        owner: "acme",
        workspace: "ops-engine",
        workspaceId: "ws-ops-1",
        space: "ops-engine",
      },
      workspaceDir,
    );

    await saveAgentKey({
      instance: "http://memcell.test",
      keyId: "key-1",
      key: "mc_live_redteam_key",
      project: workspaceDir,
      projectPath: workspaceDir,
      projectId: "ws-ops-1",
      projectSlug: "ops-engine",
      ownerSlug: "acme",
      space: "ops-engine",
      agentId: "ag-test",
    });
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    await rm(tmpRoot, { recursive: true, force: true });
  });

  describe("1. Multi-Turn Trajectory Replay & Behavioral Invariants", () => {
    it("replays a full 2-turn Antigravity trajectory enforcing single-recall per turn, read-only silence, zero context echo, and continuation rollup", async () => {
      const transcriptPath = join(tmpRoot, "agy-transcript.jsonl");
      const sessionId = "agy-session-101";
      const apiCalls: { url: string; body: Record<string, unknown> }[] = [];

      globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        apiCalls.push({ url, body });

        if (url.endsWith("/api/v1/recall")) {
          return new Response(
            JSON.stringify({
              memories: [
                {
                  memoryId: "mem-guard-prod",
                  title: "Never modify production billing config directly",
                  context: "All billing config updates must go through staged migrations.",
                  type: "guard",
                  resources: ["config/billing-prod.json"],
                  confidence: 0.96,
                  layer: "project",
                },
                {
                  memoryId: "mem-conv-1",
                  title: "Always include structured audit fields in billing handlers",
                  type: "instruction",
                  confidence: 0.91,
                  layer: "project",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        if (url.endsWith("/api/v1/remember")) {
          return new Response(JSON.stringify({ accepted: true, note: "queued" }), {
            status: 202,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response("{}", { status: 200 });
      }) as typeof fetch;

      // Step 1: Turn 1 User Input written to transcript + SessionStart fires -> recalls once for Turn 1
      const turn1UserLine = `${JSON.stringify({
        step_index: 1,
        type: "USER_INPUT",
        content: "Update the invoice webhook handler in src/billing/webhook.ts to log retries",
      })}\n`;
      await writeFile(transcriptPath, turn1UserLine, "utf8");

      mockStdin({
        session_id: sessionId,
        cwd: workspaceDir,
        transcript_path: transcriptPath,
      });
      const startRes = await runMoment("session-start", "antigravity");
      expect(startRes.context).toContain("OPERATIONAL GUARDS & INVARIANTS");
      expect(startRes.context).toContain("Never modify production billing config directly");
      expect(apiCalls.filter((c) => c.url.endsWith("/api/v1/recall"))).toHaveLength(1);

      // Verify Antigravity adapter wraps context in injectSteps JSON
      const spokenStart = adapterFor("antigravity")!.speak(
        "session-start",
        startRes.context ?? null,
        startRes.heard,
      );
      expect(JSON.parse(spokenStart!)).toEqual({
        injectSteps: [{ systemMessage: { systemMessage: startRes.context } }],
      });

      // Step 2: PreInvocation #1 fires immediately after SessionStart for the same Turn 1 prompt -> deduplicated!
      mockStdin({
        session_id: sessionId,
        cwd: workspaceDir,
        transcript_path: transcriptPath,
      });
      const preInv1 = await runMoment("prompt-submit", "antigravity");
      expect(preInv1.context).toBeUndefined();
      expect(apiCalls.filter((c) => c.url.endsWith("/api/v1/recall"))).toHaveLength(1);

      // Step 3: PreToolUse on a read-only tool (view_file) -> passes silently with 0 API calls
      mockStdin({
        session_id: sessionId,
        cwd: workspaceDir,
        transcript_path: transcriptPath,
        toolCall: {
          name: "view_file",
          args: { AbsolutePath: join(workspaceDir, "src/billing/webhook.ts") },
        },
      });
      const preToolRead = await runMoment("before-act", "antigravity");
      expect(preToolRead.refuse).toBeUndefined();
      expect(preToolRead.context).toBeUndefined();

      // Step 4: PreInvocation #2 fires mid-turn after tool execution with same user prompt -> MUST NOT re-recall!
      mockStdin({
        session_id: sessionId,
        cwd: workspaceDir,
        transcript_path: transcriptPath,
      });
      const preInv2 = await runMoment("prompt-submit", "antigravity");
      expect(preInv2.context).toBeUndefined();
      expect(apiCalls.filter((c) => c.url.endsWith("/api/v1/recall"))).toHaveLength(1);

      // Step 5: Assistant finishes Turn 1 (including an echoed <memcell_context> block and tool calls) + Stop fires
      const turn1AssistantLine = `${JSON.stringify({
        step_index: 2,
        type: "PLANNER_RESPONSE",
        content: `<memcell_context>\nEchoed internal context that must never be self-distilled\n</memcell_context>\nUpdated the retry logger in src/billing/webhook.ts and verified the handler.`,
        tool_calls: [
          {
            name: "replace_file_content",
            args: { TargetFile: join(workspaceDir, "src/billing/webhook.ts") },
          },
          {
            name: "run_command",
            args: { CommandLine: "pnpm test src/billing/webhook.test.ts" },
          },
        ],
      })}\n`;
      await writeFile(transcriptPath, turn1UserLine + turn1AssistantLine, "utf8");

      mockStdin({
        session_id: sessionId,
        cwd: workspaceDir,
        transcript_path: transcriptPath,
      });
      await runMoment("turn-end", "antigravity");

      const rememberCalls = apiCalls.filter((c) => c.url.endsWith("/api/v1/remember"));
      expect(rememberCalls).toHaveLength(1);
      const turn1Remember = rememberCalls[0]!.body;
      expect(String(turn1Remember.raw)).not.toContain("<memcell_context>");
      expect(String(turn1Remember.raw)).not.toContain("Echoed internal context");
      expect(String(turn1Remember.raw)).toContain(
        "Updated the retry logger in src/billing/webhook.ts",
      );
      expect(turn1Remember.touched).toEqual(["src/billing/webhook.ts"]);
      expect(turn1Remember.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "file_touch",
            name: "replace_file_content",
            target: "src/billing/webhook.ts",
          }),
          expect.objectContaining({
            type: "command",
            name: "run_command",
          }),
        ]),
      );

      // Step 6: Turn 2 short follow-up prompt ("yes please") -> rolls up Turn 1 intent & suppresses duplicate memory IDs
      const turn2UserLine = `${JSON.stringify({
        step_index: 3,
        type: "USER_INPUT",
        content: "yes please",
      })}\n`;
      await writeFile(transcriptPath, turn1UserLine + turn1AssistantLine + turn2UserLine, "utf8");

      mockStdin({
        session_id: sessionId,
        cwd: workspaceDir,
        transcript_path: transcriptPath,
      });
      const preInvTurn2 = await runMoment("prompt-submit", "antigravity");
      const recallCalls = apiCalls.filter((c) => c.url.endsWith("/api/v1/recall"));
      expect(recallCalls).toHaveLength(2);
      // Verify hierarchical intent envelope rolled up Turn 1's substantive prompt with "yes please"
      expect(String(recallCalls[1]!.body.intent)).toContain(
        "Update the invoice webhook handler in src/billing/webhook.ts to log retries",
      );
      expect(String(recallCalls[1]!.body.intent)).toContain("User instruction: yes please");
      // Because the server returned the exact same 2 memory IDs already injected in Turn 1, delta injection is silent!
      expect(preInvTurn2.context).toBeUndefined();
    });

    it("stages recall context on non-injecting Cursor beforeSubmitPrompt and delivers it on the first postToolUse", async () => {
      const sessionId = "cursor-session-202";

      globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/api/v1/recall")) {
          return new Response(
            JSON.stringify({
              memories: [
                {
                  memoryId: "mem-cursor-1",
                  title: "Keep API handlers idempotent using request keys",
                  type: "instruction",
                  confidence: 0.92,
                  layer: "project",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("{}", { status: 200 });
      }) as typeof fetch;

      // Cursor prompt-submit (beforeSubmitPrompt) cannot inject directly into the prompt
      mockStdin({
        session_id: sessionId,
        cwd: workspaceDir,
        prompt: "Refactor the payment capture endpoint for idempotency",
      });
      const promptRes = await runMoment("prompt-submit", "cursor");
      expect(
        adapterFor("cursor")!.speak("prompt-submit", promptRes.context ?? null, promptRes.heard),
      ).toBeNull();

      // Verify context was staged into pendingGuidance and NOT marked injected yet
      const stagedCache = await sessionCacheFor(sessionId);
      expect(stagedCache.pendingGuidance).toContain(
        "Keep API handlers idempotent using request keys",
      );

      // First after-act (postToolUse) delivers the staged recall context
      mockStdin({
        session_id: sessionId,
        cwd: workspaceDir,
        tool_name: "Read",
      });
      const afterAct1 = await runMoment("after-act", "cursor");
      expect(afterAct1.context).toContain("Keep API handlers idempotent using request keys");
      const spokenAfter1 = adapterFor("cursor")!.speak(
        "after-act",
        afterAct1.context ?? null,
        afterAct1.heard,
      );
      expect(JSON.parse(spokenAfter1!)).toEqual({
        additional_context: afterAct1.context,
      });

      // Second after-act (postToolUse) has nothing pending -> silent
      mockStdin({
        session_id: sessionId,
        cwd: workspaceDir,
        tool_name: "Read",
      });
      const afterAct2 = await runMoment("after-act", "cursor");
      expect(afterAct2.context).toBeUndefined();
    });
  });

  describe("2. Red-Team Guard Evasion Suite", () => {
    const claudeGuard = (() => {
      const g = adapterFor("claude")?.surface?.guard;
      if (!g || !can(g)) throw new Error("claude guard missing");
      return g as Guard;
    })();

    const opencodeGuard = (() => {
      const g = adapterFor("opencode")?.surface?.guard;
      if (!g || !can(g)) throw new Error("opencode guard missing");
      return g as Guard;
    })();

    const codexGuard = (() => {
      const g = adapterFor("codex")?.surface?.guard;
      if (!g || !can(g)) throw new Error("codex guard missing");
      return g as Guard;
    })();

    const stagedGuards = stageMemoriesFromRecall(
      [
        {
          id: "guard-outbound",
          title: "Never trigger outbound webhook mutations or force pushes from agent sessions",
          type: "guard",
          resources: ["https://api.example.com", "git push"],
          tags: ["guard", "send"],
          confidence: 0.98,
        },
        {
          id: "guard-prod-config",
          title: "Never modify or delete config/production.json",
          type: "guard",
          resources: ["config/production.json"],
          appliesAt: ["change"],
          confidence: 0.99,
        },
      ],
      "strict",
    );

    it("catches uppercase curl -X POST / PUT / DELETE and curl --data outbound mutations", () => {
      for (const cmd of [
        "curl -X POST https://api.example.com/v1/webhooks",
        "curl -s -X DELETE https://api.example.com/v1/users/1",
        "curl --request POST https://api.example.com/v1/sync",
        'curl https://api.example.com/v1/events -d \'{"event":"drop"}\'',
      ]) {
        const res = evaluatePreAct({
          tool: "Bash",
          input: { command: cmd },
          guard: claudeGuard,
          activeMemories: stagedGuards,
        });
        expect(res.verdict, `Expected refusal for command: ${cmd}`).toBe("refuse");
      }
    });

    it("catches subshell git push and destructive shell file mutations targeting guarded resources", () => {
      const subshellPush = evaluatePreAct({
        tool: "Bash",
        input: { command: 'bash -c "git push --force origin main"' },
        guard: claudeGuard,
        activeMemories: stagedGuards,
      });
      expect(subshellPush.verdict).toBe("refuse");

      for (const fileCmd of [
        "rm -rf config/production.json",
        "mv /tmp/override.json config/production.json",
        "sed -i '' 's/strict/permissive/' config/production.json",
        "echo '{}' > config/production.json",
      ]) {
        const res = evaluatePreAct({
          tool: "Bash",
          input: { command: fileCmd },
          guard: claudeGuard,
          activeMemories: stagedGuards,
        });
        expect(res.verdict, `Expected refusal for shell mutation: ${fileCmd}`).toBe("refuse");
      }
    });

    it("catches resource-scoped file edits across OpenCode filePath and apply_patch envelopes", () => {
      const opencodeEdit = evaluatePreAct({
        tool: "edit",
        input: { filePath: "/workspace/app/config/production.json" },
        guard: opencodeGuard,
        activeMemories: stagedGuards,
      });
      expect(opencodeEdit.verdict).toBe("refuse");

      const patchEdit = evaluatePreAct({
        tool: "Edit",
        input: {
          patch:
            "*** Begin Patch\n*** Update File: config/production.json\n@@\n-foo\n+bar\n*** End Patch",
        },
        guard: claudeGuard,
        activeMemories: stagedGuards,
      });
      expect(patchEdit.verdict).toBe("refuse");

      const codexShellRm = evaluatePreAct({
        tool: "Bash",
        input: { command: "rm config/production.json" },
        guard: codexGuard,
        activeMemories: stagedGuards,
      });
      expect(codexShellRm.verdict).toBe("refuse");
    });

    it("maintains zero false-positives on unguarded files and routine read/test commands", () => {
      const safeFileEdit = evaluatePreAct({
        tool: "Edit",
        input: { file_path: "src/components/Header.tsx" },
        guard: claudeGuard,
        activeMemories: stagedGuards,
      });
      expect(safeFileEdit.verdict).toBe("pass");

      for (const safeCmd of [
        "pnpm test",
        "git status",
        "git diff src/components/Header.tsx",
        "cat README.md",
        "rm -rf dist/bundle.js",
      ]) {
        const res = evaluatePreAct({
          tool: "Bash",
          input: { command: safeCmd },
          guard: claudeGuard,
          activeMemories: stagedGuards,
        });
        expect(res.verdict, `Expected pass for safe command: ${safeCmd}`).toBe("pass");
      }
    });
  });

  describe("3. Transcript Poisoning, Malformed EOF & Schema Drift Detection Chaos Suite", () => {
    it("tolerates half-written JSONL lines at EOF without losing valid turns or throwing", async () => {
      const transcriptPath = join(tmpRoot, "claude-malformed.jsonl");
      const validLine1 = `${JSON.stringify({
        type: "user",
        message: { role: "user", content: "Document the disaster recovery runbook steps" },
      })}\n`;
      const validLine2 = `${JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Added the primary failover checklist and verification gates to docs/dr-runbook.md.",
            },
          ],
        },
      })}\n`;
      const halfWrittenLine = `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"truncated mid-write`;

      await writeFile(transcriptPath, validLine1 + validLine2 + halfWrittenLine, "utf8");

      const slice = await adapterFor("claude")!.read!(
        { transcript_path: transcriptPath, cwd: workspaceDir },
        0,
      );
      expect(slice.text).toContain("Document the disaster recovery runbook steps");
      expect(slice.text).toContain("Added the primary failover checklist");
      expect(slice.text).not.toContain("truncated mid-write");
    });

    it("detects and logs suspected transcript schema drift when transcript grows >= 1KB with 0 extracted messages or actions", async () => {
      const transcriptPath = join(tmpRoot, "drift-transcript.jsonl");
      const sessionId = "drift-session-303";

      // Write > 1.5KB of unrecognized future schema lines
      const unknownLines = Array.from({ length: 15 }, (_, idx) =>
        JSON.stringify({
          schemaVersion: "99.0",
          unrecognizedEnvelope: {
            seq: idx,
            opaquePayload: "x".repeat(100),
          },
        }),
      ).join("\n");
      await writeFile(transcriptPath, `${unknownLines}\n`, "utf8");

      globalThis.fetch = vi.fn(
        async () => new Response("{}", { status: 200 }),
      ) as unknown as typeof fetch;

      mockStdin({
        session_id: sessionId,
        cwd: workspaceDir,
        transcript_path: transcriptPath,
      });
      await runMoment("turn-end", "claude");

      const logPath = projectLogFile({
        owner: "acme",
        project: "ops-engine",
        space: "ops-engine",
      });
      const logContent = await readFile(logPath, "utf8");
      expect(logContent).toContain("transcript schema drift suspected: record advanced by");
      expect(logContent).toContain("but 0 messages or actions were parsed");
    });
  });

  describe("4. Network Outage / 502 Chaos Rollback Resilience", () => {
    it("fails open on 502 Bad Gateway during turn-end and rolls back the transcript cursor so the next turn delivers both turns", async () => {
      const transcriptPath = join(tmpRoot, "outage-transcript.jsonl");
      const sessionId = "outage-session-404";
      const rememberPayloads: string[] = [];
      let shouldFail = true;

      globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/v1/remember")) {
          if (shouldFail) {
            return new Response(JSON.stringify({ message: "Bad Gateway" }), {
              status: 502,
              headers: { "content-type": "application/json" },
            });
          }
          const body = JSON.parse(String(init?.body ?? "{}")) as { raw?: string };
          rememberPayloads.push(body.raw ?? "");
          return new Response(JSON.stringify({ accepted: true }), {
            status: 202,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("{}", { status: 200 });
      }) as typeof fetch;

      // Turn 1 written to transcript
      const turn1 = [
        JSON.stringify({
          type: "user",
          message: { role: "user", content: "Configure rate limiting on the public webhook route" },
        }),
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            content: "Configured a 100 req/min sliding window limiter on /webhooks/ingest.",
          },
        }),
      ].join("\n");
      await writeFile(transcriptPath, `${turn1}\n`, "utf8");

      // Turn 1 turn-end hits 502 -> must fail open without throwing AND roll note.read back to 0
      mockStdin({
        session_id: sessionId,
        cwd: workspaceDir,
        transcript_path: transcriptPath,
      });
      await expect(runMoment("turn-end", "claude")).resolves.toBeDefined();

      const cacheAfter502 = await sessionCacheFor(sessionId);
      expect(cacheAfter502.read).toBe(0);
      expect(rememberPayloads).toHaveLength(0);

      // Server recovers on Turn 2 -> both Turn 1 and Turn 2 are delivered together!
      shouldFail = false;
      const turn2 = [
        JSON.stringify({
          type: "user",
          message: { role: "user", content: "Add burst headers to the response as well" },
        }),
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            content:
              "Added X-RateLimit-Remaining and Retry-After headers to the limiter middleware.",
          },
        }),
      ].join("\n");
      await writeFile(transcriptPath, `${turn1}\n${turn2}\n`, "utf8");

      mockStdin({
        session_id: sessionId,
        cwd: workspaceDir,
        transcript_path: transcriptPath,
      });
      await runMoment("turn-end", "claude");

      expect(rememberPayloads).toHaveLength(1);
      expect(rememberPayloads[0]).toContain("Configured a 100 req/min sliding window limiter");
      expect(rememberPayloads[0]).toContain("Added X-RateLimit-Remaining and Retry-After headers");

      const cacheAfterRecovery = await sessionCacheFor(sessionId);
      expect(cacheAfterRecovery.read).toBeGreaterThan(0);
    });
  });
});
