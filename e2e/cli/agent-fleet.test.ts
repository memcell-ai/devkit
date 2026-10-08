import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestEnvironment, type TestEnvironment } from "./test-helpers.js";

describe("CLI Agent Management E2E", () => {
  let env: TestEnvironment | null = null;
  let agentId: string | undefined;
  let keyId: string | undefined;

  beforeAll(async () => {
    env = await setupTestEnvironment("agent", { createWorkspace: true });
    if (!env) {
      console.warn(
        "[e2e] Backend not reachable or no auth credentials. Skipping agent fleet suite.",
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

  it("lists agent keys connected to the machine or workspace", () => {
    if (!env) return;

    const res = env.runCli(["agent", "list"]);
    expect(res.stdout).toMatch(/agent|Connected/i);
  });

  it("registers a new agent in the workspace via agent new", () => {
    if (!env) return;

    const res = env.runCli([
      "agent",
      "new",
      "Compliance Reviewer",
      "--description",
      "Autonomous agent auditing financial transactions",
      "--type",
      "custom_pipeline",
    ]);

    expect(res.stdout).toMatch(/registered/i);
    expect(res.stdout).toContain("Compliance Reviewer");

    const lines = res.stdout.split("\n").map((l) => l.trim());
    agentId =
      lines.find((l) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          l,
        ),
      ) ||
      res.stdout.match(
        /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
      )?.[1];
    expect(agentId).toBeDefined();
  });

  it("mints an API key for the registered agent via agent key create", () => {
    if (!env || !agentId) return;

    const res = env.runCli(["agent", "key", "create", agentId]);
    expect(res.stdout).toMatch(/minted key/i);

    const lines = res.stdout.split("\n").map((l) => l.trim());
    keyId =
      lines.find((l) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          l,
        ),
      ) ||
      res.stdout.match(
        /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
      )?.[1];
    expect(keyId).toBeDefined();
  });

  it("updates agent metadata via agent update", () => {
    if (!env || !agentId) return;

    const res = env.runCli([
      "agent",
      "update",
      agentId,
      "--description",
      "Updated autonomous auditing agent for high-value transactions",
    ]);

    expect(res.stdout).toMatch(/updated/i);
  });

  it("revokes the minted agent key via agent key revoke", () => {
    if (!env || !keyId) return;

    const res = env.runCli(["agent", "key", "revoke", keyId]);
    expect(res.stdout).toMatch(/revoked/i);
  });

  it("deletes the registered agent via agent delete", () => {
    if (!env || !agentId) return;

    const res = env.runCli(["agent", "delete", agentId]);
    expect(res.stdout).toMatch(/deleted/i);
  });
});
