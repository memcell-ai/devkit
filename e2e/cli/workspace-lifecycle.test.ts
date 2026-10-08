import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestEnvironment, type TestEnvironment } from "./test-helpers.js";

describe("CLI Workspace Lifecycle E2E", () => {
  let env: TestEnvironment | null = null;
  const targetWsSlug = `e2e-ws-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    // We create the test environment without auto-creating a default workspace,
    // because this suite explicitly tests the creation and lifecycle.
    env = await setupTestEnvironment("wslife", { createWorkspace: false });
    if (!env) {
      console.warn(
        "[e2e] Backend not reachable or no auth credentials. Skipping workspace lifecycle suite.",
      );
    }
  });

  afterAll(() => {
    if (env) {
      // Ensure target workspace is cleaned up if it was created
      env.runCli(
        ["workspace", "delete", targetWsSlug, "--url", env.instanceUrl],
        {
          allowFailure: true,
        },
      );
      env.cleanup();
    }
  });

  it("creates a new workspace with custom description", () => {
    if (!env) return;

    const res = env.runCli([
      "workspace",
      "new",
      targetWsSlug,
      "--description",
      "Customer operations and compliance workspace",
      "--url",
      env.instanceUrl,
    ]);

    expect(res.stdout).toMatch(/made/i);
    expect(res.stdout).toContain(targetWsSlug);
  });

  it("lists workspaces and includes the newly created workspace", () => {
    if (!env) return;

    const res = env.runCli(["workspace", "list", "--url", env.instanceUrl]);
    expect(res.stdout).toContain(targetWsSlug);
  });

  it("retrieves workspace details and metadata via workspace get", () => {
    if (!env) return;

    const res = env.runCli([
      "workspace",
      "get",
      targetWsSlug,
      "--url",
      env.instanceUrl,
    ]);
    expect(res.stdout).toContain(targetWsSlug);
    expect(res.stdout).toMatch(/Customer operations and compliance workspace/i);
  });

  it("updates workspace name and description", () => {
    if (!env) return;

    const res = env.runCli([
      "workspace",
      "update",
      targetWsSlug,
      "--name",
      "Updated Customer Operations",
      "--description",
      "Updated compliance guidelines",
      "--url",
      env.instanceUrl,
    ]);

    expect(res.stdout).toMatch(/updated/i);
    expect(res.stdout).toMatch(/Updated Customer Operations/i);
  });

  it("verifies updated details via workspace get", () => {
    if (!env) return;

    const res = env.runCli([
      "workspace",
      "get",
      targetWsSlug,
      "--url",
      env.instanceUrl,
    ]);
    expect(res.stdout).toContain(targetWsSlug);
    expect(res.stdout).toMatch(/Updated Customer Operations/i);
  });

  it("deletes the workspace and confirms removal from workspace list", () => {
    if (!env) return;

    const deleteRes = env.runCli([
      "workspace",
      "delete",
      targetWsSlug,
      "--url",
      env.instanceUrl,
    ]);
    expect(deleteRes.stdout).toMatch(/deleted workspace/i);

    const listRes = env.runCli(["workspace", "list", "--url", env.instanceUrl]);
    expect(listRes.stdout).not.toContain(targetWsSlug);
  });
});
