import {
  deleteThread,
  getThread,
  listThreads,
  updateThreadScope,
  updateThreadStatus,
} from "../threads.js";
import { runCommand, toFlagsRecord, type CliCommand } from "../types.js";

const listThreadCmd: CliCommand = {
  command: ["list", "ls"],
  describe: "List active and historical session threads in this workspace",
  builder: (yargs) =>
    yargs
      .option("status", {
        type: "string",
        choices: ["active", "paused", "completed"] as const,
        describe: "Filter by thread status",
      })
      .option("scope", {
        type: "string",
        choices: ["user", "workspace", "all"] as const,
        describe: "Filter by thread scope (user, workspace, or all)",
      })
      .option("entity", {
        type: "string",
        describe: "Filter by domain entity or resource",
      })
      .option("query", {
        alias: "q",
        type: "string",
        describe: "Search query filter",
      })
      .option("page", { type: "number", describe: "Page number" })
      .option("limit", { alias: "n", type: "number", describe: "Results per page" }),
  handler: runCommand(async (argv) => listThreads(argv._instance!, toFlagsRecord(argv))),
};

const getThreadCmd: CliCommand<{ id: string }> = {
  command: "get <id>",
  describe: "Inspect a session thread's objective, decisions, next steps, and turns",
  builder: (yargs) =>
    yargs.positional("id", {
      type: "string",
      demandOption: true,
      describe: "Thread ID or external session ID",
    }),
  handler: runCommand(async (argv) =>
    getThread(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const completeThreadCmd: CliCommand<{ id: string }> = {
  command: "complete <id>",
  describe: "Mark a session thread as completed",
  builder: (yargs) =>
    yargs.positional("id", {
      type: "string",
      demandOption: true,
      describe: "Thread ID",
    }),
  handler: runCommand(async (argv) =>
    updateThreadStatus(argv._instance!, argv.id, "completed", toFlagsRecord(argv, ["id"])),
  ),
};

const resumeThreadCmd: CliCommand<{ id: string }> = {
  command: "resume <id>",
  describe: "Mark a paused or completed session thread as active",
  builder: (yargs) =>
    yargs.positional("id", {
      type: "string",
      demandOption: true,
      describe: "Thread ID",
    }),
  handler: runCommand(async (argv) =>
    updateThreadStatus(argv._instance!, argv.id, "active", toFlagsRecord(argv, ["id"])),
  ),
};

const shareThreadCmd: CliCommand<{ id: string }> = {
  command: "share <id>",
  describe: "Share a session thread with all members of the workspace",
  builder: (yargs) =>
    yargs.positional("id", {
      type: "string",
      demandOption: true,
      describe: "Thread ID",
    }),
  handler: runCommand(async (argv) =>
    updateThreadScope(argv._instance!, argv.id, "workspace", toFlagsRecord(argv, ["id"])),
  ),
};

const unshareThreadCmd: CliCommand<{ id: string }> = {
  command: "unshare <id>",
  describe: "Make a shared session thread private to you again",
  builder: (yargs) =>
    yargs.positional("id", {
      type: "string",
      demandOption: true,
      describe: "Thread ID",
    }),
  handler: runCommand(async (argv) =>
    updateThreadScope(argv._instance!, argv.id, "user", toFlagsRecord(argv, ["id"])),
  ),
};

const deleteThreadCmd: CliCommand<{ id: string }> = {
  command: "delete <id>",
  describe: "Delete a session thread and its turn summaries",
  builder: (yargs) =>
    yargs.positional("id", {
      type: "string",
      demandOption: true,
      describe: "Thread ID",
    }),
  handler: runCommand(async (argv) =>
    deleteThread(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

export const threadCommand: CliCommand = {
  command: "thread",
  describe: "Manage session conversation threads and turn summaries",
  builder: (yargs) =>
    yargs
      .command(listThreadCmd)
      .command(getThreadCmd)
      .command(completeThreadCmd)
      .command(resumeThreadCmd)
      .command(shareThreadCmd)
      .command(unshareThreadCmd)
      .command(deleteThreadCmd),
  handler: runCommand(async (argv) => listThreads(argv._instance!, toFlagsRecord(argv))),
};
