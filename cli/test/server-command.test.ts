import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockMachineRoot = "";

const credentialForMock = vi.fn(async () => null);
const spawnMock = vi.fn(() => ({
  pid: 42424,
  unref: vi.fn(),
  kill: vi.fn(),
  once: vi.fn(),
  on: vi.fn((event: string, cb: (code: number) => void) => {
    if (event === "exit") cb(0);
  }),
  removeListener: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: (...args: unknown[]) => spawnMock(...(args as [])),
}));

vi.mock("../src/machine.js", () => ({
  machineDir: () => mockMachineRoot,
  machineFile: (...parts: string[]) => join(mockMachineRoot, ...parts),
}));

vi.mock("../src/instance.js", () => ({
  credentialFor: (...args: unknown[]) => credentialForMock(...(args as [])),
  normalize: (url: string) => url,
}));

const { startServer } = await import("../src/commands/server.js");

describe("memcell start offline & bundle resolution", () => {
  let tempDir: string;
  const originalServerPath = process.env.MEMCELL_SERVER_PATH;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "memcell-server-cmd-"));
    mockMachineRoot = join(tempDir, "machine");
    await mkdir(mockMachineRoot, { recursive: true });
    credentialForMock.mockReset();
    credentialForMock.mockResolvedValue(null);
    spawnMock.mockClear();
  });

  afterEach(async () => {
    if (originalServerPath === undefined) delete process.env.MEMCELL_SERVER_PATH;
    else process.env.MEMCELL_SERVER_PATH = originalServerPath;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("starts local daemon completely offline without credentials when MEMCELL_SERVER_PATH is present", async () => {
    const serverEntry = join(tempDir, "server.js");
    await writeFile(serverEntry, "console.log('local standalone');", "utf8");
    process.env.MEMCELL_SERVER_PATH = serverEntry;

    const exitCode = await startServer("https://memcell.ai", {
      daemon: true,
      port: 3999,
      dataDir: join(tempDir, "data"),
    });

    expect(exitCode).toBe(0);
    expect(credentialForMock).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("starts local daemon completely offline without credentials when cached server bundle exists", async () => {
    delete process.env.MEMCELL_SERVER_PATH;
    const cachedDir = join(mockMachineRoot, "server");
    await mkdir(cachedDir, { recursive: true });
    await writeFile(join(cachedDir, "server.js"), "console.log('cached');", "utf8");
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    try {
      const exitCode = await startServer("https://memcell.ai", {
        daemon: true,
        port: 3999,
        dataDir: join(tempDir, "data"),
      });

      expect(exitCode).toBe(0);
      expect(credentialForMock).not.toHaveBeenCalled();
      expect(spawnMock).toHaveBeenCalledTimes(1);
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it("requires authentication only when no local or cached bundle exists", async () => {
    delete process.env.MEMCELL_SERVER_PATH;
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    try {
      const exitCode = await startServer("https://memcell.ai", {
        daemon: true,
        port: 3999,
        dataDir: join(tempDir, "data"),
      });

      expect(exitCode).toBe(1);
      expect(credentialForMock).toHaveBeenCalledTimes(1);
      expect(spawnMock).not.toHaveBeenCalled();
    } finally {
      cwdSpy.mockRestore();
    }
  });
});
