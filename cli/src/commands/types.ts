import type { ArgumentsCamelCase, CommandModule } from "yargs";
import type { ResolvedContext } from "../model.js";

export interface GlobalArgs {
  url?: string;
  workspace?: string;
  project?: string;
  owner?: string;
  json?: boolean;
  _instance?: string;
  _from?: string;
  _context?: ResolvedContext;
}

export type CliCommand<T = Record<string, unknown>> = CommandModule<GlobalArgs, GlobalArgs & T>;

let currentExitCode = 0;

export function setExitCode(code: number): void {
  currentExitCode = code;
}

export function getExitCode(): number {
  return currentExitCode;
}

export function resetExitCode(code = 0): void {
  currentExitCode = code;
}

export function runCommand<T = Record<string, unknown>>(
  fn: (argv: ArgumentsCamelCase<GlobalArgs & T>) => Promise<number> | number,
): (argv: ArgumentsCamelCase<GlobalArgs & T>) => Promise<void> {
  return async (argv: ArgumentsCamelCase<GlobalArgs & T>) => {
    const code = await fn(argv);
    setExitCode(code);
  };
}

/**
 * Converts strongly-typed yargs camelCase/kebab-case arguments into the flat
 * Record<string, string | true> shape expected by command implementation functions.
 */
export function toFlagsRecord(
  argv: Record<string, unknown>,
  excludeKeys: string[] = [],
): Record<string, string | true> {
  const excluded = new Set(["_", "$0", "_instance", "_from", "_context", ...excludeKeys]);
  const out: Record<string, string | true> = {};
  for (const [key, val] of Object.entries(argv)) {
    if (excluded.has(key) || val === undefined || val === false || val === null) continue;
    if (val === true) {
      out[key] = true;
    } else if (typeof val === "number") {
      out[key] = String(val);
    } else if (typeof val === "string") {
      out[key] = val;
    }
  }
  return out;
}
