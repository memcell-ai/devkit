import {
  collaboratorCommand,
  insightsCommand,
  pauseCommand,
  resumeCommand,
  scopeCommand,
  statsCommand,
  sweepCommand,
} from "../admin/index.js";
import {
  copyWorkspace,
  deleteWorkspace,
  getWorkspace,
  getWorkspaceActivity,
  listWorkspaces,
  newWorkspace,
  purgeWorkspace,
  transferWorkspace,
  useWorkspace,
  updateWorkspace,
} from "../workspaces.js";
import { runCommand, toFlagsRecord, type CliCommand } from "../types.js";

const listWorkspaceCmd: CliCommand = {
  command: ["list", "ls"],
  describe: "List workspaces you have access to",
  builder: (yargs) => yargs,
  handler: runCommand(async (argv) => listWorkspaces(argv._instance!, toFlagsRecord(argv))),
};

const getWorkspaceCmd: CliCommand<{ slug: string }> = {
  command: "get <slug>",
  describe: "View workspace details",
  builder: (yargs) =>
    yargs.positional("slug", {
      type: "string",
      demandOption: true,
      describe: "Workspace slug or [owner]/[workspace]",
    }),
  handler: runCommand(async (argv) =>
    getWorkspace(argv._instance!, argv.slug, toFlagsRecord(argv, ["slug"])),
  ),
};

const createWorkspaceCmd: CliCommand<{ name: string; description?: string }> = {
  command: ["create <name>", "new <name>"],
  describe: "Create a new workspace",
  builder: (yargs) =>
    yargs
      .positional("name", {
        type: "string",
        demandOption: true,
        describe: "Workspace name",
      })
      .option("description", {
        type: "string",
        describe: "Optional workspace description",
      }),
  handler: runCommand(async (argv) =>
    newWorkspace(argv._instance!, argv.name, toFlagsRecord(argv, ["name"])),
  ),
};

const updateWorkspaceCmd: CliCommand<{ slug: string; name?: string; description?: string }> = {
  command: "update <slug>",
  describe: "Update workspace name or description",
  builder: (yargs) =>
    yargs
      .positional("slug", {
        type: "string",
        demandOption: true,
        describe: "Workspace slug or [owner]/[workspace]",
      })
      .option("name", {
        type: "string",
        describe: "New workspace display name",
      })
      .option("description", {
        type: "string",
        describe: "New workspace description",
      }),
  handler: runCommand(async (argv) =>
    updateWorkspace(argv._instance!, argv.slug, toFlagsRecord(argv, ["slug"])),
  ),
};

const deleteWorkspaceCmd: CliCommand<{ slug: string }> = {
  command: "delete <slug>",
  describe: "Delete a workspace permanently",
  builder: (yargs) =>
    yargs.positional("slug", {
      type: "string",
      demandOption: true,
      describe: "Workspace slug or [owner]/[workspace]",
    }),
  handler: runCommand(async (argv) => deleteWorkspace(argv._instance!, argv.slug)),
};

const useWorkspaceCmd: CliCommand<{ slug: string }> = {
  command: ["use <slug>", "switch <slug>"],
  describe: "Switch the active workspace context",
  builder: (yargs) =>
    yargs.positional("slug", {
      type: "string",
      demandOption: true,
      describe: "Workspace slug or [owner]/[workspace]",
    }),
  handler: runCommand(async (argv) => useWorkspace(argv._instance!, argv.slug)),
};

const transferWorkspaceCmd: CliCommand<{ slug: string; to?: string; "new-slug"?: string }> = {
  command: "transfer <slug>",
  describe: "Transfer workspace ownership to another user or organization",
  builder: (yargs) =>
    yargs
      .positional("slug", {
        type: "string",
        demandOption: true,
        describe: "Workspace slug or [owner]/[workspace]",
      })
      .option("to", {
        type: "string",
        describe: "Target owner user or organization handle (or owner/new-slug)",
      })
      .option("new-slug", {
        type: "string",
        describe: "Optional new workspace slug under the target owner",
      }),
  handler: runCommand(async (argv) =>
    transferWorkspace(argv._instance!, argv.slug, toFlagsRecord(argv, ["slug"])),
  ),
};

const copyWorkspaceCmd: CliCommand<{
  slug: string;
  target?: string;
  to?: string;
  name?: string;
  visibility?: string;
  threads?: boolean;
  documents?: boolean;
}> = {
  command: ["copy <slug> [target]", "clone <slug> [target]", "fork <slug> [target]"],
  describe: "Copy a workspace and its memories into your account or an organization",
  builder: (yargs) =>
    yargs
      .positional("slug", {
        type: "string",
        demandOption: true,
        describe: "Source workspace slug or [owner]/[workspace]",
      })
      .positional("target", {
        type: "string",
        describe: "Optional destination slug or [owner]/[workspace]",
      })
      .option("to", {
        type: "string",
        describe: "Destination owner handle or organization slug",
      })
      .option("name", {
        type: "string",
        describe: "Custom display name for the copied workspace",
      })
      .option("visibility", {
        type: "string",
        choices: ["private", "public"],
        describe: "Visibility for the copied workspace",
      })
      .option("threads", {
        type: "boolean",
        default: true,
        describe: "Include shared workspace threads",
      })
      .option("documents", {
        type: "boolean",
        default: true,
        describe: "Include ingested documents and chunks",
      }),
  handler: runCommand(async (argv) =>
    copyWorkspace(argv._instance!, argv.slug, argv.target, toFlagsRecord(argv, ["slug", "target"])),
  ),
};

const activityWorkspaceCmd: CliCommand<{
  slug?: string;
  outcome?: string;
  subject?: string;
  "memory-id"?: string;
  page?: number;
  limit?: number;
}> = {
  command: "activity [slug]",
  describe: "View audit and outcome activity for a workspace",
  builder: (yargs) =>
    yargs
      .positional("slug", {
        type: "string",
        describe: "Optional workspace slug or [owner]/[workspace]",
      })
      .option("outcome", {
        type: "string",
        describe: "Outcome filter (worked, failed, avoided)",
      })
      .option("subject", {
        type: "string",
        describe: "Domain entity or topic filter",
      })
      .option("memory-id", {
        type: "string",
        describe: "Filter by memory ID",
      })
      .option("page", {
        type: "number",
        describe: "Page number",
      })
      .option("limit", {
        alias: "n",
        type: "number",
        describe: "Results per page",
      }),
  handler: runCommand(async (argv) =>
    getWorkspaceActivity(argv._instance!, argv.slug, toFlagsRecord(argv, ["slug"])),
  ),
};

const purgeWorkspaceCmd: CliCommand<{ slug?: string }> = {
  command: "purge [slug]",
  describe: "Purge all memories, threads, and documents from a workspace",
  builder: (yargs) =>
    yargs.positional("slug", {
      type: "string",
      describe: "Optional workspace slug or [owner]/[workspace]",
    }),
  handler: runCommand(async (argv) =>
    purgeWorkspace(argv._instance!, argv.slug, toFlagsRecord(argv, ["slug"])),
  ),
};

export const workspaceCommand: CliCommand = {
  command: "workspace",
  describe: "Manage workspaces, collaborators, scopes, activity, and sweeps",
  builder: (yargs) =>
    yargs
      .command(listWorkspaceCmd)
      .command(getWorkspaceCmd)
      .command(createWorkspaceCmd)
      .command(updateWorkspaceCmd)
      .command(deleteWorkspaceCmd)
      .command(useWorkspaceCmd)
      .command(copyWorkspaceCmd)
      .command(transferWorkspaceCmd)
      .command(activityWorkspaceCmd)
      .command(purgeWorkspaceCmd)
      .command(collaboratorCommand)
      .command(scopeCommand)
      .command(statsCommand)
      .command(insightsCommand)
      .command(sweepCommand)
      .command(pauseCommand)
      .command(resumeCommand),
  handler: runCommand(async (argv) => listWorkspaces(argv._instance!, toFlagsRecord(argv))),
};
