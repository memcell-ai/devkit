import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface CliResult {
  stdout: string;
  stderr: string;
  status: number;
}

export function resolveInstanceUrl(): string {
  return (process.env.MEMCELL_INSTANCE_URL || "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

export function resolveAuthToken(instanceUrl: string): string | null {
  if (process.env.MEMCELL_API_KEY?.trim())
    return process.env.MEMCELL_API_KEY.trim();
  if (process.env.MEMCELL_SESSION_TOKEN?.trim())
    return process.env.MEMCELL_SESSION_TOKEN.trim();

  // Check stored user credentials
  try {
    const credPath = join(homedir(), ".memcell", "credentials.json");
    if (existsSync(credPath)) {
      const data = JSON.parse(readFileSync(credPath, "utf8"));
      const match = data.credentials?.[instanceUrl];
      if (match?.token) return match.token;
    }
  } catch {
    // Ignore read errors
  }

  // Fallback to local Postgres session lookup for dev servers
  try {
    const psqlOut = execFileSync(
      "psql",
      [
        process.env.DATABASE_URL ||
          "postgresql://memcell:memcell@localhost:5442/memcell",
        "-t",
        "-A",
        "-c",
        "SELECT token FROM session WHERE expires_at > NOW() ORDER BY expires_at DESC LIMIT 1;",
      ],
      { encoding: "utf8" },
    ).trim();
    if (psqlOut) return psqlOut;
  } catch {
    // Ignore db query errors
  }

  return null;
}

export async function checkBackendHealth(
  instanceUrl: string,
): Promise<boolean> {
  return fetch(`${instanceUrl}/api/healthz`)
    .then((r) => r.ok)
    .catch(() => false);
}

export interface TestEnvironment {
  instanceUrl: string;
  authToken: string;
  tempBaseDir: string;
  tempHomeDir: string;
  tempWorkDir: string;
  wsSlug: string;
  runCli: (
    args: string[],
    options?: { allowFailure?: boolean; cwd?: string },
  ) => CliResult;
  cleanup: () => void;
}

export async function setupTestEnvironment(
  suitePrefix: string,
  options: { createWorkspace?: boolean } = { createWorkspace: true },
): Promise<TestEnvironment | null> {
  const instanceUrl = resolveInstanceUrl();
  const isHealthy = await checkBackendHealth(instanceUrl);
  if (!isHealthy) return null;

  const authToken = resolveAuthToken(instanceUrl);
  if (!authToken) return null;

  const tempBaseDir = mkdtempSync(
    join(tmpdir(), `memcell-e2e-${suitePrefix}-`),
  );
  const tempHomeDir = join(tempBaseDir, "home");
  const tempWorkDir = join(tempBaseDir, "work");
  mkdirSync(tempHomeDir, { recursive: true });
  mkdirSync(tempWorkDir, { recursive: true });

  const memcellHome = join(tempHomeDir, ".memcell");
  mkdirSync(memcellHome, { recursive: true });
  writeFileSync(
    join(memcellHome, "credentials.json"),
    JSON.stringify(
      {
        current: instanceUrl,
        credentials: {
          [instanceUrl]: {
            instance: instanceUrl,
            token: authToken,
            obtainedAt: new Date().toISOString(),
          },
        },
      },
      null,
      2,
    ),
  );

  const cliDist = resolve(__dirname, "../../cli/dist/bin.js");
  const runCli = (
    args: string[],
    cliOptions: { allowFailure?: boolean; cwd?: string } = {},
  ): CliResult => {
    try {
      const stdout = execFileSync(process.execPath, [cliDist, ...args], {
        cwd: cliOptions.cwd || tempWorkDir,
        env: {
          ...process.env,
          HOME: tempHomeDir,
        },
        encoding: "utf8",
      });
      return { stdout, stderr: "", status: 0 };
    } catch (err: any) {
      if (cliOptions.allowFailure) {
        return {
          stdout: err.stdout?.toString() || "",
          stderr: err.stderr?.toString() || "",
          status: err.status ?? 1,
        };
      }
      throw new Error(
        `CLI command failed: memcell ${args.join(" ")}\nSTDOUT:\n${err.stdout}\nSTDERR:\n${err.stderr}`,
      );
    }
  };

  const wsSlug = `e2e-${suitePrefix}-${Math.random().toString(36).slice(2, 8)}`;
  if (options.createWorkspace) {
    runCli(["workspace", "new", wsSlug, "--url", instanceUrl]);
  }

  const cleanup = () => {
    if (options.createWorkspace) {
      runCli(["workspace", "delete", wsSlug, "--url", instanceUrl], {
        allowFailure: true,
      });
    }
    if (existsSync(tempBaseDir)) {
      rmSync(tempBaseDir, { recursive: true, force: true });
    }
  };

  return {
    instanceUrl,
    authToken,
    tempBaseDir,
    tempHomeDir,
    tempWorkDir,
    wsSlug,
    runCli,
    cleanup,
  };
}
