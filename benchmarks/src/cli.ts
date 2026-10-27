#!/usr/bin/env node
import {
  AppendOnlyMarkdownArm,
  MemCellGovernedArm,
  MemCellLiveApiArm,
  NaiveVectorStoreArm,
  SingleVendorSiloArm,
  type BenchmarkArm,
} from "./arms.js";
import { formatBenchmarkMarkdown, runOperationalBenchmark } from "./runner.js";

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const outputJson = args.has("--json");
  const runLive = args.has("--live");

  const arms: BenchmarkArm[] = [
    new MemCellGovernedArm(),
    new SingleVendorSiloArm(),
    new NaiveVectorStoreArm(),
    new AppendOnlyMarkdownArm(),
  ];

  if (runLive) {
    const apiKey = process.env.MEMCELL_API_KEY;
    const namespace = process.env.MEMCELL_WORKSPACE;
    if (!apiKey || !namespace) {
      process.stderr.write(
        "Error: --live requires MEMCELL_API_KEY and MEMCELL_WORKSPACE (owner/workspace) environment variables.\n",
      );
      process.exitCode = 1;
      return;
    }
    arms.unshift(
      new MemCellLiveApiArm({
        apiKey,
        namespace,
        baseUrl: process.env.MEMCELL_INSTANCE,
      }),
    );
  }

  const report = await runOperationalBenchmark(arms);
  if (outputJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }

  process.stdout.write(formatBenchmarkMarkdown(report) + "\n");
}

main().catch((err: unknown) => {
  process.stderr.write(
    `Benchmark failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
