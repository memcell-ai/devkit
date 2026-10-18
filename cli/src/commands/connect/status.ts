import { status } from "../status.js";
import { runCommand, type CliCommand } from "../types.js";

export const statusCommand: CliCommand = {
  command: "status",
  describe: "Show current signed-in user, connected workspace, and active agent hooks",
  builder: (yargs) => yargs,
  handler: runCommand(async (argv) => status(argv._instance!, argv._from ?? "default")),
};
