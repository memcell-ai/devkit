import { logout } from "../logout.js";
import { runCommand, type CliCommand } from "../types.js";

export interface LogoutArgs {
  account?: string;
  all?: boolean;
}

export const logoutCommand: CliCommand<LogoutArgs> = {
  command: "logout [account]",
  describe: "Sign out an account and remove its saved session on this machine",
  builder: (yargs) =>
    yargs
      .positional("account", {
        type: "string",
        describe: "Email of the account to sign out (default: the one in use here)",
      })
      .option("all", {
        type: "boolean",
        describe: "Sign out every account on this instance",
      }),
  handler: runCommand(async (argv) =>
    logout(argv._instance!, { account: argv.account, all: Boolean(argv.all) }),
  ),
};
