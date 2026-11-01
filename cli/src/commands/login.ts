import { deviceGrant } from "../grant.js";
import { call } from "../client.js";
import { folderAccount } from "../instance.js";
import { findWorkspace } from "../workspace.js";
import { getSdkClient } from "../sdk-client.js";
import {
  badge,
  cmd,
  good,
  bad,
  label,
  place,
  row,
  say,
  value,
  variant,
  warn,
  type Row,
} from "../ui.js";

// This machine, and who is behind it. A terminal cannot hold a browser
// session, so it takes the standard device grant (shared in ../grant): ask
// for a code, show it, let a human approve it in a browser, then exchange
// it for a session this machine can spend.
//
// It signs in and stops there, adding the account beside any already here.
// Wiring a project to a space is `connect`, and keeping the two apart is the
// point — one is about this machine and outlives every directory on it, the
// other is about one directory and can happen many times over.

/**
 * What is true about THIS directory, now the machine is signed in.
 *
 * It used to recite "wire a project with memcell connect" whatever the state
 * was. Somebody read that, started their coding agent instead, and had a
 * whole session where the hooks fired and did nothing — with no step in
 * between ever checking whether this directory could run the loop.
 */
async function hereNext(instance: string, userId: string): Promise<Row[]> {
  const found = await findWorkspace(process.cwd());
  if (!found) return [row(2, [warn("not connected here")], [label("run"), cmd("memcell connect")])];
  const owner = await folderAccount(instance);
  return [
    row(2, [good("connected here")], [value(found.project.space)]),
    ...(owner && owner.userId !== userId
      ? [row(2, [label("this folder stays with"), value(owner.email ?? "its own account")])]
      : []),
  ];
}

export async function login(
  instance: string,
  options: { noBrowser?: boolean; sso?: string } = {},
): Promise<number> {
  if (options.sso) {
    try {
      let lookup: any;
      const sdk = await getSdkClient(instance, { anonymous: true });
      if (typeof (sdk.organizations as any)?.sso?.lookup === "function") {
        lookup = await (sdk.organizations as any).sso.lookup(options.sso);
      } else {
        const param = options.sso.includes("@") ? "email" : "domain";
        lookup = await call<any>(
          instance,
          `/api/v1/auth/sso/lookup?${param}=${encodeURIComponent(options.sso)}`,
          { anonymous: true },
        );
      }

      say(
        row(0, [badge("memcell"), label("enterprise sso"), place(lookup.organization.name)]),
        row(1, [good("domain verified")], [label(lookup.domain)]),
        row(2, [label("authenticating via"), variant(lookup.provider.providerId)]),
      );
    } catch (error) {
      say(
        row(0, [badge("memcell"), label("enterprise sso"), place(options.sso)]),
        row(1, [bad("sso lookup failed")], [label((error as Error).message)]),
      );
      return 1;
    }
  }

  const user = await deviceGrant(instance, {
    noBrowser: options.noBrowser,
    retry: options.sso ? `memcell login --sso ${options.sso}` : "memcell login",
  });
  if (!user) return 1;

  const who = user.isAnonymous ? "you, so far" : `${user.name} · ${user.email}`;
  say(
    row(0, [badge("memcell"), place(instance)]),
    row(1, [good("connected")], [value(who)]),
    ...(await hereNext(instance, user.id)),
    user.isAnonymous && row(2, [label("sign in to keep this account")]),
  );
  return 0;
}
