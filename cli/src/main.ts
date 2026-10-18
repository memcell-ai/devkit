import { runYargsCli } from "./cli.js";
import { checkUpdate, printUpdateNotice } from "./update.js";
import { findWorkspace } from "./workspace.js";

export async function main(argv: string[], version: string): Promise<number> {
  // Inspect workspace to ensure dedicated structure and .gitignore whenever CLI executes
  await findWorkspace().catch(() => null);

  const isHelpOrVersion =
    argv.length === 0 ||
    argv.includes("-h") ||
    argv.includes("--help") ||
    argv.includes("-v") ||
    argv.includes("--version");
  const cmdPath = argv.filter((a) => !a.startsWith("-"));
  const updateCheck = isHelpOrVersion
    ? Promise.resolve(null)
    : checkUpdate(version, cmdPath).catch(() => null);

  try {
    const exitCode = await runYargsCli(argv, version);
    const newerVersion = await updateCheck;
    if (newerVersion) {
      printUpdateNotice(version, newerVersion);
    }
    return exitCode;
  } catch (error) {
    console.error((error as Error)?.message || "Command failed");
    return 1;
  }
}
