import { hook, hookInstall, hookRemove, hookVerify } from "../hook.js";
import { runCommand, type CliCommand } from "../types.js";

const statusHookCmd: CliCommand<{ agent?: string }> = {
  command: ["status [agent]", "verify [agent]"],
  describe: "Inspect and verify configured lifecycle hooks for an agent",
  builder: (yargs) =>
    yargs
      .positional("agent", {
        type: "string",
        describe: "Optional agent harness name (e.g. claude, cursor, antigravity)",
      })
      .option("agent", {
        type: "string",
        describe: "Optional agent harness name",
      }),
  handler: runCommand(async (argv) => hookVerify(argv.agent)),
};

const installHookCmd: CliCommand<{ agent?: string }> = {
  command: "install [agent]",
  describe: "Install local lifecycle hooks for detected or specified agent",
  builder: (yargs) =>
    yargs.positional("agent", {
      type: "string",
      describe: "Optional agent harness name (e.g. claude, cursor, antigravity)",
    }),
  handler: runCommand(async (argv) => hookInstall(argv.agent)),
};

const removeHookCmd: CliCommand = {
  command: "remove",
  describe: "Remove installed MemCell hooks and local workspace wiring from this directory",
  builder: (yargs) => yargs,
  handler: runCommand(async () => hookRemove()),
};

const runHookCmd: CliCommand<{ moment: string; program: string; agent?: string }> = {
  command: "run <moment> <program>",
  describe: "Execute a lifecycle hook moment for an agent program",
  builder: (yargs) =>
    yargs
      .positional("moment", {
        type: "string",
        demandOption: true,
        describe: "Lifecycle moment (session-start, prompt-submit, pre-act, after-act, turn-end)",
      })
      .positional("program", {
        type: "string",
        demandOption: true,
        describe: "Agent harness identifier",
      })
      .option("agent", {
        type: "string",
        describe: "Wired agent ID",
      }),
  handler: runCommand(async (argv) => hook(argv.moment, argv.program)),
};

export const hookCommand: CliCommand<{ moment?: string; program?: string; agent?: string }> = {
  command: "hook [moment] [program]",
  describe: "Manage and verify local agent lifecycle hooks",
  builder: (yargs) =>
    yargs
      .command(statusHookCmd)
      .command(installHookCmd)
      .command(removeHookCmd)
      .command(runHookCmd)
      .positional("moment", {
        type: "string",
        describe: "Lifecycle moment (when invoked by an installed agent hook)",
      })
      .positional("program", {
        type: "string",
        describe: "Agent harness program name",
      })
      .option("agent", {
        type: "string",
        describe: "Wired agent ID",
      }),
  handler: runCommand(async (argv) => {
    if (!argv.moment) {
      return hookVerify(argv.agent);
    }
    return hook(argv.moment, argv.program ?? "");
  }),
};
