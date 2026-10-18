import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createCli } from "../src/cli.js";
import { enforceRequirements, resolveContext } from "../src/context.js";
import { saveProject } from "../src/workspace.js";

async function scratch() {
  return mkdtemp(join(tmpdir(), "memcell-aspect-"));
}

describe("global flags parsing", () => {
  it("accepts --workspace and -w on commands", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const cli1 = createCli(["import", "--workspace", "my-workspace", "--help"], "1.5.0");
      const res1 = await cli1.parseAsync();
      expect(res1.workspace).toBe("my-workspace");

      const cli2 = createCli(["import", "-w", "owner/short-ws", "--help"], "1.5.0");
      const res2 = await cli2.parseAsync();
      expect(res2.workspace).toBe("owner/short-ws");
    } finally {
      spy.mockRestore();
    }
  });

  it("accepts --owner and --json across commands", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const cli = createCli(
        ["memory", "list", "--owner", "acme-corp", "--json", "--help"],
        "1.5.0",
      );
      const res = await cli.parseAsync();
      expect(res.owner).toBe("acme-corp");
      expect(res.json).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("execution context resolution", () => {
  it("resolves workspace and owner from --workspace owner/slug flag", async () => {
    const context = await resolveContext("http://localhost:3000", {
      workspace: "acme/backend",
    });
    expect(context.project).not.toBeNull();
    expect(context.project?.owner).toBe("acme");
    expect(context.project?.project).toBe("backend");
    expect(context.project?.namespace).toBe("acme/backend");
    expect(context.project?.source).toBe("flag");
  });

  it("resolves workspace and owner when passed separately via flags", async () => {
    const context = await resolveContext("http://localhost:3000", {
      workspace: "frontend",
      owner: "design-org",
    });
    expect(context.project).not.toBeNull();
    expect(context.project?.owner).toBe("design-org");
    expect(context.project?.project).toBe("frontend");
    expect(context.project?.namespace).toBe("design-org/frontend");
    expect(context.project?.source).toBe("flag");
  });

  it("falls back to local .memcell config file when flags are absent", async () => {
    const dir = await scratch();
    await saveProject(
      {
        instance: "http://localhost:3000",
        owner: "team-alpha",
        project: "shared-core",
        space: "shared-core",
      },
      dir,
    );

    const context = await resolveContext("http://localhost:3000", {}, dir);
    expect(context.project).not.toBeNull();
    expect(context.project?.owner).toBe("team-alpha");
    expect(context.project?.project).toBe("shared-core");
    expect(context.project?.namespace).toBe("team-alpha/shared-core");
    expect(context.project?.source).toBe("file");
  });
});

describe("aspect requirement gates", () => {
  it("blocks execution when auth is required and user has no credential", () => {
    const mockCommand = {
      path: ["workspace", "list"],
      what: "test",
      require: { auth: "required" as const },
      run: async () => 0,
    };

    const emptyContext = {
      instance: "http://localhost:3000",
      from: "/tmp",
      credential: null,
      project: null,
      owner: null,
    };

    const result = enforceRequirements(mockCommand, emptyContext);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.exitCode).toBe(1);
    }
  });

  it("blocks execution when workspace is required and no workspace can be resolved", () => {
    const mockCommand = {
      path: ["memory", "list"],
      what: "test",
      require: { workspace: "required" as const },
      run: async () => 0,
    };

    const unprojectedContext = {
      instance: "http://localhost:3000",
      from: "/tmp",
      credential: { token: "valid-token" },
      project: null,
      owner: null,
    };

    const result = enforceRequirements(mockCommand, unprojectedContext);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.exitCode).toBe(1);
    }
  });

  it("passes when all declared requirements are met", () => {
    const mockCommand = {
      path: ["memory", "list"],
      what: "test",
      require: { auth: "required" as const, workspace: "required" as const },
      run: async () => 0,
    };

    const validContext = {
      instance: "http://localhost:3000",
      from: "/tmp",
      credential: { token: "valid-token" },
      project: {
        owner: "test-owner",
        project: "test-proj",
        namespace: "test-owner/test-proj",
        source: "flag" as const,
      },
      owner: "test-owner",
    };

    const result = enforceRequirements(mockCommand, validContext);
    expect(result.ok).toBe(true);
  });
});
