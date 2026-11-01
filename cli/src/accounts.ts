import { agentStanding, whoIs } from "./client.js";
import { bindFolder, nameUnnamedSession, normalize, unnamedSession } from "./instance.js";
import { agentKeys, stampAgentKey } from "./keyring.js";

// What it takes the instance to answer about the accounts on this machine.

/** Asks whose the session saved before accounts had names is. An instance that
 *  cannot be reached says nothing about that session, so it stays. */
export async function nameSavedSession(instance: string): Promise<void> {
  const token = await unnamedSession(instance);
  if (!token) return;
  const session = await whoIs(instance, token).catch(() => undefined);
  if (session === undefined) return;
  await nameUnnamedSession(instance, session?.user ?? null);
}

/** Ties each connected folder to the person its keys belong to, so a new
 *  account arriving on this machine leaves those folders where they were. */
export async function claimFolders(instance: string): Promise<void> {
  const wanted = normalize(instance);
  for (const held of await agentKeys()) {
    if (normalize(held.instance) !== wanted) continue;
    const userId =
      held.userId ?? (await agentStanding(instance, held.key).catch(() => null))?.userId;
    if (!userId) continue;
    if (!held.userId) await stampAgentKey(held, userId);
    await bindFolder(instance, held.projectPath ?? held.project, { userId });
  }
}
