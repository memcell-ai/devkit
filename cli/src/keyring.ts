import { chmod, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { activeUserId, folderAccount, normalize } from "./instance.js";
import { machineDir, machineFile } from "./machine.js";
import { findWorkspace } from "./workspace.js";

// Where identity lives, which is deliberately not where the wiring lives.
//
// `.memcell` sits in the project and names the instance and the space —
// project truth, identical for every clone, safe to commit. Everything
// personal is HERE: the key, its id, and the wired agent's id, found at
// runtime by the directory that was paired. A project file carrying any of
// it would either leak a credential one `git add .` away from public, or
// make every teammate's connect rewrite a committed file.

export interface AgentKey {
  instance: string;
  keyId: string;
  key: string;
  project: string;
  /** The project id. `[project].id`. */
  projectId?: string;
  /** The project slug. `[project].slug`. */
  projectSlug?: string;
  /** The project owner slug. `[project].owner`. */
  ownerSlug?: string;
  /** The resolved directory path where this project was connected. */
  projectPath?: string;
  /** The space this key answers for (legacy alias for projectSlug). */
  space?: string;
  /** The wired agent's own id — personal, like the key, so it lives here
   *  rather than in the committed project file. */
  agentId?: string;
  /** The specific agent program name (e.g. 'antigravity', 'claude', 'cursor')
   *  this key authenticates for. */
  agent?: string;
  /** The person the key was minted for. Two people can hold keys for one
   *  workspace on one machine, and neither may answer for the other. */
  userId?: string;
}

interface Store {
  keys?: Record<string, AgentKey>;
}

const dir = machineDir;
const file = () => machineFile("agent-keys.json");

/** Instance and id together: an id is unique only within one memcell, and a
 *  key minted against a laptop's dev server must never be found for the
 *  hosted one. */
const handle = (instance: string, keyId: string) => `${normalize(instance)}|${keyId}`;

/** A key saved before keys recorded their person could be anybody's. */
const samePerson = (key: AgentKey, userId?: string) =>
  !userId || !key.userId || key.userId === userId;

async function read(): Promise<Store> {
  try {
    return JSON.parse(await readFile(file(), "utf8")) as Store;
  } catch {
    return {};
  }
}

async function write(store: Store): Promise<void> {
  await mkdir(dir(), { recursive: true });
  await writeFile(file(), `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await chmod(file(), 0o600);
}

/**
 * Prunes prior keys for a specific project directory, id, and instance.
 *
 * When reconnecting, the server revokes/supersedes prior keys for that person's
 * agent in that workspace, whichever folder holds them. Pruning matching entries
 * ensures the keyring does not hold dead keys that cause random 401s or agent
 * disconnections. Another person's key for the same workspace stays live and stays.
 */
export async function pruneProjectKeys(
  instance: string,
  projectDir: string,
  agentName?: string,
  projectId?: string,
  userId?: string,
): Promise<number> {
  const store = await read();
  if (!store.keys) return 0;

  const real = (p: string) => realpath(resolve(p)).catch(() => resolve(p));
  const at = await real(projectDir);
  const wanted = normalize(instance);

  const remaining: Record<string, AgentKey> = {};
  let pruned = 0;

  for (const [h, keyEntry] of Object.entries(store.keys)) {
    const isSameInstance = normalize(keyEntry.instance) === wanted;
    const isSameProject =
      (projectId &&
        keyEntry.projectId &&
        keyEntry.projectId === projectId &&
        samePerson(keyEntry, userId)) ||
      (await real(keyEntry.projectPath ?? keyEntry.project)) === at;
    const isSameAgent = agentName
      ? keyEntry.agent?.toLowerCase() === agentName.toLowerCase()
      : true;

    if (isSameInstance && isSameProject && isSameAgent) {
      pruned++;
    } else {
      remaining[h] = keyEntry;
    }
  }

  if (pruned > 0) {
    await write({ keys: remaining });
  }
  return pruned;
}

export async function saveAgentKey(entry: AgentKey): Promise<void> {
  const store = await read();
  const real = (p: string) => realpath(resolve(p)).catch(() => resolve(p));
  const resolvedPath = resolve(entry.projectPath ?? entry.project);
  const targetProject = await real(resolvedPath);
  const targetInstance = normalize(entry.instance);
  const targetAgent = entry.agent?.toLowerCase();
  const targetProjectId = entry.projectId;

  const cleaned: Record<string, AgentKey> = {};

  for (const [h, k] of Object.entries(store.keys ?? {})) {
    const isSameInstance = normalize(k.instance) === targetInstance;
    const isSameProject =
      targetProjectId && k.projectId
        ? k.projectId === targetProjectId && samePerson(k, entry.userId)
        : (await real(k.projectPath ?? k.project)) === targetProject;
    const isSameAgent =
      targetAgent !== undefined ? k.agent?.toLowerCase() === targetAgent : k.agent === undefined;

    if (isSameInstance && isSameProject && isSameAgent) {
      // Supersede prior key for this exact agent in this project
      continue;
    }
    cleaned[h] = k;
  }

  cleaned[handle(entry.instance, entry.keyId)] = {
    ...entry,
    project: resolvedPath,
    projectPath: resolvedPath,
    projectSlug: entry.projectSlug ?? entry.space,
    space: entry.space ?? entry.projectSlug,
  };
  await write({ keys: cleaned });
}

export async function agentKeyFor(instance: string, keyId: string): Promise<AgentKey | null> {
  return (await read()).keys?.[handle(instance, keyId)] ?? null;
}

/** Records the person behind a key saved before keys carried one. */
export async function stampAgentKey(key: AgentKey, userId: string): Promise<void> {
  const store = await read();
  const at = handle(key.instance, key.keyId);
  const held = store.keys?.[at];
  if (!held) return;
  await write({ keys: { ...store.keys, [at]: { ...held, userId } } });
}

/** Keys found by their workspace rather than their folder answer only for the
 *  folder's own person. With two people's keys on the machine and nothing saying
 *  which folder this is, there is no answer: a wrong guess acts as someone else. */
async function ownKeys(
  instance: string,
  projectDir: string | undefined,
  held: AgentKey[],
): Promise<AgentKey[]> {
  const owner = projectDir
    ? ((await folderAccount(instance, projectDir))?.userId ?? (await activeUserId(instance)))
    : await activeUserId(instance);
  if (owner) return held.filter((k) => samePerson(k, owner));
  return new Set(held.map((k) => k.userId)).size > 1 ? [] : held;
}

/** The pairing for a wired DIRECTORY or PROJECT — how everything finds its
 *  identity, now that the project file carries none.
 *
 *  A folder's own pairing answers first. Otherwise it matches by projectId or
 *  slug for the folder's person, then falls back to the single connected
 *  project on this machine. */
export async function agentKeyForProject(
  instance: string,
  projectDir?: string,
  agentName?: string,
  projectIdOrSlug?: string,
): Promise<AgentKey | null> {
  const real = (p: string) => realpath(resolve(p)).catch(() => resolve(p));
  const wanted = normalize(instance);
  const entries = Object.values((await read()).keys ?? {}).filter(
    (k) => normalize(k.instance) === wanted,
  );
  if (entries.length === 0) return null;

  const isNamedProject = (k: AgentKey) =>
    k.projectId === projectIdOrSlug ||
    k.projectSlug?.toLowerCase() === projectIdOrSlug?.toLowerCase() ||
    k.space?.toLowerCase() === projectIdOrSlug?.toLowerCase();

  let held: AgentKey[] = [];

  // 1. This folder's own pairing: exact path or subdirectory check
  if (projectDir) {
    const at = await real(projectDir);
    for (const k of entries) {
      const keyPath = await real(k.projectPath ?? k.project);
      if (
        (keyPath === at || at.startsWith(keyPath + "/")) &&
        (!projectIdOrSlug || isNamedProject(k))
      ) {
        held.push(k);
      }
    }
  }

  // 2. If explicit projectIdOrSlug provided, match by id or slug
  if (held.length === 0 && projectIdOrSlug) {
    held = await ownKeys(instance, projectDir, entries.filter(isNamedProject));
  }

  // 3. If still not found, check findProject(projectDir)
  if (held.length === 0 && projectDir) {
    const found = await findWorkspace(projectDir).catch(() => null);
    if (found) {
      const foundId = found.project.projectId;
      const foundSlug = found.project.project || found.project.space;
      const foundRoot = await real(found.root);
      const matching: AgentKey[] = [];
      for (const k of entries) {
        const keyPath = await real(k.projectPath ?? k.project);
        if (
          (foundId && k.projectId === foundId) ||
          (foundSlug && (k.projectSlug === foundSlug || k.space === foundSlug)) ||
          keyPath === foundRoot
        ) {
          matching.push(k);
        }
      }
      held = await ownKeys(instance, projectDir, matching);
    }
  }

  // 4. Fallback: Only when NO projectDir was specified (e.g. global agent invocation without a directory anchor), check if exactly one project is connected on this instance
  if (held.length === 0 && !projectDir) {
    const uniqueProjects = new Set(
      entries.map((k) => k.projectId || k.projectSlug || k.space || k.projectPath || k.project),
    );
    if (uniqueProjects.size === 1) {
      held = entries;
    }
  }

  if (held.length === 0) return null;

  const target = agentName ?? process.env.MEMCELL_AGENT;
  if (target) {
    const forAgent = held.filter((k) => k.agent?.toLowerCase() === target.toLowerCase());
    if (forAgent.length > 0) return forAgent[forAgent.length - 1]!;
    const generic = held.filter((k) => !k.agent);
    if (generic.length > 0) return generic[generic.length - 1]!;
    return null;
  }
  const generic = held.find((k) => !k.agent);
  if (generic) return generic;
  const antigravity = held.find((k) => k.agent?.toLowerCase() === "antigravity");
  if (
    antigravity &&
    (process.env.GEMINI_CLI ||
      process.env.ANTIGRAVITY_AGENT ||
      process.env.AGENT_NAME === "antigravity")
  ) {
    return antigravity;
  }
  return held[held.length - 1] ?? null;
}

/** Every key this machine holds — what `reset` has to be able to describe
 *  before it forgets it, and what tells somebody which projects go quiet. */
export async function agentKeys(): Promise<AgentKey[]> {
  return Object.values((await read()).keys ?? {});
}

/**
 * Returns distinct connected projects stored on this machine.
 */
export async function listConnectedProjects(instance?: string): Promise<
  {
    instance: string;
    projectId?: string;
    projectSlug?: string;
    ownerSlug?: string;
    projectPath?: string;
    agent?: string;
  }[]
> {
  const store = await read();
  const wanted = instance ? normalize(instance) : null;
  const seen = new Set<string>();
  const projects: {
    instance: string;
    projectId?: string;
    projectSlug?: string;
    ownerSlug?: string;
    projectPath?: string;
    agent?: string;
  }[] = [];

  for (const k of Object.values(store.keys ?? {})) {
    const inst = normalize(k.instance);
    if (wanted && inst !== wanted) continue;
    const slug = k.projectSlug ?? k.space;
    const dedupeKey = `${inst}|${k.projectId ?? ""}|${slug ?? ""}|${k.projectPath ?? k.project}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    projects.push({
      instance: k.instance,
      projectId: k.projectId,
      projectSlug: slug,
      ownerSlug: k.ownerSlug,
      projectPath: k.projectPath ?? k.project,
      agent: k.agent,
    });
  }
  return projects;
}

export async function forgetAgentKey(instance: string, keyId: string): Promise<boolean> {
  const store = await read();
  const at = handle(instance, keyId);
  if (!store.keys?.[at]) return false;
  const { [at]: _gone, ...rest } = store.keys;
  await write({ keys: rest });
  return true;
}
