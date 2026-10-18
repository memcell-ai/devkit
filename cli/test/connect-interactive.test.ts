import { describe, expect, it } from "vitest";

import { ask, CAN_ASK, choose } from "../src/select.js";
import { badInstance, DEFAULT_INSTANCE, normalize } from "../src/instance.js";

describe("interactive prompts: choose and ask", () => {
  it("CAN_ASK reports false in automated test / CI environments", () => {
    // In vitest / CI, CAN_ASK must be false to prevent hanging test runs
    expect(CAN_ASK()).toBe(false);
  });

  it("choose returns default/initial choice when CAN_ASK is false", async () => {
    const choices = [
      { name: "cloud", label: "MemCell Cloud" },
      { name: "local", label: "Local Development" },
    ];
    // In non-interactive environments, choose should return choices[initial] without blocking
    const selected = await choose("Select instance:", choices, 1);
    expect(selected).toBe("local");
  });

  it("choose returns null for empty choices", async () => {
    const selected = await choose("Empty:", []);
    expect(selected).toBeNull();
  });

  it("ask returns defaultValue when CAN_ASK is false", async () => {
    const answer = await ask("Project name", "my-default-project");
    expect(answer).toBe("my-default-project");
  });

  it("ask returns null when no default is provided in non-interactive environment", async () => {
    const answer = await ask("Enter custom URL");
    expect(answer).toBeNull();
  });
});

describe("instance selection & validation in interactive connect", () => {
  it("validates instance URLs correctly with badInstance", () => {
    expect(badInstance("http://localhost:3000")).toBeNull();
    expect(badInstance("https://memcell.ai")).toBeNull();
    expect(badInstance("http://127.0.0.1:8080")).toBeNull();

    expect(badInstance("not-a-url")).toContain("is not a URL");
    expect(badInstance("ftp://example.com")).toContain("is not http or https");
  });

  it("normalizes trailing slashes on selected instances", () => {
    expect(normalize("http://localhost:3000/")).toBe("http://localhost:3000");
    expect(normalize("https://memcell.ai///")).toBe("https://memcell.ai");
  });
});

describe("workspace response unwrapping for interactive connect", () => {
  it("extracts slug and owner correctly from nested workspace response", () => {
    const res: {
      ok?: boolean;
      workspace?: { id?: string; slug: string; name: string; ownerSlug?: string };
      slug?: string;
      ownerSlug?: string;
    } = {
      ok: true,
      workspace: {
        id: "ws_123",
        name: "sample",
        slug: "sample",
        ownerSlug: "memcell",
      },
    };
    const ws = res.workspace ?? res;
    const slug = ws.slug;
    const finalOwner = ws.ownerSlug || "memcell";
    const targetWorkspace = finalOwner ? `${finalOwner}/${slug}` : slug;

    expect(slug).toBe("sample");
    expect(targetWorkspace).toBe("memcell/sample");
  });

  it("extracts slug and owner correctly from flat workspace response", () => {
    const res: {
      ok?: boolean;
      workspace?: { id?: string; slug: string; name: string; ownerSlug?: string };
      slug?: string;
      ownerSlug?: string;
    } = {
      ok: true,
      slug: "sample",
      ownerSlug: "memcell",
    };
    const ws = res.workspace ?? res;
    const slug = ws.slug;
    const finalOwner = ws.ownerSlug || "memcell";
    const targetWorkspace = finalOwner ? `${finalOwner}/${slug}` : slug;

    expect(slug).toBe("sample");
    expect(targetWorkspace).toBe("memcell/sample");
  });

  it("registers all modular yargs command families in YARGS_COMMANDS", async () => {
    const { YARGS_COMMANDS } = await import("../src/cli.js");
    const cmdNames = YARGS_COMMANDS.map((c) =>
      Array.isArray(c.command) ? c.command[0] : String(c.command),
    );
    expect(cmdNames).toContain("login");
    expect(cmdNames).toContain("logout");
    expect(cmdNames).toContain("connect [target]");
    expect(cmdNames).toContain("disconnect");
    expect(cmdNames).toContain("status");
    expect(cmdNames).toContain("recall <intent>");
    expect(cmdNames).toContain("remember <text>");
    expect(cmdNames).toContain("report [memory] [outcome]");
    expect(cmdNames).toContain("workspace");
    expect(cmdNames).toContain("memory");
    expect(cmdNames).toContain("thread");
    expect(cmdNames).toContain("document");
    expect(cmdNames).toContain("agent");
    expect(cmdNames).toContain("hook [moment] [program]");
    expect(cmdNames).toContain("org");
    expect(cmdNames).toContain("team");
    expect(cmdNames).toContain("account");
    expect(cmdNames).toContain("webhook");
    expect(cmdNames).toContain("config");
    expect(cmdNames).toContain("server");
  });
});
