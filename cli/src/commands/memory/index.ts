import { promotionCommand } from "../admin/index.js";
import {
  adoptMemory,
  createMemory,
  deleteMemory,
  getMemory,
  historyMemory,
  listMemories,
  memoryRelations,
  relateMemories,
  starMemory,
  unrelateMemories,
  updateMemory,
} from "../memories.js";
import { promote } from "../promote.js";
import { seed } from "../seed.js";
import { runCommand, toFlagsRecord, type CliCommand } from "../types.js";

const listMemoryCmd: CliCommand = {
  command: ["list", "ls"],
  describe: "List memories in the active workspace",
  builder: (yargs) =>
    yargs
      .option("type", {
        type: "string",
        choices: ["instruction", "decision", "fact", "preference"] as const,
        describe: "Filter by memory type",
      })
      .option("status", {
        type: "string",
        describe: "Filter by memory status",
      })
      .option("scope", {
        type: "string",
        describe: "Filter by operational scope (user, workspace, team, organization)",
      })
      .option("query", {
        alias: "q",
        type: "string",
        describe: "Search query filter",
      })
      .option("limit", {
        alias: "n",
        type: "number",
        describe: "Maximum results per page",
      })
      .option("page", {
        type: "number",
        describe: "Page number",
      }),
  handler: runCommand(async (argv) => listMemories(argv._instance!, toFlagsRecord(argv))),
};

const getMemoryCmd: CliCommand<{ id: string }> = {
  command: "get <id>",
  describe: "Inspect details of a memory by ID",
  builder: (yargs) =>
    yargs.positional("id", {
      type: "string",
      demandOption: true,
      describe: "Memory ID",
    }),
  handler: runCommand(async (argv) =>
    getMemory(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const createMemoryCmd: CliCommand<{ text: string }> = {
  command: ["create <text>", "new <text>"],
  describe: "Create a memory directly in the workspace",
  builder: (yargs) =>
    yargs
      .positional("text", {
        type: "string",
        demandOption: true,
        describe: "Memory text content",
      })
      .option("name", { type: "string", describe: "Memory title" })
      .option("type", {
        type: "string",
        choices: ["instruction", "decision", "fact", "preference"] as const,
        describe: "Memory categorization type",
      })
      .option("scope", { type: "string", describe: "Operational scope" })
      .option("status", { type: "string", describe: "Initial status" })
      .option("meta", { type: "string", describe: "Structured JSON metadata" })
      .option("roles", { type: "string", describe: "Comma-separated required roles" })
      .option("subject", { alias: "target", type: "string", describe: "Domain entity or topic" })
      .option("context", { type: "string", describe: "Contextual background or rationale" })
      .option("observation", { type: "string", describe: "Empirical observation anchor" })
      .option("enforce", { type: "boolean", describe: "Enforce as strict operational guard" }),
  handler: runCommand(async (argv) =>
    createMemory(argv._instance!, argv.text, toFlagsRecord(argv, ["text"])),
  ),
};

const updateMemoryCmd: CliCommand<{ id: string }> = {
  command: "update <id>",
  describe: "Update a memory's content, status, or type",
  builder: (yargs) =>
    yargs
      .positional("id", {
        type: "string",
        demandOption: true,
        describe: "Memory ID",
      })
      .option("text", { type: "string", describe: "Updated memory content" })
      .option("name", { type: "string", describe: "Updated memory title" })
      .option("type", {
        type: "string",
        choices: ["instruction", "decision", "fact", "preference"] as const,
        describe: "Updated memory type",
      })
      .option("status", { type: "string", describe: "Updated memory status" })
      .option("meta", { type: "string", describe: "Updated JSON metadata" })
      .option("context", { type: "string", describe: "Updated context" })
      .option("observation", { type: "string", describe: "Updated observation" })
      .option("enforce", { type: "boolean", describe: "Enforce as strict operational guard" }),
  handler: runCommand(async (argv) =>
    updateMemory(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const deleteMemoryCmd: CliCommand<{ id: string; all?: boolean }> = {
  command: "delete <id>",
  describe: "Delete a memory or its latest version",
  builder: (yargs) =>
    yargs
      .positional("id", {
        type: "string",
        demandOption: true,
        describe: "Memory ID",
      })
      .option("all", {
        type: "boolean",
        describe: "Delete all versions instead of only the latest version",
      }),
  handler: runCommand(async (argv) =>
    deleteMemory(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const starMemoryCmd: CliCommand<{ id: string; unstar?: boolean }> = {
  command: "star <id>",
  describe: "Star or unstar a memory",
  builder: (yargs) =>
    yargs
      .positional("id", {
        type: "string",
        demandOption: true,
        describe: "Memory ID",
      })
      .option("unstar", {
        type: "boolean",
        describe: "Remove star instead of adding",
      }),
  handler: runCommand(async (argv) =>
    starMemory(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const unstarMemoryCmd: CliCommand<{ id: string }> = {
  command: "unstar <id>",
  describe: "Remove star from a memory",
  builder: (yargs) =>
    yargs.positional("id", {
      type: "string",
      demandOption: true,
      describe: "Memory ID",
    }),
  handler: runCommand(async (argv) =>
    starMemory(argv._instance!, argv.id, { ...toFlagsRecord(argv, ["id"]), unstar: true }),
  ),
};

const historyMemoryCmd: CliCommand<{ id: string }> = {
  command: "history <id>",
  describe: "View revision and outcome history of a memory",
  builder: (yargs) =>
    yargs.positional("id", {
      type: "string",
      demandOption: true,
      describe: "Memory ID",
    }),
  handler: runCommand(async (argv) =>
    historyMemory(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const adoptMemoryCmd: CliCommand<{ id: string; into?: string; to?: string }> = {
  command: "adopt <id>",
  describe: "Adopt an existing memory into another workspace",
  builder: (yargs) =>
    yargs
      .positional("id", {
        type: "string",
        demandOption: true,
        describe: "Memory ID",
      })
      .option("into", {
        alias: "to",
        type: "string",
        describe: "Target workspace namespace to adopt into",
      }),
  handler: runCommand(async (argv) =>
    adoptMemory(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const promoteMemoryCmd: CliCommand<{ memory: string; to?: string; reason?: string }> = {
  command: "promote <memory>",
  describe: "Promote a memory to workspace, team, or organization scope",
  builder: (yargs) =>
    yargs
      .positional("memory", {
        type: "string",
        demandOption: true,
        describe: "Memory ID",
      })
      .option("to", {
        type: "string",
        default: "workspace",
        describe: "Target scope to promote to (workspace, team, organization)",
      })
      .option("reason", {
        type: "string",
        describe: "Reason for promoting the memory",
      }),
  handler: runCommand(async (argv) =>
    promote(argv.memory, argv.to || "workspace", argv.reason, argv.url),
  ),
};

const relateMemoryCmd: CliCommand<{ source: string; target: string }> = {
  command: "relate <source> <target>",
  describe: "Create a directed relation edge between two memories",
  builder: (yargs) =>
    yargs
      .positional("source", { type: "string", demandOption: true, describe: "Source memory ID" })
      .positional("target", { type: "string", demandOption: true, describe: "Target memory ID" })
      .option("type", {
        alias: "relation",
        type: "string",
        describe: "Relation type (justifies, depends_on, limits, supersedes, related_to)",
      })
      .option("confidence", {
        type: "number",
        describe: "Relation confidence score (0.0 to 1.0)",
      }),
  handler: runCommand(async (argv) =>
    relateMemories(
      argv._instance!,
      argv.source,
      argv.target,
      toFlagsRecord(argv, ["source", "target"]),
    ),
  ),
};

const unrelateMemoryCmd: CliCommand<{ arg1: string; arg2?: string }> = {
  command: "unrelate <arg1> [arg2]",
  describe: "Remove a relation edge between memories",
  builder: (yargs) =>
    yargs
      .positional("arg1", {
        type: "string",
        demandOption: true,
        describe: "Relation ID (or source memory ID when relation ID is second)",
      })
      .positional("arg2", {
        type: "string",
        describe: "Relation ID (when source memory ID is first)",
      }),
  handler: runCommand(async (argv) =>
    unrelateMemories(argv._instance!, argv.arg1, argv.arg2, toFlagsRecord(argv, ["arg1", "arg2"])),
  ),
};

const relationMemoryCmd: CliCommand<{ id?: string }> = {
  command: "relation [id]",
  describe: "List incoming and outgoing relations for a memory or workspace",
  builder: (yargs) =>
    yargs
      .positional("id", {
        type: "string",
        describe: "Optional memory ID (omit for workspace-wide relations)",
      })
      .option("type", { type: "string", describe: "Filter by relation type" })
      .option("page", { type: "number", describe: "Page number" })
      .option("limit", { alias: "n", type: "number", describe: "Results per page" }),
  handler: runCommand(async (argv) =>
    memoryRelations(
      argv._instance!,
      argv.id === "list" ? undefined : argv.id,
      toFlagsRecord(argv, ["id"]),
    ),
  ),
};

const seedMemoryCmd: CliCommand<{ source: string; reason?: string; "no-watch"?: boolean }> = {
  command: "seed <source>",
  describe: "Seed a documentation or repository URL into shared memory",
  builder: (yargs) =>
    yargs
      .positional("source", {
        type: "string",
        demandOption: true,
        describe: "Repository or documentation URL",
      })
      .option("reason", { type: "string", describe: "Why this source should be indexed" })
      .option("no-watch", { type: "boolean", describe: "Do not follow crawl progress" }),
  handler: runCommand(async (argv) =>
    seed(argv._instance!, argv.source, {
      reason: argv.reason,
      watch: !argv["no-watch"],
    }),
  ),
};

export const memoryCommand: CliCommand = {
  command: "memory",
  describe: "Manage memories, revisions, relations, and scope promotions",
  builder: (yargs) =>
    yargs
      .command(listMemoryCmd)
      .command(getMemoryCmd)
      .command(createMemoryCmd)
      .command(updateMemoryCmd)
      .command(deleteMemoryCmd)
      .command(starMemoryCmd)
      .command(unstarMemoryCmd)
      .command(historyMemoryCmd)
      .command(adoptMemoryCmd)
      .command(promoteMemoryCmd)
      .command(promotionCommand)
      .command(relateMemoryCmd)
      .command(unrelateMemoryCmd)
      .command(relationMemoryCmd)
      .command(seedMemoryCmd),
  handler: runCommand(async (argv) => listMemories(argv._instance!, toFlagsRecord(argv))),
};
