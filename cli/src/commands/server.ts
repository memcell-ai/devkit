import { execFileSync, spawn } from "node:child_process";
import { openSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { number, text } from "../config.js";
import { credentialFor } from "../instance.js";
import { machineFile } from "../machine.js";
import { installService } from "./service.js";
import { badge, blank, cmd, good, label, place, row, say, value, warn } from "../ui.js";

export interface DaemonState {
  pid: number;
  port: number;
  startedAt: string;
  dataDir: string;
  serverPath: string;
  logPath: string;
}

const DAEMON_FILE = "daemon.json";

/**
 * Checks if the background daemon server is currently running.
 * Cleans up stale PID file if the process died unexpectedly.
 */
export async function getRunningServer(): Promise<DaemonState | null> {
  const daemonPath = machineFile(DAEMON_FILE);
  try {
    const raw = await readFile(daemonPath, "utf8");
    const state = JSON.parse(raw) as DaemonState;

    if (!state.pid || typeof state.pid !== "number") {
      await rm(daemonPath, { force: true }).catch(() => {});
      return null;
    }

    // Probe whether the process is alive
    try {
      process.kill(state.pid, 0);
      return state;
    } catch (err: any) {
      if (err.code === "ESRCH") {
        // Dead process, clean up stale state
        await rm(daemonPath, { force: true }).catch(() => {});
        return null;
      }
      return state;
    }
  } catch {
    return null;
  }
}

/**
 * Resolves or downloads the local standalone server bundle.
 * Fails fast with an explicit error if the bundle is missing or cannot be fetched.
 */
async function resolveServerBundle(
  instance: string,
  token: string,
): Promise<{ serverEntry: string; serverDir: string }> {
  // 1. Explicit environment variable override
  if (process.env.MEMCELL_SERVER_PATH) {
    const customPath = resolve(process.env.MEMCELL_SERVER_PATH);
    const entry = customPath.endsWith(".js") ? customPath : join(customPath, "server.js");
    const dir = customPath.endsWith(".js") ? join(customPath, "..") : customPath;
    const exists = await stat(entry).catch(() => null);
    if (!exists) {
      say(
        row(0, [badge("memcell"), warn("MEMCELL_SERVER_PATH invalid")]),
        row(1, [label("Missing:"), place(entry)]),
      );
      throw new Error(`Invalid MEMCELL_SERVER_PATH: ${customPath}`);
    }
    return { serverEntry: entry, serverDir: dir };
  }

  // 2. Local monorepo standalone build detection (for development & E2E)
  try {
    const currentDir = process.cwd();
    const candidatePaths = [
      join(currentDir, "memcell", ".next", "standalone"),
      join(currentDir, "..", "memcell", ".next", "standalone"),
      join(currentDir, ".next", "standalone"),
    ];

    for (const cand of candidatePaths) {
      const entry = join(cand, "server.js");
      const exists = await stat(entry).catch(() => null);
      if (exists) {
        return { serverEntry: entry, serverDir: cand };
      }
    }
  } catch {
    // Continue to platform download
  }

  // 3. User cached server directory
  const serverDir = machineFile("server");
  const serverEntry = join(serverDir, "server.js");
  const cached = await stat(serverEntry).catch(() => null);
  if (cached) {
    return { serverEntry, serverDir };
  }

  // 4. Download from platform endpoint
  await mkdir(serverDir, { recursive: true });

  const downloadUrl = `${instance.replace(/\/+$/, "")}/api/v1/download/server?platform=${process.platform}&arch=${process.arch}&version=latest&stream=true`;

  say(
    row(0, [badge("memcell"), label("downloading local server bundle...")]),
    row(1, [label("Source:"), place(downloadUrl)]),
  );

  let res: Response;
  try {
    res = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/gzip, application/octet-stream, application/json",
      },
    });
  } catch (err: any) {
    say(
      row(0, [badge("memcell"), warn("failed to connect to download endpoint")]),
      row(1, [label("Instance:"), place(instance)]),
      row(1, [label("Error:"), label(err.message || "network request failed")]),
    );
    throw new Error(`Network failure downloading server bundle: ${err.message}`);
  }

  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}`;
    try {
      const errJson = (await res.json()) as any;
      if (errJson.message) errorDetail = errJson.message;
      else if (errJson.error) errorDetail = errJson.error;
    } catch {
      // Use HTTP status
    }
    say(
      row(0, [badge("memcell"), warn("server bundle download failed")]),
      row(1, [label("Instance:"), place(instance)]),
      row(1, [label("Status:"), value(String(res.status))]),
      row(1, [label("Detail:"), label(errorDetail)]),
      blank(),
      row(0, [label("Ensure the standalone server assets have been released for this instance.")]),
    );
    throw new Error(`Server bundle download failed (${res.status}): ${errorDetail}`);
  }

  const tarPath = join(serverDir, "bundle.tar.gz");
  const arrayBuffer = await res.arrayBuffer();
  await writeFile(tarPath, Buffer.from(arrayBuffer));

  try {
    execFileSync("tar", ["-xzf", tarPath, "-C", serverDir], { stdio: "ignore" });
  } catch (err: any) {
    await rm(tarPath, { force: true }).catch(() => {});
    say(
      row(0, [badge("memcell"), warn("failed to extract server bundle archive")]),
      row(1, [label("Error:"), value(err.message || "tar extraction failed")]),
    );
    throw new Error(`Failed to extract server bundle: ${err.message}`);
  } finally {
    await rm(tarPath, { force: true }).catch(() => {});
  }

  const entryExists = await stat(serverEntry).catch(() => null);
  if (!entryExists) {
    say(
      row(0, [badge("memcell"), warn("server bundle archive corrupt or incomplete")]),
      row(1, [label("Missing:"), place(serverEntry)]),
    );
    throw new Error(`Server bundle archive missing server.js entry point: ${serverEntry}`);
  }

  say(
    row(0, [badge("memcell"), good("local server bundle installed")]),
    row(1, [label("Location:"), place(serverDir)]),
  );

  return { serverEntry, serverDir };
}

/**
 * Start the local server in foreground or background daemon mode.
 */
export async function startServer(
  instance: string,
  options: {
    daemon?: boolean;
    service?: boolean;
    onBoot?: boolean;
    port?: number;
    dataDir?: string;
    noBrowser?: boolean;
    force?: boolean;
  } = {},
): Promise<number> {
  // Delegate to OS system service if requested
  if (options.service || options.onBoot) {
    const serviceFlags: Record<string, string | true> = {};
    if (options.port) serviceFlags.port = String(options.port);
    if (options.dataDir) serviceFlags["data-dir"] = options.dataDir;
    return installService(instance, serviceFlags);
  }
  // 1. Enforce authentication standing
  const credential = await credentialFor(instance);
  if (!credential) {
    say(
      row(0, [badge("memcell"), warn("authentication required")]),
      row(1, [label("Account".padEnd(11, " ")), warn("not signed in")]),
      blank(),
      row(0, [label("To download and run the Memcell local server, please sign in:")]),
      row(1, [cmd("memcell login".padEnd(21, " ")), label("Sign in to your account")]),
    );
    return 1;
  }

  const configuredPort = (await number("server.port", 3000)).value;
  const envPort = process.env.PORT ? parseInt(process.env.PORT, 10) : undefined;
  const port = options.port || envPort || configuredPort;

  const configuredDataDir = (await text("server.data_dir", machineFile("data"))).value;
  const envDataDir = process.env.DATA_DIR;
  const storageDir = options.dataDir
    ? resolve(options.dataDir)
    : envDataDir
      ? resolve(envDataDir)
      : resolve(configuredDataDir);

  await mkdir(storageDir, { recursive: true });

  // 2. Check if server is already running
  const running = await getRunningServer();
  if (running) {
    say(
      row(0, [badge("memcell"), good("local server is already running")]),
      row(1, [label("Status".padEnd(11, " ")), good("active")]),
      row(1, [label("PID".padEnd(11, " ")), value(String(running.pid))]),
      row(1, [label("URL".padEnd(11, " ")), place(`http://localhost:${running.port}`)]),
      row(1, [
        label("Console".padEnd(11, " ")),
        place(`http://localhost:${running.port}/operator/settings/providers`),
      ]),
      blank(),
      row(0, [label("To stop the running server:")]),
      row(1, [cmd("memcell stop".padEnd(21, " ")), label("Halt background local server")]),
    );
    return 0;
  }

  // 3. Resolve server bundle (fail fast on missing release assets)
  let serverBundle: { serverEntry: string; serverDir: string };
  try {
    serverBundle = await resolveServerBundle(instance, credential.token);
  } catch {
    return 1;
  }
  const { serverEntry, serverDir } = serverBundle;

  const env = {
    ...process.env,
    PORT: String(port),
    DATA_DIR: storageDir,
    DATABASE_URL: "", // Absence guarantees embedded PGlite usage
    NODE_ENV: "production",
  };

  const consoleUrl = `http://localhost:${port}/operator/settings/providers`;
  const serverUrl = `http://localhost:${port}`;

  // 4. Background Daemon Mode
  if (options.daemon) {
    const logPath = machineFile("server.log");
    const outFd = openSync(logPath, "a");
    const errFd = openSync(logPath, "a");

    const child = spawn(process.execPath, [serverEntry], {
      detached: true,
      stdio: ["ignore", outFd, errFd],
      env,
      cwd: serverDir,
    });

    child.unref();

    const state: DaemonState = {
      pid: child.pid!,
      port,
      startedAt: new Date().toISOString(),
      dataDir: storageDir,
      serverPath: serverEntry,
      logPath,
    };

    await writeFile(machineFile(DAEMON_FILE), JSON.stringify(state, null, 2), "utf8");

    say(
      row(0, [badge("memcell"), good("local server started in background")]),
      row(1, [label("Status".padEnd(11, " ")), good("active (daemon)")]),
      row(1, [label("PID".padEnd(11, " ")), value(String(child.pid))]),
      row(1, [label("URL".padEnd(11, " ")), place(serverUrl)]),
      row(1, [label("Storage".padEnd(11, " ")), place(join(storageDir, "pg")), label("(PGlite)")]),
      row(1, [label("Logs".padEnd(11, " ")), place(logPath)]),
      blank(),
      row(0, [label("Configure your LLM provider keys in the Operator Console:")]),
      row(1, [place(consoleUrl)]),
      blank(),
      row(0, [label("Commands:")]),
      row(1, [cmd("memcell stop".padEnd(21, " ")), label("Stop the background server")]),
      row(1, [cmd("memcell status".padEnd(21, " ")), label("Check system standing")]),
    );
    return 0;
  }

  // 5. Foreground Mode
  say(
    row(0, [badge("memcell"), good("local server running on"), place(serverUrl)]),
    row(1, [label("Storage".padEnd(11, " ")), place(join(storageDir, "pg")), label("(PGlite)")]),
    row(1, [label("Console".padEnd(11, " ")), place(consoleUrl)]),
    blank(),
    row(0, [label("Press Ctrl+C to shut down.")]),
  );

  return new Promise<number>((resolvePromise) => {
    const child = spawn(process.execPath, [serverEntry], {
      stdio: "inherit",
      env,
      cwd: serverDir,
    });

    const shutdown = () => {
      child.kill("SIGTERM");
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

    child.on("exit", (code) => {
      process.removeListener("SIGINT", shutdown);
      process.removeListener("SIGTERM", shutdown);
      resolvePromise(code ?? 0);
    });
  });
}

/**
 * Stop the background local server daemon.
 */
export async function stopServer(options: { force?: boolean } = {}): Promise<number> {
  const daemonPath = machineFile(DAEMON_FILE);
  const state = await getRunningServer();

  if (!state) {
    say(row(0, [badge("memcell"), warn("no background local server is currently running")]));
    await rm(daemonPath, { force: true }).catch(() => {});
    return 0;
  }

  try {
    process.kill(state.pid, options.force ? "SIGKILL" : "SIGTERM");

    // Wait up to 3 seconds for graceful shutdown if not forced
    if (!options.force) {
      let alive = true;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 100));
        try {
          process.kill(state.pid, 0);
        } catch {
          alive = false;
          break;
        }
      }
      if (alive) {
        try {
          process.kill(state.pid, "SIGKILL");
        } catch {}
      }
    }
  } catch (err: any) {
    if (err.code !== "ESRCH") {
      say(
        row(0, [badge("memcell"), warn(`failed to signal process ${state.pid}: ${err.message}`)]),
      );
    }
  }

  await rm(daemonPath, { force: true }).catch(() => {});

  say(
    row(0, [badge("memcell"), good("local server stopped")]),
    row(1, [label("PID".padEnd(11, " ")), value(String(state.pid))]),
    row(1, [label("Port".padEnd(11, " ")), value(String(state.port))]),
  );
  return 0;
}
