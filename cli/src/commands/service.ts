import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { number, text } from "../config.js";
import { credentialFor } from "../instance.js";
import { machineDir, machineFile } from "../machine.js";
import { badge, blank, cmd, good, label, place, row, say, value, warn } from "../ui.js";

export interface ServiceState {
  platform: NodeJS.Platform;
  installedAt: string;
  serviceFile?: string;
  label: string;
  port: number;
  dataDir: string;
  logPath: string;
}

const SERVICE_FILE = "service.json";
const SERVICE_LABEL = "ai.memcell.server";

export function getServiceStateFile(): string {
  return machineFile(SERVICE_FILE);
}

export async function readServiceState(): Promise<ServiceState | null> {
  try {
    const raw = await readFile(getServiceStateFile(), "utf8");
    return JSON.parse(raw) as ServiceState;
  } catch {
    return null;
  }
}

export async function writeServiceState(state: ServiceState): Promise<void> {
  await mkdir(machineDir(), { recursive: true });
  await writeFile(getServiceStateFile(), JSON.stringify(state, null, 2), "utf8");
}

export async function clearServiceState(): Promise<void> {
  await rm(getServiceStateFile(), { force: true }).catch(() => {});
}

/**
 * Resolves the Node binary and CLI entry point to execute.
 */
export function resolveServiceBinary(): { nodeBin: string; cliBin: string } {
  const nodeBin = process.execPath;
  const cliBin = resolve(process.argv[1] || "memcell");
  return { nodeBin, cliBin };
}

/**
 * Builds macOS launchd property list XML.
 */
export function buildLaunchdPlist(options: {
  nodeBin: string;
  cliBin: string;
  port: number;
  dataDir: string;
  logPath: string;
}): string {
  const pathEnv = process.env.PATH || "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${options.nodeBin}</string>
    <string>${options.cliBin}</string>
    <string>start</string>
    <string>--port</string>
    <string>${options.port}</string>
    <string>--data-dir</string>
    <string>${options.dataDir}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${options.logPath}</string>
  <key>StandardErrorPath</key>
  <string>${options.logPath}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${pathEnv}</string>
    <key>PORT</key>
    <string>${options.port}</string>
    <key>DATA_DIR</key>
    <string>${options.dataDir}</string>
  </dict>
</dict>
</plist>
`;
}

/**
 * Builds Linux systemd user service unit file.
 */
export function buildSystemdUnit(options: {
  nodeBin: string;
  cliBin: string;
  port: number;
  dataDir: string;
  logPath: string;
}): string {
  const pathEnv = process.env.PATH || "/usr/local/bin:/usr/bin:/bin";
  return `[Unit]
Description=MemCell Local Engine Daemon
After=network.target

[Service]
Type=simple
ExecStart="${options.nodeBin}" "${options.cliBin}" start --port ${options.port} --data-dir "${options.dataDir}"
Restart=on-failure
RestartSec=5
StandardOutput=append:${options.logPath}
StandardError=append:${options.logPath}
Environment="PATH=${pathEnv}"
Environment="PORT=${options.port}"
Environment="DATA_DIR=${options.dataDir}"

[Install]
WantedBy=default.target
`;
}

/**
 * Installs MemCell local server as an OS-level user background service.
 */
export async function installService(
  instance: string,
  flags: Record<string, string | true> = {},
): Promise<number> {
  const cred = await credentialFor(instance);
  if (!cred) {
    say(
      row(0, [badge("memcell"), warn("authentication required")]),
      row(1, [label("Account".padEnd(11, " ")), warn("not signed in")]),
      blank(),
      row(0, [label("To register and run the Memcell system service, please sign in:")]),
      row(1, [cmd("memcell login".padEnd(21, " ")), label("Sign in to your account")]),
    );
    return 1;
  }

  const configuredPort = (await number("server.port", 3000)).value;
  const envPort = process.env.PORT ? parseInt(process.env.PORT, 10) : undefined;
  const port =
    typeof flags.port === "string" ? parseInt(flags.port, 10) : envPort || configuredPort;

  const configuredDataDir = (await text("server.data_dir", machineFile("data"))).value;
  const envDataDir = process.env.DATA_DIR;
  const dataDir =
    typeof flags["data-dir"] === "string"
      ? resolve(flags["data-dir"])
      : envDataDir
        ? resolve(envDataDir)
        : resolve(configuredDataDir);
  const logPath = machineFile("server.log");
  const { nodeBin, cliBin } = resolveServiceBinary();

  await mkdir(dataDir, { recursive: true });

  const platform = process.platform;

  try {
    if (platform === "darwin") {
      const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
      const plistPath = join(launchAgentsDir, `${SERVICE_LABEL}.plist`);

      await mkdir(launchAgentsDir, { recursive: true });

      // If already loaded, unload first
      try {
        execFileSync("launchctl", ["unload", "-w", plistPath], { stdio: "ignore" });
      } catch {
        // Ignore if not currently loaded
      }

      const plistContent = buildLaunchdPlist({
        nodeBin,
        cliBin,
        port,
        dataDir,
        logPath,
      });

      await writeFile(plistPath, plistContent, "utf8");

      try {
        execFileSync("launchctl", ["load", "-w", plistPath], { stdio: "ignore" });
      } catch (err: any) {
        say(row(0, [badge("memcell"), warn("launchctl load notice"), label(err.message || "")]));
      }

      await writeServiceState({
        platform: "darwin",
        installedAt: new Date().toISOString(),
        serviceFile: plistPath,
        label: SERVICE_LABEL,
        port,
        dataDir,
        logPath,
      });

      say(
        row(0, [badge("memcell"), good("system service installed & started")]),
        row(1, [label("Supervisor".padEnd(11, " ")), good("launchd (macOS LaunchAgent)")]),
        row(1, [label("Service".padEnd(11, " ")), value(SERVICE_LABEL)]),
        row(1, [label("File".padEnd(11, " ")), place(plistPath)]),
        row(1, [label("URL".padEnd(11, " ")), place(`http://localhost:${port}`)]),
        row(1, [label("Logs".padEnd(11, " ")), place(logPath)]),
        row(1, [label("Storage".padEnd(11, " ")), place(join(dataDir, "pg")), label("(PGlite)")]),
        blank(),
        row(0, [
          label("Auto-start is enabled. The server will restart automatically on boot or crash."),
        ]),
        blank(),
        row(0, [label("Commands:")]),
        row(1, [cmd("memcell service status".padEnd(25, " ")), label("Check service health")]),
        row(1, [cmd("memcell service stop".padEnd(25, " ")), label("Stop the service")]),
        row(1, [cmd("memcell service uninstall".padEnd(25, " ")), label("Remove system service")]),
      );
      return 0;
    }

    if (platform === "linux") {
      const systemdUserDir = join(homedir(), ".config", "systemd", "user");
      const unitPath = join(systemdUserDir, "memcell.service");

      await mkdir(systemdUserDir, { recursive: true });

      const unitContent = buildSystemdUnit({
        nodeBin,
        cliBin,
        port,
        dataDir,
        logPath,
      });

      await writeFile(unitPath, unitContent, "utf8");

      try {
        execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
        execFileSync("systemctl", ["--user", "enable", "--now", "memcell"], { stdio: "ignore" });
      } catch (err: any) {
        say(row(0, [badge("memcell"), warn("systemctl notice"), label(err.message || "")]));
      }

      await writeServiceState({
        platform: "linux",
        installedAt: new Date().toISOString(),
        serviceFile: unitPath,
        label: "memcell.service",
        port,
        dataDir,
        logPath,
      });

      say(
        row(0, [badge("memcell"), good("system service installed & started")]),
        row(1, [label("Supervisor".padEnd(11, " ")), good("systemd (User Unit)")]),
        row(1, [label("Service".padEnd(11, " ")), value("memcell.service")]),
        row(1, [label("File".padEnd(11, " ")), place(unitPath)]),
        row(1, [label("URL".padEnd(11, " ")), place(`http://localhost:${port}`)]),
        row(1, [label("Logs".padEnd(11, " ")), place(logPath)]),
        row(1, [label("Storage".padEnd(11, " ")), place(join(dataDir, "pg")), label("(PGlite)")]),
        blank(),
        row(0, [
          label("Auto-start is enabled. The server will restart automatically on boot or crash."),
        ]),
        blank(),
        row(0, [label("Commands:")]),
        row(1, [cmd("memcell service status".padEnd(25, " ")), label("Check service health")]),
        row(1, [cmd("memcell service stop".padEnd(25, " ")), label("Stop the service")]),
        row(1, [cmd("memcell service uninstall".padEnd(25, " ")), label("Remove system service")]),
      );
      return 0;
    }

    if (platform === "win32") {
      const taskName = "MemCell Local Server";
      const taskRunCmd = `"${nodeBin}" "${cliBin}" start --port ${port} --data-dir "${dataDir}"`;

      try {
        execFileSync(
          "schtasks",
          ["/create", "/tn", taskName, "/tr", taskRunCmd, "/sc", "onlogon", "/f"],
          { stdio: "ignore" },
        );
        execFileSync("schtasks", ["/run", "/tn", taskName], { stdio: "ignore" });
      } catch (err: any) {
        say(row(0, [badge("memcell"), warn("Task Scheduler notice"), label(err.message || "")]));
      }

      await writeServiceState({
        platform: "win32",
        installedAt: new Date().toISOString(),
        label: taskName,
        port,
        dataDir,
        logPath,
      });

      say(
        row(0, [badge("memcell"), good("system service installed & started")]),
        row(1, [label("Supervisor".padEnd(11, " ")), good("Windows Task Scheduler (On Logon)")]),
        row(1, [label("Task".padEnd(11, " ")), value(taskName)]),
        row(1, [label("URL".padEnd(11, " ")), place(`http://localhost:${port}`)]),
        row(1, [label("Logs".padEnd(11, " ")), place(logPath)]),
        row(1, [label("Storage".padEnd(11, " ")), place(join(dataDir, "pg")), label("(PGlite)")]),
        blank(),
        row(0, [label("Commands:")]),
        row(1, [cmd("memcell service status".padEnd(25, " ")), label("Check service health")]),
        row(1, [cmd("memcell service uninstall".padEnd(25, " ")), label("Remove scheduled task")]),
      );
      return 0;
    }

    say(
      row(0, [badge("memcell"), warn("unsupported platform for native service"), value(platform)]),
      row(1, [
        label("Use"),
        cmd("memcell start --daemon"),
        label("for background execution on this OS"),
      ]),
    );
    return 1;
  } catch (err: any) {
    say(
      row(0, [badge("memcell"), warn("failed to install system service")]),
      row(1, [label("Error:"), value(err.message || "unknown failure")]),
    );
    return 1;
  }
}

/**
 * Uninstalls MemCell local server from the OS supervisor.
 */
export async function uninstallService(): Promise<number> {
  const state = await readServiceState();
  const platform = state?.platform || process.platform;

  try {
    if (platform === "darwin") {
      const plistPath =
        state?.serviceFile || join(homedir(), "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`);

      try {
        execFileSync("launchctl", ["unload", "-w", plistPath], { stdio: "ignore" });
      } catch {
        // Ignore unload errors
      }

      await rm(plistPath, { force: true }).catch(() => {});
      await clearServiceState();

      say(
        row(0, [badge("memcell"), good("system service uninstalled")]),
        row(1, [label("Removed LaunchAgent:"), place(plistPath)]),
      );
      return 0;
    }

    if (platform === "linux") {
      const unitPath =
        state?.serviceFile || join(homedir(), ".config", "systemd", "user", "memcell.service");

      try {
        execFileSync("systemctl", ["--user", "disable", "--now", "memcell"], { stdio: "ignore" });
      } catch {
        // Ignore disable errors
      }

      await rm(unitPath, { force: true }).catch(() => {});
      try {
        execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
      } catch {
        // Ignore
      }
      await clearServiceState();

      say(
        row(0, [badge("memcell"), good("system service uninstalled")]),
        row(1, [label("Removed systemd unit:"), place(unitPath)]),
      );
      return 0;
    }

    if (platform === "win32") {
      const taskName = state?.label || "MemCell Local Server";
      try {
        execFileSync("schtasks", ["/delete", "/tn", taskName, "/f"], { stdio: "ignore" });
      } catch {
        // Ignore
      }
      await clearServiceState();

      say(
        row(0, [badge("memcell"), good("system service uninstalled")]),
        row(1, [label("Removed scheduled task:"), value(taskName)]),
      );
      return 0;
    }

    await clearServiceState();
    say(row(0, [badge("memcell"), good("system service state cleared")]));
    return 0;
  } catch (err: any) {
    say(
      row(0, [badge("memcell"), warn("failed to uninstall system service")]),
      row(1, [label("Error:"), value(err.message || "unknown failure")]),
    );
    return 1;
  }
}

/**
 * Checks the status of the OS-level system service.
 */
export async function statusService(): Promise<number> {
  const state = await readServiceState();
  const platform = state?.platform || process.platform;

  if (!state) {
    say(
      row(0, [badge("memcell"), warn("no system service installed")]),
      row(1, [
        label("Run"),
        cmd("memcell service install"),
        label("to configure auto-start on boot"),
      ]),
    );
    return 0;
  }

  let active = false;

  if (platform === "darwin") {
    try {
      const out = execFileSync("launchctl", ["list"], { encoding: "utf8" });
      active = out.includes(SERVICE_LABEL);
    } catch {
      active = false;
    }
  } else if (platform === "linux") {
    try {
      const out = execFileSync("systemctl", ["--user", "is-active", "memcell"], {
        encoding: "utf8",
      }).trim();
      active = out === "active";
    } catch {
      active = false;
    }
  } else if (platform === "win32") {
    try {
      const out = execFileSync("schtasks", ["/query", "/tn", state.label], {
        encoding: "utf8",
      });
      active = out.includes(state.label);
    } catch {
      active = false;
    }
  }

  say(
    row(0, [badge("memcell"), label("system service status"), place(state.platform)]),
    row(
      1,
      [label("Status".padEnd(11, " "))],
      active ? [good("active (running)")] : [warn("installed (inactive)")],
    ),
    row(1, [label("Service".padEnd(11, " ")), value(state.label)]),
    state.serviceFile ? row(1, [label("File".padEnd(11, " ")), place(state.serviceFile)]) : null,
    row(1, [label("Port".padEnd(11, " ")), value(String(state.port))]),
    row(1, [label("Logs".padEnd(11, " ")), place(state.logPath)]),
    row(1, [label("Installed".padEnd(11, " ")), label(state.installedAt)]),
  );

  return 0;
}

/**
 * Starts the OS system service.
 */
export async function startService(): Promise<number> {
  const state = await readServiceState();
  const platform = state?.platform || process.platform;

  if (!state) {
    say(
      row(0, [badge("memcell"), warn("system service not installed")]),
      row(1, [label("Install first with"), cmd("memcell service install")]),
    );
    return 1;
  }

  try {
    if (platform === "darwin") {
      execFileSync("launchctl", ["start", SERVICE_LABEL], { stdio: "ignore" });
    } else if (platform === "linux") {
      execFileSync("systemctl", ["--user", "start", "memcell"], { stdio: "ignore" });
    } else if (platform === "win32") {
      execFileSync("schtasks", ["/run", "/tn", state.label], { stdio: "ignore" });
    }

    say(
      row(0, [badge("memcell"), good("system service started")]),
      row(1, [label("Service:"), value(state.label)]),
      row(1, [label("URL:"), place(`http://localhost:${state.port}`)]),
    );
    return 0;
  } catch (err: any) {
    say(
      row(0, [badge("memcell"), warn("failed to start service")]),
      row(1, [label("Error:"), value(err.message || "unknown failure")]),
    );
    return 1;
  }
}

/**
 * Stops the OS system service.
 */
export async function stopService(): Promise<number> {
  const state = await readServiceState();
  const platform = state?.platform || process.platform;

  if (!state) {
    say(
      row(0, [badge("memcell"), warn("system service not installed")]),
      row(1, [label("Install first with"), cmd("memcell service install")]),
    );
    return 1;
  }

  try {
    if (platform === "darwin") {
      execFileSync("launchctl", ["stop", SERVICE_LABEL], { stdio: "ignore" });
    } else if (platform === "linux") {
      execFileSync("systemctl", ["--user", "stop", "memcell"], { stdio: "ignore" });
    } else if (platform === "win32") {
      execFileSync("schtasks", ["/end", "/tn", state.label], { stdio: "ignore" });
    }

    say(
      row(0, [badge("memcell"), good("system service stopped")]),
      row(1, [label("Service:"), value(state.label)]),
    );
    return 0;
  } catch (err: any) {
    say(
      row(0, [badge("memcell"), warn("failed to stop service")]),
      row(1, [label("Error:"), value(err.message || "unknown failure")]),
    );
    return 1;
  }
}
