import {
  acceptInvitation,
  createApiKey,
  createToken,
  declineInvitation,
  getInvitation,
  getProfile,
  listApiKeys,
  listTokens,
  revokeApiKey,
  revokeToken,
  updateProfile,
} from "../account.js";
import { resetCommand, usageCommand } from "../admin/index.js";
import { runCommand, toFlagsRecord, type CliCommand } from "../types.js";

const profileAccountCmd: CliCommand = {
  command: "profile",
  describe: "View authenticated user profile",
  builder: (yargs) => yargs,
  handler: runCommand(async (argv) => getProfile(argv._instance!)),
};

const updateAccountCmd: CliCommand<{ name?: string }> = {
  command: "update",
  describe: "Update profile information",
  builder: (yargs) => yargs.option("name", { type: "string", describe: "Updated display name" }),
  handler: runCommand(async (argv) => updateProfile(argv._instance!, toFlagsRecord(argv))),
};

const keyAccountCmd: CliCommand = {
  command: "key",
  describe: "Manage personal API keys",
  builder: (yargs) =>
    yargs
      .command({
        command: ["list", "ls"],
        describe: "List API keys",
        builder: (y) => y,
        handler: runCommand(async (argv) => listApiKeys(argv._instance!)),
      })
      .command({
        command: ["create <name>", "new <name>"],
        describe: "Create a new API key",
        builder: (y) =>
          y
            .positional("name", { type: "string", demandOption: true, describe: "Key label" })
            .option("expires", { type: "number", describe: "Expiration duration in days" }),
        handler: runCommand<{ name: string }>(async (argv) =>
          createApiKey(argv._instance!, argv.name, toFlagsRecord(argv, ["name"])),
        ),
      })
      .command({
        command: "revoke <id>",
        describe: "Revoke an API key",
        builder: (y) =>
          y.positional("id", { type: "string", demandOption: true, describe: "Key ID" }),
        handler: runCommand<{ id: string }>(async (argv) => revokeApiKey(argv._instance!, argv.id)),
      }),
  handler: runCommand(async (argv) => listApiKeys(argv._instance!)),
};

const tokenAccountCmd: CliCommand = {
  command: "token",
  describe: "Manage personal API tokens",
  builder: (yargs) =>
    yargs
      .command({
        command: ["list", "ls"],
        describe: "List API tokens",
        builder: (y) => y,
        handler: runCommand(async (argv) => listTokens(argv._instance!)),
      })
      .command({
        command: ["create <name>", "new <name>"],
        describe: "Create a new API token",
        builder: (y) =>
          y
            .positional("name", { type: "string", demandOption: true, describe: "Token label" })
            .option("expires", { type: "number", describe: "Expiration duration in days" }),
        handler: runCommand<{ name: string }>(async (argv) =>
          createToken(argv._instance!, argv.name, toFlagsRecord(argv, ["name"])),
        ),
      })
      .command({
        command: "revoke <id>",
        describe: "Revoke an API token",
        builder: (y) =>
          y.positional("id", { type: "string", demandOption: true, describe: "Token ID" }),
        handler: runCommand<{ id: string }>(async (argv) => revokeToken(argv._instance!, argv.id)),
      }),
  handler: runCommand(async (argv) => listTokens(argv._instance!)),
};

const invitationAccountCmd: CliCommand = {
  command: "invitation",
  describe: "Inspect, accept, or decline pending workspace or organization invitations",
  builder: (yargs) =>
    yargs
      .demandCommand(1, "Specify an invitation action (get, accept, or decline).")
      .command({
        command: "get <id>",
        describe: "Inspect details of a pending invitation",
        builder: (y) =>
          y.positional("id", { type: "string", demandOption: true, describe: "Invitation ID" }),
        handler: runCommand<{ id: string }>(async (argv) =>
          getInvitation(argv._instance!, argv.id),
        ),
      })
      .command({
        command: "accept <id>",
        describe: "Accept a pending invitation",
        builder: (y) =>
          y.positional("id", { type: "string", demandOption: true, describe: "Invitation ID" }),
        handler: runCommand<{ id: string }>(async (argv) =>
          acceptInvitation(argv._instance!, argv.id),
        ),
      })
      .command({
        command: "decline <id>",
        describe: "Decline a pending invitation",
        builder: (y) =>
          y.positional("id", { type: "string", demandOption: true, describe: "Invitation ID" }),
        handler: runCommand<{ id: string }>(async (argv) =>
          declineInvitation(argv._instance!, argv.id),
        ),
      }),
  handler: () => {},
};

export const accountCommand: CliCommand = {
  command: "account",
  describe: "Manage your profile, API keys, invitations, and usage",
  builder: (yargs) =>
    yargs
      .command(profileAccountCmd)
      .command(updateAccountCmd)
      .command(keyAccountCmd)
      .command(tokenAccountCmd)
      .command(invitationAccountCmd)
      .command(usageCommand)
      .command(resetCommand),
  handler: runCommand(async (argv) => getProfile(argv._instance!)),
};
