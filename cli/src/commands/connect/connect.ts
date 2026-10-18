import { adapterFor } from "../../adapters/index.js";
import { connect } from "../connect.js";
import { runCommand, type CliCommand } from "../types.js";

export interface ConnectArgs {
  target?: string;
  pair?: string;
  agent?: string;
  "no-browser"?: boolean;
  claude?: boolean;
  cursor?: boolean;
  copilot?: boolean;
  codex?: boolean;
  openai?: boolean;
  opencode?: boolean;
  hermes?: boolean;
  antigravity?: boolean;
  gemini?: boolean;
  goose?: boolean;
  windsurf?: boolean;
  mcp?: boolean;
}

export const connectCommand: CliCommand<ConnectArgs> = {
  command: "connect [target]",
  aliases: ["init"],
  describe: "Connect this directory to a workspace and install agent hooks",
  builder: (yargs) =>
    yargs
      .positional("target", {
        type: "string",
        describe: "Workspace to connect ([owner]/<slug> or <slug>)",
      })
      .option("pair", {
        type: "string",
        describe: "Pairing ticket code from the browser connect page",
      })
      .option("agent", {
        type: "string",
        describe: "Explicit agent harness to wire (e.g. claude, cursor, antigravity)",
      })
      .option("no-browser", {
        type: "boolean",
        describe: "Print the login link instead of opening a browser",
      })
      .option("claude", { type: "boolean", hidden: true })
      .option("cursor", { type: "boolean", hidden: true })
      .option("copilot", { type: "boolean", hidden: true })
      .option("codex", { type: "boolean", hidden: true })
      .option("openai", { type: "boolean", hidden: true })
      .option("opencode", { type: "boolean", hidden: true })
      .option("hermes", { type: "boolean", hidden: true })
      .option("antigravity", { type: "boolean", hidden: true })
      .option("gemini", { type: "boolean", hidden: true })
      .option("goose", { type: "boolean", hidden: true })
      .option("windsurf", { type: "boolean", hidden: true })
      .option("mcp", { type: "boolean", hidden: true }),
  handler: runCommand(async (argv) => {
    let explicitAgent =
      argv.agent ||
      (argv.claude ? "claude" : undefined) ||
      (argv.cursor ? "cursor" : undefined) ||
      (argv.copilot ? "copilot" : undefined) ||
      (argv.codex ? "codex" : undefined) ||
      (argv.openai ? "codex" : undefined) ||
      (argv.opencode ? "opencode" : undefined) ||
      (argv.hermes ? "hermes" : undefined) ||
      (argv.antigravity ? "antigravity" : undefined) ||
      (argv.gemini ? "gemini" : undefined) ||
      (argv.goose ? "goose" : undefined) ||
      (argv.windsurf ? "windsurf" : undefined) ||
      (argv.mcp ? "mcp" : undefined);

    let workspaceArg = argv.target;
    if (!explicitAgent && workspaceArg && !workspaceArg.includes("/")) {
      const normalized = workspaceArg.trim().toLowerCase();
      if (adapterFor(normalized)) {
        explicitAgent = normalized === "openai" ? "codex" : normalized;
        workspaceArg = undefined;
      }
    }

    return connect(argv._instance!, {
      pair: argv.pair,
      workspace: workspaceArg ?? argv.workspace ?? argv.project,
      agent: explicitAgent,
      noBrowser: Boolean(argv["no-browser"]),
      from: argv._from ?? "default",
    });
  }),
};
