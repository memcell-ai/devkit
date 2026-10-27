import type { CreateSourceParams, SourceType } from "@memcell/sdk";
import { resolveNamespace } from "../namespace.js";
import { getSdkClient } from "../sdk-client.js";
import {
  badge,
  cmd,
  emit,
  good,
  id as idSeg,
  label,
  place,
  row,
  say,
  value,
  variant,
  warn,
} from "../ui.js";

function getTargetWorkspace(flags: Record<string, string | true>): string | undefined {
  const raw = typeof flags.workspace === "string" ? flags.workspace : undefined;
  if (!raw) return undefined;
  const ws = raw.trim();
  if (typeof flags.owner === "string" && !ws.includes("/")) {
    return `${flags.owner.trim()}/${ws}`;
  }
  return ws;
}

function refused(instance: string, failure: Error): number {
  say(
    row(0, [badge("memcell"), place(instance)]),
    row(1, [warn("refused")], [label(failure.message)]),
  );
  return 1;
}

export async function listSources(
  instance: string,
  flags: Record<string, string | true> = {},
): Promise<number> {
  try {
    const sdk = await getSdkClient(instance);
    const namespace = await resolveNamespace(sdk, getTargetWorkspace(flags));
    const res = await sdk.sources.list(namespace);

    if (flags.json === true) {
      emit(JSON.stringify(res, null, 2) + "\n");
      return 0;
    }

    const sources = res.sources || [];
    if (sources.length === 0) {
      say(
        row(0, [badge("memcell"), label("source"), place(namespace)]),
        row(1, [label("no knowledge sources connected yet")]),
        row(2, [label("connect a URL, sitemap, webhook, or repo with"), cmd("memcell source add")]),
      );
      return 0;
    }

    say(
      row(
        0,
        [badge("memcell"), label("source"), place(namespace)],
        [variant(`${sources.length} sources`)],
      ),
      ...sources.map((s) =>
        row(
          1,
          [variant(s.type)],
          [label(s.name)],
          [value(`${s.documentCount} docs · ${s.memoryCount} memories`)],
          [label(s.status)],
          [idSeg(s.id)],
        ),
      ),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export async function addSource(
  instance: string,
  target: string | undefined,
  flags: Record<string, string | true> = {},
): Promise<number> {
  try {
    const sdk = await getSdkClient(instance);
    const namespace = await resolveNamespace(sdk, getTargetWorkspace(flags));

    const explicitType = typeof flags.type === "string" ? flags.type.trim().toLowerCase() : "";
    const trimmedTarget = target ? target.trim() : "";
    let resolvedType: SourceType;
    if (explicitType === "url" || explicitType === "webhook" || explicitType === "github") {
      resolvedType = explicitType;
    } else if (trimmedTarget.startsWith("http://") || trimmedTarget.startsWith("https://")) {
      resolvedType = "url";
    } else if (trimmedTarget.includes("/")) {
      resolvedType = "github";
    } else {
      resolvedType = "webhook";
    }

    const name = typeof flags.name === "string" ? flags.name.trim() : undefined;
    const distillMemories = flags["no-distill"] === true ? false : true;

    let params: CreateSourceParams;
    if (resolvedType === "url") {
      if (!trimmedTarget) {
        say(
          row(0, [badge("memcell"), label("source add")]),
          row(1, [warn("provide an https:// URL or sitemap URL to connect")]),
        );
        return 1;
      }
      const maxPages =
        typeof flags["max-pages"] === "string" ? parseInt(flags["max-pages"], 10) : undefined;
      params = {
        type: "url",
        url: trimmedTarget,
        name,
        maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
        distillMemories,
      };
    } else if (resolvedType === "github") {
      if (!trimmedTarget) {
        say(
          row(0, [badge("memcell"), label("source add")]),
          row(1, [warn("provide a GitHub owner/repo target")]),
        );
        return 1;
      }
      params = {
        type: "github",
        repoFullName: trimmedTarget,
        defaultBranch: typeof flags.branch === "string" ? flags.branch : undefined,
        name,
      };
    } else {
      params = {
        type: "webhook",
        name: name || trimmedTarget || "Inbound Webhook",
        distillMemories,
      };
    }

    const created = await sdk.sources.create(namespace, params);

    if (flags.json === true) {
      emit(JSON.stringify(created, null, 2) + "\n");
      return 0;
    }

    say(
      row(0, [badge("memcell"), label("source"), place(namespace)]),
      row(
        1,
        [good("connected")],
        [variant(created.source.type)],
        [label(created.source.name)],
        [idSeg(created.source.id)],
      ),
      created.webhookSecret
        ? row(2, [warn("signing secret (save once)")], [value(created.webhookSecret)])
        : null,
      created.ingestPath ? row(2, [label("ingest endpoint")], [place(created.ingestPath)]) : null,
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export async function syncSource(
  instance: string,
  sourceId: string,
  flags: Record<string, string | true> = {},
): Promise<number> {
  try {
    const sdk = await getSdkClient(instance);
    const namespace = await resolveNamespace(sdk, getTargetWorkspace(flags));
    const maxPages =
      typeof flags["max-pages"] === "string" ? parseInt(flags["max-pages"], 10) : undefined;
    const maxFiles =
      typeof flags["max-files"] === "string" ? parseInt(flags["max-files"], 10) : undefined;
    const distillMemories = flags["no-distill"] === true ? false : undefined;

    const res = await sdk.sources.sync(namespace, sourceId, {
      maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
      maxFiles: Number.isFinite(maxFiles) ? maxFiles : undefined,
      distillMemories,
    });

    if (flags.json === true) {
      emit(JSON.stringify(res, null, 2) + "\n");
      return 0;
    }

    say(
      row(0, [badge("memcell"), label("source sync"), place(namespace)]),
      row(
        1,
        [good(res.status)],
        [label("documents"), value(String(res.syncedFiles))],
        [label("chunks"), value(String(res.totalChunks))],
        [label("memories"), value(String(res.totalMemories))],
      ),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export async function deleteSource(
  instance: string,
  sourceId: string,
  flags: Record<string, string | true> = {},
): Promise<number> {
  try {
    const sdk = await getSdkClient(instance);
    const namespace = await resolveNamespace(sdk, getTargetWorkspace(flags));
    await sdk.sources.delete(namespace, sourceId);

    if (flags.json === true) {
      emit(JSON.stringify({ deleted: true, id: sourceId }, null, 2) + "\n");
      return 0;
    }

    say(
      row(0, [badge("memcell"), label("source"), place(namespace)]),
      row(1, [good("deleted")], [idSeg(sourceId)]),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}
