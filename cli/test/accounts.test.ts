import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Several people signed in on one machine. What is pinned: nobody's session
// replaces anybody else's, a file written before accounts existed keeps
// working, and a folder keeps acting as the person who connected it however
// many others sign in after them.

const home = await mkdtemp(join(tmpdir(), "memcell-accounts-home-"));
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => home,
}));

const elsewhere = await mkdtemp(join(tmpdir(), "memcell-accounts-cwd-"));
const cwd = vi.spyOn(process, "cwd").mockReturnValue(elsewhere);

const { claimFolders, nameSavedSession } = await import("../src/accounts.js");
const {
  accountsOn,
  actAs,
  bindFolder,
  credentialFor,
  folderAccount,
  forgetAccount,
  knownInstances,
  makeActive,
  saveCredential,
  unbindFolder,
} = await import("../src/instance.js");
const { agentKeys, saveAgentKey } = await import("../src/keyring.js");

const LOCAL = "http://localhost:3100";
const STORE = join(home, ".memcell", "credentials.json");

const one = { userId: "u-one", email: "one@example.com", name: "One" };
const two = { userId: "u-two", email: "two@example.com", name: "Two" };

const signIn = (who: typeof one, token: string) =>
  saveCredential({ instance: LOCAL, token, obtainedAt: "2026-11-01T00:00Z", ...who });

async function folder(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "memcell-accounts-folder-"));
  await mkdir(join(dir, ".memcell"));
  await writeFile(
    join(dir, ".memcell", "config.toml"),
    `[instance]\nurl = "${LOCAL}"\n\n[workspace]\nid = "ws-1"\nslug = "shared"\n`,
  );
  return dir;
}

afterEach(async () => {
  actAs(undefined);
  delete process.env.MEMCELL_ACCOUNT;
  cwd.mockReturnValue(elsewhere);
  vi.unstubAllGlobals();
  await rm(join(home, ".memcell"), { recursive: true, force: true });
});

describe("accounts on one instance", () => {
  it("keeps the first account when a second signs in", async () => {
    await signIn(one, "token-one");
    await signIn(two, "token-two");

    expect((await accountsOn(LOCAL)).map((account) => account.email)).toEqual([
      "one@example.com",
      "two@example.com",
    ]);
    expect((await credentialFor(LOCAL))?.token).toBe("token-two");
  });

  it("makes an account active by its email", async () => {
    await signIn(one, "token-one");
    await signIn(two, "token-two");

    expect((await makeActive(LOCAL, "ONE@example.com"))?.userId).toBe("u-one");
    expect((await credentialFor(LOCAL))?.token).toBe("token-one");
    expect(await makeActive(LOCAL, "stranger@example.com")).toBeNull();
  });

  it("acts as a named account, by flag or by environment", async () => {
    await signIn(one, "token-one");
    await signIn(two, "token-two");

    actAs("one@example.com");
    expect((await credentialFor(LOCAL))?.token).toBe("token-one");
    actAs(undefined);

    process.env.MEMCELL_ACCOUNT = "one@example.com";
    expect((await credentialFor(LOCAL))?.token).toBe("token-one");
    process.env.MEMCELL_ACCOUNT = "stranger@example.com";
    expect(await credentialFor(LOCAL)).toBeNull();
  });

  it("signing one account out leaves the other, and the active one moves to it", async () => {
    await signIn(one, "token-one");
    await signIn(two, "token-two");

    const leaving = (await accountsOn(LOCAL)).find((account) => account.userId === "u-two")!;
    expect(await forgetAccount(LOCAL, leaving)).toBe(true);

    expect((await credentialFor(LOCAL))?.token).toBe("token-one");
    expect(await knownInstances()).toEqual([LOCAL]);
  });

  it("an instance with nobody left is no longer known", async () => {
    await signIn(one, "token-one");
    const [account] = await accountsOn(LOCAL);
    await forgetAccount(LOCAL, account!);

    expect(await credentialFor(LOCAL)).toBeNull();
    expect(await knownInstances()).toEqual([]);
  });
});

describe("a credentials file from before accounts", () => {
  const legacy = (token: string) =>
    JSON.stringify({
      current: LOCAL,
      credentials: { [LOCAL]: { instance: LOCAL, token, obtainedAt: "2026-10-01T00:00Z" } },
    });

  async function write(contents: string) {
    await mkdir(join(home, ".memcell"), { recursive: true });
    await writeFile(STORE, contents);
  }

  const answersSession = (body: unknown, ok = true) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ok ? new Response(JSON.stringify(body)) : Promise.reject(new Error("offline")),
      ),
    );

  it("keeps the session working as it was", async () => {
    await write(legacy("old-token"));
    expect((await credentialFor(LOCAL))?.token).toBe("old-token");
  });

  it("learns whose the session is and keeps it active", async () => {
    await write(legacy("old-token"));
    answersSession({ user: { id: "u-one", email: "one@example.com", name: "One" } });

    await nameSavedSession(LOCAL);

    const [account] = await accountsOn(LOCAL);
    expect(account).toMatchObject({ userId: "u-one", email: "one@example.com", active: true });
    expect((await credentialFor(LOCAL))?.token).toBe("old-token");
  });

  it("drops a session the instance says signs nobody in", async () => {
    await write(legacy("dead-token"));
    answersSession(null);

    await nameSavedSession(LOCAL);

    expect(await accountsOn(LOCAL)).toEqual([]);
  });

  it("keeps the session when the instance cannot be reached", async () => {
    await write(legacy("old-token"));
    answersSession(null, false);

    await nameSavedSession(LOCAL);

    expect((await credentialFor(LOCAL))?.token).toBe("old-token");
  });
});

describe("a connected folder's account", () => {
  it("stays with the person who connected it, whoever signs in after", async () => {
    const dir = await folder();
    await signIn(one, "token-one");
    await bindFolder(LOCAL, dir, one);
    await signIn(two, "token-two");

    cwd.mockReturnValue(dir);
    expect((await credentialFor(LOCAL))?.token).toBe("token-one");

    cwd.mockReturnValue(elsewhere);
    expect((await credentialFor(LOCAL))?.token).toBe("token-two");
  });

  it("answers from anywhere inside the folder", async () => {
    const dir = await folder();
    await signIn(one, "token-one");
    await bindFolder(LOCAL, dir, one);
    await signIn(two, "token-two");

    const inside = join(dir, "deeper");
    await mkdir(inside);
    cwd.mockReturnValue(inside);
    expect((await credentialFor(LOCAL))?.token).toBe("token-one");
  });

  it("does not borrow someone else when its person has signed out", async () => {
    const dir = await folder();
    await signIn(one, "token-one");
    await bindFolder(LOCAL, dir, one);
    await signIn(two, "token-two");

    const leaving = (await accountsOn(LOCAL)).find((account) => account.userId === "u-one")!;
    await forgetAccount(LOCAL, leaving);

    cwd.mockReturnValue(dir);
    expect(await credentialFor(LOCAL)).toBeNull();
    expect((await folderAccount(LOCAL))?.email).toBe("one@example.com");
  });

  it("an explicit account beats the folder", async () => {
    const dir = await folder();
    await signIn(one, "token-one");
    await bindFolder(LOCAL, dir, one);
    await signIn(two, "token-two");

    cwd.mockReturnValue(dir);
    actAs("two@example.com");
    expect((await credentialFor(LOCAL))?.token).toBe("token-two");
  });

  it("is forgotten when the folder disconnects", async () => {
    const dir = await folder();
    await signIn(one, "token-one");
    await bindFolder(LOCAL, dir, one);
    await unbindFolder(LOCAL, dir);

    expect(await folderAccount(LOCAL, dir)).toBeNull();
  });

  it("is not recorded for an account saved nowhere on this machine", async () => {
    const dir = await folder();
    await signIn(one, "token-one");
    await bindFolder(LOCAL, dir, two);

    expect(await folderAccount(LOCAL, dir)).toBeNull();
  });

  it("is claimed from the key already in the folder when a new account arrives", async () => {
    const dir = await folder();
    await signIn(one, "token-one");
    await saveAgentKey({
      instance: LOCAL,
      keyId: "key-one",
      key: "secret-of-one",
      project: dir,
      projectId: "ws-1",
      agent: "claude",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ userId: "u-one", standing: "ok" }))),
    );

    await claimFolders(LOCAL);
    await signIn(two, "token-two");

    cwd.mockReturnValue(dir);
    expect((await credentialFor(LOCAL))?.token).toBe("token-one");
    expect((await agentKeys())[0]?.userId).toBe("u-one");
  });

  it("leaves a folder alone when its key cannot say whose it is", async () => {
    const dir = await folder();
    await signIn(one, "token-one");
    await saveAgentKey({
      instance: LOCAL,
      keyId: "key-gone",
      key: "revoked",
      project: dir,
      projectId: "ws-1",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "nope" }), { status: 401 })),
    );

    await claimFolders(LOCAL);

    expect(await folderAccount(LOCAL, dir)).toBeNull();
  });
});
