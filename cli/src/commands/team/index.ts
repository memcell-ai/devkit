import {
  addTeamMember,
  createTeam,
  deleteTeam,
  getTeam,
  inviteTeamMember,
  listTeamMembers,
  listTeams,
  removeTeamMember,
  updateTeam,
} from "../teams.js";
import { runCommand, toFlagsRecord, type CliCommand } from "../types.js";

const listTeamCmd: CliCommand = {
  command: ["list", "ls"],
  describe: "List organization teams",
  builder: (yargs) => yargs.option("org", { type: "string", describe: "Organization handle" }),
  handler: runCommand(async (argv) => listTeams(argv._instance!, toFlagsRecord(argv))),
};

const getTeamCmd: CliCommand<{ id: string }> = {
  command: "get <id>",
  describe: "View team details, workspaces, and agents",
  builder: (yargs) =>
    yargs
      .positional("id", { type: "string", demandOption: true, describe: "Team ID" })
      .option("org", { type: "string", describe: "Organization handle" }),
  handler: runCommand(async (argv) =>
    getTeam(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const createTeamCmd: CliCommand<{ name: string }> = {
  command: ["create <name>", "new <name>"],
  describe: "Create a new team in the organization",
  builder: (yargs) =>
    yargs
      .positional("name", { type: "string", demandOption: true, describe: "Team name" })
      .option("org", { type: "string", describe: "Organization handle" }),
  handler: runCommand(async (argv) =>
    createTeam(argv._instance!, argv.name, toFlagsRecord(argv, ["name"])),
  ),
};

const updateTeamCmd: CliCommand<{ id: string; name?: string }> = {
  command: "update <id>",
  describe: "Update team name",
  builder: (yargs) =>
    yargs
      .positional("id", { type: "string", demandOption: true, describe: "Team ID" })
      .option("name", { type: "string", describe: "Updated team name" })
      .option("org", { type: "string", describe: "Organization handle" }),
  handler: runCommand(async (argv) =>
    updateTeam(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const deleteTeamCmd: CliCommand<{ id: string }> = {
  command: "delete <id>",
  describe: "Delete a team from the organization",
  builder: (yargs) =>
    yargs
      .positional("id", { type: "string", demandOption: true, describe: "Team ID" })
      .option("org", { type: "string", describe: "Organization handle" }),
  handler: runCommand(async (argv) =>
    deleteTeam(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
  ),
};

const memberTeamCmd: CliCommand<{ id?: string }> = {
  command: "member [id]",
  describe: "List, add, or remove members of a team",
  builder: (yargs) =>
    yargs
      .positional("id", { type: "string", describe: "Team ID" })
      .option("org", { type: "string", describe: "Organization handle" })
      .command({
        command: "list <id>",
        describe: "List members of a team",
        builder: (y) =>
          y
            .positional("id", { type: "string", demandOption: true })
            .option("org", { type: "string" }),
        handler: runCommand<{ id: string }>(async (argv) =>
          listTeamMembers(argv._instance!, argv.id, toFlagsRecord(argv, ["id"])),
        ),
      })
      .command({
        command: "add <id> <user>",
        describe: "Add a user to a team",
        builder: (y) =>
          y
            .positional("id", { type: "string", demandOption: true })
            .positional("user", { type: "string", demandOption: true })
            .option("org", { type: "string" })
            .option("role", { type: "string" }),
        handler: runCommand<{ id: string; user: string }>(async (argv) =>
          addTeamMember(argv._instance!, argv.id, argv.user, toFlagsRecord(argv, ["id", "user"])),
        ),
      })
      .command({
        command: "remove <id> <user>",
        describe: "Remove a user from a team",
        builder: (y) =>
          y
            .positional("id", { type: "string", demandOption: true })
            .positional("user", { type: "string", demandOption: true })
            .option("org", { type: "string" }),
        handler: runCommand<{ id: string; user: string }>(async (argv) =>
          removeTeamMember(
            argv._instance!,
            argv.id,
            argv.user,
            toFlagsRecord(argv, ["id", "user"]),
          ),
        ),
      }),
  handler: runCommand(async (argv) => {
    if (!argv.id) return 1;
    return listTeamMembers(argv._instance!, argv.id, toFlagsRecord(argv, ["id"]));
  }),
};

const inviteTeamCmd: CliCommand<{ email: string }> = {
  command: "invite <email>",
  describe: "Invite a colleague to the organization or workspace",
  builder: (yargs) =>
    yargs
      .positional("email", { type: "string", demandOption: true, describe: "Colleague email" })
      .option("org", { type: "string", describe: "Organization handle" })
      .option("role", { type: "string", describe: "Role to assign" })
      .option("team", { type: "string", describe: "Team ID" }),
  handler: runCommand(async (argv) =>
    inviteTeamMember(argv._instance!, argv.email, toFlagsRecord(argv, ["email"])),
  ),
};

export const teamCommand: CliCommand = {
  command: "team",
  describe: "Manage organization teams and team members",
  builder: (yargs) =>
    yargs
      .command(listTeamCmd)
      .command(getTeamCmd)
      .command(createTeamCmd)
      .command(updateTeamCmd)
      .command(deleteTeamCmd)
      .command(memberTeamCmd)
      .command(inviteTeamCmd),
  handler: runCommand(async (argv) => listTeams(argv._instance!, toFlagsRecord(argv))),
};
