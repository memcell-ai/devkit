import { spawn } from "node:child_process";
import { hostname } from "node:os";
import { basename } from "node:path";

import { claimFolders, nameSavedSession } from "./accounts.js";
import { call, whoIs, type MemcellError, type Session } from "./client.js";
import { saveCredential } from "./instance.js";
import { bad, cmd, label, place, row, say, value, variant, warn, badge } from "./ui.js";

// The standard device grant (RFC 8628), shared by every command that needs
// this machine signed in: ask for a code, show it, let a human approve it
// in a browser — anonymous or signed in — then exchange it for a session
// this machine can spend. `login` is this and a report; bare `connect` is
// this and then the key.

function resolveClientId(): string {
  try {
    return `memcell-cli · ${basename(process.cwd())} (${hostname()})`;
  } catch {
    return "memcell-cli";
  }
}

interface Grant {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface Token {
  access_token: string;
  token_type: string;
}

/**
 * Open the approval page if this machine can; say so plainly if it cannot.
 *
 * The URL comes from the INSTANCE, over the wire, and on Windows it is
 * handed to `cmd`. A `--url` pointed at a hostile or compromised host
 * could therefore choose what a person's shell runs. So it is parsed before
 * it is spawned, must be http(s), and must belong to the instance the
 * person named — a device grant that sends you somewhere else is not a
 * device grant.
 */
export function openBrowserTarget(url: string, instance: string): string | null {
  let target: URL;
  let home: URL;
  try {
    target = new URL(url);
    home = new URL(instance);
  } catch {
    return null;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return null;
  if (target.origin !== home.origin) return null;
  // Serialised, not the raw string: URL encoding escapes quotes and the
  // characters a command line would otherwise treat as its own.
  return target.href;
}

function openBrowser(url: string, instance: string): boolean {
  const safe = openBrowserTarget(url, instance);
  if (!safe) return false;
  try {
    // Windows: `start` is cmd's own, its first QUOTED argument is a window
    // title, and an args array with `shell: true` is the exact shape Node
    // deprecated (DEP0190). So: cmd /c start with an empty title and the
    // url quoted verbatim — no shell, nothing for cmd to split on.
    const child =
      process.platform === "win32"
        ? spawn("cmd", ["/c", "start", '""', `"${safe}"`], {
            stdio: "ignore",
            detached: true,
            windowsVerbatimArguments: true,
          })
        : spawn(process.platform === "darwin" ? "open" : "xdg-open", [safe], {
            stdio: "ignore",
            detached: true,
          });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Adds the approved account to this machine beside any already here. The
 * account is asked for rather than assumed: the browser that approved may have
 * been signed in as anybody.
 */
async function keepSession(instance: string, token: string): Promise<Session["user"] | null> {
  const session = await whoIs(instance, token).catch(() => null);
  if (!session) {
    say(row(1, [warn("refused")], [label("the instance did not say who signed in")]));
    return null;
  }
  await nameSavedSession(instance);
  await saveCredential({
    instance,
    token,
    obtainedAt: new Date().toISOString(),
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  await claimFolders(instance);
  return session.user;
}

/**
 * Run the grant to a saved credential. Prints the code, the page, and every
 * ending in the terminal's own voice; the caller only needs who signed in.
 * `retry` is what to tell somebody to run again on an expired code — the
 * command they are actually in.
 */
export async function deviceGrant(
  instance: string,
  options: { noBrowser?: boolean; retry: string },
): Promise<Session["user"] | null> {
  const clientId = resolveClientId();
  let grant: Grant;
  try {
    grant = await call<Grant>(instance, "/api/auth/device/code", {
      method: "POST",
      anonymous: true,
      body: { client_id: clientId, scope: "memory" },
    });
  } catch (error) {
    say(
      row(0, [badge("memcell"), place(instance)]),
      row(1, [bad("unreachable")], [label((error as MemcellError).message)]),
    );
    return null;
  }

  // Headless boxes, CI, and anyone who would rather paste the link than
  // have a window thrown at them.
  const noBrowser =
    options.noBrowser || Boolean(process.env.MEMCELL_NO_BROWSER) || Boolean(process.env.CI);
  const opened = noBrowser ? false : openBrowser(grant.verification_uri_complete, instance);

  say(
    row(0, [badge("memcell"), place(instance)], [variant("connecting")]),
    row(1, [label("code"), value(grant.user_code)], [label("at"), place(grant.verification_uri)]),
    row(2, [
      label(
        opened
          ? "opening your browser — approve there and this will continue"
          : "open that page on any device (phone included) and enter the code",
      ),
    ]),
    // The code belongs to the first account that answers it, so say which
    // window to finish in rather than letting a second one fail obscurely.
    opened && row(2, [label("finish in the window that opened")]),
    opened && row(2, [label("to sign in as someone else, choose it on that page")]),
  );

  // Clamped, because these two numbers come from the instance and drive a
  // loop. A malformed or hostile body — `expires_in: null`, `interval: 0` —
  // otherwise turns approval into an unbounded hot loop against the token
  // endpoint, from the person's own machine.
  const seconds = Number(grant.expires_in);
  const paceSeconds = Number(grant.interval);
  const deadline =
    Date.now() + (Number.isFinite(seconds) ? Math.min(Math.max(seconds, 60), 1800) : 900) * 1000;
  let interval = (Number.isFinite(paceSeconds) ? Math.min(Math.max(paceSeconds, 1), 30) : 5) * 1000;

  for (;;) {
    await wait(interval);
    if (Date.now() > deadline) {
      say(row(1, [warn("the code expired")], [label("run"), cmd(options.retry), label("again")]));
      return null;
    }

    try {
      const token = await call<Token>(instance, "/api/auth/device/token", {
        method: "POST",
        anonymous: true,
        body: {
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: grant.device_code,
          client_id: clientId,
        },
      });

      return await keepSession(instance, token.access_token);
    } catch (error) {
      const failure = error as MemcellError;
      const code = (failure.body as { error?: string } | null)?.error;

      if (code === "authorization_pending") continue;
      // The server sets the pace; being told to slow down is not a failure.
      if (code === "slow_down") {
        interval += 5000;
        continue;
      }
      if (code === "access_denied") {
        say(row(1, [warn("denied in the browser")], [label("nothing was connected")]));
        return null;
      }
      if (code === "expired_token") {
        say(row(1, [warn("the code expired")], [label("run"), cmd(options.retry), label("again")]));
        return null;
      }
      say(row(1, [warn("refused")], [label(failure.message)]));
      return null;
    }
  }
}
