import { exportAuditLogs, listAuditLogs } from "../audit.js";
import {
  inviteCollaborator,
  listCollaborators,
  removeCollaborator,
  revokeCollaboratorInvite,
  updateCollaboratorRole,
} from "../collaborators.js";
import { exportSpace } from "../export.js";
import {
  getFleetAgent,
  grantFleetWorkspace,
  listFleet,
  registerFleetAgent,
  resumeFleetAgent,
  revokeFleetWorkspace,
  suspendFleetAgent,
} from "../fleet.js";
import { importFiles } from "../import.js";
import { getEnterpriseInsights } from "../insights.js";
import { mcp } from "../mcp.js";
import {
  getOperatorAnalytics,
  getOperatorConfig,
  getOperatorLimits,
  getOperatorStats,
  listOperatorUsers,
  listOperatorWorkspaces,
} from "../operator.js";
import { pause, resume } from "../pause.js";
import { promote } from "../promote.js";
import { approvePromotion, listPromotions, rejectPromotion } from "../promotions.js";
import { reset } from "../reset.js";
import { scope } from "../scope.js";
import { stats } from "../stats.js";
import { sweepConsolidate } from "../sweep.js";
import { runCommand, toFlagsRecord, type CliCommand } from "../types.js";
import { getUsage } from "../usage.js";

export const importCommand: CliCommand<{
  files?: string[];
  "dry-run"?: boolean;
  scope?: string;
  type?: string;
}> = {
  command: "import [files..]",
  describe: "Import existing instruction files or JSON exports into memory",
  builder: (yargs) =>
    yargs
      .positional("files", {
        type: "string",
        array: true,
        describe: "Files or JSON exports to distill",
      })
      .option("dry-run", {
        type: "boolean",
        describe: "Preview what would be imported without writing to memory",
      })
      .option("scope", { type: "string", describe: "Operational scope" })
      .option("type", { type: "string", describe: "Memory type" }),
  handler: runCommand(async (argv) =>
    importFiles({
      files: argv.files ?? [],
      url: argv.url,
      workspace:
        argv.workspace ??
        argv.project ??
        argv._context?.workspace?.namespace ??
        argv._context?.project?.namespace,
      owner: argv.owner ?? argv._context?.owner ?? undefined,
      dryRun: Boolean(argv["dry-run"]),
      scope: argv.scope,
      type: argv.type,
      json: Boolean(argv.json),
    }),
  ),
};

export const exportCommand: CliCommand<{ format?: string; out?: string }> = {
  command: "export",
  describe: "Export memories from the active workspace",
  builder: (yargs) =>
    yargs
      .option("format", {
        type: "string",
        default: "json",
        describe: "Output format (json, agents-md, claude-md, cursorrules)",
      })
      .option("out", {
        alias: "o",
        type: "string",
        describe: "Write output to a file instead of stdout",
      }),
  handler: runCommand(async (argv) =>
    exportSpace(
      argv.format || "json",
      argv.out,
      argv.url,
      argv.workspace ??
        argv.project ??
        argv._context?.workspace?.namespace ??
        argv._context?.project?.namespace,
    ),
  ),
};

export const sweepCommand: CliCommand<{
  "min-similarity"?: number;
  "min-cluster-size"?: number;
  "max-cluster-size"?: number;
  wait?: boolean;
  "no-wait"?: boolean;
}> = {
  command: "sweep [action]",
  describe: "Run a consolidation sweep over memories in the active workspace",
  builder: (yargs) =>
    yargs
      .positional("action", { type: "string", describe: "Optional sub-action (consolidate)" })
      .option("min-similarity", {
        type: "number",
        describe: "Minimum cosine similarity threshold (default: 0.80)",
      })
      .option("min-cluster-size", {
        type: "number",
        describe: "Minimum memories per cluster (default: 2)",
      })
      .option("max-cluster-size", {
        type: "number",
        describe: "Maximum memories per cluster (default: 8)",
      })
      .option("wait", { type: "boolean", describe: "Wait for background job completion" })
      .option("no-wait", {
        type: "boolean",
        describe: "Submit consolidation job asynchronously without waiting",
      }),
  handler: runCommand(async (argv) =>
    sweepConsolidate(argv._instance!, toFlagsRecord(argv, ["action"]), argv._context),
  ),
};

export const pauseCommand: CliCommand = {
  command: "pause",
  describe: "Pause background hooks for this workspace",
  builder: (yargs) => yargs,
  handler: runCommand(async (argv) => pause(argv._from ?? "default")),
};

export const resumeCommand: CliCommand = {
  command: ["resume", "unpause"],
  describe: "Resume background hooks for this workspace",
  builder: (yargs) => yargs,
  handler: runCommand(async (argv) => resume(argv._from ?? "default")),
};

export const resetCommand: CliCommand<{ force?: boolean }> = {
  command: "reset",
  describe: "Clear all local MemCell credentials and state on this machine",
  builder: (yargs) =>
    yargs.option("force", {
      alias: "f",
      type: "boolean",
      describe: "Skip confirmation prompt",
    }),
  handler: runCommand(async (argv) => reset(Boolean(argv.force))),
};

export const mcpCommand: CliCommand<{ dir?: string; agent?: string }> = {
  command: "mcp",
  describe: false,
  builder: (yargs) =>
    yargs
      .option("dir", { type: "string", describe: "Workspace directory" })
      .option("agent", { type: "string", describe: "Agent identifier" }),
  handler: runCommand(async (argv) => mcp(argv.dir, argv.agent)),
};

export const promoteCommand: CliCommand<{ memory: string; to?: string; reason?: string }> = {
  command: "promote <memory>",
  describe: "Promote a memory to workspace, team, or organization scope",
  builder: (yargs) =>
    yargs
      .positional("memory", { type: "string", demandOption: true, describe: "Memory ID" })
      .option("to", { type: "string", default: "workspace", describe: "Target scope" })
      .option("reason", { type: "string", describe: "Reason for promotion" }),
  handler: runCommand(async (argv) =>
    promote(argv.memory, argv.to || "workspace", argv.reason, argv.url),
  ),
};

export const scopeCommand: CliCommand = {
  command: "scope [action]",
  describe: "List active operational scopes in this workspace",
  builder: (yargs) =>
    yargs.positional("action", { type: "string", describe: "Optional action (list, ls)" }),
  handler: runCommand(async (argv) => scope(argv.url)),
};

export const statsCommand: CliCommand = {
  command: "stats",
  describe: "View workspace agent activity and token savings statistics",
  builder: (yargs) => yargs,
  handler: runCommand(async (argv) => stats(argv._instance!)),
};

export const promotionCommand: CliCommand = {
  command: "promotion",
  describe: "Review and approve or reject scope promotion requests",
  builder: (yargs) =>
    yargs
      .option("status", { type: "string", describe: "Filter by request status" })
      .command({
        command: ["list", "ls"],
        describe: "List pending scope promotion requests",
        builder: (y) => y.option("status", { type: "string" }),
        handler: runCommand(async (argv) => listPromotions(argv._instance!, toFlagsRecord(argv))),
      })
      .command({
        command: "approve <request>",
        describe: "Approve a pending scope promotion request",
        builder: (y) =>
          y
            .positional("request", { type: "string", demandOption: true })
            .option("reason", { type: "string" }),
        handler: runCommand<{ request: string; reason?: string }>(async (argv) =>
          approvePromotion(
            argv._instance!,
            argv.request,
            argv.reason,
            toFlagsRecord(argv, ["request"]),
          ),
        ),
      })
      .command({
        command: "reject <request>",
        describe: "Reject a pending scope promotion request",
        builder: (y) =>
          y
            .positional("request", { type: "string", demandOption: true })
            .option("reason", { type: "string" }),
        handler: runCommand<{ request: string; reason?: string }>(async (argv) =>
          rejectPromotion(
            argv._instance!,
            argv.request,
            argv.reason,
            toFlagsRecord(argv, ["request"]),
          ),
        ),
      }),
  handler: runCommand(async (argv) => listPromotions(argv._instance!, toFlagsRecord(argv))),
};

export const collaboratorCommand: CliCommand = {
  command: "collaborator",
  describe: "Manage workspace collaborators and invitations",
  builder: (yargs) =>
    yargs
      .option("role", { type: "string", describe: "Access role (read, write, admin)" })
      .command({
        command: ["list [target]", "ls [target]"],
        describe: "List workspace collaborators and pending invitations",
        builder: (y) =>
          y
            .positional("target", { type: "string", describe: "Optional workspace namespace" })
            .option("role", { type: "string" }),
        handler: runCommand<{ target?: string }>(async (argv) =>
          listCollaborators(argv._instance!, argv.target, toFlagsRecord(argv, ["target"])),
        ),
      })
      .command({
        command: "invite <email>",
        describe: "Invite a collaborator to the workspace",
        builder: (y) =>
          y
            .positional("email", { type: "string", demandOption: true })
            .option("role", { type: "string" }),
        handler: runCommand<{ email: string }>(async (argv) =>
          inviteCollaborator(argv._instance!, argv.email, toFlagsRecord(argv, ["email"])),
        ),
      })
      .command({
        command: "update-role <user>",
        describe: "Update a collaborator's access role",
        builder: (y) =>
          y
            .positional("user", { type: "string", demandOption: true })
            .option("role", { type: "string" }),
        handler: runCommand<{ user: string }>(async (argv) =>
          updateCollaboratorRole(argv._instance!, argv.user, toFlagsRecord(argv, ["user"])),
        ),
      })
      .command({
        command: "remove <user>",
        describe: "Remove a collaborator from the workspace",
        builder: (y) => y.positional("user", { type: "string", demandOption: true }),
        handler: runCommand<{ user: string }>(async (argv) =>
          removeCollaborator(argv._instance!, argv.user, toFlagsRecord(argv, ["user"])),
        ),
      })
      .command({
        command: "revoke-invite <invitation>",
        describe: "Revoke a pending workspace invitation",
        builder: (y) => y.positional("invitation", { type: "string", demandOption: true }),
        handler: runCommand<{ invitation: string }>(async (argv) =>
          revokeCollaboratorInvite(
            argv._instance!,
            argv.invitation,
            toFlagsRecord(argv, ["invitation"]),
          ),
        ),
      }),
  handler: runCommand(async (argv) =>
    listCollaborators(argv._instance!, undefined, toFlagsRecord(argv)),
  ),
};

export const fleetCommand: CliCommand = {
  command: "fleet",
  describe: "Manage organization agent fleet and cross-workspace access grants",
  builder: (yargs) =>
    yargs
      .option("org", { type: "string" })
      .command({
        command: ["list", "ls"],
        describe: "List autonomous agent fleet across the organization",
        builder: (y) =>
          y
            .option("org", { type: "string" })
            .option("scope", { type: "string" })
            .option("status", { type: "string" })
            .option("health", { type: "string" })
            .option("team", { type: "string" }),
        handler: runCommand(async (argv) => listFleet(argv._instance!, toFlagsRecord(argv))),
      })
      .command({
        command: "get <agentId>",
        describe: "Inspect fleet agent configuration and workspace grants",
        builder: (y) =>
          y
            .positional("agentId", { type: "string", demandOption: true })
            .option("org", { type: "string" }),
        handler: runCommand<{ agentId: string }>(async (argv) =>
          getFleetAgent(argv._instance!, argv.agentId, toFlagsRecord(argv, ["agentId"])),
        ),
      })
      .command({
        command: "register <name>",
        describe: "Register a new agent in the organization fleet",
        builder: (y) =>
          y
            .positional("name", { type: "string", demandOption: true })
            .option("org", { type: "string" })
            .option("slug", { type: "string" })
            .option("scope", { type: "string" })
            .option("framework", { type: "string" })
            .option("model", { type: "string" })
            .option("description", { type: "string" })
            .option("team", { type: "string" })
            .option("no-key", { type: "boolean" }),
        handler: runCommand<{ name: string }>(async (argv) =>
          registerFleetAgent(argv._instance!, argv.name, toFlagsRecord(argv, ["name"])),
        ),
      })
      .command({
        command: ["suspend <agentId>", "kill <agentId>"],
        describe: "Suspend gateway access for a fleet agent",
        builder: (y) =>
          y
            .positional("agentId", { type: "string", demandOption: true })
            .option("org", { type: "string" })
            .option("reason", { type: "string" }),
        handler: runCommand<{ agentId: string }>(async (argv) =>
          suspendFleetAgent(argv._instance!, argv.agentId, toFlagsRecord(argv, ["agentId"])),
        ),
      })
      .command({
        command: "resume <agentId>",
        describe: "Reactivate a suspended fleet agent",
        builder: (y) =>
          y
            .positional("agentId", { type: "string", demandOption: true })
            .option("org", { type: "string" }),
        handler: runCommand<{ agentId: string }>(async (argv) =>
          resumeFleetAgent(argv._instance!, argv.agentId, toFlagsRecord(argv, ["agentId"])),
        ),
      })
      .command({
        command: "grant <agentId>",
        describe: "Grant cross-workspace access for a fleet agent",
        builder: (y) =>
          y
            .positional("agentId", { type: "string", demandOption: true })
            .option("org", { type: "string" })
            .option("permission", { type: "string" }),
        handler: runCommand<{ agentId: string }>(async (argv) =>
          grantFleetWorkspace(argv._instance!, argv.agentId, toFlagsRecord(argv, ["agentId"])),
        ),
      })
      .command({
        command: "revoke <agentId>",
        describe: "Revoke cross-workspace access for a fleet agent",
        builder: (y) =>
          y
            .positional("agentId", { type: "string", demandOption: true })
            .option("org", { type: "string" }),
        handler: runCommand<{ agentId: string }>(async (argv) =>
          revokeFleetWorkspace(argv._instance!, argv.agentId, toFlagsRecord(argv, ["agentId"])),
        ),
      }),
  handler: runCommand(async (argv) => listFleet(argv._instance!, toFlagsRecord(argv))),
};

export const usageCommand: CliCommand<{ targetOwner?: string; timeframe?: string }> = {
  command: "usage [targetOwner]",
  describe: "Inspect account or organization usage, quotas, and memory breakdowns",
  builder: (yargs) =>
    yargs
      .positional("targetOwner", {
        type: "string",
        describe: "Optional user or organization handle",
      })
      .option("timeframe", {
        type: "string",
        describe: "Telemetry timeframe (24h, 7d, 30d, all)",
      }),
  handler: runCommand(async (argv) =>
    getUsage(
      argv._instance!,
      argv.targetOwner === "get" ? undefined : argv.targetOwner,
      toFlagsRecord(argv, ["targetOwner"]),
    ),
  ),
};

export const auditCommand: CliCommand = {
  command: "audit",
  describe: "Inspect and export enterprise audit logs",
  builder: (yargs) =>
    yargs
      .option("org", { type: "string" })
      .option("actor", { type: "string" })
      .option("actor-type", { type: "string" })
      .option("action", { type: "string" })
      .option("target-type", { type: "string" })
      .option("target-id", { type: "string" })
      .option("team", { type: "string" })
      .option("from", { type: "string" })
      .option("to", { type: "string" })
      .option("limit", { alias: "n", type: "number" })
      .command({
        command: ["list", "ls"],
        describe: "List enterprise audit events",
        builder: (y) => y,
        handler: runCommand(async (argv) => listAuditLogs(argv._instance!, toFlagsRecord(argv))),
      })
      .command({
        command: "export",
        describe: "Export enterprise audit logs (CEF, JSON, or CSV)",
        builder: (y) =>
          y.option("format", { type: "string" }).option("out", { alias: "o", type: "string" }),
        handler: runCommand(async (argv) => exportAuditLogs(argv._instance!, toFlagsRecord(argv))),
      }),
  handler: runCommand(async (argv) => listAuditLogs(argv._instance!, toFlagsRecord(argv))),
};

export const insightsCommand: CliCommand = {
  command: "insights",
  describe:
    "View workspace or organization insights, confidence calibration, and governance telemetry",
  builder: (yargs) =>
    yargs
      .option("org", { type: "string", describe: "Organization handle" })
      .option("timeframe", {
        type: "string",
        describe: "Telemetry window (24h, 7d, 30d)",
      })
      .option("team", { type: "string", describe: "Filter organization insights by team ID" }),
  handler: runCommand(async (argv) => {
    const isOrgSubcommand = String(argv._?.[0] ?? "") === "org";
    return getEnterpriseInsights(argv._instance!, {
      ...toFlagsRecord(argv),
      ...(isOrgSubcommand ? { _scope: "org" } : {}),
    });
  }),
};

export const operatorCommand: CliCommand = {
  command: "operator",
  describe: "Cluster administration, platform limits, and runtime metrics",
  builder: (yargs) =>
    yargs
      .command({
        command: "stats",
        describe: "View cluster-wide runtime, memory, and uptime metrics",
        builder: (y) => y,
        handler: runCommand(async (argv) => getOperatorStats(argv._instance!, toFlagsRecord(argv))),
      })
      .command({
        command: "analytics",
        describe: "View operator-level aggregated platform analytics",
        builder: (y) => y.option("timeframe", { type: "string" }),
        handler: runCommand(async (argv) =>
          getOperatorAnalytics(argv._instance!, toFlagsRecord(argv)),
        ),
      })
      .command({
        command: "config",
        describe: "Inspect operator platform configuration and active flags",
        builder: (y) => y,
        handler: runCommand(async (argv) =>
          getOperatorConfig(argv._instance!, toFlagsRecord(argv)),
        ),
      })
      .command({
        command: "limit [action]",
        describe: "View operational quotas across global, accounts, or telemetry",
        builder: (y) => y.option("type", { type: "string" }),
        handler: runCommand(async (argv) =>
          getOperatorLimits(argv._instance!, toFlagsRecord(argv)),
        ),
      })
      .command({
        command: "user [action]",
        describe: "List platform users across all workspaces and organizations",
        builder: (y) =>
          y.option("page", { type: "number" }).option("limit", { alias: "n", type: "number" }),
        handler: runCommand(async (argv) =>
          listOperatorUsers(argv._instance!, toFlagsRecord(argv)),
        ),
      })
      .command({
        command: "workspace [action]",
        describe: "List all provisioned workspaces on this cluster",
        builder: (y) =>
          y.option("page", { type: "number" }).option("limit", { alias: "n", type: "number" }),
        handler: runCommand(async (argv) =>
          listOperatorWorkspaces(argv._instance!, toFlagsRecord(argv)),
        ),
      }),
  handler: runCommand(async (argv) => getOperatorStats(argv._instance!, toFlagsRecord(argv))),
};
