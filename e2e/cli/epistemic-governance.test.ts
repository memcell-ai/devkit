import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestEnvironment, type TestEnvironment } from "./test-helpers.js";

describe("CLI Epistemic Governance E2E", () => {
  let env: TestEnvironment | null = null;
  let userMemoryId: string | undefined;

  beforeAll(async () => {
    env = await setupTestEnvironment("gov", { createWorkspace: true });
    if (!env) {
      console.warn(
        "[e2e] Backend not reachable or no auth credentials. Skipping epistemic governance suite.",
      );
      return;
    }

    env.runCli(["connect", env.wsSlug, "--url", env.instanceUrl]);
  });

  afterAll(() => {
    if (env) {
      env.cleanup();
    }
  });

  it("lists active operational scopes in the workspace", () => {
    if (!env) return;

    const res = env.runCli(["scope"]);
    expect(res.stdout).toMatch(/scope/i);
    expect(res.stdout).toContain(env.wsSlug);
  });

  it("records a personal-scoped memory via remember", () => {
    if (!env) return;

    const res = env.runCli([
      "remember",
      "Operational preference: Prioritize verifiable primary audit logs over aggregated summaries",
      "--type",
      "preference",
      "--scope",
      "user",
    ]);

    expect(res.stdout).toMatch(/Created new memory|Filed/i);

    const lines = res.stdout.split("\n").map((l) => l.trim());
    userMemoryId =
      lines.find((l) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          l,
        ),
      ) ||
      res.stdout.match(
        /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
      )?.[1];
    expect(userMemoryId).toBeDefined();
  });

  it("requests or directly executes scope promotion to workspace", () => {
    if (!env || !userMemoryId) return;

    const res = env.runCli([
      "promote",
      userMemoryId,
      "--to",
      "workspace",
      "--reason",
      "Broadened standard for all verification agents in this workspace",
    ]);

    expect(res.stdout).toMatch(/promoted|review requested/i);
  });

  it("lists scope promotion requests", () => {
    if (!env) return;

    const res = env.runCli(["promotion", "list", "--status", "all"]);
    expect(res.stdout).toMatch(/promotion|no .* requests/i);
  });
});
