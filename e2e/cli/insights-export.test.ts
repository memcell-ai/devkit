import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestEnvironment, type TestEnvironment } from "./test-helpers.js";

describe("CLI Insights, Export & Lifecycle E2E", () => {
  let env: TestEnvironment | null = null;

  beforeAll(async () => {
    env = await setupTestEnvironment("export", { createWorkspace: true });
    if (!env) {
      console.warn(
        "[e2e] Backend not reachable or no auth credentials. Skipping insights & export suite.",
      );
      return;
    }

    env.runCli(["connect", env.wsSlug, "--url", env.instanceUrl]);
    // Seed at least one memory to test formatting
    env.runCli([
      "remember",
      "Operational directive: Record audit traces for external compliance verification",
      "--type",
      "directive",
      "--scope",
      "workspace",
    ]);
  });

  afterAll(() => {
    if (env) {
      env.cleanup();
    }
  });

  it("reads telemetry statistics via stats", () => {
    if (!env) return;

    const res = env.runCli(["stats"]);
    expect(res.stdout).toMatch(/memcell/i);
  });

  it("retrieves workspace usage metrics via usage get", () => {
    if (!env) return;

    const res = env.runCli(["usage", "get"]);
    expect(res.stdout).toMatch(/usage|memcell/i);
  });

  it("exports workspace memories in json format", () => {
    if (!env) return;

    const res = env.runCli(["export", "--format", "json"]);
    const parsed = JSON.parse(res.stdout);
    expect(parsed).toBeDefined();
    expect(Array.isArray(parsed.memories)).toBe(true);
    expect(parsed.memories.length).toBeGreaterThanOrEqual(1);
  });

  it("exports workspace memories in agents-md format", () => {
    if (!env) return;

    const res = env.runCli(["export", "--format", "agents-md"]);
    expect(res.stdout).toMatch(/# Memory Context|Directives/i);
  });

  it("exports workspace memories in claude-md format", () => {
    if (!env) return;

    const res = env.runCli(["export", "--format", "claude-md"]);
    expect(res.stdout).toMatch(/# Memory Context|Directives/i);
  });

  it("exports workspace memories in cursorrules format", () => {
    if (!env) return;

    const res = env.runCli(["export", "--format", "cursorrules"]);
    expect(res.stdout).toMatch(/exported from memcell|Record audit traces/i);
  });

  it("pauses and resumes workspace hook execution", () => {
    if (!env) return;

    const pauseRes = env.runCli(["pause"]);
    expect(pauseRes.stdout).toMatch(/paused/i);

    const resumeRes = env.runCli(["resume"]);
    expect(resumeRes.stdout).toMatch(/resumed|active/i);
  });

  it("disconnects workspace wiring via hook remove", () => {
    if (!env) return;

    const res = env.runCli(["hook", "remove"]);
    expect(res.stdout).toMatch(/disconnected/i);
  });
});
