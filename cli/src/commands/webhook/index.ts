import {
  createWebhook,
  deleteWebhook,
  getWebhook,
  listWebhooks,
  pingWebhook,
  updateWebhook,
} from "../webhooks.js";
import { runCommand, toFlagsRecord, type CliCommand } from "../types.js";

const listWebhookCmd: CliCommand = {
  command: ["list", "ls"],
  describe: "List workspace webhooks",
  builder: (yargs) => yargs,
  handler: runCommand(async (argv) => listWebhooks(argv._instance!, toFlagsRecord(argv))),
};

const getWebhookCmd: CliCommand<{ id: string }> = {
  command: "get <id>",
  describe: "Inspect details of a webhook",
  builder: (yargs) =>
    yargs.positional("id", { type: "string", demandOption: true, describe: "Webhook ID" }),
  handler: runCommand(async (argv) =>
    getWebhook(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const createWebhookCmd: CliCommand<{
  name: string;
  endpoint: string;
  secret?: string;
  events?: string;
  disabled?: boolean;
}> = {
  command: ["create <name> <endpoint>", "new <name> <endpoint>"],
  describe: "Register a new webhook for workspace event delivery",
  builder: (yargs) =>
    yargs
      .positional("name", { type: "string", demandOption: true, describe: "Webhook label" })
      .positional("endpoint", {
        type: "string",
        demandOption: true,
        describe: "Destination HTTP/S URL",
      })
      .option("secret", { type: "string", describe: "Shared HMAC signing secret" })
      .option("events", {
        type: "string",
        describe: "Comma-separated subscribed event names or *",
      })
      .option("disabled", { type: "boolean", describe: "Create in disabled state" }),
  handler: runCommand(async (argv) =>
    createWebhook(
      argv._instance!,
      argv.name,
      argv.endpoint,
      toFlagsRecord(argv, ["name", "endpoint"]),
    ),
  ),
};

const updateWebhookCmd: CliCommand<{ id: string }> = {
  command: "update <id>",
  describe: "Update webhook settings, URL, or events",
  builder: (yargs) =>
    yargs
      .positional("id", { type: "string", demandOption: true, describe: "Webhook ID" })
      .option("name", { type: "string", describe: "Updated webhook label" })
      .option("endpoint", { type: "string", describe: "Updated destination URL" })
      .option("secret", { type: "string", describe: "Updated HMAC signing secret" })
      .option("events", { type: "string", describe: "Updated event subscriptions" })
      .option("enable", { type: "boolean", describe: "Enable webhook delivery" })
      .option("disable", { type: "boolean", describe: "Disable webhook delivery" }),
  handler: runCommand(async (argv) =>
    updateWebhook(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const deleteWebhookCmd: CliCommand<{ id: string }> = {
  command: "delete <id>",
  describe: "Delete a webhook from the workspace",
  builder: (yargs) =>
    yargs.positional("id", { type: "string", demandOption: true, describe: "Webhook ID" }),
  handler: runCommand(async (argv) =>
    deleteWebhook(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const pingWebhookCmd: CliCommand<{ id: string }> = {
  command: "ping <id>",
  describe: "Dispatch a test ping to verify webhook delivery and signature",
  builder: (yargs) =>
    yargs.positional("id", { type: "string", demandOption: true, describe: "Webhook ID" }),
  handler: runCommand(async (argv) =>
    pingWebhook(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

export const webhookCommand: CliCommand = {
  command: "webhook",
  describe: "Manage workspace webhooks and event routing",
  builder: (yargs) =>
    yargs
      .command(listWebhookCmd)
      .command(getWebhookCmd)
      .command(createWebhookCmd)
      .command(updateWebhookCmd)
      .command(deleteWebhookCmd)
      .command(pingWebhookCmd),
  handler: runCommand(async (argv) => listWebhooks(argv._instance!, toFlagsRecord(argv))),
};
