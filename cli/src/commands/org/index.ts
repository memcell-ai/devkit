import { auditCommand, fleetCommand, insightsCommand } from "../admin/index.js";
import {
  configureOrgSSO,
  createOrganization,
  deleteOrganization,
  deleteOrgSSO,
  enforceOrgSSO,
  getOrganization,
  inviteOrgMember,
  listOrganizations,
  listOrgInvitations,
  listOrgMembers,
  listOrgSSO,
  removeOrgMember,
  revokeOrgInvitation,
  switchOrganization,
  updateOrganization,
  updateOrgMember,
  verifyOrgSSO,
} from "../orgs.js";
import { runCommand, toFlagsRecord, type CliCommand } from "../types.js";

const listOrgCmd: CliCommand = {
  command: ["list", "ls"],
  describe: "List organizations you belong to",
  builder: (yargs) => yargs,
  handler: runCommand(async (argv) => listOrganizations(argv._instance!)),
};

const getOrgCmd: CliCommand<{ slug: string }> = {
  command: "get <slug>",
  describe: "View organization profile and details",
  builder: (yargs) =>
    yargs.positional("slug", {
      type: "string",
      demandOption: true,
      describe: "Organization handle",
    }),
  handler: runCommand(async (argv) => getOrganization(argv._instance!, argv.slug)),
};

const createOrgCmd: CliCommand<{ slug: string; name?: string }> = {
  command: ["create <slug>", "new <slug>"],
  describe: "Create a new organization and set active context",
  builder: (yargs) =>
    yargs
      .positional("slug", { type: "string", demandOption: true, describe: "Unique URL handle" })
      .option("name", { type: "string", describe: "Organization display name" }),
  handler: runCommand(async (argv) =>
    createOrganization(argv._instance!, argv.slug, { name: argv.name }),
  ),
};

const updateOrgCmd: CliCommand<{ slug: string; name?: string }> = {
  command: "update <slug>",
  describe: "Update organization profile name",
  builder: (yargs) =>
    yargs
      .positional("slug", { type: "string", demandOption: true, describe: "Organization handle" })
      .option("name", { type: "string", describe: "Updated display name" }),
  handler: runCommand(async (argv) =>
    updateOrganization(argv._instance!, argv.slug, { name: argv.name }),
  ),
};

const deleteOrgCmd: CliCommand<{ slug: string }> = {
  command: "delete <slug>",
  describe: "Delete an organization",
  builder: (yargs) =>
    yargs.positional("slug", {
      type: "string",
      demandOption: true,
      describe: "Organization handle",
    }),
  handler: runCommand(async (argv) => deleteOrganization(argv._instance!, argv.slug)),
};

const useOrgCmd: CliCommand<{ slug: string }> = {
  command: ["use <slug>", "switch <slug>"],
  describe: "Switch active CLI organization context (or 'personal')",
  builder: (yargs) =>
    yargs.positional("slug", {
      type: "string",
      demandOption: true,
      describe: "Organization handle or 'personal'",
    }),
  handler: runCommand(async (argv) => switchOrganization(argv._instance!, argv.slug)),
};

const memberOrgCmd: CliCommand<{ slug?: string }> = {
  command: "member [slug]",
  describe: "Manage organization members",
  builder: (yargs) =>
    yargs
      .positional("slug", { type: "string", describe: "Organization handle" })
      .option("role", { type: "string", describe: "Filter or set role (member, admin, owner)" })
      .command({
        command: "list <slug>",
        describe: "List organization members",
        builder: (y) =>
          y
            .positional("slug", { type: "string", demandOption: true })
            .option("role", { type: "string" }),
        handler: runCommand<{ slug: string }>(async (argv) =>
          listOrgMembers(argv._instance!, argv.slug, toFlagsRecord(argv, ["slug"])),
        ),
      })
      .command({
        command: "update <slug> <user>",
        describe: "Update an organization member's role",
        builder: (y) =>
          y
            .positional("slug", { type: "string", demandOption: true })
            .positional("user", { type: "string", demandOption: true })
            .option("role", { type: "string" }),
        handler: runCommand<{ slug: string; user: string }>(async (argv) =>
          updateOrgMember(
            argv._instance!,
            argv.slug,
            argv.user,
            toFlagsRecord(argv, ["slug", "user"]),
          ),
        ),
      })
      .command({
        command: "remove <slug> <user>",
        describe: "Remove a member from the organization",
        builder: (y) =>
          y
            .positional("slug", { type: "string", demandOption: true })
            .positional("user", { type: "string", demandOption: true }),
        handler: runCommand<{ slug: string; user: string }>(async (argv) =>
          removeOrgMember(argv._instance!, argv.slug, argv.user),
        ),
      }),
  handler: runCommand(async (argv) => {
    if (!argv.slug) return 1;
    return listOrgMembers(argv._instance!, argv.slug, toFlagsRecord(argv, ["slug"]));
  }),
};

const inviteOrgCmd: CliCommand<{ slug?: string; email?: string }> = {
  command: "invite <slug> [email]",
  describe: "Invite and manage organization invitations",
  builder: (yargs) =>
    yargs
      .positional("slug", { type: "string", describe: "Organization handle" })
      .positional("email", { type: "string", describe: "Email address to invite" })
      .option("role", { type: "string", describe: "Role to assign (member, admin)" })
      .command({
        command: "list <slug>",
        describe: "List pending organization invitations",
        builder: (y) => y.positional("slug", { type: "string", demandOption: true }),
        handler: runCommand<{ slug: string }>(async (argv) =>
          listOrgInvitations(argv._instance!, argv.slug),
        ),
      })
      .command({
        command: "revoke <slug> <invitation>",
        describe: "Revoke a pending organization invitation",
        builder: (y) =>
          y
            .positional("slug", { type: "string", demandOption: true })
            .positional("invitation", { type: "string", demandOption: true }),
        handler: runCommand<{ slug: string; invitation: string }>(async (argv) =>
          revokeOrgInvitation(argv._instance!, argv.slug, argv.invitation),
        ),
      }),
  handler: runCommand(async (argv) => {
    if (!argv.slug || !argv.email) return 1;
    return inviteOrgMember(
      argv._instance!,
      argv.slug,
      argv.email,
      toFlagsRecord(argv, ["slug", "email"]),
    );
  }),
};

const ssoOrgCmd: CliCommand<{ slug?: string }> = {
  command: "sso [slug]",
  describe: "Manage organization SSO identity providers and domain verification",
  builder: (yargs) =>
    yargs
      .positional("slug", { type: "string", describe: "Organization handle" })
      .command({
        command: "list <slug>",
        describe: "List configured SSO identity providers",
        builder: (y) => y.positional("slug", { type: "string", demandOption: true }),
        handler: runCommand<{ slug: string }>(async (argv) =>
          listOrgSSO(argv._instance!, argv.slug),
        ),
      })
      .command({
        command: "configure <slug>",
        describe: "Configure or update a SAML or OIDC provider",
        builder: (y) =>
          y
            .positional("slug", { type: "string", demandOption: true })
            .option("provider-id", { type: "string" })
            .option("provider", { type: "string" })
            .option("type", { type: "string" })
            .option("domain", { type: "string" })
            .option("metadata-url", { type: "string" })
            .option("metadata-xml", { type: "string" })
            .option("client-id", { type: "string" })
            .option("client-secret", { type: "string" })
            .option("issuer", { type: "string" })
            .option("authorization-endpoint", { type: "string" })
            .option("token-endpoint", { type: "string" })
            .option("user-info-endpoint", { type: "string" })
            .option("jwks-uri", { type: "string" }),
        handler: runCommand<{ slug: string }>(async (argv) =>
          configureOrgSSO(argv._instance!, argv.slug, toFlagsRecord(argv, ["slug"])),
        ),
      })
      .command({
        command: "verify <slug>",
        describe: "Verify DNS TXT record for an organization SSO domain",
        builder: (y) =>
          y
            .positional("slug", { type: "string", demandOption: true })
            .option("provider-id", { type: "string" })
            .option("provider", { type: "string" }),
        handler: runCommand<{ slug: string }>(async (argv) =>
          verifyOrgSSO(argv._instance!, argv.slug, toFlagsRecord(argv, ["slug"])),
        ),
      })
      .command({
        command: "enforce <slug>",
        describe: "Enable or disable strict SSO enforcement",
        builder: (y) =>
          y
            .positional("slug", { type: "string", demandOption: true })
            .option("enable", { type: "boolean" })
            .option("disable", { type: "boolean" })
            .option("off", { type: "boolean" }),
        handler: runCommand<{ slug: string }>(async (argv) =>
          enforceOrgSSO(argv._instance!, argv.slug, toFlagsRecord(argv, ["slug"])),
        ),
      })
      .command({
        command: "delete <slug>",
        describe: "Delete an organization SSO provider configuration",
        builder: (y) =>
          y
            .positional("slug", { type: "string", demandOption: true })
            .option("provider-id", { type: "string" })
            .option("provider", { type: "string" }),
        handler: runCommand<{ slug: string }>(async (argv) =>
          deleteOrgSSO(argv._instance!, argv.slug, toFlagsRecord(argv, ["slug"])),
        ),
      }),
  handler: runCommand(async (argv) => {
    if (!argv.slug) return 1;
    return listOrgSSO(argv._instance!, argv.slug);
  }),
};

export const orgCommand: CliCommand = {
  command: "org",
  describe: "Manage organizations, members, fleet, audit logs, and SSO",
  builder: (yargs) =>
    yargs
      .command(listOrgCmd)
      .command(getOrgCmd)
      .command(createOrgCmd)
      .command(updateOrgCmd)
      .command(deleteOrgCmd)
      .command(useOrgCmd)
      .command(memberOrgCmd)
      .command(inviteOrgCmd)
      .command(ssoOrgCmd)
      .command(fleetCommand)
      .command(auditCommand)
      .command(insightsCommand),
  handler: runCommand(async (argv) => listOrganizations(argv._instance!)),
};
