import { writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { memcellOnPath } from "../adapters/shared.js";
import { UnreadableConfig } from "../adapters/shared.js";
import { installSkill } from "../adapters/skill.js";
import { adapterFor, healWiringCollisions } from "../adapters/index.js";
import { currentAgent, detected } from "../agents.js";
import { call, MemcellError, whoami } from "../client.js";
import { deviceGrant } from "../grant.js";
import {
  badInstance,
  credentialFor,
  DEFAULT_INSTANCE,
  knownInstances,
  normalize,
} from "../instance.js";
import { pruneProjectKeys, saveAgentKey } from "../keyring.js";
import { resolveModelForAgent } from "../model-detect.js";
import { findGitRoot, findWorkspace, saveWorkspace, workspaceRoot } from "../workspace.js";
import { ask, CAN_ASK, choose, type Choice } from "../select.js";
import {
  badge,
  blank,
  cmd,
  good,
  label,
  place,
  row,
  say,
  value,
  variant,
  viaNpx,
  warn,
} from "../ui.js";

// `memcell connect` — a cold terminal to a wired project, one command.
//
// Bare, it is terminal-first: if this machine holds no session, the device
// grant runs right here (code, browser, approve — anonymous counts), and
// then the key is minted against the approver's active space. With
// `--pair <id>` it is the terminal's half of the browser flow instead: the
// connect page made a pairing as whoever was in the browser, and holding
// the ticket is standing enough. Both paths end in the same wiring.

interface Exchanged {
  key: string;
  keyId: string;
  agentId: string;
  workspace?: { id: string; slug: string; name: string; ownerSlug?: string };
  project?: { id: string; slug: string; name: string; ownerSlug?: string };
  space?: { id: string; slug: string; name: string; ownerSlug?: string };
  instance: string;
  agents?: Record<string, { key: string; keyId: string; agentId: string; agentName: string }>;
}

export async function connect(
  instance: string,
  options: {
    pair?: string;
    workspace?: string;
    project?: string;
    space?: string;
    agent?: string;
    noBrowser?: boolean;
    from: string;
  },
): Promise<number> {
  const pair = options.pair?.trim();
  const existing = await findWorkspace(process.cwd()).catch(() => null);
  let targetWorkspace = (options.workspace || options.project || options.space)?.trim();

  const isInteractive =
    !pair && !options.workspace && !options.project && !options.space && CAN_ASK();

  if (isInteractive) {
    let action: string | null = null;
    if (existing) {
      const wsSlug =
        existing.workspace.workspace || existing.workspace.project || existing.workspace.space;
      const currentSlug = existing.workspace.owner
        ? `${existing.workspace.owner}/${wsSlug}`
        : wsSlug;

      say(
        row(0, [badge("memcell"), label("workspace connection detected")]),
        row(
          1,
          [label("connected to")],
          [good(currentSlug)],
          [label("on"), place(existing.workspace.instance)],
        ),
        row(2, [label("file:")], [label(existing.at)]),
      );

      action = await choose("What would you like to do?", [
        {
          name: "keep",
          label: "Keep current connection & refresh keys",
          note: currentSlug,
        },
        {
          name: "switch_workspace",
          label: "Switch workspace or organization",
        },
        {
          name: "switch_instance",
          label: "Switch target instance (Cloud / Local / Custom)",
          note: existing.workspace.instance,
        },
        {
          name: "cancel",
          label: "Cancel",
        },
      ]);

      if (!action || action === "cancel") return 0;

      if (action === "keep") {
        targetWorkspace = currentSlug;
        instance = existing.workspace.instance;
      } else if (action === "switch_workspace") {
        instance = existing.workspace.instance;
      }
    }

    // Instance selection (if fresh or user requested instance switch)
    if (action === "switch_instance" || (!existing && options.from === "default")) {
      const known = await knownInstances();
      const instanceChoices: Choice[] = [
        {
          name: DEFAULT_INSTANCE,
          label: "MemCell Cloud",
          note: "https://memcell.ai (Production)",
        },
        {
          name: "http://localhost:3000",
          label: "Local Development",
          note: "http://localhost:3000",
        },
        ...known
          .filter((k) => k !== DEFAULT_INSTANCE && k !== "http://localhost:3000")
          .map((k) => ({ name: k, label: "Saved Instance", note: k })),
        {
          name: "custom",
          label: "Custom / Self-Hosted URL...",
        },
      ];

      const pickedInstance = await choose("Select MemCell instance:", instanceChoices);
      if (!pickedInstance) return 0;

      if (pickedInstance === "custom") {
        const customUrl = await ask("Enter MemCell instance URL");
        if (!customUrl) return 0;
        const wrong = badInstance(customUrl);
        if (wrong) {
          say(row(0, [badge("memcell"), warn("invalid URL")]), row(1, [label(wrong)]));
          return 1;
        }
        instance = normalize(customUrl);
      } else {
        instance = pickedInstance;
      }
    }

    // Owner & Workspace selection
    if (!targetWorkspace) {
      let held = (await credentialFor(instance)) ? await whoami(instance).catch(() => null) : null;
      if (!held) {
        say(
          row(0, [badge("memcell"), place(instance)]),
          row(1, [label("signing in to this instance...")]),
        );
        const granted = await deviceGrant(instance, {
          noBrowser: options.noBrowser,
          retry: "memcell connect",
        });
        if (!granted) return 1;
        held = await whoami(instance).catch(() => null);
      }

      // Query organizations
      const orgsRes = await call<{
        organizations?: { id: string; name: string; slug: string }[];
      }>(instance, "/api/v1/organizations").catch(() => null);
      const orgs = orgsRes?.organizations ?? [];

      let selectedOwner: string | null = null;
      if (orgs.length > 0) {
        const personalLabel = held?.user
          ? held.user.isAnonymous
            ? "Personal"
            : `${held.user.name} (Personal)`
          : "Personal";
        const ownerChoices: Choice[] = [
          {
            name: "__personal__",
            label: personalLabel,
          },
          ...orgs.map((o) => ({
            name: o.slug,
            label: `${o.name} (${o.slug})`,
            note: "Organization",
          })),
        ];
        const pickedOwner = await choose("Select account or organization:", ownerChoices);
        if (!pickedOwner) return 0;
        selectedOwner = pickedOwner === "__personal__" ? null : pickedOwner;
      }

      // Query workspaces for that owner
      const workspacesPath = selectedOwner
        ? `/api/v1/${selectedOwner}/workspaces`
        : "/api/v1/workspaces";
      const workspacesRes = await call<{
        workspaces?: { id: string; name: string; slug: string; ownerSlug?: string }[];
        projects?: { id: string; name: string; slug: string; ownerSlug?: string }[];
      }>(instance, workspacesPath).catch(() => null);
      const candidateWorkspaces = workspacesRes?.workspaces ?? workspacesRes?.projects ?? [];

      const workspaceChoices: Choice[] = [
        ...candidateWorkspaces.map((w) => {
          const fullSlug =
            w.ownerSlug && selectedOwner && w.ownerSlug !== selectedOwner
              ? `${w.ownerSlug}/${w.slug}`
              : w.slug;
          return {
            name: fullSlug,
            label: fullSlug,
            note: w.name !== w.slug ? w.name : undefined,
          };
        }),
        {
          name: "__new__",
          label: "+ Create new workspace...",
        },
      ];

      const pickedWs = await choose("Select workspace to connect:", workspaceChoices);
      if (!pickedWs) return 0;

      if (pickedWs === "__new__") {
        const defaultName = basename(process.cwd());
        const newName = await ask("Workspace name", defaultName);
        if (!newName) return 0;

        const body: Record<string, unknown> = { name: newName };
        if (selectedOwner) body.owner = selectedOwner;

        try {
          const res = await call<{
            ok?: boolean;
            workspace?: { id?: string; slug: string; name: string; ownerSlug?: string };
            project?: { id?: string; slug: string; name: string; ownerSlug?: string };
            slug?: string;
            name?: string;
            ownerSlug?: string;
          }>(
            instance,
            selectedOwner ? `/api/v1/${selectedOwner}/workspaces` : "/api/v1/workspaces",
            {
              method: "POST",
              body,
            },
          );
          const ws = res.workspace ?? res.project ?? res;
          const slug = ws.slug;
          if (!slug) {
            say(
              row(0, [badge("memcell"), warn("could not resolve workspace slug")]),
              row(1, [label("Server responded without a workspace slug. Please try again.")]),
            );
            return 1;
          }
          const finalOwner = ws.ownerSlug || selectedOwner;
          targetWorkspace = finalOwner ? `${finalOwner}/${slug}` : slug;
        } catch (error) {
          const failure = error as MemcellError;
          say(
            row(0, [badge("memcell"), warn("could not create workspace")]),
            row(1, [label(failure.message || "Failed to create workspace.")]),
          );
          return 1;
        }
      } else {
        targetWorkspace =
          selectedOwner && !pickedWs.includes("/") ? `${selectedOwner}/${pickedWs}` : pickedWs;
      }
    }
  } else {
    // Non-interactive / Headless fallback
    if (!targetWorkspace) {
      const wsSlug =
        existing?.workspace?.workspace ||
        existing?.workspace?.project ||
        existing?.workspace?.space;
      if (existing?.workspace?.owner && wsSlug) {
        targetWorkspace = `${existing.workspace.owner}/${wsSlug}`;
      } else if (wsSlug) {
        targetWorkspace = wsSlug;
      }
    }
  }

  // WHERE this is about to authenticate, said out loud when the directory
  // chose it. `.memcell` is committed and outranks this machine's own
  // config, so a cloned repository decides which host receives the device
  // grant and mints the key. That is fine when it is expected and worth
  // seeing when it is not — the host is named before anything is sent.
  if (options.from === "project") {
    say(
      row(
        0,
        [badge("memcell"), label("connecting to"), place(instance)],
        [label("(from directory .memcell)")],
      ),
    );
  }

  const here = basename(process.cwd());
  const present = [...(await detected())];
  if (options.agent?.trim()) {
    const specified = options.agent.trim().toLowerCase();
    if (!present.includes(specified) && adapterFor(specified)) {
      present.push(specified);
    }
  }
  const activeAgent = options.agent?.trim() || currentAgent() || present[0] || here;

  const models: Record<string, string> = {};
  for (const ag of present) {
    models[ag] = await resolveModelForAgent(ag, process.cwd());
  }
  const activeModel = await resolveModelForAgent(activeAgent, process.cwd());
  models[activeAgent] = activeModel;

  const identity = {
    agent: activeAgent,
    model: activeModel,
    agents: present,
    models,
    machine: hostname(),
  };

  let exchanged: Exchanged;
  try {
    if (pair) {
      exchanged = await call<Exchanged>(instance, "/api/v1/pair/claim", {
        method: "POST",
        body: {
          pair,
          ...identity,
          workspace: targetWorkspace || undefined,
          project: targetWorkspace || undefined,
          space: targetWorkspace || undefined,
        },
      });
    } else {
      const held = (await credentialFor(instance))
        ? await whoami(instance).catch(() => null)
        : null;
      if (!held) {
        const granted = await deviceGrant(instance, {
          noBrowser: options.noBrowser,
          retry: "memcell connect",
        });
        if (!granted) return 1;
      }
      exchanged = await call<Exchanged>(instance, "/api/v1/connect", {
        method: "POST",
        body: {
          ...identity,
          workspace: targetWorkspace || undefined,
          preferredWorkspace: here,
          project: targetWorkspace || undefined,
          preferredProject: here,
          space: targetWorkspace || undefined,
          preferredSpace: here,
        },
      });
    }
  } catch (error) {
    const failure = error as MemcellError;
    const body = failure.body as {
      error?: string;
      message?: string;
      workspaces?: { id: string; slug: string; name: string; ownerSlug?: string }[];
      projects?: { id: string; slug: string; name: string; ownerSlug?: string }[];
    } | null;

    const candidates = body?.workspaces ?? body?.projects;
    if (
      failure.status === 409 &&
      (body?.error === "multiple_workspaces" || body?.error === "multiple_projects") &&
      Array.isArray(candidates)
    ) {
      say(
        row(0, [badge("memcell"), place(instance)]),
        row(1, [warn("multiple workspaces found")], [label("choose which one to connect:")]),
        ...candidates.map((w) => {
          const display = w.ownerSlug ? `${w.ownerSlug}/${w.slug}` : w.slug;
          return row(2, [good(display)], [label(w.name)]);
        }),
        row(2, [label("run"), cmd("memcell connect [owner]/<slug>")]),
      );
      return 1;
    }

    say(
      row(0, [badge("memcell"), place(instance)]),
      row(1, [warn("could not connect")], [label(failure.message)]),
    );
    return 1;
  }

  if (exchanged.instance && new URL(exchanged.instance).origin !== new URL(instance).origin) {
    say(
      row(0, [badge("memcell"), place(instance)]),
      row(1, [warn("refused")], [label(`that instance answered for ${exchanged.instance}`)]),
    );
    return 1;
  }
  const linked = (exchanged.workspace || exchanged.project || exchanged.space)!;
  const ownerSlug =
    exchanged.workspace?.ownerSlug || exchanged.project?.ownerSlug || exchanged.space?.ownerSlug;
  const gitRoot = !existing ? await findGitRoot(process.cwd()) : null;
  const workspaceDirRoot = existing?.root ?? gitRoot ?? process.cwd();
  const at = await saveWorkspace(
    {
      instance,
      owner: ownerSlug,
      workspace: linked.slug,
      workspaceId: linked.id,
      project: linked.slug,
      projectId: linked.id,
      space: linked.slug,
      spaceId: linked.id,
    },
    workspaceDirRoot,
  );
  await pruneProjectKeys(instance, workspaceDirRoot, undefined, linked.id);
  await saveAgentKey({
    instance,
    keyId: exchanged.keyId,
    key: exchanged.key,
    project: workspaceDirRoot,
    projectId: linked.id,
    projectSlug: linked.slug,
    ownerSlug,
    projectPath: workspaceDirRoot,
    space: linked.slug,
    agentId: exchanged.agentId,
    agent: activeAgent,
  });

  if (exchanged.agents) {
    for (const [name, sub] of Object.entries(exchanged.agents)) {
      if (sub.keyId === exchanged.keyId) continue;
      await saveAgentKey({
        instance,
        keyId: sub.keyId,
        key: sub.key,
        project: workspaceDirRoot,
        projectId: linked.id,
        projectSlug: linked.slug,
        ownerSlug,
        projectPath: workspaceDirRoot,
        space: linked.slug,
        agentId: sub.agentId,
        agent: name,
      });
    }
  }

  const wired: string[] = [];
  const refused: string[] = [];
  for (const name of present) {
    const adapter = adapterFor(name);
    if (!adapter) continue;
    try {
      await adapter.install(workspaceDirRoot);
      wired.push(name);
    } catch (trouble) {
      if (trouble instanceof UnreadableConfig) {
        refused.push(name);
        continue;
      }
      throw trouble;
    }
  }
  const onPath = await memcellOnPath();

  const hasNativeHooks = wired.some((w) => w !== "mcp");
  let healedCollisions: string[] = [];
  let skillInstalled = false;
  if (hasNativeHooks && options.agent !== "mcp") {
    healedCollisions = await healWiringCollisions(workspaceDirRoot);
  } else {
    if (!wired.includes("mcp")) {
      const mcp = adapterFor("mcp");
      if (mcp) {
        await mcp.install(workspaceDirRoot).catch(() => undefined);
      }
    }
    installSkill(workspaceDirRoot);
    skillInstalled = true;
  }

  const workspaceUrl = ownerSlug
    ? `${instance}/${ownerSlug}/${linked.slug}`
    : `${instance}/home?workspace=${linked.slug}`;

  const workspaceDisplay = ownerSlug ? `${ownerSlug}/${linked.slug}` : linked.slug;

  say(
    row(0, [badge("memcell"), good(`Connected to ${workspaceDisplay}`)]),
    row(1, [label("Directory".padEnd(11, " ")), place(dirname(at))]),
    wired.length > 0
      ? row(1, [label("Agents".padEnd(11, " ")), value(wired.join(", "))])
      : row(1, [
          label("Agents".padEnd(11, " ")),
          warn("none detected in this directory (wired MCP + Skill fallback)"),
        ]),
    hasNativeHooks
      ? row(
          1,
          [label("Hooks".padEnd(11, " ")), good("Installed")],
          [label("(primary automatic memory lifecycle)")],
        )
      : row(
          1,
          [label("MCP".padEnd(11, " ")), good("Installed")],
          [label("(.mcp.json fallback for hookless clients)")],
        ),
    healedCollisions.length > 0
      ? row(
          1,
          [
            label("Healed".padEnd(11, " ")),
            good(`Removed colliding ${healedCollisions.join(", ")}`),
          ],
          [label("(hooks are primary)")],
        )
      : null,
    refused.length > 0
      ? row(
          1,
          [label("Refused".padEnd(11, " ")), warn(refused.join(", "))],
          [label("(invalid JSON config)")],
        )
      : null,
    skillInstalled
      ? row(
          1,
          [label("Skill".padEnd(11, " ")), place(".agents/skills/memcell")],
          [label("(hookless agent fallback)")],
        )
      : null,
    row(1, [label("Dashboard".padEnd(11, " ")), place(workspaceUrl)]),
    !onPath &&
      row(
        1,
        [label("Warning".padEnd(11, " ")), warn("memcell is not on PATH")],
        [label("the hooks will not fire until it is")],
        [value("npm install -g memcell")],
      ),
    blank(),
    row(0, [label("Next:")]),
    row(1, [cmd("memcell status".padEnd(21, " ")), label("Verify agent connections and quotas")]),
    row(1, [cmd("memcell disconnect".padEnd(21, " ")), label("Disconnect local agent hooks")]),
    !targetWorkspace &&
      row(1, [
        cmd("memcell connect --workspace <slug>".padEnd(21, " ")),
        label("Switch connected workspace"),
      ]),
    viaNpx() &&
      row(1, [cmd("npm install -g memcell".padEnd(21, " ")), label("Install CLI globally")]),
  );
  return 0;
}
