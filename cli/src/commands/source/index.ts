import { addSource, deleteSource, listSources, syncSource } from "../sources.js";
import { runCommand, toFlagsRecord, type CliCommand } from "../types.js";

const listSourceCmd: CliCommand = {
  command: ["list", "ls"],
  describe: "List connected knowledge sources in this workspace",
  builder: (yargs) => yargs,
  handler: runCommand(async (argv) => listSources(argv._instance!, toFlagsRecord(argv))),
};

const addSourceCmd: CliCommand<{
  target?: string;
  type?: string;
  name?: string;
  branch?: string;
  "max-pages"?: number;
  "no-distill"?: boolean;
}> = {
  command: ["add [target]", "create [target]"],
  describe: "Connect a URL/sitemap, inbound webhook, or GitHub source to this workspace",
  builder: (yargs) =>
    yargs
      .positional("target", {
        type: "string",
        describe: "URL/sitemap (https://...), GitHub repo (owner/repo), or webhook label",
      })
      .option("type", {
        type: "string",
        choices: ["url", "webhook", "github"],
        describe: "Source type (auto-detected from target when omitted)",
      })
      .option("name", {
        type: "string",
        describe: "Display name for the knowledge source",
      })
      .option("branch", {
        type: "string",
        describe: "Default branch for GitHub sources",
      })
      .option("max-pages", {
        type: "number",
        describe: "Maximum pages to crawl when syncing a URL sitemap source",
      })
      .option("no-distill", {
        type: "boolean",
        describe: "Index grounded chunks only without distilling atomic memories",
      }),
  handler: runCommand(async (argv) =>
    addSource(argv._instance!, argv.target, toFlagsRecord(argv, ["target"])),
  ),
};

const syncSourceCmd: CliCommand<{
  id: string;
  "max-pages"?: number;
  "max-files"?: number;
  "no-distill"?: boolean;
}> = {
  command: "sync <id>",
  describe: "Trigger an immediate sync for a connected URL or GitHub source",
  builder: (yargs) =>
    yargs
      .positional("id", {
        type: "string",
        demandOption: true,
        describe: "Source ID",
      })
      .option("max-pages", {
        type: "number",
        describe: "Maximum pages to fetch on URL sitemap sync",
      })
      .option("max-files", {
        type: "number",
        describe: "Maximum files to fetch on GitHub sync",
      })
      .option("no-distill", {
        type: "boolean",
        describe: "Index grounded chunks without distilling atomic memories",
      }),
  handler: runCommand(async (argv) =>
    syncSource(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const deleteSourceCmd: CliCommand<{ id: string }> = {
  command: "delete <id>",
  describe: "Disconnect and remove a knowledge source from this workspace",
  builder: (yargs) =>
    yargs.positional("id", {
      type: "string",
      demandOption: true,
      describe: "Source ID",
    }),
  handler: runCommand(async (argv) =>
    deleteSource(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

export const sourceCommand: CliCommand = {
  command: "source",
  describe: "Manage workspace knowledge sources (URL/sitemap, webhook, GitHub)",
  builder: (yargs) =>
    yargs
      .command(listSourceCmd)
      .command(addSourceCmd)
      .command(syncSourceCmd)
      .command(deleteSourceCmd),
  handler: runCommand(async (argv) => listSources(argv._instance!, toFlagsRecord(argv))),
};
