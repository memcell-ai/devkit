import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installCli, memcellOnPath, pathWithoutRunners } from "../src/adapters/shared.js";

const SYSTEM = ["/usr/bin", "/bin"];

async function fakeCommand(dir: string, name: string, body = "exit 0"): Promise<string> {
  await mkdir(dir, { recursive: true });
  const at = join(dir, name);
  await writeFile(at, `#!/bin/sh\n${body}\n`);
  await chmod(at, 0o755);
  return dir;
}

describe("whether a hook's shell can find memcell", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "memcell-path-"));
    vi.stubEnv("HOME", home);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(home, { recursive: true, force: true });
  });

  const npxCache = () => join(home, ".npm", "_npx", "abc123", "node_modules", ".bin");

  it("finds a real install sitting behind npx's cache", async () => {
    const runner = await fakeCommand(npxCache(), "memcell");
    const installed = await fakeCommand(join(home, "global"), "memcell");
    vi.stubEnv("PATH", [runner, installed, ...SYSTEM].join(delimiter));

    expect(await memcellOnPath()).toBe(true);
  });

  it("does not count npx's cache as an install", async () => {
    const runner = await fakeCommand(npxCache(), "memcell");
    vi.stubEnv("PATH", [runner, ...SYSTEM].join(delimiter));

    expect(await memcellOnPath()).toBe(false);
  });

  it("does not count npx's cache when a shell profile puts it back", async () => {
    const runner = await fakeCommand(npxCache(), "memcell");
    await writeFile(join(home, ".profile"), `export PATH="${runner}:$PATH"\n`);
    vi.stubEnv("PATH", SYSTEM.join(delimiter));

    expect(await memcellOnPath()).toBe(false);
  });

  it("takes only the runner's entries off PATH", () => {
    const path = ["/home/a/.npm/_npx/abc/node_modules/.bin", "/opt/bin", "/usr/bin"].join(
      delimiter,
    );

    expect(pathWithoutRunners(path)).toBe(["/opt/bin", "/usr/bin"].join(delimiter));
  });
});

describe("installing the CLI", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "memcell-install-"));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(home, { recursive: true, force: true });
  });

  it("asks npm for the package and reports nothing wrong when it works", async () => {
    const log = join(home, "npm-args");
    const bin = await fakeCommand(home, "npm", `echo "$@" > "${log}"`);
    vi.stubEnv("PATH", [bin, ...SYSTEM].join(delimiter));

    expect(await installCli()).toBeNull();

    const { readFile } = await import("node:fs/promises");
    expect((await readFile(log, "utf8")).trim()).toBe("install -g memcell");
  });

  it("says what npm said when it fails", async () => {
    const bin = await fakeCommand(
      home,
      "npm",
      'echo "npm error code EACCES" >&2\necho "npm error more detail" >&2\nexit 243',
    );
    vi.stubEnv("PATH", [bin, ...SYSTEM].join(delimiter));

    expect(await installCli()).toBe("npm error code EACCES");
  });

  it("says so when npm is not there", async () => {
    vi.stubEnv("PATH", join(home, "nothing"));

    expect(await installCli()).toEqual(expect.any(String));
  });
});
