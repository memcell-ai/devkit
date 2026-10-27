import {
  AppendOnlyMarkdownArm,
  MemCellGovernedArm,
  NaiveVectorStoreArm,
  SingleVendorSiloArm,
  type BenchmarkArm,
  type ProbeEvaluation,
} from "./arms.js";
import {
  buildBenchmarkEpisodes,
  CALIBRATION_EVALUATION_SAMPLES,
  type BenchmarkDomain,
  type BenchmarkStage,
  type CalibrationOutcomeSample,
} from "./dataset.js";

export interface StageScore {
  passed: number;
  total: number;
  ratePct: number;
}

export interface ArmBenchmarkSummary {
  armId: string;
  armName: string;
  tagline: string;
  overallPassed: number;
  overallTotal: number;
  overallRatePct: number;
  poisonedServedCount: number;
  avgEvalLatencyMs: number;
  byStage: Record<BenchmarkStage, StageScore>;
  byDomain: Record<BenchmarkDomain, StageScore>;
  evaluations: ProbeEvaluation[];
}

export interface CalibrationBucketReport {
  label: string;
  range: string;
  predictedConfidencePct: number;
  observedWorkedRatePct: number;
  sampleCount: number;
  gapPct: number;
}

export interface CalibrationReport {
  totalSamples: number;
  expectedCalibrationError: number;
  expectedCalibrationErrorPct: number;
  brierScore: number;
  buckets: CalibrationBucketReport[];
}

export interface OperationalBenchmarkReport {
  suite: string;
  version: string;
  episodeCount: number;
  probesPerArm: number;
  arms: ArmBenchmarkSummary[];
  calibration: CalibrationReport;
}

const STAGES: readonly BenchmarkStage[] = [
  "grounded_recall",
  "repeat_avoidance",
  "poison_quarantine",
  "cross_vendor_handoff",
  "guard_enforcement",
];

const DOMAINS: readonly BenchmarkDomain[] = [
  "customer_support",
  "incident_ops",
  "finance_compliance",
  "market_research",
];

export function computeCalibrationReport(
  samples: readonly CalibrationOutcomeSample[] = CALIBRATION_EVALUATION_SAMPLES,
): CalibrationReport {
  const specs = [
    { label: "< 0.50 (At Risk)", range: "0.00 - 0.49", min: 0.0, max: 0.5 },
    {
      label: "0.50 – 0.69 (Emerging)",
      range: "0.50 - 0.69",
      min: 0.5,
      max: 0.7,
    },
    {
      label: "0.70 – 0.84 (Verified)",
      range: "0.70 - 0.84",
      min: 0.7,
      max: 0.85,
    },
    {
      label: "0.85 – 0.94 (Strong)",
      range: "0.85 - 0.94",
      min: 0.85,
      max: 0.95,
    },
    {
      label: "0.95 – 1.00 (High Trust)",
      range: "0.95 - 1.00",
      min: 0.95,
      max: 1.01,
    },
  ] as const;

  let brierSum = 0;
  let weightedGapSum = 0;

  const buckets: CalibrationBucketReport[] = specs.map((spec) => {
    const matching = samples.filter(
      (s) => s.confidenceBefore >= spec.min && s.confidenceBefore < spec.max,
    );
    const count = matching.length;
    if (count === 0) {
      return {
        label: spec.label,
        range: spec.range,
        predictedConfidencePct: 0,
        observedWorkedRatePct: 0,
        sampleCount: 0,
        gapPct: 0,
      };
    }

    let confSum = 0;
    let worked = 0;
    for (const s of matching) {
      confSum += s.confidenceBefore;
      const y = s.outcome === "worked" ? 1 : 0;
      worked += y;
      brierSum += (s.confidenceBefore - y) * (s.confidenceBefore - y);
    }

    const pred = confSum / count;
    const obs = worked / count;
    const gap = Math.abs(obs - pred);
    weightedGapSum += count * gap;

    return {
      label: spec.label,
      range: spec.range,
      predictedConfidencePct: Number((pred * 100).toFixed(1)),
      observedWorkedRatePct: Number((obs * 100).toFixed(1)),
      sampleCount: count,
      gapPct: Number((gap * 100).toFixed(1)),
    };
  });

  const total = samples.length;
  const ece = total > 0 ? Number((weightedGapSum / total).toFixed(4)) : 0;
  const brier = total > 0 ? Number((brierSum / total).toFixed(4)) : 0;

  return {
    totalSamples: total,
    expectedCalibrationError: ece,
    expectedCalibrationErrorPct: Number((ece * 100).toFixed(1)),
    brierScore: brier,
    buckets,
  };
}

export async function runOperationalBenchmark(
  customArms?: readonly BenchmarkArm[],
): Promise<OperationalBenchmarkReport> {
  const episodes = buildBenchmarkEpisodes();
  const arms: readonly BenchmarkArm[] = customArms ?? [
    new MemCellGovernedArm(),
    new SingleVendorSiloArm(),
    new NaiveVectorStoreArm(),
    new AppendOnlyMarkdownArm(),
  ];

  const summaries: ArmBenchmarkSummary[] = [];

  for (const arm of arms) {
    const stageCounts = new Map<
      BenchmarkStage,
      { passed: number; total: number }
    >();
    const domainCounts = new Map<
      BenchmarkDomain,
      { passed: number; total: number }
    >();
    for (const s of STAGES) stageCounts.set(s, { passed: 0, total: 0 });
    for (const d of DOMAINS) domainCounts.set(d, { passed: 0, total: 0 });

    const evaluations: ProbeEvaluation[] = [];
    let poisonedServedCount = 0;
    let totalLatencyMs = 0;

    const recordProbe = (
      stage: BenchmarkStage,
      domain: BenchmarkDomain,
      ev: ProbeEvaluation,
    ) => {
      evaluations.push(ev);
      if (ev.poisonedServed) poisonedServedCount += 1;
      totalLatencyMs += ev.latencyMs;

      const st = stageCounts.get(stage)!;
      st.total += 1;
      if (ev.passed) st.passed += 1;

      const dm = domainCounts.get(domain)!;
      dm.total += 1;
      if (ev.passed) dm.passed += 1;
    };

    for (const ep of episodes) {
      await arm.resetEpisode();

      // Stage 1: Grounded recall
      await arm.ingest(ep.stage1Seeds);
      recordProbe(
        "grounded_recall",
        ep.domain,
        await arm.evaluate(ep.stage1Probe),
      );

      // Stage 2: Repeat-failure avoidance after outcome feedback
      await arm.ingest(ep.stage2InitialSeeds);
      await arm.feedback(ep.stage2Feedback);
      await arm.ingest(ep.stage2PostFeedbackSeeds);
      recordProbe(
        "repeat_avoidance",
        ep.domain,
        await arm.evaluate(ep.stage2Probe),
      );

      // Stage 3: Poisoned-turn quarantine
      await arm.ingest(ep.stage3Seeds);
      recordProbe(
        "poison_quarantine",
        ep.domain,
        await arm.evaluate(ep.stage3Probe),
      );

      // Stage 4: Cross-vendor handoff continuity
      await arm.ingest(ep.stage4Seeds);
      recordProbe(
        "cross_vendor_handoff",
        ep.domain,
        await arm.evaluate(ep.stage4Probe),
      );

      // Stage 5: Pre-action guard enforcement
      await arm.ingest(ep.stage5Seeds);
      recordProbe(
        "guard_enforcement",
        ep.domain,
        await arm.evaluate(ep.stage5Probe),
      );

      await arm.resetEpisode();
    }

    const overallTotal = evaluations.length;
    const overallPassed = evaluations.filter((e) => e.passed).length;

    const toScore = (c: { passed: number; total: number }): StageScore => ({
      passed: c.passed,
      total: c.total,
      ratePct:
        c.total > 0 ? Number(((c.passed / c.total) * 100).toFixed(1)) : 0,
    });

    summaries.push({
      armId: arm.id,
      armName: arm.name,
      tagline: arm.tagline,
      overallPassed,
      overallTotal,
      overallRatePct:
        overallTotal > 0
          ? Number(((overallPassed / overallTotal) * 100).toFixed(1))
          : 0,
      poisonedServedCount,
      avgEvalLatencyMs:
        overallTotal > 0
          ? Number((totalLatencyMs / overallTotal).toFixed(3))
          : 0,
      byStage: {
        grounded_recall: toScore(stageCounts.get("grounded_recall")!),
        repeat_avoidance: toScore(stageCounts.get("repeat_avoidance")!),
        poison_quarantine: toScore(stageCounts.get("poison_quarantine")!),
        cross_vendor_handoff: toScore(stageCounts.get("cross_vendor_handoff")!),
        guard_enforcement: toScore(stageCounts.get("guard_enforcement")!),
      },
      byDomain: {
        customer_support: toScore(domainCounts.get("customer_support")!),
        incident_ops: toScore(domainCounts.get("incident_ops")!),
        finance_compliance: toScore(domainCounts.get("finance_compliance")!),
        market_research: toScore(domainCounts.get("market_research")!),
      },
      evaluations,
    });
  }

  return {
    suite: "MemCell Operational Memory & Governance Benchmark",
    version: "1.0.0",
    episodeCount: episodes.length,
    probesPerArm: episodes.length * STAGES.length,
    arms: summaries,
    calibration: computeCalibrationReport(),
  };
}

export function formatBenchmarkMarkdown(
  report: OperationalBenchmarkReport,
): string {
  const lines: string[] = [
    `# ${report.suite} (v${report.version})`,
    "",
    `Evaluated **${report.episodeCount} multi-session episodes** (${report.probesPerArm} probes per architecture) across Customer Support, Cloud & Incident Ops, Finance & Compliance, and Market Research.`,
    "",
    "## Architecture Comparison",
    "",
    "| Architecture | Overall | Grounded Recall | Repeat Avoidance | Poison Shield | Cross-Vendor | Pre-Action Guard | Poisoned Served |",
    "| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const arm of report.arms) {
    lines.push(
      `| **${arm.armName}** | **${arm.overallRatePct.toFixed(1)}%** (${arm.overallPassed}/${arm.overallTotal}) | ${arm.byStage.grounded_recall.ratePct.toFixed(1)}% | ${arm.byStage.repeat_avoidance.ratePct.toFixed(1)}% | ${arm.byStage.poison_quarantine.ratePct.toFixed(1)}% | ${arm.byStage.cross_vendor_handoff.ratePct.toFixed(1)}% | ${arm.byStage.guard_enforcement.ratePct.toFixed(1)}% | ${arm.poisonedServedCount} |`,
    );
  }

  lines.push(
    "",
    `## Confidence Calibration Curve (ECE: ${report.calibration.expectedCalibrationErrorPct.toFixed(1)}%, Brier: ${report.calibration.brierScore.toFixed(3)})`,
    "",
    "| Confidence Tier | Predicted | Empirical Worked | Samples | Gap |",
    "| :--- | ---: | ---: | ---: | ---: |",
  );

  for (const b of report.calibration.buckets) {
    lines.push(
      `| ${b.label} | ${b.predictedConfidencePct.toFixed(1)}% | ${b.observedWorkedRatePct.toFixed(1)}% | ${b.sampleCount} | ${b.gapPct.toFixed(1)}pp |`,
    );
  }

  return lines.join("\n");
}
