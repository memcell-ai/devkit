import { disconnect } from "../hook.js";
import { runCommand, type CliCommand } from "../types.js";

export const disconnectCommand: CliCommand = {
  command: "disconnect",
  describe:
    "Disconnect this directory, remove local agent hooks, and clear local workspace binding",
  builder: (yargs) => yargs,
  handler: runCommand(async () => disconnect()),
};
