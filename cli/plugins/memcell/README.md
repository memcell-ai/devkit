# MemCell plugin for Claude Code

Shared, persistent memory for AI agents. With this plugin, Claude recalls what
your MemCell workspace already established (instructions, decisions, facts,
preferences, working threads, and indexed documents) before it acts, and
reports afterwards whether what it recalled worked. A memory's confidence rises
when it works and falls when it fails, so the memories that hold up are the
ones that come back.

## What the plugin contains

- **MCP server `memcell`.** Claude Code starts it with `npx -y memcell@2.0.0 mcp`.
  The first time it runs, npx downloads that exact version of the
  [`memcell` npm package](https://www.npmjs.com/package/memcell) and its
  dependencies from the npm registry. The server exposes seven tools: `recall`,
  `remember`, `report`, `feedback`, `ingest_document`, `search_documents`, and
  `get_insights`.
- **Skill `memcell`.** It teaches Claude to recall before a non-trivial task,
  remember instructions and decisions as they are made, and report outcomes
  afterwards. When the MCP tools are not loaded, the skill tells Claude to run
  the same operations through the `memcell` command line, such as
  `memcell recall` and `memcell report`.

## Connect a workspace first

The MCP server answers from a MemCell workspace linked to the directory you
work in. Run this once in that directory:

```bash
npx memcell connect
```

It opens a browser approval and links the directory to a workspace on MemCell
Cloud (`https://memcell.ai`), a local MemCell server, or your own self-hosted
instance. It saves only the instance and workspace names in a `.memcell` file in
the directory; the agent key stays on your machine under `~/.memcell`. Until a
workspace is connected, every tool call returns an error that tells Claude to
run `memcell connect`.

## What it sends, and where

The server talks only to the MemCell instance your workspace is connected to,
using that workspace's agent key. It sends:

- what Claude asks `recall` and `search_documents` to look up;
- the memories Claude records with `remember`;
- the outcome reports Claude files with `report` and `feedback`;
- the documents Claude indexes with `ingest_document`;
- the name of the model Claude is running, in an `x-memcell-model` header.

The server sends nothing anywhere else, and it skips the CLI's daily update check
against the npm registry. Memories and documents stay in your workspace
until you delete them, and `memcell export` writes them out as JSON,
`AGENTS.md`, `CLAUDE.md`, or `.cursorrules` at any time.

## License

Apache-2.0. The CLI and MCP server are in
[memcell-ai/devkit](https://github.com/memcell-ai/devkit); this plugin is
listed from [memcell-ai/mcp](https://github.com/memcell-ai/mcp). Docs:
[memcell.ai/docs](https://memcell.ai/docs).
