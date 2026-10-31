import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const home = await mkdtemp(join(tmpdir(), "memcell-usage-home-"));
const workspaceDir = await mkdtemp(join(tmpdir(), "memcell-usage-dir-"));

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

const { getUsage } = await import("../src/commands/usage.js");
const { saveCredential } = await import("../src/instance.js");
const { set } = await import("../src/config.js");

const instance = "http://memcell.test";
const cwd = process.cwd;

function serverUsage(slug: string, name: string, memories: Record<string, unknown>) {
  return {
    owner: { id: "org_1", slug, name, type: "org" },
    timeframe: "30d",
    period: { start: "2026-10-01T00:00:00.000Z", end: "2026-10-30T12:00:00.000Z" },
    quotas: {
      plan: {
        id: name.toLowerCase(),
        name,
        status: "active",
        renewsAt: null,
        rateLimitPerMinute: 120,
        isCustomRateOverride: false,
      },
      memories: { isNearLimit: false, isOverLimit: false, percentage: 0, ...memories },
      unlimitedGuarantee: { workspaces: true, requests: true },
    },
    summary: { totalIngressCalls: 35000 },
    dailyTimeSeries: [],
    workspaceBreakdown: [],
  };
}

beforeAll(async () => {
  await saveCredential({
    instance,
    token: "test_session_token",
    obtainedAt: new Date().toISOString(),
  });
  return () => {
    process.cwd = cwd;
  };
});

beforeEach(() => {
  calls.length = 0;
  process.cwd = () => workspaceDir;
});

describe("usage get", () => {
  it("fetches resource usage for explicit owner", async () => {
    answer = () =>
      serverUsage("acme", "Pro", {
        used: 1250,
        limit: 500000,
        types: {
          instruction: 700,
          decision: 100,
          fact: 300,
          preference: 100,
          provisional: 30,
          enforced: 20,
        },
      });

    const printed: string[] = [];
    const log = console.log;
    console.log = (line: string) => printed.push(line);
    try {
      expect(await getUsage(instance, "acme", { timeframe: "30d" })).toBe(0);
    } finally {
      console.log = log;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://memcell.test/api/v1/acme/usage?timeframe=30d");
    const out = printed.join("\n");
    expect(out).toContain("usage");
    expect(out).toContain("acme");
    expect(out).toContain("memories:");
    expect(out).toContain("1,250");
    expect(out).toContain("500,000");
    expect(out).toContain("plan:");
    expect(out).toContain("Pro");
    expect(out).toContain("enforced 20");
    expect(out).toContain("35,000");
    expect(out).toContain("unlimited");
    expect(out).toContain("120/min");
  });

  it("shows no meter for an Enterprise limit, which arrives as null", async () => {
    answer = () => serverUsage("acme", "Enterprise", { used: 90000, limit: null });

    const printed: string[] = [];
    const log = console.log;
    console.log = (line: string) => printed.push(line);
    try {
      expect(await getUsage(instance, "acme")).toBe(0);
    } finally {
      console.log = log;
    }

    const out = printed.join("\n");
    expect(out).toContain("Enterprise");
    expect(out).toContain("90,000");
    expect(out).toContain("no fixed limit");
    expect(out).not.toContain("null");
    expect(out).not.toContain("/ ");
  });

  it("fetches resource usage using active organization context", async () => {
    await set("organization", "cyberdyne", "global");

    answer = () => serverUsage("cyberdyne", "Free", { used: 50, limit: 10000 });

    const printed: string[] = [];
    const log = console.log;
    console.log = (line: string) => printed.push(line);
    try {
      expect(await getUsage(instance)).toBe(0);
    } finally {
      console.log = log;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://memcell.test/api/v1/cyberdyne/usage");
    const out = printed.join("\n");
    expect(out).toContain("cyberdyne");
  });
});
