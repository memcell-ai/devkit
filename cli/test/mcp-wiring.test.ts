import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { claude } from "../src/adapters/claude.js";
import { MCP_ARGS, MCP_COMMAND } from "../src/adapters/shared.js";
import { copilot } from "../src/adapters/copilot.js";
import { gemini } from "../src/adapters/gemini.js";
import { windsurf } from "../src/adapters/windsurf.js";
import { cline } from "../src/adapters/cline.js";
import { mcpAdapter } from "../src/adapters/mcp.js";

// Hook-first law: standalone `mcpAdapter` (`--agent mcp`) installs `.mcp.json`
// for hookless MCP clients, while hook-capable adapters (`claude`, `gemini`,
// `copilot`, `windsurf`, `cline`, etc.) install native lifecycle hooks only
// and automatically self-heal (strip) any legacy `mcpServers.memcell` entries
// while preserving foreign MCP servers.

const read = async (p: string) => JSON.parse(await readFile(p, "utf8"));

describe("mcpAdapter — standalone .mcp.json at the workspace root", () => {
  it("installs the bridge, preserves foreign servers, removes only ours", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memcell-mcp-standalone-"));
    await writeFile(
      join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { theirs: { type: "http", url: "https://x/mcp" } } }),
    );

    await mcpAdapter.install(dir);
    const doc = await read(join(dir, ".mcp.json"));
    expect(doc.mcpServers.memcell).toEqual({
      type: "stdio",
      command: MCP_COMMAND,
      args: MCP_ARGS,
    });
    expect(doc.mcpServers.theirs.url).toBe("https://x/mcp");

    await mcpAdapter.remove(dir);
    const after = await read(join(dir, ".mcp.json"));
    expect(after.mcpServers.memcell).toBeUndefined();
    expect(after.mcpServers.theirs.url).toBe("https://x/mcp");
  });

  it("a file we created alone disappears on remove", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memcell-mcp-standalone2-"));
    await mcpAdapter.install(dir);
    expect((await read(join(dir, ".mcp.json"))).mcpServers.memcell).toBeTruthy();
    await mcpAdapter.remove(dir);
    await expect(readFile(join(dir, ".mcp.json"), "utf8")).rejects.toThrow();
  });

  it("an entry that is not the bridge command is never ours to remove", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memcell-mcp-standalone3-"));
    await writeFile(
      join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { memcell: { type: "http", url: "https://their-own/mcp" } } }),
    );
    await mcpAdapter.remove(dir);
    expect((await read(join(dir, ".mcp.json"))).mcpServers.memcell.url).toBe(
      "https://their-own/mcp",
    );
  });
});

describe("claude — hooks-only install self-heals legacy .mcp.json collision", () => {
  it("strips legacy memcell MCP entry on install while preserving foreign servers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memcell-mcp-claude-"));
    await writeFile(
      join(dir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          memcell: { type: "stdio", command: MCP_COMMAND, args: MCP_ARGS },
          theirs: { type: "http", url: "https://x/mcp" },
        },
      }),
    );

    await claude.install(dir);
    const after = await read(join(dir, ".mcp.json"));
    expect(after.mcpServers.memcell).toBeUndefined();
    expect(after.mcpServers.theirs.url).toBe("https://x/mcp");
  });
});

describe("gemini — hooks-only install self-heals legacy mcpServers in .gemini/settings.json", () => {
  it("installs hooks and strips colliding mcpServers.memcell", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memcell-mcp-gemini-"));
    await mkdir(join(dir, ".gemini"), { recursive: true });
    await writeFile(
      join(dir, ".gemini", "settings.json"),
      JSON.stringify({ mcpServers: { memcell: { command: MCP_COMMAND, args: MCP_ARGS } } }),
    );

    await gemini.install(dir);
    const doc = await read(join(dir, ".gemini", "settings.json"));
    expect(doc.hooks).toBeDefined();
    expect(doc.mcpServers).toBeUndefined();
  });
});

describe("copilot — hooks-only install self-heals .github/mcp.json", () => {
  it("strips our MCP entry while preserving foreign servers in .github/mcp.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memcell-mcp-copilot-"));
    await mkdir(join(dir, ".github"), { recursive: true });
    await writeFile(
      join(dir, ".github", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          memcell: { type: "local", command: MCP_COMMAND, args: MCP_ARGS, tools: ["*"] },
          github: { type: "http", url: "https://gh/mcp" },
        },
      }),
    );

    await copilot.install(dir);
    const after = await read(join(dir, ".github", "mcp.json"));
    expect(after.mcpServers.memcell).toBeUndefined();
    expect(after.mcpServers.github.url).toBe("https://gh/mcp");
  });
});

describe("windsurf — hooks-only install self-heals .windsurf/mcp_config.json", () => {
  it("strips legacy MCP bridge on hook install", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memcell-mcp-windsurf-"));
    await mkdir(join(dir, ".windsurf"), { recursive: true });
    await writeFile(
      join(dir, ".windsurf", "mcp_config.json"),
      JSON.stringify({ mcpServers: { memcell: { command: MCP_COMMAND, args: MCP_ARGS } } }),
    );

    await windsurf.install(dir);
    const after = await read(join(dir, ".windsurf", "mcp_config.json")).catch(() => null);
    expect(after?.mcpServers?.memcell).toBeUndefined();
  });
});

describe("cline — hooks-only install self-heals .cline/mcp.json", () => {
  it("strips legacy MCP bridge on hook install", async () => {
    const dir = await mkdtemp(join(tmpdir(), "memcell-mcp-cline-"));
    await mkdir(join(dir, ".cline"), { recursive: true });
    await writeFile(
      join(dir, ".cline", "mcp.json"),
      JSON.stringify({ mcpServers: { memcell: { command: MCP_COMMAND, args: MCP_ARGS } } }),
    );

    await cline.install(dir);
    const after = await read(join(dir, ".cline", "mcp.json")).catch(() => null);
    expect(after?.mcpServers?.memcell).toBeUndefined();
  });
});
