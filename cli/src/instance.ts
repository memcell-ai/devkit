import { join, resolve } from "node:path";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";

import { text } from "./config.js";
import { machineDir } from "./machine.js";
import { findWorkspace } from "./workspace.js";

// Where this machine keeps what it knows: which memcell it talks to, and the
// accounts signed in there.
//
// The instance is part of the credential, never a separate setting — a
// token minted against a laptop's dev server must never be presentable to
// memcell.ai. So they are stored together, per instance, and every command
// resolves both in one step.
//
// One instance can hold several accounts. Which one a command acts as is
// decided here and nowhere else: `--account`, then MEMCELL_ACCOUNT, then the
// account the folder was connected with, then the machine's active account.

export const DEFAULT_INSTANCE = "https://memcell.ai";

export interface Credential {
  instance: string;
  token: string;
  /** ISO — what the session said when it was stored. */
  obtainedAt: string;
  userId?: string;
  email?: string;
  name?: string;
}

export interface Account extends Credential {
  /** Whether this is the account commands use where a folder does not say. */
  active: boolean;
}

export interface FolderAccount {
  userId: string;
  email?: string;
}

type Saved = Omit<Credential, "instance">;

interface InstanceEntry {
  active?: string;
  accounts: Record<string, Saved>;
  /** Each connected folder's account, by real path. Kept here rather than in
   *  the folder's `.memcell`, which is committed and shared with everyone. */
  folders?: Record<string, FolderAccount>;
}

interface Store {
  current?: string;
  credentials?: Record<string, InstanceEntry>;
}

interface StoredFile {
  current?: string;
  credentials?: Record<string, InstanceEntry | (Saved & { instance: string })>;
}

/** A session saved before the CLI recorded whose it was. It works as it always
 *  did until `nameSavedSession` learns the account behind it. */
const UNNAMED = "unnamed";

const dir = machineDir;
const file = () => join(dir(), "credentials.json");

let actingAs: string | undefined;

/** Act as this account for the rest of the run, whatever the folder says. */
export function actAs(account?: string): void {
  actingAs = account?.trim() || undefined;
}

/** The account this run was told to act as, by flag or environment. */
export function namedAccount(): string | undefined {
  return actingAs ?? (process.env.MEMCELL_ACCOUNT?.trim() || undefined);
}

/** Trailing slashes are a foot-gun once these become URL prefixes. */
export function normalize(instance: string): string {
  let end = instance.length;
  while (end > 0 && instance[end - 1] === "/") end--;
  return instance.slice(0, end);
}

/**
 * Whether this could be an instance at all.
 *
 * A typo in `--url` used to be carried all the way down and surface as
 * "not signed in · run memcell login" — sending somebody to sign in to
 * something that cannot exist. Caught once, where the instance is decided,
 * so every command refuses the same way.
 */
export function badInstance(instance: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(instance);
  } catch {
    return `${instance} is not a URL · try http://localhost:3000`;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:"
    ? null
    : `${instance} is not http or https`;
}

async function read(): Promise<Store> {
  let raw: StoredFile;
  try {
    raw = JSON.parse(await readFile(file(), "utf8")) as StoredFile;
  } catch {
    return {};
  }
  const credentials: Record<string, InstanceEntry> = {};
  for (const [instance, stored] of Object.entries(raw.credentials ?? {})) {
    credentials[instance] =
      "accounts" in stored
        ? stored
        : {
            active: UNNAMED,
            accounts: { [UNNAMED]: { token: stored.token, obtainedAt: stored.obtainedAt } },
          };
  }
  return { current: raw.current, credentials };
}

async function write(store: Store): Promise<void> {
  await mkdir(dir(), { recursive: true });
  // The token is a live session: keep it off other users' eyes.
  await writeFile(file(), `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
}

async function writeEntry(store: Store, instance: string, entry: InstanceEntry): Promise<void> {
  await write({ ...store, credentials: { ...store.credentials, [instance]: entry } });
}

/**
 * Which memcell this invocation talks to — the first setting to go through
 * the config chain, and the reason that chain exists.
 *
 * `--url` · MEMCELL_INSTANCE · the workspace's `instance` · the
 * machine's `instance` · whatever was last connected · the hosted one.
 * The last-connected fallback stays beneath config on purpose: it is a
 * memory of what happened, and a setting somebody wrote is a declaration of
 * what they want.
 */
export async function resolveInstance(flag?: string): Promise<string> {
  const configured = await text("instance.url", "", flag);
  if (configured.value) return normalize(configured.value);
  const store = await read();
  return normalize(store.current ?? DEFAULT_INSTANCE);
}

/** The same answer, with what decided it — for the commands that say where
 *  they are pointed and why. */
export async function whereInstance(flag?: string): Promise<{ instance: string; from: string }> {
  const configured = await text("instance.url", "", flag);
  if (configured.value) return { instance: normalize(configured.value), from: configured.scope };
  const store = await read();
  return store.current
    ? { instance: normalize(store.current), from: "last connected" }
    : { instance: DEFAULT_INSTANCE, from: "default" };
}

const entryFor = (store: Store, instance: string): InstanceEntry | undefined =>
  store.credentials?.[normalize(instance)];

function accountNamed(entry: InstanceEntry, wanted: string): [string, Saved] | null {
  const lowered = wanted.toLowerCase();
  return (
    Object.entries(entry.accounts).find(
      ([id, saved]) => id === wanted || saved.email?.toLowerCase() === lowered,
    ) ?? null
  );
}

function activeAccountOf(entry: InstanceEntry): [string, Saved] | null {
  const id =
    entry.active && entry.accounts[entry.active] ? entry.active : Object.keys(entry.accounts)[0];
  return id ? [id, entry.accounts[id]!] : null;
}

async function realFolder(from?: string): Promise<string | null> {
  const found = await findWorkspace(from).catch(() => null);
  if (!found) return null;
  return realpath(found.root).catch(() => found.root);
}

/** A folder belonging to somebody who is not signed in answers null rather
 *  than borrowing whoever is: acting as the wrong person fails later, and
 *  with a message that says nothing about why. */
async function accountInForce(entry: InstanceEntry): Promise<[string, Saved] | null> {
  const wanted = namedAccount();
  if (wanted) return accountNamed(entry, wanted);

  const folder = await realFolder();
  const owner = folder ? entry.folders?.[folder] : undefined;
  if (owner) {
    const saved = entry.accounts[owner.userId];
    return saved ? [owner.userId, saved] : null;
  }
  return activeAccountOf(entry);
}

export async function credentialFor(instance: string): Promise<Credential | null> {
  const envKey = process.env.MEMCELL_API_KEY?.trim();
  if (envKey) {
    return {
      instance: normalize(instance),
      token: envKey,
      obtainedAt: new Date().toISOString(),
    };
  }
  const entry = entryFor(await read(), instance);
  const account = entry ? await accountInForce(entry) : null;
  return account ? { ...account[1], instance: normalize(instance) } : null;
}

/** Saves the session and makes its account the machine's active one. */
export async function saveCredential(credential: Credential): Promise<void> {
  const store = await read();
  const instance = normalize(credential.instance);
  const { instance: _instance, ...saved } = credential;
  const id = credential.userId ?? UNNAMED;
  const entry = store.credentials?.[instance] ?? { accounts: {} };
  await write({
    current: instance,
    credentials: {
      ...store.credentials,
      [instance]: { ...entry, active: id, accounts: { ...entry.accounts, [id]: saved } },
    },
  });
}

export async function accountsOn(instance: string): Promise<Account[]> {
  const entry = entryFor(await read(), instance);
  if (!entry) return [];
  const active = activeAccountOf(entry)?.[0];
  return Object.entries(entry.accounts).map(([id, saved]) => ({
    ...saved,
    instance: normalize(instance),
    active: id === active,
  }));
}

/** The token of a session whose account is not known yet. */
export async function unnamedSession(instance: string): Promise<string | null> {
  return entryFor(await read(), instance)?.accounts[UNNAMED]?.token ?? null;
}

/** Puts an account to the unnamed session, or drops it when it no longer signs
 *  anybody in. */
export async function nameUnnamedSession(
  instance: string,
  user: { id: string; email?: string; name?: string } | null,
): Promise<void> {
  const store = await read();
  const key = normalize(instance);
  const entry = store.credentials?.[key];
  const session = entry?.accounts[UNNAMED];
  if (!entry || !session) return;

  const { [UNNAMED]: _unnamed, ...accounts } = entry.accounts;
  if (user) {
    accounts[user.id] = { ...session, userId: user.id, email: user.email, name: user.name };
  }
  const active = entry.active === UNNAMED ? (user?.id ?? Object.keys(accounts)[0]) : entry.active;
  await writeEntry(store, key, { ...entry, active, accounts });
}

export async function makeActive(instance: string, wanted: string): Promise<Account | null> {
  const store = await read();
  const key = normalize(instance);
  const entry = store.credentials?.[key];
  const found = entry ? accountNamed(entry, wanted) : null;
  if (!entry || !found) return null;
  await writeEntry(store, key, { ...entry, active: found[0] });
  return { ...found[1], instance: key, active: true };
}

/** Whose this folder is on this instance, if anybody's. */
export async function folderAccount(
  instance: string,
  from?: string,
): Promise<FolderAccount | null> {
  const entry = entryFor(await read(), instance);
  const folder = entry ? await realFolder(from) : null;
  return folder ? (entry?.folders?.[folder] ?? null) : null;
}

/** The account a folder with no owner of its own would act as. */
export async function activeUserId(instance: string): Promise<string | null> {
  const entry = entryFor(await read(), instance);
  const id = entry ? activeAccountOf(entry)?.[0] : undefined;
  return id && id !== UNNAMED ? id : null;
}

/** Records whose a folder is. Only for an account saved here: a run on an API
 *  key from the environment leaves nothing to come back to. */
export async function bindFolder(
  instance: string,
  folder: string,
  owner: FolderAccount,
): Promise<void> {
  const store = await read();
  const key = normalize(instance);
  const entry = store.credentials?.[key];
  if (!entry?.accounts[owner.userId]) return;
  const path = await realpath(resolve(folder)).catch(() => resolve(folder));
  await writeEntry(store, key, { ...entry, folders: { ...entry.folders, [path]: owner } });
}

export async function unbindFolder(instance: string, folder: string): Promise<void> {
  const store = await read();
  const key = normalize(instance);
  const entry = store.credentials?.[key];
  const path = await realpath(resolve(folder)).catch(() => resolve(folder));
  if (!entry?.folders?.[path]) return;
  const { [path]: _gone, ...folders } = entry.folders;
  await writeEntry(store, key, { ...entry, folders });
}

/** Forgets one account. Folders keep their owner, so signing that account back
 *  in puts them back as they were. */
export async function forgetAccount(instance: string, credential: Credential): Promise<boolean> {
  const store = await read();
  const key = normalize(instance);
  const id = credential.userId ?? UNNAMED;
  const entry = store.credentials?.[key];
  if (!entry?.accounts[id]) return false;
  const { [id]: _gone, ...accounts } = entry.accounts;
  const remaining = { ...store.credentials, [key]: { ...entry, accounts } };
  const elsewhere = Object.keys(remaining).find(
    (other) => Object.keys(remaining[other]!.accounts).length > 0,
  );
  await write({
    current:
      store.current === key && Object.keys(accounts).length === 0 ? elsewhere : store.current,
    credentials: {
      ...remaining,
      [key]: {
        ...entry,
        accounts,
        active: entry.active === id ? Object.keys(accounts)[0] : entry.active,
      },
    },
  });
  return true;
}

export async function forgetCredential(instance: string): Promise<boolean> {
  const store = await read();
  const key = normalize(instance);
  if (!store.credentials?.[key]) return false;
  const { [key]: _gone, ...rest } = store.credentials;
  await write({
    current: store.current === key ? Object.keys(rest)[0] : store.current,
    credentials: rest,
  });
  return true;
}

export async function knownInstances(): Promise<string[]> {
  return Object.entries((await read()).credentials ?? {})
    .filter(([, entry]) => Object.keys(entry.accounts).length > 0)
    .map(([instance]) => instance);
}
