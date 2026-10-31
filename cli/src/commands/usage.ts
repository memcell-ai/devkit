import { MemCellError } from "@memcell/sdk";
import { get } from "../config.js";
import { credentialFor } from "../instance.js";
import { getSdkClient } from "../sdk-client.js";
import {
  badge,
  bad,
  cmd,
  good,
  label,
  meter,
  place,
  row,
  say,
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
  );
  return 1;
}

export async function getUsage(
  instance: string,
  ownerArg?: string,
  flags: Record<string, string | true> = {},
): Promise<number> {
  if (!(await credentialFor(instance))) {
    needsSession(instance);
    return 1;
  }

  try {
    const sdk = await getSdkClient(instance);
    let owner = ownerArg?.trim() || (typeof flags.owner === "string" ? flags.owner : undefined);

    if (!owner) {
      const activeOrg = (await get("organization"))?.value as string | undefined;
      if (activeOrg) {
        owner = activeOrg;
      } else {
        const profile = await sdk.account.get();
        owner = profile.handle || profile.id;
      }
    }

    if (!owner) {
      say(row(0, [bad("missing owner")]), row(1, [label("specify owner handle or organization")]));
      return 1;
    }

    const timeframe =
      typeof flags.timeframe === "string" &&
      (flags.timeframe === "30d" || flags.timeframe === "90d")
        ? flags.timeframe
        : undefined;

    const data = await sdk.usage.get(owner, { timeframe });

    const { plan, memories } = data.quotas;

    say(
      row(
        0,
        [badge("memcell"), label("usage"), place(data.owner.slug)],
        [variant(data.timeframe)],
        [label("plan:"), good(plan.name)],
      ),
      row(
        1,
        [
          label("memories:"),
          value(memories.used.toLocaleString()),
          ...(memories.limit === null
            ? []
            : [
                label("/"),
                value(memories.limit.toLocaleString()),
                meter(memories.used, memories.limit),
              ]),
        ],
        memories.limit === null ? [label("no fixed limit")] : null,
      ),
      memories.types
        ? row(
            2,
            [label("by type:")],
            ...Object.entries(memories.types).map(([type, count]) => [
              variant(type),
              label(count.toLocaleString()),
            ]),
          )
        : null,
      row(
        1,
        [label("requests:"), value(data.summary.totalIngressCalls.toLocaleString())],
        [label("unlimited")],
      ),
      row(2, [
        label("rate limit:"),
        variant(plan.bypassRateLimits ? "bypassed" : `${plan.rateLimitPerMinute}/min`),
      ]),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}
