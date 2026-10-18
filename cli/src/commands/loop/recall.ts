import { recall } from "../recall.js";
import { runCommand, toFlagsRecord, type CliCommand } from "../types.js";

export interface RecallArgs {
  intent: string;
  limit?: number;
  scope?: string;
  scopes?: string;
  "my-memory"?: boolean;
  my?: boolean;
  meta?: boolean;
  metadata?: boolean;
  type?: string;
  enforce?: boolean;
  "min-confidence"?: number;
  "confidence-floor"?: number;
  floor?: number;
  subject?: string;
  target?: string;
  format?: string;
  "allow-provisional"?: boolean;
  provisional?: boolean;
}

export const recallCommand: CliCommand<RecallArgs> = {
  command: "recall <intent>",
  describe: "Recall relevant memories, threads, and documents before acting",
  builder: (yargs) =>
    yargs
      .positional("intent", {
        type: "string",
        demandOption: true,
        describe: "What you are trying to do or know",
      })
      .option("limit", {
        alias: "n",
        type: "number",
        describe: "Maximum number of matched memories to return",
      })
      .option("scope", {
        type: "string",
        describe: "Operational scope filter (user, workspace, team, organization)",
      })
      .option("scopes", {
        type: "string",
        describe: "Comma-separated operational scopes",
      })
      .option("my-memory", {
        alias: "my",
        type: "boolean",
        describe: "Include authenticated caller personal memory",
      })
      .option("meta", {
        alias: "metadata",
        type: "boolean",
        describe: "Include memory metadata in recall output",
      })
      .option("type", {
        type: "string",
        choices: ["instruction", "decision", "fact", "preference"] as const,
        describe: "Filter by memory type",
      })
      .option("enforce", {
        type: "boolean",
        describe: "Filter for strictly enforced guard instructions",
      })
      .option("min-confidence", {
        alias: ["confidence-floor", "floor"],
        type: "number",
        describe: "Minimum calibrated confidence threshold (0.0 to 1.0)",
      })
      .option("subject", {
        alias: "target",
        type: "string",
        describe: "Domain entity or topic filter",
      })
      .option("format", {
        type: "string",
        describe: "Output format (json, agents-md, claude-md, cursorrules)",
      })
      .option("allow-provisional", {
        alias: "provisional",
        type: "boolean",
        describe: "Include provisional uncalibrated memories",
      }),
  handler: runCommand(async (argv) => recall(argv.intent, toFlagsRecord(argv, ["intent"]))),
};
