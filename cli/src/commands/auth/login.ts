import { login } from "../login.js";
import { runCommand, type CliCommand } from "../types.js";

export interface LoginArgs {
  force?: boolean;
  "no-browser"?: boolean;
  sso?: string;
}

export const loginCommand: CliCommand<LoginArgs> = {
  command: "login",
  describe: "Sign this machine in to a MemCell instance",
  builder: (yargs) =>
    yargs
      .option("force", {
        alias: "f",
        type: "boolean",
        describe: "Sign in again even if a valid session already exists",
      })
      .option("no-browser", {
        type: "boolean",
        describe: "Print the verification URL instead of opening a browser",
      })
      .option("sso", {
        type: "string",
        describe: "Single Sign-On organization handle",
      }),
  handler: runCommand(async (argv) =>
    login(argv._instance!, {
      force: Boolean(argv.force),
      noBrowser: Boolean(argv["no-browser"]),
      sso: argv.sso,
    }),
  ),
};
