import { resolveNamespace } from "../namespace.js";
import { getSdkClient } from "../sdk-client.js";
import {
  badge,
  blank,
  cmd,
  emit,
  good,
  id as idSeg,
  label,
  list,
  place,
  row,
  say,
  time,
  value,
  variant,
  warn,
} from "../ui.js";

function getTargetWorkspace(flags: Record<string, string | true>): string | undefined {
  const raw = typeof flags.workspace === "string" ? flags.workspace : undefined;
  if (!raw) return undefined;
  const ws = raw.trim();
  if (typeof flags.owner === "string" && !ws.includes("/")) {
    return `${flags.owner.trim()}/${ws}`;
  }
  return ws;
}

function refused(instance: string, failure: Error): number {
  say(
    row(0, [badge("memcell"), place(instance)]),
    row(1, [warn("refused")], [label(failure.message)]),
  );
  return 1;
}

export async function listThreads(
  instance: string,
  flags: Record<string, string | true> = {},
): Promise<number> {
  try {
    const sdk = await getSdkClient(instance);
    const target = getTargetWorkspace(flags);
    const namespace = await resolveNamespace(sdk, target);

    const status = typeof flags.status === "string" ? (flags.status as any) : undefined;
    const scope = typeof flags.scope === "string" ? (flags.scope as any) : undefined;
    const entity = typeof flags.entity === "string" ? flags.entity : undefined;
    const q = typeof flags.query === "string" ? flags.query : undefined;
    const page = typeof flags.page === "string" ? parseInt(flags.page, 10) : undefined;
    const limit = typeof flags.limit === "string" ? parseInt(flags.limit, 10) : undefined;

    const res = await sdk.threads.list(namespace, {
      status,
      scope,
      entity,
      q,
      page: Number.isFinite(page) ? page : undefined,
      perPage: Number.isFinite(limit) ? limit : undefined,
    });

    if (flags.json === true) {
      emit(JSON.stringify(res, null, 2) + "\n");
      return 0;
    }

    const items = res.items || [];
    if (items.length === 0) {
      say(
        row(0, [badge("memcell"), label("thread"), place(namespace)]),
        row(1, [label("no session threads found in this workspace")]),
      );
      return 0;
    }

    say(
      row(
        0,
        [badge("memcell"), label("thread"), place(namespace)],
        [variant(`${items.length}${res.pagination?.total ? ` of ${res.pagination.total}` : ""}`)],
      ),
      ...items.flatMap((t: any) => [
        row(
          1,
          [variant(t.status || "active")],
          t.scope === "workspace" ? [variant("shared")] : null,
          [label(`${t.turnCount ?? 1} turns`)],
          [value(t.title)],
        ),
        t.currentObjective ? row(2, [label("objective:"), label(t.currentObjective)]) : null,
        row(2, [idSeg(t.id)]),
      ]),
      blank(),
      row(1, [label("inspect one with"), cmd("memcell thread get <id>")]),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export async function getThread(
  instance: string,
  threadId: string,
  flags: Record<string, string | true> = {},
): Promise<number> {
  try {
    const sdk = await getSdkClient(instance);
    const target = getTargetWorkspace(flags);
    const namespace = await resolveNamespace(sdk, target);

    const detail = await sdk.threads.get(namespace, threadId);
    if (flags.json === true) {
      emit(JSON.stringify(detail, null, 2) + "\n");
      return 0;
    }

    const t = detail.thread;
    const turns = detail.turns || [];
    const memories = detail.memories || [];

    say(
      row(0, [badge("memcell"), label("thread"), place(namespace)], [idSeg(t.id)]),
      row(
        1,
        [variant(t.status || "active")],
        t.scope === "workspace" ? [variant("shared")] : [variant("private")],
        [value(`${t.turnCount ?? turns.length} turns`)],
        t.externalSessionId ? [label(`session:${t.externalSessionId}`)] : null,
        t.lastActiveAt ? [time(String(t.lastActiveAt))] : null,
      ),
      row(1, [label("title:"), value(t.title)]),
      t.currentObjective ? row(2, [label("objective:"), value(t.currentObjective)]) : null,
      t.summary ? row(2, [label("summary:"), label(t.summary)]) : null,
      t.milestones?.length
        ? row(
            2,
            [label("milestones:")],
            [
              list(
                t.milestones.map((m: any) => {
                  const title = m.phase || m.title;
                  return title ? `${title}: ${m.summary}` : String(m.summary || "");
                }),
              ),
            ],
          )
        : null,
      t.decisions?.length ? row(2, [label("decisions:")], [list(t.decisions)]) : null,
      t.nextSteps?.length ? row(2, [label("next steps:")], [list(t.nextSteps)]) : null,
      t.resources?.length ? row(2, [label("resources:")], [list(t.resources)]) : null,
      t.entities?.length ? row(2, [label("entities:")], [list(t.entities)]) : null,
      ...(turns.length > 0
        ? [
            row(1, [label(`activity trail (${turns.length} turns):`)]),
            ...turns.flatMap((turn: any) => {
              const turnSummary = turn.summary || turn.agentOutcome || turn.userIntent || "";
              return [
                row(
                  2,
                  [variant(`turn #${turn.turnIndex}`)],
                  turn.createdAt ? [time(String(turn.createdAt))] : null,
                  turnSummary ? [label(turnSummary)] : null,
                ),
                ...(Array.isArray(turn.actions)
                  ? turn.actions.map((act: any) => {
                      const actType = act.category || act.type || "action";
                      const actName = act.tool || act.name || "tool";
                      const actSummary = act.inputSummary || act.outputSummary || act.summary || "";
                      return row(
                        3,
                        [variant(actType)],
                        [value(actName)],
                        act.target ? [label(act.target)] : null,
                        actSummary ? [label(actSummary)] : null,
                      );
                    })
                  : []),
              ];
            }),
          ]
        : []),
      ...(memories.length > 0
        ? [
            row(1, [label(`distilled memories (${memories.length}):`)]),
            ...memories.map((m: any) =>
              row(2, [variant(m.type || "fact")], [idSeg(m.id)], [label(m.title)]),
            ),
          ]
        : []),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export async function updateThreadStatus(
  instance: string,
  threadId: string,
  status: "active" | "paused" | "completed",
  flags: Record<string, string | true> = {},
): Promise<number> {
  try {
    const sdk = await getSdkClient(instance);
    const target = getTargetWorkspace(flags);
    const namespace = await resolveNamespace(sdk, target);

    const updated = await sdk.threads.update(namespace, threadId, { status });
    say(
      row(0, [badge("memcell"), label("thread"), place(namespace)]),
      row(1, [good(`marked ${updated.status}`)], [idSeg(updated.id)], [label(updated.title)]),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export async function updateThreadScope(
  instance: string,
  threadId: string,
  scope: "user" | "workspace",
  flags: Record<string, string | true> = {},
): Promise<number> {
  try {
    const sdk = await getSdkClient(instance);
    const target = getTargetWorkspace(flags);
    const namespace = await resolveNamespace(sdk, target);

    const updated = await sdk.threads.update(namespace, threadId, { scope });
    say(
      row(0, [badge("memcell"), label("thread"), place(namespace)]),
      row(
        1,
        [good(scope === "workspace" ? "shared with workspace" : "set to private (user)")],
        [idSeg(updated.id)],
        [label(updated.title)],
      ),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export async function deleteThread(
  instance: string,
  threadId: string,
  flags: Record<string, string | true> = {},
): Promise<number> {
  try {
    const sdk = await getSdkClient(instance);
    const target = getTargetWorkspace(flags);
    const namespace = await resolveNamespace(sdk, target);

    await sdk.threads.delete(namespace, threadId);
    say(
      row(0, [badge("memcell"), label("thread"), place(namespace)]),
      row(1, [good("deleted")], [idSeg(threadId)]),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}
