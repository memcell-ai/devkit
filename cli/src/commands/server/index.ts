import { operatorCommand } from "../admin/index.js";
import { startServer, stopServer } from "../server.js";
import {
  installService,
  startService,
  statusService,
  stopService,
  uninstallService,
} from "../service.js";
import { runCommand, toFlagsRecord, type CliCommand } from "../types.js";

export interface StartServerArgs {
  daemon?: boolean;
  service?: boolean;
  "on-boot"?: boolean;
  port?: number;
  "data-dir"?: string;
  "no-browser"?: boolean;
  force?: boolean;
}

export const startServerCmd: CliCommand<StartServerArgs> = {
  command: "start",
  describe: "Start local MemCell server with embedded PGlite storage",
  builder: (yargs) =>
    yargs
      .option("daemon", {
        alias: "d",
        type: "boolean",
        describe: "Run local server as a background daemon process",
      })
      .option("service", {
        type: "boolean",
        describe: "Manage or run as an OS system service",
      })
      .option("on-boot", {
        type: "boolean",
        describe: "Automatically launch the local server on OS boot or login",
      })
      .option("port", {
        type: "number",
        describe: "Port to bind the local server on (default: 3000)",
      })
      .option("data-dir", {
        type: "string",
        describe: "Directory for local PGlite data storage",
      })
      .option("no-browser", {
        type: "boolean",
        describe: "Do not open the dashboard in a browser",
      })
      .option("force", {
        alias: "f",
        type: "boolean",
        describe: "Force restart if already running",
      }),
  handler: runCommand(async (argv) =>
    startServer(argv._instance!, {
      daemon: Boolean(argv.daemon),
      service: Boolean(argv.service),
      onBoot: Boolean(argv["on-boot"]),
      port: argv.port,
      dataDir: argv["data-dir"],
      noBrowser: Boolean(argv["no-browser"]),
      force: Boolean(argv.force),
    }),
  ),
};

export const stopServerCmd: CliCommand<{ force?: boolean }> = {
  command: "stop",
  describe: "Stop the running background local MemCell server",
  builder: (yargs) =>
    yargs.option("force", {
      alias: "f",
      type: "boolean",
      describe: "Force stop the background process",
    }),
  handler: runCommand(async (argv) =>
    stopServer({
      force: Boolean(argv.force),
    }),
  ),
};

export const serviceCommand: CliCommand = {
  command: "service",
  describe: "Manage the native OS background system service (launchd / systemd)",
  builder: (yargs) =>
    yargs
      .command({
        command: "install",
        describe: "Install local server as a native OS system service",
        builder: (y) =>
          y
            .option("port", { type: "number", describe: "Port to bind" })
            .option("data-dir", { type: "string", describe: "Data directory path" }),
        handler: runCommand(async (argv) => installService(argv._instance!, toFlagsRecord(argv))),
      })
      .command({
        command: "uninstall",
        describe: "Uninstall and remove the native OS system service",
        builder: (y) => y,
        handler: runCommand(async () => uninstallService()),
      })
      .command({
        command: "status",
        describe: "Check native OS system service running state",
        builder: (y) => y,
        handler: runCommand(async () => statusService()),
      })
      .command({
        command: "start",
        describe: "Start the installed native OS system service",
        builder: (y) => y,
        handler: runCommand(async () => startService()),
      })
      .command({
        command: "stop",
        describe: "Stop the running native OS system service",
        builder: (y) => y,
        handler: runCommand(async () => stopService()),
      }),
  handler: runCommand(async () => statusService()),
};

export const serverCommand: CliCommand = {
  command: "server",
  describe: "Start, stop, or manage the local MemCell server and cluster",
  builder: (yargs) =>
    yargs
      .demandCommand(1, "Specify a server subcommand (start, stop, service, or operator).")
      .command(startServerCmd)
      .command(stopServerCmd)
      .command(serviceCommand)
      .command(operatorCommand),
  handler: () => {},
};
