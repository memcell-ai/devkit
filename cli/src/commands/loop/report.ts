import { report } from "../report.js";
import { runCommand, toFlagsRecord, type CliCommand } from "../types.js";

export interface ReportArgs {
  memory?: string;
  "memory-id"?: string;
  outcome?: string;
  summary?: string;
  note?: string;
  reason?: string;
}

export const reportCommand: CliCommand<ReportArgs> = {
  command: "report [memory] [outcome]",
  describe: "Report an outcome (worked, failed, avoided) to calibrate memory confidence",
  builder: (yargs) =>
    yargs
      .positional("memory", {
        type: "string",
        describe: "Target memory ID from recall",
      })
      .positional("outcome", {
        type: "string",
        choices: ["worked", "failed", "avoided"] as const,
        describe: "Outcome verdict (worked, failed, avoided)",
      })
      .option("memory-id", {
        type: "string",
        describe: "Target memory ID (alternative to positional)",
      })
      .option("note", {
        alias: ["summary", "reason"],
        type: "string",
        describe: "Brief note explaining what happened",
      }),
  handler: runCommand(async (argv) => {
    const memoryId = argv.memory || argv["memory-id"];
    const outcome = argv.outcome;
    if (!memoryId || !outcome) {
      throw new Error(
        "memcell report requires a memory ID and an outcome (worked | failed | avoided)",
      );
    }
    return report(
      memoryId,
      outcome,
      argv.note ?? argv.summary ?? argv.reason,
      argv.url,
      toFlagsRecord(argv, ["memory", "outcome"]),
    );
  }),
};
