import { remember } from "../remember.js";
import { runCommand, toFlagsRecord, type CliCommand } from "../types.js";

export interface RememberArgs {
  text: string;
  type?: string;
  at?: string;
  scope?: string;
  "my-memory"?: boolean;
  my?: boolean;
  meta?: string;
  subject?: string;
  target?: string;
  roles?: string;
  context?: string;
  observation?: string;
  enforce?: boolean;
}

export const rememberCommand: CliCommand<RememberArgs> = {
  command: "remember <text>",
  describe: "Save an atomic memory (instruction, decision, fact, or preference)",
  builder: (yargs) =>
    yargs
      .positional("text", {
        type: "string",
        demandOption: true,
        describe: "The memory claim or directive",
      })
      .option("type", {
        type: "string",
        choices: ["instruction", "decision", "fact", "preference"] as const,
        describe: "Memory categorization type",
      })
      .option("at", {
        type: "string",
        describe: "Comma-separated lifecycle moments (read, change, record, send, answer)",
      })
      .option("scope", {
        type: "string",
        describe: "Target scope (defaults to user / My Memory)",
      })
      .option("my-memory", {
        alias: "my",
        type: "boolean",
        describe: "Save in personal My Memory scope",
      })
      .option("meta", {
        type: "string",
        describe: "Structured JSON metadata",
      })
      .option("subject", {
        alias: "target",
        type: "string",
        describe: "Domain entity or topic anchor",
      })
      .option("roles", {
        type: "string",
        describe: "Comma-separated required roles for RBAC",
      })
      .option("context", {
        type: "string",
        describe: "Contextual background or rationale",
      })
      .option("observation", {
        type: "string",
        describe: "Empirical observation or evidence anchor",
      })
      .option("enforce", {
        type: "boolean",
        describe: "Enforce as a strict operational guard instruction",
      }),
  handler: runCommand(async (argv) =>
    remember(
      argv.text,
      argv.type,
      argv.at,
      argv.url,
      argv.scope ?? (argv["my-memory"] || argv.my ? "user" : undefined),
      argv.meta,
      argv.subject ?? argv.target,
      argv.roles,
      argv.context,
      argv.observation,
      argv.enforce,
      toFlagsRecord(argv, ["text"]),
    ),
  ),
};
