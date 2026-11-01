import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Connecting with several accounts on the machine: the folder belongs to
// whoever connected it, and a workspace one account cannot see says who is
// signed in rather than sending somebody off to look for a missing workspace.

const home = await mkdtemp(join(tmpdir(), "memcell-connect-accounts-home-"));
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => home,
}));

const instance = "http://accounts.test";
const people: Record<string, { id: string; name: string; email: string }> = {
  "token-one": { id: "u-one", name: "One", email: "one@example.com" },
  "token-two": { id: "u-two", name: "Two", email: "two@example.com" },
};

/** Each person sees only their own workspace. */
vi.stubGlobal(
  "fetch",
  async (url: string, init: { body?: string; headers: Record<string, string> }) => {
    const token = init.headers.authorization?.slice("Bearer ".length) ?? "";
    const person = people[token];
    if (url.endsWith("/api/auth/get-session")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ user: person }) };
    }
    const wanted = (JSON.parse(init.body!) as { workspace: string }).workspace;
    if (wanted !== `${person?.id}/mine`) {
      return {
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ message: `Workspace '${wanted}' not found.` }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          instance,
          workspace: { id: `ws-${person!.id}`, slug: "mine", name: "Mine", ownerSlug: person!.id },
          key: `mc_ag_${person!.id}`,
          keyId: `key-${person!.id}`,
          agentId: `agent-${person!.id}`,
        }),
    };
  },
);

const { connect } = await import("../src/commands/connect.js");
const { actAs, credentialFor, folderAccount, saveCredential } = await import("../src/instance.js");
const { agentKeys } = await import("../src/keyring.js");

const cwd = process.cwd;
const said: string[] = [];

const signIn = (token: string) =>
  saveCredential({
    instance,
    token,
    obtainedAt: "2026-11-01T00:00Z",
    userId: people[token]!.id,
    email: people[token]!.email,
    name: people[token]!.name,
  });

beforeEach(async () => {
  said.length = 0;
  vi.spyOn(console, "log").mockImplementation((...args) => void said.push(args.join(" ")));
  const dir = await mkdtemp(join(tmpdir(), "memcell-connect-accounts-dir-"));
  process.cwd = () => dir;
  await signIn("token-one");
  await signIn("token-two");
  actAs(undefined);
});

afterEach(() => {
  process.cwd = cwd;
  actAs(undefined);
  vi.restoreAllMocks();
});

describe("connecting with several accounts here", () => {
  it("gives the folder to the account that connected it", async () => {
    const code = await connect(instance, { from: "test", workspace: "u-two/mine" });

    expect(code).toBe(0);
    expect((await folderAccount(instance))?.email).toBe("two@example.com");
    expect((await agentKeys()).find((key) => key.keyId === "key-u-two")?.userId).toBe("u-two");
    expect(said.join("\n")).toContain("two@example.com");
  });

  it("the folder stays with its person when someone else signs in after", async () => {
    await connect(instance, { from: "test", workspace: "u-two/mine" });

    await signIn("token-one");

    expect((await credentialFor(instance))?.token).toBe("token-two");
  });

  it("connects as a named account", async () => {
    actAs("one@example.com");

    const code = await connect(instance, { from: "test", workspace: "u-one/mine" });

    expect(code).toBe(0);
    expect((await folderAccount(instance))?.email).toBe("one@example.com");
  });

  it("says who is signed in and who else could try when a workspace cannot be seen", async () => {
    const code = await connect(instance, { from: "test", workspace: "u-one/mine" });

    expect(code).toBe(1);
    const output = said.join("\n");
    expect(output).toContain("Workspace 'u-one/mine' not found.");
    expect(output).toContain("two@example.com");
    expect(output).toContain("memcell connect u-one/mine --account one@example.com");
    expect(output).toContain("memcell login");
  });
});
