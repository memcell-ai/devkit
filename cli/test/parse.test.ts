import { describe, expect, it, vi } from "vitest";
import { createCli, runYargsCli, YARGS_COMMANDS } from "../src/cli.js";

describe("yargs CLI parser & command dispatch", () => {
  it("shows help and returns 0 when invoked with no arguments", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    try {
      const code = await runYargsCli([], "1.5.0");
      expect(code).toBe(0);
      expect(logs.join("\n")).toContain("Usage: memcell <command> [options]");
      expect(logs.join("\n")).toContain("Global Options:");
    } finally {
      spy.mockRestore();
    }
  });

  it("prints version and returns 0 on --version and -v", async () => {
    for (const flag of ["--version", "-v"]) {
      const logs: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
        logs.push(args.join(" "));
      });
      try {
        const code = await runYargsCli([flag], "1.5.0");
        expect(code).toBe(0);
        expect(logs.join("\n")).toContain("1.5.0");
      } finally {
        spy.mockRestore();
      }
    }
  });

  it("renders native yargs command help on --help and subcommand --help", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    try {
      const code = await runYargsCli(["workspace", "--help"], "1.5.0");
      expect(code).toBe(0);
      const output = logs.join("\n");
      expect(output).toContain("memcell workspace");
      expect(output).toContain("list");
      expect(output).toContain("create <name>");
      expect(output).not.toContain("$0");
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects unknown top-level commands with exit code 1", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    try {
      const code = await runYargsCli(["nonexistent-command"], "1.5.0");
      expect(code).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects missing required positional arguments with exit code 1", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    try {
      const code = await runYargsCli(["workspace", "get"], "1.5.0");
      expect(code).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("registers clean singular top-level commands in YARGS_COMMANDS", () => {
    const names = YARGS_COMMANDS.map(
      (c) => (Array.isArray(c.command) ? c.command[0] : String(c.command)).split(" ")[0],
    );
    expect(names).toContain("login");
    expect(names).toContain("connect");
    expect(names).toContain("recall");
    expect(names).toContain("remember");
    expect(names).toContain("report");
    expect(names).toContain("workspace");
    expect(names).toContain("memory");
    expect(names).toContain("thread");
    expect(names).toContain("document");
    expect(names).toContain("agent");
    expect(names).toContain("org");
    expect(names).toContain("team");
    expect(names).toContain("account");
    expect(names).toContain("webhook");
    expect(names).toContain("config");
    expect(names).toContain("server");
    expect(names).not.toContain("workspaces");
    expect(names).not.toContain("memories");
  });

  it("parses global flags (--url, --workspace, --owner, --json) across commands", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const cli = createCli(
        ["memory", "list", "--workspace", "acme/core", "--owner", "acme", "--json", "--help"],
        "1.5.0",
      );
      const parsed = await cli.parseAsync();
      expect(parsed.workspace).toBe("acme/core");
      expect(parsed.owner).toBe("acme");
      expect(parsed.json).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
