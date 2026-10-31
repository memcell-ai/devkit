import { MemCellError } from "@memcell/sdk";
import { upgradeHint } from "../client.js";
import { credentialFor } from "../instance.js";
import { getSdkClient } from "../sdk-client.js";
import {
  badge,
  bad,
  cmd,
  good,
  id as idSeg,
  label,
  place,
  row,
  say,
  time,
  value,
  variant,
  warn,
} from "../ui.js";

const needsSession = (instance: string) =>
  say(
    row(0, [badge("memcell"), place(instance)]),
    row(1, [warn("not signed in")], [label("run"), cmd("memcell login")]),
  );

function refused(instance: string, failure: Error): number {
  say(
    row(0, [badge("memcell"), place(instance)]),
    row(1, [warn("refused")], [label(failure.message)]),
    upgradeHint(failure),
  );
  return 1;
}

export async function getProfile(instance: string): Promise<number> {
  if (!(await credentialFor(instance))) {
    needsSession(instance);
    return 1;
  }

  try {
    const sdk = await getSdkClient(instance);
    const profile = await sdk.account.get();

    say(
      row(0, [badge("memcell"), label("account"), place(instance)]),
      row(
        1,
        [good(profile.name || profile.handle || "user")],
        profile.email ? [label(profile.email)] : null,
        profile.handle ? [variant(`@${profile.handle}`)] : null,
      ),
      row(2, [idSeg(profile.id)]),
      profile.createdAt ? row(2, [label("member since:"), time(String(profile.createdAt))]) : null,
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export async function updateProfile(
  instance: string,
  flags: Record<string, string | true> = {},
): Promise<number> {
  if (!(await credentialFor(instance))) {
    needsSession(instance);
    return 1;
  }

  const name = typeof flags.name === "string" ? flags.name : undefined;
  if (!name) {
    say(row(0, [bad("missing name")], [label("specify --name <new-name>")]));
    return 1;
  }

  try {
    const sdk = await getSdkClient(instance);
    const updated = await sdk.account.updateProfile({ name });

    say(
      row(0, [badge("memcell"), label("account update"), place(instance)]),
      row(1, [good("updated profile name")], [value(updated.name || name)]),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export async function listApiKeys(instance: string): Promise<number> {
  if (!(await credentialFor(instance))) {
    needsSession(instance);
    return 1;
  }

  try {
    const sdk = await getSdkClient(instance);
    const keys = await sdk.account.apiKeys.list();

    if (keys.length === 0) {
      say(
        row(0, [badge("memcell"), label("account key"), place(instance)]),
        row(1, [label("no API keys found")]),
        row(2, [label("create one with"), cmd("memcell account key create <name>")]),
      );
      return 0;
    }

    say(
      row(
        0,
        [badge("memcell"), label("account key"), place(instance)],
        [variant(`${keys.length}`)],
      ),
      ...keys.map((k) =>
        row(
          1,
          [good(k.name)],
          [variant(k.preview || k.prefix || "")],
          k.expiresAt ? [label("expires:"), time(String(k.expiresAt))] : null,
          [idSeg(k.id)],
        ),
      ),
      row(2, [label("revoke one with"), cmd("memcell account key revoke <id>")]),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export const listTokens = listApiKeys;

export async function createApiKey(
  instance: string,
  name: string,
  flags: Record<string, string | true> = {},
): Promise<number> {
  if (!(await credentialFor(instance))) {
    needsSession(instance);
    return 1;
  }

  const expiresInDays = typeof flags.expires === "string" ? parseInt(flags.expires, 10) : undefined;

  try {
    const sdk = await getSdkClient(instance);
    const key = await sdk.account.apiKeys.create({
      name,
      expiresInDays: Number.isFinite(expiresInDays) ? expiresInDays : undefined,
    });

    say(
      row(0, [badge("memcell"), label("account key create"), place(instance)]),
      row(1, [good("created API key")], [value(key.name)], [idSeg(key.id)]),
      row(2, [
        label("key:"),
        value(key.key || key.token || (key as any).rawKey || (key as any).rawToken),
      ]),
      row(2, [label("copy this key now — it will never be displayed again")]),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export const createToken = createApiKey;

export async function revokeApiKey(instance: string, keyId: string): Promise<number> {
  if (!(await credentialFor(instance))) {
    needsSession(instance);
    return 1;
  }

  try {
    const sdk = await getSdkClient(instance);
    await sdk.account.apiKeys.revoke(keyId);

    say(
      row(0, [badge("memcell"), label("account key revoke"), place(instance)]),
      row(1, [good("revoked API key")], [idSeg(keyId)]),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export const revokeToken = revokeApiKey;

export async function getInvitation(instance: string, invitationId: string): Promise<number> {
  if (!(await credentialFor(instance))) {
    needsSession(instance);
    return 1;
  }

  try {
    const sdk = await getSdkClient(instance);
    const inv = await sdk.invitations.get(invitationId);

    say(
      row(0, [badge("memcell"), label("invitation"), place(instance)], [idSeg(invitationId)]),
      row(1, [good(inv.email)], [variant(inv.role || "member")]),
      inv.organizationSlug ? row(2, [label("organization:"), value(inv.organizationSlug)]) : null,
      row(2, [label("accept with"), cmd(`memcell account invitation accept ${invitationId}`)]),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export async function acceptInvitation(instance: string, invitationId: string): Promise<number> {
  if (!(await credentialFor(instance))) {
    needsSession(instance);
    return 1;
  }

  try {
    const sdk = await getSdkClient(instance);
    const res = await sdk.invitations.accept(invitationId);

    say(
      row(0, [badge("memcell"), label("account invitation accept"), place(instance)]),
      row(1, [good("accepted invitation")], [idSeg(invitationId)]),
      res.organizationSlug
        ? row(2, [label("organization context:"), value(res.organizationSlug)])
        : null,
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export async function declineInvitation(instance: string, invitationId: string): Promise<number> {
  if (!(await credentialFor(instance))) {
    needsSession(instance);
    return 1;
  }

  try {
    const sdk = await getSdkClient(instance);
    await sdk.invitations.decline(invitationId);

    say(
      row(0, [badge("memcell"), label("account invitation decline"), place(instance)]),
      row(1, [good("declined invitation")], [idSeg(invitationId)]),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}
