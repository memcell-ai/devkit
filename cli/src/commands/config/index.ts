import { configGet, configSet } from "../config.js";
import { runCommand, type CliCommand } from "../types.js";

const getConfigCmd: CliCommand<{ key: string; global?: boolean }> = {
  command: "get <key>",
  describe: "Read a configuration setting and its source file",
  builder: (yargs) =>
    yargs
      .positional("key", {
        type: "string",
        demandOption: true,
        describe: "Dotted configuration key (e.g. recall.limit)",
      })
      .option("global", {
        alias: "g",
        type: "boolean",
        describe: "Read from global machine config instead of workspace config",
      }),
  handler: runCommand(async (argv) => configGet(argv.key, Boolean(argv.global))),
};

const setConfigCmd: CliCommand<{ key: string; value: string; global?: boolean }> = {
  command: "set <key> <value>",
  describe: "Write a configuration setting for this workspace or machine",
  builder: (yargs) =>
    yargs
      .positional("key", {
        type: "string",
        demandOption: true,
        describe: "Dotted configuration key (e.g. recall.limit)",
      })
      .positional("value", {
        type: "string",
        demandOption: true,
        describe: "Value to store",
      })
      .option("global", {
        alias: "g",
        type: "boolean",
        describe: "Write to global machine config instead of workspace config",
      }),
  handler: runCommand(async (argv) => configSet(argv.key, argv.value, Boolean(argv.global))),
};

export const configCommand: CliCommand = {
  command: "config",
  describe: "Read and write workspace or global CLI configuration settings",
  builder: (yargs) =>
    yargs
      .demandCommand(1, "Specify a config subcommand (get or set).")
      .option("global", {
        alias: "g",
        type: "boolean",
        describe: "Target global machine config",
      })
      .command(getConfigCmd)
      .command(setConfigCmd),
  handler: () => {},
};
