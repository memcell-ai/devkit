import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { projectDir, type ProjectLogScope } from "./session.js";

/** What a teammate gets from joining, in the words the CLI uses everywhere. */
export const INVITE_GIVES =
  "Once they join, their agents recall what this workspace shares. Your My Memory stays private.";

/** The one line a person sees after their first useful recall, while nobody else is in. */
export const inviteNotice = (workspacePath: string): string =>
  `memcell: You're the only one in ${workspacePath}. Invite a teammate and their agents recall what this workspace shares: memcell invite <email>`;

const MARKER = "invite-suggested";

/** Whether this machine already suggested inviting someone to this workspace. Once is enough. */
export async function suggestedInvite(scope: ProjectLogScope | undefined): Promise<boolean> {
  if (!scope) return true;
  return access(join(projectDir(scope), MARKER)).then(
    () => true,
    () => false,
  );
}

export async function rememberSuggestedInvite(scope: ProjectLogScope | undefined): Promise<void> {
  if (!scope) return;
  const dir = projectDir(scope);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, MARKER), new Date().toISOString());
}
