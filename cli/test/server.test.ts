import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const home = await mkdtemp(join(tmpdir(), "memcell-server-home-"));

vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => home,
}));

let fetchStatus = 404;
let fetchJson: Record<string, unknown> = {
  error: { code: "server_bundle_not_found", message: "Release asset not found" },
};

vi.stubGlobal("fetch", async () => ({
  ok: fetchStatus >= 200 && fetchStatus < 300,
  status: fetchStatus,
  json: async () => fetchJson,
  text: async () => JSON.stringify(fetchJson),
  arrayBuffer: async () => new ArrayBuffer(0),
}));

const { startServer, stopServer, getRunningServer } = await import("../src/commands/server.js");
const { saveCredential } = await import("../src/instance.js");
const { machineFile } = await import("../src/machine.js");

const instance = "http://localhost:3000";

describe("server commands (memcell start / memcell stop)", () => {
  beforeEach(async () => {
    fetchStatus = 404;
    fetchJson = {
      error: { code: "server_bundle_not_found", message: "Release asset not found" },
    };
  });

  afterAll(async () => {
    await rm(home, { recursive: true, force: true }).catch(() => {});
  });

  it("refuses to start when user is unauthenticated", async () => {
    const unauthedInstance = "http://unauthed.test";
    const code = await startServer(unauthedInstance, { daemon: true });
    expect(code).toBe(1);
  });

  it("fails fast when standalone server bundle is missing on release", async () => {
    await saveCredential({
      instance,
      token: "test_token_123",
      obtainedAt: new Date().toISOString(),
    });

    fetchStatus = 404;
    fetchJson = {
      error: "server_bundle_not_found",
      message: "Standalone server bundle is not available on this release",
    };

    const code = await startServer(instance, { daemon: true, port: 49152 });
    expect(code).toBe(1);

    const running = await getRunningServer();
    expect(running).toBeNull();
  });

  it("starts daemon server when bundle is cached, records daemon.json, and reports running state", async () => {
    await saveCredential({
      instance,
      token: "test_token_123",
      obtainedAt: new Date().toISOString(),
    });

    // Provide a valid installed server.js in the machine cache directory
    const serverDir = machineFile("server");
    await mkdir(serverDir, { recursive: true });
    const serverJs = join(serverDir, "server.js");
    await writeFile(
      serverJs,
      `const http = require('node:http');
const server = http.createServer((req, res) => { res.writeHead(200); res.end('ok'); });
server.listen(process.env.PORT || 3000);
`,
      "utf8",
    );

    const code = await startServer(instance, { daemon: true, port: 49152 });
    expect(code).toBe(0);

    const running = await getRunningServer();
    expect(running).not.toBeNull();
    expect(running?.port).toBe(49152);
    expect(typeof running?.pid).toBe("number");

    // Clean up
    const stopCode = await stopServer();
    expect(stopCode).toBe(0);

    const afterStop = await getRunningServer();
    expect(afterStop).toBeNull();
  });

  it("handles stopServer gracefully when no daemon is running", async () => {
    const code = await stopServer();
    expect(code).toBe(0);
  });
});
