import { deleteDocument, ingestDocuments, listDocuments, searchDocuments } from "../documents.js";
import { runCommand, toFlagsRecord, type CliCommand } from "../types.js";

const listDocumentCmd: CliCommand = {
  command: ["list", "ls"],
  describe: "List grounded documents ingested in this workspace",
  builder: (yargs) =>
    yargs.option("query", {
      alias: "q",
      type: "string",
      describe: "Search query filter",
    }),
  handler: runCommand(async (argv) => listDocuments(argv._instance!, toFlagsRecord(argv))),
};

const ingestDocumentCmd: CliCommand<{
  file?: string;
  "no-distill"?: boolean;
  "dry-run"?: boolean;
}> = {
  command: "ingest [file]",
  describe:
    "Ingest workspace documents (PDF, DOCX, CSV, HTML, JSON, Markdown) into grounded chunks and distill memories",
  builder: (yargs) =>
    yargs
      .positional("file", {
        type: "string",
        describe: "Optional file or directory to ingest",
      })
      .option("no-distill", {
        type: "boolean",
        describe: "Index document chunks for retrieval only without distilling memories",
      })
      .option("dry-run", {
        type: "boolean",
        describe: "Preview which files would be ingested without uploading",
      }),
  handler: runCommand(async (argv) =>
    ingestDocuments(argv._instance!, argv.file ? [argv.file] : [], toFlagsRecord(argv, ["file"])),
  ),
};

const searchDocumentCmd: CliCommand<{ query: string; limit?: number }> = {
  command: "search <query>",
  describe: "Search grounded document chunks in this workspace",
  builder: (yargs) =>
    yargs
      .positional("query", {
        type: "string",
        demandOption: true,
        describe: "Natural language search query",
      })
      .option("limit", {
        alias: "n",
        type: "number",
        describe: "Maximum chunks to return",
      }),
  handler: runCommand(async (argv) =>
    searchDocuments(argv._instance!, argv.query, toFlagsRecord(argv, ["query"])),
  ),
};

const deleteDocumentCmd: CliCommand<{ id: string }> = {
  command: "delete <id>",
  describe: "Delete an ingested document and its chunks",
  builder: (yargs) =>
    yargs.positional("id", {
      type: "string",
      demandOption: true,
      describe: "Document ID",
    }),
  handler: runCommand(async (argv) =>
    deleteDocument(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

export const documentCommand: CliCommand = {
  command: "document",
  describe: "Manage grounded workspace documents and chunk search",
  builder: (yargs) =>
    yargs
      .command(listDocumentCmd)
      .command(ingestDocumentCmd)
      .command(searchDocumentCmd)
      .command(deleteDocumentCmd),
  handler: runCommand(async (argv) => listDocuments(argv._instance!, toFlagsRecord(argv))),
};

export const topLevelIngestCommand: CliCommand<{
  file?: string;
  "no-distill"?: boolean;
  "dry-run"?: boolean;
}> = {
  command: "ingest [file]",
  describe:
    "Ingest workspace documents (PDF, DOCX, CSV, HTML, JSON, Markdown) into grounded chunks and distill memories",
  builder: ingestDocumentCmd.builder,
  handler: ingestDocumentCmd.handler,
};
