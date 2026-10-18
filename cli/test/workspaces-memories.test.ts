import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const home = await mkdtemp(join(tmpdir(), "memcell-ws-home-"));
const projectDir = await mkdtemp(join(tmpdir(), "memcell-ws-dir-"));

vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => home,
}));

const calls: { url: string; method?: string; body?: Record<string, unknown> }[] = [];
let answer: () => unknown = () => ({});

vi.stubGlobal(
  "fetch",
  async (
    url: string,
    init: { method?: string; body?: string; headers: Record<string, string> },
  ) => {
    calls.push({
      url,
      method: init.method,
      body: init.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
    });
    return { ok: true, status: 200, text: async () => JSON.stringify(answer()) };
  },
);

const { runYargsCli, YARGS_COMMANDS } = await import("../src/cli.js");
const { listWorkspaces, newWorkspace, useWorkspace } =
  await import("../src/commands/workspaces.js");
const { listMemories, createMemory, deleteMemory } = await import("../src/commands/memories.js");
const { saveCredential } = await import("../src/instance.js");
const { saveProject, findWorkspace } = await import("../src/workspace.js");
const { resolveContext } = await import("../src/context.js");

const instance = "http://memcell.test";
const cwd = process.cwd;

beforeAll(async () => {
  await saveCredential({
    instance,
    token: "test_session_token",
    obtainedAt: new Date().toISOString(),
  });
  await saveProject({ instance, owner: "acme", project: "core", space: "core" }, projectDir);
  return () => {
    process.cwd = cwd;
  };
});

beforeEach(async () => {
  calls.length = 0;
  process.cwd = () => projectDir;
  await saveProject({ instance, owner: "acme", project: "core", space: "core" }, projectDir);
});

describe("workspaces & memories CLI dispatch", () => {
  it("standardizes YARGS_COMMANDS on singular resource nouns", () => {
    const cmdNames = YARGS_COMMANDS.map(
      (c) => (Array.isArray(c.command) ? c.command[0] : String(c.command)).split(" ")[0],
    );
    expect(cmdNames).toContain("workspace");
    expect(cmdNames).toContain("memory");
    expect(cmdNames).toContain("thread");
    expect(cmdNames).toContain("document");
    expect(cmdNames).toContain("team");
    expect(cmdNames).toContain("webhook");
    expect(cmdNames).toContain("agent");
    expect(cmdNames).toContain("org");

    // Must NOT contain plural nouns
    expect(cmdNames).not.toContain("workspaces");
    expect(cmdNames).not.toContain("memories");
    expect(cmdNames).not.toContain("threads");
    expect(cmdNames).not.toContain("documents");
    expect(cmdNames).not.toContain("teams");
    expect(cmdNames).not.toContain("webhooks");
    expect(cmdNames).not.toContain("agents");
    expect(cmdNames).not.toContain("orgs");
  });

  it("renders native yargs help for singular resource commands", async () => {
    for (const resource of ["workspace", "memory", "team", "org"]) {
      const logs: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
        logs.push(args.join(" "));
      });
      try {
        const code = await runYargsCli([resource, "--help"], "1.5.0");
        expect(code).toBe(0);
        expect(logs.join("\n")).toContain(`memcell ${resource}`);
      } finally {
        spy.mockRestore();
      }
    }
  });

  it("rejects plural resource commands in strict mode", async () => {
    for (const plural of [
      ["workspaces", "list"],
      ["memories", "list"],
      ["teams", "list"],
      ["webhooks", "list"],
      ["agents", "list"],
      ["orgs", "list"],
    ]) {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        const code = await runYargsCli(plural, "1.5.0");
        expect(code, `plural ${plural.join(" ")} should fail`).toBe(1);
      } finally {
        spy.mockRestore();
      }
    }
  });

  it("resolves context with --workspace flag", async () => {
    const context = await resolveContext("http://localhost:3000", {
      workspace: "acme/backend",
    });
    expect(context.project).not.toBeNull();
    expect(context.workspace).not.toBeNull();
    expect(context.project?.owner).toBe("acme");
    expect(context.project?.workspace).toBe("backend");
    expect(context.project?.project).toBe("backend");
    expect(context.project?.namespace).toBe("acme/backend");
  });
});

describe("workspaces commands execution", () => {
  it("lists workspaces and shows active/linked items", async () => {
    answer = () => ({
      activeWorkspace: { slug: "core", name: "Core Engine" },
      workspaces: [
        { id: "ws-1", slug: "core", name: "Core Engine" },
        { id: "ws-2", slug: "docs", name: "Documentation" },
      ],
    });

    const code = await listWorkspaces(instance);
    expect(code).toBe(0);
  });

  it("creates a new workspace via API", async () => {
    answer = () => ({ id: "ws-3", slug: "ml-pipeline", name: "ML Pipeline" });

    const code = await newWorkspace(instance, "ML Pipeline");
    expect(code).toBe(0);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("switches active workspace via useWorkspace and updates .memcell/config.toml", async () => {
    answer = () => ({
      activeWorkspace: { slug: "ml-pipeline", name: "ML Pipeline" },
    });

    const code = await useWorkspace(instance, "ml-pipeline");
    expect(code).toBe(0);
    const patchCall = calls.find((c) => c.method === "PATCH");
    expect(patchCall).toBeDefined();
    expect(patchCall?.body?.workspace).toBe("ml-pipeline");

    const found = await findWorkspace(projectDir);
    expect(found?.workspace.workspace).toBe("ml-pipeline");
  });

  it("purges workspace data via purgeWorkspace", async () => {
    const { purgeWorkspace } = await import("../src/commands/workspaces.js");
    answer = () => ({ ok: true });

    const code = await purgeWorkspace(instance, "acme/core");
    expect(code).toBe(0);
    const deleteCall = calls.find(
      (c) => c.method === "DELETE" && c.url.endsWith("/api/v1/acme/core/memories"),
    );
    expect(deleteCall).toBeDefined();
  });
});

describe("memories commands execution", () => {
  it("lists memories in active workspace", async () => {
    answer = () => ({
      memories: [
        {
          id: "mem-1",
          title: "Production database requires SSL",
          type: "guard",
          scope: "workspace",
          confidence: 0.95,
        },
      ],
      pagination: { total: 1, page: 1, perPage: 30, hasMore: false },
    });

    const code = await listMemories(instance);
    expect(code).toBe(0);
  });

  it("creates a memory directly in workspace", async () => {
    answer = () => ({
      memory: {
        id: "mem-2",
        title: "Keep functions pure when possible",
        type: "instruction",
        scope: "workspace",
      },
    });

    const code = await createMemory(instance, "Keep functions pure when possible", {
      type: "instruction",
    });
    expect(code).toBe(0);
  });

  it("deletes latest version of a memory by default", async () => {
    answer = () => ({
      status: "deleted",
      deletedCount: 1,
      deletedScope: "version",
      nextId: "mem-1",
      restoredVersion: 1,
    });

    const printed: string[] = [];
    const log = console.log;
    console.log = (line: string) => printed.push(line);
    try {
      const code = await deleteMemory(instance, "mem-2", {});
      expect(code).toBe(0);
    } finally {
      console.log = log;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.url).toBe("http://memcell.test/api/v1/acme/core/memories/mem-2");
    const out = printed.join("\n");
    expect(out).toContain("pruned latest version (restored v1)");
  });

  it("deletes all versions of a memory with --all", async () => {
    answer = () => ({
      status: "deleted",
      deletedCount: 2,
      deletedScope: "memory",
    });

    const printed: string[] = [];
    const log = console.log;
    console.log = (line: string) => printed.push(line);
    try {
      const code = await deleteMemory(instance, "mem-2", { all: true });
      expect(code).toBe(0);
    } finally {
      console.log = log;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.url).toBe(
      "http://memcell.test/api/v1/acme/core/memories/mem-2?allVersions=true",
    );
    const out = printed.join("\n");
    expect(out).toContain("deleted");
  });
});
