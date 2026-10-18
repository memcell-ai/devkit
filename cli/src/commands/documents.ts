import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { resolveNamespace } from "../namespace.js";
import { getSdkClient } from "../sdk-client.js";
import {
  badge,
  bad,
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
  type Row,
} from "../ui.js";
import { wired } from "./wired.js";

const BOOTSTRAP_FILES = [
  "README.md",
  "ARCHITECTURE.md",
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
];

const BOOTSTRAP_DIRS = ["docs", ".cursor/rules", ".claude/rules"];

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

async function collectDocsFromDir(dirPath: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") && entry.name !== ".cursor" && entry.name !== ".claude") {
        continue;
      }
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") {
        continue;
      }
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const nested = await collectDocsFromDir(fullPath);
        for (const f of nested) {
          if (!results.includes(f)) results.push(f);
        }
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".md") ||
          entry.name.endsWith(".mdx") ||
          entry.name.endsWith(".mdc") ||
          entry.name.endsWith(".txt"))
      ) {
        if (!results.includes(fullPath)) results.push(fullPath);
      }
    }
  } catch {
    // ignore missing directories
  }
  return results;
}

async function discoverBootstrapFiles(root: string, explicitFiles?: string[]): Promise<string[]> {
  if (explicitFiles && explicitFiles.length > 0) {
    const expanded: string[] = [];
    for (const item of explicitFiles) {
      try {
        const st = await stat(item);
        if (st.isDirectory()) {
          const nested = await collectDocsFromDir(item);
          for (const f of nested) {
            if (!expanded.includes(f)) expanded.push(f);
          }
          continue;
        }
      } catch {
        // pass through so unreadable file is reported
      }
      if (!expanded.includes(item)) expanded.push(item);
    }
    return expanded;
  }

  const found: string[] = [];
  for (const name of BOOTSTRAP_FILES) {
    try {
      const full = join(root, name);
      const st = await stat(full);
      if (st.isFile()) found.push(full);
    } catch {
      // absent
    }
  }
  for (const dir of BOOTSTRAP_DIRS) {
    const nested = await collectDocsFromDir(join(root, dir));
    for (const f of nested) {
      if (!found.includes(f)) found.push(f);
    }
  }
  return found;
}

export async function ingestDocuments(
  instance: string,
  files: string[] = [],
  flags: Record<string, string | true> = {},
): Promise<number> {
  const explicitWs = getTargetWorkspace(flags);
  const here = await wired("ingest", instance, { silent: Boolean(explicitWs) });

  let targetSpace: string;
  let root = process.cwd();
  let targetInstance = instance;
  let targetBearer: string | undefined;

  if (here && !explicitWs) {
    targetSpace = here.space;
    root = here.root;
    targetInstance = here.instance;
    targetBearer = here.key;
  } else if (explicitWs) {
    targetSpace = explicitWs;
  } else {
    return 1;
  }

  const chosen = await discoverBootstrapFiles(root, files);
  if (chosen.length === 0) {
    say(
      row(0, [badge("memcell"), label("ingest"), place(targetSpace)]),
      row(1, [warn("no documents found to ingest")]),
    );
    return 1;
  }

  const distillMemories = flags["no-distill"] !== true;
  const rows: Row[] = [row(0, [badge("memcell"), label("ingest"), place(targetSpace)])];
  let totalChunks = 0;
  let totalMemories = 0;
  let landed = 0;

  const sdk = await getSdkClient(targetInstance, targetBearer ? { bearer: targetBearer } : {});
  const namespace = await resolveNamespace(sdk, targetSpace).catch(() => targetSpace);

  for (const file of chosen) {
    const shown = (relative(root, file) || file).replaceAll("\\", "/");
    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      rows.push(row(1, [bad("cannot read")], [place(shown)]));
      continue;
    }

    if (!content.trim()) continue;

    try {
      const res = await sdk.documents.ingest(namespace, {
        title: shown,
        sourcePath: shown,
        content,
        contentType: shown.endsWith(".json") ? "application/json" : "text/markdown",
        distillMemories,
      });

      landed += 1;
      totalChunks += res.chunksCreated ?? 0;
      totalMemories += res.distilledMemoriesCount ?? 0;

      rows.push(
        row(
          1,
          [good(shown)],
          res.unchanged
            ? [label("unchanged")]
            : [label("chunks"), value(String(res.chunksCreated ?? 0))],
          (res.distilledMemoriesCount ?? 0) > 0
            ? [label("memories"), value(String(res.distilledMemoriesCount))]
            : null,
        ),
      );
    } catch (error) {
      rows.push(
        row(
          1,
          [bad("refused")],
          [place(shown)],
          [label(error instanceof Error ? error.message : String(error))],
        ),
      );
    }
  }

  rows.push(
    row(
      1,
      landed > 0 ? [good(`${landed} documents ingested`)] : [bad("no documents ingested")],
      [label("chunks"), value(String(totalChunks))],
      totalMemories > 0 ? [label("memories distilled"), value(String(totalMemories))] : null,
    ),
  );
  say(...rows);
  return landed > 0 ? 0 : 1;
}

export async function listDocuments(
  instance: string,
  flags: Record<string, string | true> = {},
): Promise<number> {
  try {
    const sdk = await getSdkClient(instance);
    const target = getTargetWorkspace(flags);
    const namespace = await resolveNamespace(sdk, target);

    const q = typeof flags.query === "string" ? flags.query : undefined;
    const res = await sdk.documents.list(namespace, { q });

    if (flags.json === true) {
      emit(JSON.stringify(res, null, 2) + "\n");
      return 0;
    }

    const items = res.items || [];
    if (items.length === 0) {
      say(
        row(0, [badge("memcell"), label("document"), place(namespace)]),
        row(1, [label("no RAG documents ingested yet")]),
        row(2, [label("ingest project docs with"), cmd("memcell ingest")]),
      );
      return 0;
    }

    say(
      row(
        0,
        [badge("memcell"), label("document"), place(namespace)],
        [variant(`${items.length} documents`)],
      ),
      ...items.flatMap((d: any) => [
        row(
          1,
          [value(`${d.chunkCount ?? 0} chunks`)],
          [label(d.sourcePath || d.title)],
          [idSeg(d.id)],
        ),
      ]),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export async function searchDocuments(
  instance: string,
  query: string,
  flags: Record<string, string | true> = {},
): Promise<number> {
  try {
    const sdk = await getSdkClient(instance);
    const target = getTargetWorkspace(flags);
    const namespace = await resolveNamespace(sdk, target);

    const limit = typeof flags.limit === "string" ? parseInt(flags.limit, 10) : 5;
    const res = await sdk.documents.search(namespace, query, Number.isFinite(limit) ? limit : 5);

    if (flags.json === true) {
      emit(JSON.stringify(res, null, 2) + "\n");
      return 0;
    }

    const chunks = res.chunks || [];
    if (chunks.length === 0) {
      say(
        row(0, [badge("memcell"), label("document search"), place(namespace)]),
        row(1, [label("no matching document chunks found")]),
      );
      return 0;
    }

    say(
      row(
        0,
        [badge("memcell"), label("document search"), place(namespace)],
        [variant(`${chunks.length} chunks`)],
      ),
      ...chunks.flatMap((c: any) => [
        row(
          1,
          [value((c.score ?? 0).toFixed(2))],
          [variant(c.sourcePath || c.documentTitle)],
          c.heading ? [label(`> ${c.heading}`)] : null,
        ),
        row(2, [label(String(c.content || "").slice(0, 180))]),
      ]),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}

export async function deleteDocument(
  instance: string,
  documentId: string,
  flags: Record<string, string | true> = {},
): Promise<number> {
  try {
    const sdk = await getSdkClient(instance);
    const target = getTargetWorkspace(flags);
    const namespace = await resolveNamespace(sdk, target);

    await sdk.documents.delete(namespace, documentId);
    say(
      row(0, [badge("memcell"), label("document"), place(namespace)]),
      row(1, [good("deleted")], [idSeg(documentId)]),
    );
    return 0;
  } catch (error) {
    return refused(instance, error as Error);
  }
}
