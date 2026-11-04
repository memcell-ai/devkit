import { inviteCollaborator } from "./collaborators.js";
import { runCommand, toFlagsRecord, type CliCommand } from "./types.js";

// `memcell invite <email>` — the short way to bring a teammate into the workspace this
// folder is connected to. The same invitation as `workspace collaborator invite`.
export const inviteCommand: CliCommand<{ email: string; role?: string }> = {
  command: "invite <email>",
  describe: "Invite a teammate to this workspace, so their agents recall what it shares",
  builder: (yargs) =>
    yargs.positional("email", { type: "string", demandOption: true }).option("role", {
      type: "string",
      describe: "Access role: read, write or admin (write lets their agents save)",
    }),
  handler: runCommand<{ email: string }>(async (argv) =>
    inviteCollaborator(argv._instance!, argv.email, toFlagsRecord(argv, ["email"])),
  ),
};
