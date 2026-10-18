import { logout } from "../logout.js";
import { runCommand, type CliCommand } from "../types.js";

export const logoutCommand: CliCommand = {
  command: "logout",
  describe: "Sign out and remove the saved session on this machine",
  builder: (yargs) => yargs,
  handler: runCommand(async (argv) => logout(argv._instance!)),
};
