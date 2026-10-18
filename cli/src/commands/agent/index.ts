import {
  createAgent,
  createAgentKey,
  deleteAgent,
  getAgent,
  listAgents,
  revokeAgent,
  revokeAgentKey,
  updateAgent,
  whoamiAgent,
} from "../agents.js";
import { runCommand, toFlagsRecord, type CliCommand } from "../types.js";

const listAgentCmd: CliCommand = {
  command: ["list", "ls"],
  describe: "List registered agents and access keys",
  builder: (yargs) => yargs,
  handler: runCommand(async (argv) => listAgents(argv._instance!, toFlagsRecord(argv))),
};

const getAgentCmd: CliCommand<{ id: string }> = {
  command: "get <id>",
  describe: "Inspect details of a registered agent",
  builder: (yargs) =>
    yargs.positional("id", { type: "string", demandOption: true, describe: "Agent ID" }),
  handler: runCommand(async (argv) =>
    getAgent(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const createAgentCmd: CliCommand<{ name: string; description?: string; type?: string }> = {
  command: ["create <name>", "new <name>"],
  describe: "Register a new agent in the workspace",
  builder: (yargs) =>
    yargs
      .positional("name", { type: "string", demandOption: true, describe: "Agent name" })
      .option("description", { type: "string", describe: "Agent description" })
      .option("type", { type: "string", describe: "Agent type" }),
  handler: runCommand(async (argv) =>
    createAgent(argv._instance!, argv.name, toFlagsRecord(argv, ["name"])),
  ),
};

const updateAgentCmd: CliCommand<{
  id: string;
  name?: string;
  description?: string;
  status?: string;
}> = {
  command: "update <id>",
  describe: "Update a registered agent's settings",
  builder: (yargs) =>
    yargs
      .positional("id", { type: "string", demandOption: true, describe: "Agent ID" })
      .option("name", { type: "string", describe: "Updated agent name" })
      .option("description", { type: "string", describe: "Updated agent description" })
      .option("status", { type: "string", describe: "Updated status" }),
  handler: runCommand(async (argv) =>
    updateAgent(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const deleteAgentCmd: CliCommand<{ id: string }> = {
  command: "delete <id>",
  describe: "Delete a registered agent",
  builder: (yargs) =>
    yargs.positional("id", { type: "string", demandOption: true, describe: "Agent ID" }),
  handler: runCommand(async (argv) =>
    deleteAgent(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const whoamiAgentCmd: CliCommand = {
  command: "whoami",
  describe: "Inspect current active agent key standing and quotas",
  builder: (yargs) => yargs,
  handler: runCommand(async (argv) => whoamiAgent(argv._instance!)),
};

const revokeAgentCmd: CliCommand<{ id: string }> = {
  command: "revoke <id>",
  describe: "Revoke an agent key by ID",
  builder: (yargs) =>
    yargs.positional("id", { type: "string", demandOption: true, describe: "Key ID" }),
  handler: runCommand(async (argv) => revokeAgent(argv._instance!, argv.id)),
};

const keyAgentCmd: CliCommand = {
  command: "key",
  describe: "Mint or revoke API keys for a registered agent",
  builder: (yargs) =>
    yargs
      .demandCommand(1, "Specify a key action (create or revoke).")
      .command({
        command: "create <id>",
        describe: "Mint a new API key for an agent",
        builder: (y) =>
          y.positional("id", { type: "string", demandOption: true, describe: "Agent ID" }),
        handler: runCommand<{ id: string }>(async (argv) =>
          createAgentKey(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
        ),
      })
      .command({
        command: "revoke <first> [second]",
        describe: "Revoke an agent API key",
        builder: (y) =>
          y
            .positional("first", {
              type: "string",
              demandOption: true,
              describe: "Key ID or Agent ID",
            })
            .positional("second", {
              type: "string",
              describe: "Key ID (when first is Agent ID)",
            }),
        handler: runCommand<{ first: string; second?: string }>(async (argv) =>
          revokeAgentKey(
            argv._instance!,
            argv.first,
            argv.second,
            toFlagsRecord(argv, ["first", "second"]),
          ),
        ),
      }),
  handler: () => {},
};

export const agentCommand: CliCommand = {
  command: "agent",
  describe: "Manage registered workspace agents and agent access keys",
  builder: (yargs) =>
    yargs
      .command(listAgentCmd)
      .command(getAgentCmd)
      .command(createAgentCmd)
      .command(updateAgentCmd)
      .command(deleteAgentCmd)
      .command(whoamiAgentCmd)
      .command(revokeAgentCmd)
      .command(keyAgentCmd),
  handler: runCommand(async (argv) => listAgents(argv._instance!, toFlagsRecord(argv))),
};
