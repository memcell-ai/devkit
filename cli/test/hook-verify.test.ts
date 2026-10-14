import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const said: string[] = [];
vi.spyOn(console, "log").mockImplementation((line: unknown) => {
  said.push(String(line));
});

const { hookVerify } = await import("../src/commands/hook.js");
const { claude } = await import("../src/adapters/claude.js");
const { cursor } = await import("../src/adapters/cursor.js");
const { hermes } = await import("../src/adapters/hermes.js");
const { saveWorkspace } = await import("../src/workspace.js");

const out = () => said.join("\n");

describe("memcell hook verify", () => {
  let dir: string;

  beforeEach(async () => {
    said.length = 0;
    dir = await mkdtemp(join(tmpdir(), "memcell-hook-verify-"));
    await saveWorkspace(
      { instance: "http://localhost:3000", space: "test-space", spaceId: "sp_1" },
      dir,
    );
  });

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("verifies wired claude hooks successfully", async () => {
    await claude.install(dir);
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    try {
      const code = await hookVerify("claude");
      expect(code).toBe(0);
      const text = out();
      expect(text).toContain("claude");
      expect(text).toContain("session-start");
      expect(text).toContain("prompt-submit");
      expect(text).toContain("before-act");
      expect(text).toContain("turn-end");
    } finally {
      cwd.mockRestore();
    }
  });

  it("verifies wired cursor hooks successfully", async () => {
    await cursor.install(dir);
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    try {
      const code = await hookVerify("cursor");
      expect(code).toBe(0);
      const text = out();
      expect(text).toContain("cursor");
      expect(text).toContain("beforeSubmitPrompt");
      expect(text).toContain("preToolUse");
    } finally {
      cwd.mockRestore();
    }
  });

  it("verifies wired hermes hooks successfully", async () => {
    await hermes.install(dir);
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    try {
      const code = await hookVerify("hermes");
      expect(code).toBe(0);
      const text = out();
      expect(text).toContain("hermes");
      expect(text).toContain("session-start");
    } finally {
      cwd.mockRestore();
    }
  });

  it("recognizes openai agent alias", async () => {
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    try {
      await hookVerify("openai");
      expect(out()).not.toContain('unknown agent "openai"');
    } finally {
      cwd.mockRestore();
    }
  });

  it("returns 1 for an unknown agent program", async () => {
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    try {
      const code = await hookVerify("nonexistent-agent");
      expect(code).toBe(1);
      expect(out()).toContain('unknown agent "nonexistent-agent"');
    } finally {
      cwd.mockRestore();
    }
  });

  it("returns 1 and warning when no hooks are wired in the directory", async () => {
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    try {
      const code = await hookVerify();
      expect(code).toBe(1);
      expect(out()).toContain("no agent hooks found in this workspace");
    } finally {
      cwd.mockRestore();
    }
  });
});
