import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const home = await mkdtemp(join(tmpdir(), "memcell-account-home-"));

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

const {
  getProfile,
  updateProfile,
  listApiKeys,
  createApiKey,
  revokeApiKey,
  listTokens,
  createToken,
  revokeToken,
} = await import("../src/commands/account.js");
const { saveCredential } = await import("../src/instance.js");

const instance = "http://memcell.test";
const cwd = process.cwd;

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
});

describe("account profile", () => {
  it("fetches caller account profile", async () => {
    answer = () => ({
      profile: {
        id: "usr_alice",
        handle: "alice",
        name: "Alice Smith",
        email: "alice@example.com",
        createdAt: new Date().toISOString(),
      },
    });

    const printed: string[] = [];
    const log = console.log;
    console.log = (line: string) => printed.push(line);
    try {
      expect(await getProfile(instance)).toBe(0);
    } finally {
      console.log = log;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://memcell.test/api/v1/account/profile");
    const out = printed.join("\n");
    expect(out).toContain("Alice Smith");
    expect(out).toContain("@alice");
    expect(out).toContain("alice@example.com");
    expect(out).toContain("usr_alice");
  });
});

describe("account update", () => {
  it("updates caller account profile name", async () => {
    answer = () => ({
      profile: {
        id: "usr_alice",
        name: "Alice Johnson",
      },
    });

    const printed: string[] = [];
    const log = console.log;
    console.log = (line: string) => printed.push(line);
    try {
      expect(await updateProfile(instance, { name: "Alice Johnson" })).toBe(0);
    } finally {
      console.log = log;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("PATCH");
    expect(calls[0]!.url).toBe("http://memcell.test/api/v1/account/profile");
    expect(calls[0]!.body).toEqual({ name: "Alice Johnson" });
    const out = printed.join("\n");
    expect(out).toContain("updated profile name");
    expect(out).toContain("Alice Johnson");
  });
});

describe("account key list", () => {
  it("lists API keys", async () => {
    answer = () => ({
      keys: [
        {
          id: "key_1",
          name: "CLI Automation",
          preview: "mc_key_1234...",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const printed: string[] = [];
    const log = console.log;
    console.log = (line: string) => printed.push(line);
    try {
      expect(await listApiKeys(instance)).toBe(0);
    } finally {
      console.log = log;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://memcell.test/api/v1/account/api-keys");
    const out = printed.join("\n");
    expect(out).toContain("CLI Automation");
    expect(out).toContain("mc_key_1234...");
    expect(out).toContain("key_1");
  });
});

describe("account key create", () => {
  it("creates a new API key", async () => {
    answer = () => ({
      key: {
        id: "key_2",
        name: "CI Pipeline",
        key: "mc_key_secret_token_value_abc",
        createdAt: new Date().toISOString(),
      },
    });

    const printed: string[] = [];
    const log = console.log;
    console.log = (line: string) => printed.push(line);
    try {
      expect(await createApiKey(instance, "CI Pipeline", { expires: "30" })).toBe(0);
    } finally {
      console.log = log;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe("http://memcell.test/api/v1/account/api-keys");
    expect(calls[0]!.body).toEqual({ name: "CI Pipeline", expiresInDays: 30 });
    const out = printed.join("\n");
    expect(out).toContain("created API key");
    expect(out).toContain("CI Pipeline");
    expect(out).toContain("mc_key_secret_token_value_abc");
  });
});

describe("account key revoke", () => {
  it("revokes an API key by ID", async () => {
    answer = () => ({ ok: true });

    const printed: string[] = [];
    const log = console.log;
    console.log = (line: string) => printed.push(line);
    try {
      expect(await revokeApiKey(instance, "key_2")).toBe(0);
    } finally {
      console.log = log;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.url).toBe("http://memcell.test/api/v1/account/api-keys/key_2");
    const out = printed.join("\n");
    expect(out).toContain("revoked API key");
    expect(out).toContain("key_2");
  });
});

describe("account token aliases", () => {
  it("supports legacy token command aliases", async () => {
    answer = () => ({
      tokens: [
        {
          id: "key_legacy",
          name: "Legacy CLI",
          preview: "mc_key_leg...",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    expect(await listTokens(instance)).toBe(0);
    expect(calls[0]!.url).toBe("http://memcell.test/api/v1/account/api-keys");

    answer = () => ({
      token: {
        id: "key_new",
        name: "Legacy New",
        token: "mc_key_leg_secret",
        createdAt: new Date().toISOString(),
      },
    });
    expect(await createToken(instance, "Legacy New")).toBe(0);
    expect(calls[1]!.url).toBe("http://memcell.test/api/v1/account/api-keys");

    answer = () => ({ ok: true });
    expect(await revokeToken(instance, "key_new")).toBe(0);
    expect(calls[2]!.url).toBe("http://memcell.test/api/v1/account/api-keys/key_new");
  });
});
