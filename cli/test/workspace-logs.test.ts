import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const home = mkdtempSync(join(tmpdir(), "memcell-log-home-"));
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => home,
}));

const { log, workspaceDir, workspaceLogFile } = await import("../src/loop/session.js");

describe("per-workspace logging", () => {
  it("resolves workspace directories under ~/.memcell/workspaces", () => {
    expect(workspaceDir({ owner: "alice", workspace: "research" })).toBe(
      join(home, ".memcell", "workspaces", "alice", "research"),
    );
    expect(workspaceDir({ workspace: "research" })).toBe(
      join(home, ".memcell", "workspaces", "research"),
    );
    expect(workspaceDir("bob/support")).toBe(
      join(home, ".memcell", "workspaces", "bob", "support"),
    );
    expect(workspaceDir()).toBe(join(home, ".memcell"));
  });

  it("resolves workspace log files to hook.log inside the workspace directory", () => {
    expect(workspaceLogFile({ owner: "alice", workspace: "research" })).toBe(
      join(home, ".memcell", "workspaces", "alice", "research", "hook.log"),
    );
    expect(workspaceLogFile()).toBe(join(home, ".memcell", "hook.log"));
  });

  it("writes logs into isolated workspace directories", async () => {
    await log("alice firing 1", { owner: "alice", workspace: "frontend" });
    await log("alice firing 2", { owner: "alice", workspace: "frontend" });
    await log("bob firing 1", { owner: "bob", workspace: "backend" });
    await log("unscoped firing 1");

    const aliceLog = readFileSync(
      join(home, ".memcell", "workspaces", "alice", "frontend", "hook.log"),
      "utf8",
    );
    const bobLog = readFileSync(
      join(home, ".memcell", "workspaces", "bob", "backend", "hook.log"),
      "utf8",
    );
    const globalLog = readFileSync(join(home, ".memcell", "hook.log"), "utf8");

    expect(aliceLog).toContain("alice firing 1");
    expect(aliceLog).toContain("alice firing 2");
    expect(aliceLog).not.toContain("bob firing");
    expect(aliceLog).not.toContain("unscoped firing");

    expect(bobLog).toContain("bob firing 1");
    expect(bobLog).not.toContain("alice firing");

    expect(globalLog).toContain("unscoped firing 1");
    expect(globalLog).not.toContain("alice firing");
    expect(globalLog).not.toContain("bob firing");
  });

  it("sanitizes unsafe characters in workspace and owner names", async () => {
    await log("safe firing", { owner: "org../unsafe", workspace: "../../pwn" });
    const resolved = workspaceLogFile({ owner: "org../unsafe", workspace: "../../pwn" });
    expect(resolved).not.toContain("..");
    expect(resolved.startsWith(join(home, ".memcell", "workspaces"))).toBe(true);
  });
});
