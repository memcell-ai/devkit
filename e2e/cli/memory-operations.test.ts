import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestEnvironment, type TestEnvironment } from "./test-helpers.js";

describe("CLI Memory Operations E2E", () => {
  let env: TestEnvironment | null = null;
  let memoryId1: string | undefined;
  let memoryId2: string | undefined;
  let relationId: string | undefined;

  beforeAll(async () => {
    env = await setupTestEnvironment("memops", { createWorkspace: true });
    if (!env) {
      console.warn(
        "[e2e] Backend not reachable or no auth credentials. Skipping memory operations suite.",
      );
      return;
    }

    // Connect to the disposable workspace
    env.runCli(["connect", env.wsSlug, "--url", env.instanceUrl]);
  });

  afterAll(() => {
    if (env) {
      env.cleanup();
    }
  });

  it("creates a primary operational directive memory via memory create", () => {
    if (!env) return;

    const res = env.runCli([
      "memory",
      "create",
      "Compliance directive: Financial transactions require explicit multi-party verification",
      "--type",
      "directive",
      "--scope",
      "workspace",
    ]);

    expect(res.stdout).toMatch(/created|filed/i);

    const match = res.stdout.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );
    memoryId1 = match?.[1];
    expect(memoryId1).toBeDefined();
  });

  it("lists memories in workspace and filters by type", () => {
    if (!env || !memoryId1) return;

    const res = env.runCli(["memory", "list", "--type", "directive"]);
    expect(res.stdout).toContain(memoryId1);
  });

  it("retrieves memory details via memory get", () => {
    if (!env || !memoryId1) return;

    const res = env.runCli(["memory", "get", memoryId1]);
    expect(res.stdout).toContain(memoryId1);
    expect(res.stdout).toMatch(/directive/i);
  });

  it("stars and unstars the memory", () => {
    if (!env || !memoryId1) return;

    const starRes = env.runCli(["memory", "star", memoryId1]);
    expect(starRes.stdout).toMatch(/starred/i);

    const unstarRes = env.runCli(["memory", "unstar", memoryId1]);
    expect(unstarRes.stdout).toMatch(/unstarred/i);
  });

  it("inspects revision and lineage history via memory history", () => {
    if (!env || !memoryId1) return;

    const res = env.runCli(["memory", "history", memoryId1]);
    expect(res.stdout).toContain(memoryId1);
  });

  it("creates a second guard memory for graph relation testing", () => {
    if (!env) return;

    const res = env.runCli([
      "memory",
      "create",
      "Threshold guard: Escalate any payment transaction exceeding $10,000 to compliance officer",
      "--type",
      "guard",
      "--scope",
      "workspace",
    ]);

    expect(res.stdout).toMatch(/created|filed/i);

    const match = res.stdout.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );
    memoryId2 = match?.[1];
    expect(memoryId2).toBeDefined();
  });

  it("relates the two memories with a directed epistemic edge", () => {
    if (!env || !memoryId1 || !memoryId2) return;

    const res = env.runCli([
      "memory",
      "relate",
      memoryId1,
      memoryId2,
      "--type",
      "limits",
    ]);

    expect(res.stdout).toMatch(/connected/i);

    const matches = [
      ...res.stdout.matchAll(
        /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
      ),
    ].map((m) => m[1]);
    relationId = matches.find((id) => id !== memoryId1 && id !== memoryId2);
  });

  it("lists memory relations in the workspace", () => {
    if (!env || !memoryId1) return;

    const res = env.runCli(["memory", "relation", "list", memoryId1]);
    expect(res.stdout).toMatch(/relation/i);
  });

  it("removes the relation edge via memory unrelate", () => {
    if (!env || !relationId) return;

    const res = env.runCli(["memory", "unrelate", relationId]);
    expect(res.stdout).toMatch(/unrelated/i);
  });

  it("deletes the memory via memory delete", () => {
    if (!env || !memoryId1) return;

    const res = env.runCli(["memory", "delete", memoryId1]);
    expect(res.stdout).toMatch(/deleted/i);
  });
});
