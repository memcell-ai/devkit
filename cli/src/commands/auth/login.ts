import { login } from "../login.js";
import { runCommand, type CliCommand } from "../types.js";

export interface LoginArgs {
  "no-browser"?: boolean;
  sso?: string;
}

export const loginCommand: CliCommand<LoginArgs> = {
  command: "login",
  describe: "Add an account on this machine and make it the active one",
  builder: (yargs) =>
    yargs
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
      noBrowser: Boolean(argv["no-browser"]),
      sso: argv.sso,
    }),
  ),
};
