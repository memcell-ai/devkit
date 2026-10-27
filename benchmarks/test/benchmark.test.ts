import { describe, expect, it } from "vitest";
import {
  formatBenchmarkMarkdown,
  runOperationalBenchmark,
} from "../src/index.js";

describe("MemCell Operational Memory & Governance Benchmark", () => {
  it("reproducibly evaluates all 4 memory architectures across 40 multi-session probes", async () => {
    const report = await runOperationalBenchmark();

    expect(report.episodeCount).toBe(8);
    expect(report.probesPerArm).toBe(40);
    expect(report.arms).toHaveLength(4);

    const memcell = report.arms.find((a) => a.armId === "memcell_governed")!;
    const singleVendor = report.arms.find(
      (a) => a.armId === "single_vendor_silo",
    )!;
    const naiveVector = report.arms.find(
      (a) => a.armId === "naive_vector_store",
    )!;
    const flatMarkdown = report.arms.find(
      (a) => a.armId === "append_only_markdown",
    )!;

    expect(memcell.overallRatePct).toBe(95.0);
    expect(memcell.byStage.grounded_recall.ratePct).toBe(87.5);
    expect(memcell.byStage.repeat_avoidance.ratePct).toBe(100.0);
    expect(memcell.byStage.poison_quarantine.ratePct).toBe(100.0);
    expect(memcell.byStage.cross_vendor_handoff.ratePct).toBe(87.5);
    expect(memcell.byStage.guard_enforcement.ratePct).toBe(100.0);
    expect(memcell.poisonedServedCount).toBe(0);

    expect(singleVendor.overallRatePct).toBe(42.5);
    expect(singleVendor.byStage.repeat_avoidance.ratePct).toBe(50.0);
    expect(singleVendor.byStage.poison_quarantine.ratePct).toBe(50.0);
    expect(singleVendor.byStage.cross_vendor_handoff.ratePct).toBe(0.0);
    expect(singleVendor.byStage.guard_enforcement.ratePct).toBe(25.0);

    expect(naiveVector.overallRatePct).toBe(42.5);
    expect(naiveVector.byStage.repeat_avoidance.ratePct).toBe(37.5);
    expect(naiveVector.byStage.poison_quarantine.ratePct).toBe(12.5);
    expect(naiveVector.byStage.cross_vendor_handoff.ratePct).toBe(62.5);
    expect(naiveVector.byStage.guard_enforcement.ratePct).toBe(12.5);
    expect(naiveVector.poisonedServedCount).toBeGreaterThan(0);

    expect(flatMarkdown.overallRatePct).toBe(37.5);
    expect(flatMarkdown.byStage.repeat_avoidance.ratePct).toBe(12.5);
    expect(flatMarkdown.byStage.poison_quarantine.ratePct).toBe(25.0);
    expect(flatMarkdown.byStage.cross_vendor_handoff.ratePct).toBe(50.0);
    expect(flatMarkdown.byStage.guard_enforcement.ratePct).toBe(25.0);
  });

  it("computes well-calibrated confidence curves and formats Markdown reports cleanly", async () => {
    const report = await runOperationalBenchmark();
    expect(report.calibration.totalSamples).toBe(40);
    expect(report.calibration.expectedCalibrationErrorPct).toBe(2.3);
    expect(report.calibration.brierScore).toBeLessThan(0.1);

    const md = formatBenchmarkMarkdown(report);
    expect(md).toContain("MemCell Governed Memory");
    expect(md).toContain("95.0%");
    expect(md).toContain("ECE: 2.3%");
  });
});
