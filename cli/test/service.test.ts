import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const home = await mkdtemp(join(tmpdir(), "memcell-service-home-"));

vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => home,
}));

const execCalls: { cmd: string; args: string[] }[] = [];

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn((cmd: string, args: string[], _options?: unknown) => {
    execCalls.push({ cmd, args });
    if (cmd === "launchctl" && args[0] === "list") {
      return "1234 0 ai.memcell.server\n";
    }
    if (cmd === "systemctl" && args[1] === "is-active") {
      return "active\n";
    }
    if (cmd === "schtasks" && args[0] === "/query") {
      return "MemCell Local Server   Running\n";
    }
    return "";
  }),
}));

const {
  buildLaunchdPlist,
  buildSystemdUnit,
  getServiceStateFile,
  readServiceState,
  writeServiceState,
  clearServiceState,
  installService,
  uninstallService,
  statusService,
  startService,
  stopService,
} = await import("../src/commands/service.js");
const { saveCredential } = await import("../src/instance.js");

const instance = "http://localhost:3000";

describe("OS system service manager (memcell service)", () => {
  beforeEach(async () => {
    execCalls.length = 0;
    await clearServiceState();
  });

  afterAll(async () => {
    await rm(home, { recursive: true, force: true }).catch(() => {});
  });

  describe("template builders", () => {
    it("builds macOS launchd plist XML with auto-start and environment variables", () => {
      const plist = buildLaunchdPlist({
        nodeBin: "/usr/local/bin/node",
        cliBin: "/usr/local/bin/memcell",
        port: 4000,
        dataDir: "/tmp/memcell-data",
        logPath: "/tmp/memcell.log",
      });

      expect(plist).toContain("<string>ai.memcell.server</string>");
      expect(plist).toContain("<string>/usr/local/bin/node</string>");
      expect(plist).toContain("<string>/usr/local/bin/memcell</string>");
      expect(plist).toContain("<string>start</string>");
      expect(plist).toContain("<string>--port</string>");
      expect(plist).toContain("<string>4000</string>");
      expect(plist).toContain("<string>--data-dir</string>");
      expect(plist).toContain("<string>/tmp/memcell-data</string>");
      expect(plist).toContain("<key>RunAtLoad</key>\n  <true/>");
      expect(plist).toContain("<key>KeepAlive</key>\n  <true/>");
      expect(plist).toContain("<string>/tmp/memcell.log</string>");
    });

    it("builds Linux systemd unit with restart-on-failure and user target", () => {
      const unit = buildSystemdUnit({
        nodeBin: "/usr/bin/node",
        cliBin: "/usr/bin/memcell",
        port: 5000,
        dataDir: "/home/user/.memcell/data",
        logPath: "/home/user/.memcell/server.log",
      });

      expect(unit).toContain("[Unit]");
      expect(unit).toContain("Description=MemCell Local Engine Daemon");
      expect(unit).toContain(
        'ExecStart="/usr/bin/node" "/usr/bin/memcell" start --port 5000 --data-dir "/home/user/.memcell/data"',
      );
      expect(unit).toContain("Restart=on-failure");
      expect(unit).toContain("RestartSec=5");
      expect(unit).toContain("StandardOutput=append:/home/user/.memcell/server.log");
      expect(unit).toContain("WantedBy=default.target");
    });
  });

  describe("state persistence", () => {
    it("persists and clears service state file cleanly", async () => {
      expect(await readServiceState()).toBeNull();

      const testState = {
        platform: "darwin" as const,
        installedAt: new Date().toISOString(),
        serviceFile: "/test/path.plist",
        label: "ai.memcell.server",
        port: 3000,
        dataDir: "/test/data",
        logPath: "/test/server.log",
      };

      await writeServiceState(testState);
      const readBack = await readServiceState();
      expect(readBack).toEqual(testState);

      await clearServiceState();
      expect(await readServiceState()).toBeNull();
    });
  });

  describe("installService", () => {
    it("refuses installation when unauthenticated", async () => {
      const code = await installService("http://unauthed.domain");
      expect(code).toBe(1);
    });

    it("installs LaunchAgent on macOS (darwin)", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true });

      try {
        await saveCredential({
          instance,
          token: "valid_token",
          obtainedAt: new Date().toISOString(),
        });

        const code = await installService(instance, { port: "3000" });
        expect(code).toBe(0);

        const state = await readServiceState();
        expect(state?.platform).toBe("darwin");
        expect(state?.label).toBe("ai.memcell.server");
        expect(state?.port).toBe(3000);

        // Verify plist was written to LaunchAgents
        expect(state?.serviceFile).toBeDefined();
        const plistContent = await readFile(state!.serviceFile!, "utf8");
        expect(plistContent).toContain("ai.memcell.server");

        // Verify launchctl commands were called
        const loaded = execCalls.some(
          (c) => c.cmd === "launchctl" && c.args.includes("load") && c.args.includes("-w"),
        );
        expect(loaded).toBe(true);
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
      }
    });

    it("installs systemd user unit on Linux", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });

      try {
        await saveCredential({
          instance,
          token: "valid_token",
          obtainedAt: new Date().toISOString(),
        });

        const code = await installService(instance, { port: "3001" });
        expect(code).toBe(0);

        const state = await readServiceState();
        expect(state?.platform).toBe("linux");
        expect(state?.port).toBe(3001);

        // Verify unit file was written
        expect(state?.serviceFile).toBeDefined();
        const unitContent = await readFile(state!.serviceFile!, "utf8");
        expect(unitContent).toContain("MemCell Local Engine Daemon");

        // Verify systemctl commands were called
        const daemonReload = execCalls.some(
          (c) => c.cmd === "systemctl" && c.args.includes("daemon-reload"),
        );
        const enabled = execCalls.some(
          (c) => c.cmd === "systemctl" && c.args.includes("enable") && c.args.includes("--now"),
        );
        expect(daemonReload).toBe(true);
        expect(enabled).toBe(true);
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
      }
    });

    it("installs scheduled task on Windows (win32)", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });

      try {
        await saveCredential({
          instance,
          token: "valid_token",
          obtainedAt: new Date().toISOString(),
        });

        const code = await installService(instance, { port: "3002" });
        expect(code).toBe(0);

        const state = await readServiceState();
        expect(state?.platform).toBe("win32");
        expect(state?.port).toBe(3002);

        // Verify schtasks was called
        const created = execCalls.some(
          (c) => c.cmd === "schtasks" && c.args.includes("/create") && c.args.includes("onlogon"),
        );
        expect(created).toBe(true);
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
      }
    });
  });

  describe("statusService", () => {
    it("reports gracefully when no service is installed", async () => {
      const code = await statusService();
      expect(code).toBe(0);
    });

    it("reports active status when service is running", async () => {
      await writeServiceState({
        platform: "darwin",
        installedAt: new Date().toISOString(),
        serviceFile: join(home, "service.plist"),
        label: "ai.memcell.server",
        port: 3000,
        dataDir: join(home, "data"),
        logPath: join(home, "server.log"),
      });

      const code = await statusService();
      expect(code).toBe(0);
      const queryCalled = execCalls.some((c) => c.cmd === "launchctl" && c.args.includes("list"));
      expect(queryCalled).toBe(true);
    });
  });

  describe("startService & stopService", () => {
    it("returns error code when service is not installed", async () => {
      expect(await startService()).toBe(1);
      expect(await stopService()).toBe(1);
    });

    it("delegates start and stop to platform supervisor", async () => {
      await writeServiceState({
        platform: "darwin",
        installedAt: new Date().toISOString(),
        serviceFile: join(home, "service.plist"),
        label: "ai.memcell.server",
        port: 3000,
        dataDir: join(home, "data"),
        logPath: join(home, "server.log"),
      });

      const startCode = await startService();
      expect(startCode).toBe(0);
      expect(
        execCalls.some(
          (c) =>
            c.cmd === "launchctl" &&
            c.args.includes("start") &&
            c.args.includes("ai.memcell.server"),
        ),
      ).toBe(true);

      const stopCode = await stopService();
      expect(stopCode).toBe(0);
      expect(
        execCalls.some(
          (c) =>
            c.cmd === "launchctl" &&
            c.args.includes("stop") &&
            c.args.includes("ai.memcell.server"),
        ),
      ).toBe(true);
    });
  });

  describe("uninstallService", () => {
    it("unloads and deletes LaunchAgent file on macOS", async () => {
      const plistPath = join(home, "Library", "LaunchAgents", "ai.memcell.server.plist");
      await writeServiceState({
        platform: "darwin",
        installedAt: new Date().toISOString(),
        serviceFile: plistPath,
        label: "ai.memcell.server",
        port: 3000,
        dataDir: join(home, "data"),
        logPath: join(home, "server.log"),
      });

      const code = await uninstallService();
      expect(code).toBe(0);

      // Verify unload was attempted
      expect(
        execCalls.some(
          (c) => c.cmd === "launchctl" && c.args.includes("unload") && c.args.includes("-w"),
        ),
      ).toBe(true);

      // Verify state was cleared
      expect(await readServiceState()).toBeNull();
    });

    it("disables and deletes unit on Linux", async () => {
      const unitPath = join(home, ".config", "systemd", "user", "memcell.service");
      await writeServiceState({
        platform: "linux",
        installedAt: new Date().toISOString(),
        serviceFile: unitPath,
        label: "memcell.service",
        port: 3000,
        dataDir: join(home, "data"),
        logPath: join(home, "server.log"),
      });

      const code = await uninstallService();
      expect(code).toBe(0);

      expect(
        execCalls.some(
          (c) => c.cmd === "systemctl" && c.args.includes("disable") && c.args.includes("--now"),
        ),
      ).toBe(true);

      expect(await readServiceState()).toBeNull();
    });
  });
});
