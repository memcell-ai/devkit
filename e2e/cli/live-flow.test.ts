import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setupTestEnvironment, type TestEnvironment } from "./test-helpers.js";

describe("CLI Live E2E Flow", () => {
  let env: TestEnvironment | null = null;
  let initialMemoryId: string | undefined;
  let promotedMemoryId: string | undefined;

  beforeAll(async () => {
    env = await setupTestEnvironment("flow", { createWorkspace: true });
    if (!env) {
      console.warn(
        "[e2e] Backend not reachable or no auth credentials. Skipping live flow suite.",
      );
    }
  });

  afterAll(() => {
    if (env) {
      env.cleanup();
    }
  });

  // ── Phase 1: Authentication & Wiring ──────────────────────────────────────────
  describe("Phase 1: Authentication & Wiring", () => {
    it("connects to the disposable workspace and establishes local configuration", () => {
      if (!env) return;

      const connectResult = env.runCli([
        "connect",
        env.wsSlug,
        "--url",
        env.instanceUrl,
      ]);
      expect(connectResult.stdout).toMatch(/Connected to/i);

      const configPath = join(env.tempWorkDir, ".memcell", "config.toml");
      expect(existsSync(configPath)).toBe(true);

      const configContent = readFileSync(configPath, "utf8");
      expect(configContent).toContain(env.instanceUrl);
      expect(configContent).toContain(env.wsSlug);
    });

    it("verifies status reports active workspace and valid agent key", () => {
      if (!env) return;

      const statusResult = env.runCli(["status"]);
      expect(statusResult.stdout).toMatch(/active/i);
      expect(statusResult.stdout).toContain(env.wsSlug);
    });
  });

  // ── Phase 2: Agent Memory Loop ────────────────────────────────────────────────
  describe("Phase 2: Agent Memory Loop", () => {
    it("returns zero memories on a cold workspace recall", () => {
      if (!env) return;

      const recallResult = env.runCli([
        "recall",
        "financial identity verification protocol",
        "--json",
      ]);
      const parsed = JSON.parse(recallResult.stdout);
      expect(Array.isArray(parsed.memories)).toBe(true);
      expect(parsed.memories.length).toBe(0);
    });

    it("files a new memory via remember and records user-scoped knowledge", () => {
      if (!env) return;

      const rememberResult = env.runCli([
        "remember",
        "Verify customer identity before issuing financial refunds",
        "--type",
        "guard",
        "--scope",
        "user",
      ]);

      expect(rememberResult.stdout).toMatch(/Created new memory|Filed/i);

      const lines = rememberResult.stdout.split("\n").map((l) => l.trim());
      initialMemoryId =
        lines.find((l) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            l,
          ),
        ) ||
        rememberResult.stdout.match(
          /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
        )?.[1];
      expect(initialMemoryId).toBeDefined();
    });

    it("elevates the memory to workspace scope via promote", () => {
      if (!env || !initialMemoryId) return;

      const promoteResult = env.runCli([
        "promote",
        initialMemoryId,
        "--to",
        "workspace",
        "--reason",
        "Mandatory security compliance across the workspace",
      ]);

      expect(promoteResult.stdout).toMatch(/promoted|review requested/i);

      const lines = promoteResult.stdout.split("\n").map((l) => l.trim());
      promotedMemoryId =
        lines.find((l) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            l,
          ),
        ) ||
        promoteResult.stdout.match(
          /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
        )?.[1];
      expect(promotedMemoryId).toBeDefined();
    });

    it("retrieves the active memory in prompt context upon recall", () => {
      if (!env || !promotedMemoryId) return;

      const recallResult = env.runCli([
        "recall",
        "Verify customer identity before issuing financial refunds",
        "--json",
      ]);

      const parsed = JSON.parse(recallResult.stdout);
      expect(parsed.memories.length).toBeGreaterThanOrEqual(1);
      expect(parsed.promptContext).toContain("<memcell_context>");
      expect(parsed.promptContext.toLowerCase()).toMatch(
        /customer identity|refunds/i,
      );

      const found = parsed.memories.find(
        (m: any) => m.id === promotedMemoryId || m.rootId === initialMemoryId,
      );
      expect(found).toBeDefined();
    });

    it("calibrates confidence after outcome reporting", () => {
      if (!env || !promotedMemoryId) return;

      const reportResult = env.runCli([
        "report",
        promotedMemoryId,
        "worked",
        "--reason",
        "Identity verification successfully validated transaction",
      ]);

      expect(reportResult.stdout).toMatch(/worked/i);
      expect(reportResult.stdout).toMatch(/confidence/i);
    });
  });

  // ── Phase 3: Epistemic Governance & Scoping ───────────────────────────────────
  describe("Phase 3: Epistemic Governance & Scoping", () => {
    it("stars the active memory", () => {
      if (!env || !promotedMemoryId) return;

      const starResult = env.runCli(["memory", "star", promotedMemoryId]);
      expect(starResult.stdout).toMatch(/starred/i);
    });

    it("lists active operational scopes and memory distribution", () => {
      if (!env) return;

      const scopeResult = env.runCli(["scope"]);
      expect(scopeResult.stdout).toMatch(/scope/i);
      expect(scopeResult.stdout).toContain(env.wsSlug);
    });

    it("lists memories in the workspace", () => {
      if (!env) return;

      const listResult = env.runCli(["memory", "list"]);
      expect(listResult.stdout).toMatch(/Verify customer identity|directive/i);
    });
  });

  // ── Phase 4: Lifecycle & Export ───────────────────────────────────────────────
  describe("Phase 4: Lifecycle & Export", () => {
    it("pauses and resumes agent hook execution", () => {
      if (!env) return;

      const pauseResult = env.runCli(["pause"]);
      expect(pauseResult.stdout).toMatch(/paused/i);

      const resumeResult = env.runCli(["resume"]);
      expect(resumeResult.stdout).toMatch(/resumed|active/i);
    });

    it("exports workspace memories into a structured document", () => {
      if (!env) return;

      const exportResult = env.runCli(["export", "--format", "json"]);
      const exportDoc = JSON.parse(exportResult.stdout);

      expect(exportDoc).toBeDefined();
      expect(Array.isArray(exportDoc.memories)).toBe(true);
      expect(exportDoc.memories.length).toBeGreaterThanOrEqual(1);
    });

    it("disconnects workspace wiring and removes local agent hooks", () => {
      if (!env) return;

      const hookRemoveResult = env.runCli(["hook", "remove"]);
      expect(hookRemoveResult.stdout).toMatch(/disconnected/i);

      const configPath = join(env.tempWorkDir, ".memcell");
      expect(existsSync(configPath)).toBe(false);
    });
  });
});
