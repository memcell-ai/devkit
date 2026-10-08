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

    const rawMem = (data.quotas as any)?.memories;
    const memTotal = Number(rawMem?.used ?? rawMem?.total ?? 0);
    const memLimit = typeof rawMem?.limit === "number" ? rawMem.limit : 0;
    const memTypes = rawMem?.types;

    const apiRequestsRaw = (data.quotas as any)?.apiRequests;
    const apiRequestsTotal = Number(
      apiRequestsRaw?.total ??
        apiRequestsRaw?.used ??
        (data as any).summary?.totalIngressCalls ??
        0,
    );
    const apiRequestsLimit = apiRequestsRaw?.limit ?? 0;

    say(
      row(
        0,
        [badge("memcell"), label("usage"), place(data.owner?.slug || owner)],
        data.timeframe ? [variant(data.timeframe)] : null,
        data.rateLimits?.tier ? [label("tier:"), good(data.rateLimits.tier)] : null,
      ),
      row(
        1,
        [label("memories:")],
        [value(memTotal.toLocaleString())],
        memLimit > 0
          ? [label("/"), value(memLimit.toLocaleString()), meter(memTotal, memLimit)]
          : null,
      ),
      ...(memTypes
        ? [
            row(
              2,
              [label("by type:")],
              ...Object.entries(memTypes).map(([t, count]) => [
                variant(t),
                label(Number(count).toLocaleString()),
              ]),
            ),
          ]
        : []),
      row(
        1,
        [label("api requests:")],
        [value(apiRequestsTotal.toLocaleString())],
        apiRequestsLimit > 0
          ? [
              label("/"),
              value(apiRequestsLimit.toLocaleString()),
              meter(apiRequestsTotal, apiRequestsLimit),
            ]
          : null,
      ),
      data.rateLimits
        ? row(
            2,
            [label("rate limits:")],
            [variant(`${data.rateLimits.recallRpm} recall/min`)],
            [variant(`${data.rateLimits.rememberRpm} remember/min`)],
          )
        : null,
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}
