import { call, MemcellError } from "../client.js";
import { nameSavedSession } from "../accounts.js";
import { accountsOn, credentialFor, forgetAccount, type Credential } from "../instance.js";
import { badge, good, label, place, row, say, value, variant, warn } from "../ui.js";

// The exact inverse of `login`, and nothing more: end a session on the
// instance, then forget it here. It leaves linked projects alone, because
// they are not what signing in created — `hook remove` undoes those, one
// directory at a time.
//
// If the instance cannot be reached the local credential still goes. A
// machine you are walking away from should not keep a token because the
// network was down.

async function signOut(instance: string, credential: Credential): Promise<string | null> {
  let remoteFailure: string | null = null;
  try {
    await call(instance, "/api/auth/sign-out", {
      method: "POST",
      body: {},
      bearer: credential.token,
    });
  } catch (error) {
    remoteFailure = (error as MemcellError).message;
  }
  await forgetAccount(instance, credential);
  return remoteFailure;
}

async function targets(
  instance: string,
  options: { account?: string; all?: boolean },
): Promise<Credential[]> {
  await nameSavedSession(instance);
  if (options.all) return accountsOn(instance);
  if (options.account) {
    const wanted = options.account.toLowerCase();
    return (await accountsOn(instance)).filter(
      (account) => account.email?.toLowerCase() === wanted || account.userId === options.account,
    );
  }
  const credential = await credentialFor(instance);
  return credential ? [credential] : [];
}

export async function logout(
  instance: string,
  options: { account?: string; all?: boolean } = {},
): Promise<number> {
  const leaving = await targets(instance, options);
  if (leaving.length === 0) {
    say(
      row(0, [badge("memcell"), place(instance)]),
      row(
        1,
        [label(options.account ? `${options.account} is not signed in` : "not connected")],
        [label("nothing to sign out of")],
      ),
    );
    return 0;
  }

  const rows = [];
  for (const credential of leaving) {
    const remoteFailure = await signOut(instance, credential);
    rows.push(
      row(
        1,
        [good("signed out")],
        credential.email ? [value(credential.email)] : null,
        remoteFailure ? [variant("local only")] : null,
      ),
      remoteFailure ? row(2, [warn("the instance was not reached")], [label(remoteFailure)]) : null,
    );
  }
  const remaining = await accountsOn(instance);
  say(
    row(0, [badge("memcell"), place(instance)]),
    ...rows,
    remaining.length > 0
      ? row(2, [
          label("still signed in"),
          value(remaining.map((account) => account.email ?? account.name ?? "unnamed").join(", ")),
        ])
      : null,
  );
  return 0;
}
