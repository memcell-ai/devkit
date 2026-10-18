// Which moment an act belongs to, decided structurally from the adapter's guard table.
//
// The record holds five words every trade shares — read, change, record,
// send, answer — and knows nothing about tools, because it outlives whichever
// agents exist. Each adapter's `guard.tools` table maps its tool names to
// those five action classes.
//
// It runs before every tool call, so it costs no call of its own: the memories
// came down once with the turn's recall, and this only decides which of them
// apply now.

import type { Guard } from "../adapters/surface.js";

export type ActClass = "read" | "change" | "record" | "send" | "answer";

/**
 * All action classes declared for `tool` in the adapter's `guard.tools` surface.
 */
export function actsOf(tool: string, guard: Guard): ActClass[] {
  return (Object.entries(guard.tools) as [ActClass, string[]][])
    .filter(([, tools]) => tools.includes(tool))
    .map(([act]) => act);
}

/**
 * The unambiguous action class this tool belongs to when the adapter's
 * `guard.tools` table assigns it to a single class, or null when the tool is
 * multi-purpose (e.g., a shell runner) and requires memory resource/scope
 * evaluation in `pre-act.ts`.
 */
export function actOf(
  tool: string,
  _input: Record<string, unknown> | undefined,
  guard: Guard,
): ActClass | null {
  const named = actsOf(tool, guard);
  if (named.length === 1) return named[0]!;
  return null;
}
