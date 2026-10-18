import yargs, { type Argv } from "yargs";
import { migrateWiring } from "./adapters/index.js";
import { accountCommand } from "./commands/account/index.js";
import { exportCommand, importCommand, mcpCommand } from "./commands/admin/index.js";
import { agentCommand } from "./commands/agent/index.js";
import { loginCommand, logoutCommand } from "./commands/auth/index.js";
import { configCommand } from "./commands/config/index.js";
import { connectCommand, disconnectCommand, statusCommand } from "./commands/connect/index.js";
import { documentCommand, topLevelIngestCommand } from "./commands/document/index.js";
import { hookCommand } from "./commands/hook/index.js";
import { recallCommand, rememberCommand, reportCommand } from "./commands/loop/index.js";
import { memoryCommand } from "./commands/memory/index.js";
import { orgCommand } from "./commands/org/index.js";
import { serverCommand } from "./commands/server/index.js";
import { teamCommand } from "./commands/team/index.js";
import { threadCommand } from "./commands/thread/index.js";
import {
  getExitCode,
  resetExitCode,
  setExitCode,
  toFlagsRecord,
  type CliCommand,
  type GlobalArgs,
} from "./commands/types.js";
import { webhookCommand } from "./commands/webhook/index.js";
import { workspaceCommand } from "./commands/workspace/index.js";
import { resolveContext } from "./context.js";
import { badInstance, whereInstance } from "./instance.js";
import { badge, row, say, warn } from "./ui.js";
import { findWorkspace } from "./workspace.js";

export const YARGS_COMMANDS: CliCommand<any>[] = [
  // 1. Auth & Local Lifecycle
  loginCommand,
  logoutCommand,
  connectCommand,
  disconnectCommand,
  statusCommand,

  // 2. Daily Memory Loop
  recallCommand,
  rememberCommand,
  reportCommand,
  importCommand,
  exportCommand,
  topLevelIngestCommand,

  // 3. Core Resources & Administration
  workspaceCommand,
  memoryCommand,
  threadCommand,
  documentCommand,
  agentCommand,
  hookCommand,
  orgCommand,
  teamCommand,
  accountCommand,
  webhookCommand,
  configCommand,
  serverCommand,
  mcpCommand,
];

export class CliAbortError extends Error {
  constructor(
    public readonly exitCode: number,
    message = `CLI aborted with code ${exitCode}`,
  ) {
    super(message);
  }
}

export function createCli(argv: string[], version: string): Argv<GlobalArgs> {
  const parser = yargs(argv)
    .scriptName("memcell")
    .usage("Usage: $0 <command> [options]")
    .version(version)
    .alias("v", "version")
    .help("help")
    .alias("h", "help")
    .option("url", {
      alias: "u",
      type: "string",
      global: true,
      describe: "MemCell server URL (env: MEMCELL_INSTANCE)",
    })
    .option("workspace", {
      alias: "w",
      type: "string",
      global: true,
      describe: "Target workspace ([owner]/<slug> or <slug>)",
    })
    .option("owner", {
      type: "string",
      global: true,
      describe: "Target user or organization handle",
    })
    .option("json", {
      type: "boolean",
      global: true,
      describe: "Output results as JSON",
    })
    .group(["url", "workspace", "owner", "json", "help", "version"], "Global Options:")
    .middleware(async (args) => {
      const urlFlag = typeof args.url === "string" ? args.url : undefined;
      const { instance, from } = await whereInstance(urlFlag);
      const cmdPath = args._.map(String);

      const wrong = badInstance(instance);
      if (wrong && cmdPath[0] !== "hook") {
        setExitCode(1);
        throw new CliAbortError(1, wrong);
      }

      const found = await findWorkspace().catch(() => null);
      if (found) await migrateWiring(found.root).catch(() => []);

      const context = await resolveContext(instance, toFlagsRecord(args), from, {
        skipRemote: true,
      });
      args._instance = instance;
      args._from = from;
      args._context = context;
    });

  for (const cmd of YARGS_COMMANDS) {
    parser.command(cmd);
  }

  return parser
    .demandCommand(1, "Specify a command to run. Use --help to see available commands.")
    .recommendCommands()
    .strictCommands()
    .wrap(Math.min(100, parser.terminalWidth() || 100))
    .exitProcess(false)
    .fail((msg, err) => {
      if (err instanceof CliAbortError) {
        throw err;
      }
      if (err) {
        throw err;
      }
      setExitCode(1);
      throw new CliAbortError(1, msg || "Invalid command or options");
    });
}

export async function runYargsCli(argv: string[], version: string): Promise<number> {
  resetExitCode(0);
  const effectiveArgv = argv.length === 0 ? ["--help"] : argv;
  const cli = createCli(effectiveArgv, version);
  try {
    await cli.parseAsync();
    return getExitCode();
  } catch (err) {
    if (err instanceof CliAbortError) {
      if (err.message) {
        say(row(0, [badge("memcell")]), row(1, [warn(err.message)]));
      }
      return err.exitCode;
    }
    throw err;
  }
}
