import { call } from "../client.js";
import { credentialFor } from "../instance.js";
import { resolveNamespace } from "../namespace.js";
import { getSdkClient } from "../sdk-client.js";
import { findWorkspace } from "../workspace.js";
import { resolveOrg } from "./fleet.js";
import { badge, cmd, emit, good, label, place, row, say, value, variant, warn } from "../ui.js";

const needsSession = (instance: string) =>
  say(
    row(0, [badge("memcell"), place(instance)]),
    row(1, [warn("not signed in")], [label("run"), cmd("memcell login")]),
  );

function refused(instance: string, failure: Error): number {
  say(
    row(0, [badge("memcell"), place(instance)]),
    row(1, [warn("refused")], [label(failure.message)]),
  );
  return 1;
}

function missingContext(instance: string): number {
  say(
    row(0, [badge("memcell"), place(instance)]),
    row(
      1,
      [warn("context required")],
      [label("specify --org <slug> or connect a workspace with"), cmd("memcell connect")],
    ),
  );
  return 1;
}

function formatCalibrationMetric(val: unknown, suffix = ""): string {
  if (typeof val !== "number" || !Number.isFinite(val)) return "n/a";
  return `${val.toFixed(1)}${suffix}`;
}

export async function getEnterpriseInsights(
  instance: string,
  flags: Record<string, string | true> = {},
): Promise<number> {
  if (!(await credentialFor(instance))) {
    needsSession(instance);
    return 1;
  }

  const explicitOrg =
    Boolean(typeof flags.org === "string" && flags.org.trim()) ||
    Boolean(typeof flags.organization === "string" && flags.organization.trim()) ||
    flags._scope === "org";

  const targetWs = typeof flags.workspace === "string" ? flags.workspace.trim() : undefined;
  const localWorkspace = !explicitOrg ? await findWorkspace().catch(() => null) : null;

  // Prefer workspace insights when `--workspace` is specified or inside a connected `.memcell` workspace
  // (unless `--org` or `memcell org insights` was explicitly requested).
  if (!explicitOrg && (targetWs || localWorkspace)) {
    try {
      const sdk = await getSdkClient(instance);
      const namespace = await resolveNamespace(sdk, targetWs);
      const timeframe =
        typeof flags.timeframe === "string" && ["24h", "7d", "30d"].includes(flags.timeframe.trim())
          ? (flags.timeframe.trim() as "24h" | "7d" | "30d")
          : "24h";

      const parts = namespace.split("/");
      const endpoint = `/api/v1/${encodeURIComponent(parts[0] || "")}/${encodeURIComponent(parts[1] || "")}/insights?timeframe=${encodeURIComponent(timeframe)}`;
      const wsInsights = await call<any>(instance, endpoint);

      if (flags.json === true) {
        emit(JSON.stringify(wsInsights, null, 2) + "\n");
        return 0;
      }

      const summary = wsInsights.summary ?? {};
      const recalls = summary.recalls ?? {};
      const verification = summary.taskVerification ?? {};
      const calibration = wsInsights.calibration;
      const governance = wsInsights.governance;

      const outputRows = [
        row(
          0,
          [badge("memcell"), label("workspace insights"), place(namespace)],
          [variant(timeframe)],
        ),
        row(
          1,
          [label("Recalls:")],
          [good(`${recalls.totalHits ?? recalls.current ?? 0} hits`)],
          [label("Hit Rate:")],
          [value(`${Number(recalls.hitRate ?? 0).toFixed(1)}%`)],
          [label("Verified Worked:")],
          [good(`${Number(verification.workedRate ?? 0).toFixed(1)}%`)],
          [label("Active Memories:")],
          [value(String(summary.activeMemoriesCount ?? 0))],
        ),
      ];

      if (calibration) {
        const ecePct =
          typeof calibration.expectedCalibrationError === "number"
            ? `${(calibration.expectedCalibrationError * 100).toFixed(1)}%`
            : "n/a";
        const brier =
          typeof calibration.brierScore === "number" ? calibration.brierScore.toFixed(3) : "n/a";
        outputRows.push(
          row(
            1,
            [label("Confidence Calibration:")],
            [label("ECE:")],
            [calibration.expectedCalibrationError !== null ? good(ecePct) : value(ecePct)],
            [label("Brier:")],
            [value(brier)],
            [label("High-Trust Worked:")],
            [good(formatCalibrationMetric(calibration.highConfidenceWorkedRate, "%"))],
            [label("Samples:")],
            [value(String(calibration.totalSamples ?? 0))],
          ),
        );
      }

      if (governance) {
        outputRows.push(
          row(
            1,
            [label("Governance Shield:")],
            [label("enforced guards:")],
            [good(String(governance.enforcedGuardCount ?? 0))],
            [label("quarantined user-scope:")],
            [value(String(governance.quarantinedUserScopeCount ?? 0))],
            [label("provisional:")],
            [value(String(governance.provisionalCount ?? 0))],
            [label("demoted:")],
            [value(String(governance.demotedOrRefutedCount ?? 0))],
          ),
        );
      }

      say(...outputRows);
      return 0;
    } catch {
      return missingContext(instance);
    }
  }

  const orgSlug = await resolveOrg(flags);
  if (!orgSlug) {
    return missingContext(instance);
  }

  const timeframe =
    typeof flags.timeframe === "string" &&
    ["24h", "7d", "30d", "90d", "all"].includes(flags.timeframe.trim())
      ? flags.timeframe.trim()
      : "30d";

  try {
    const query = new URLSearchParams();
    query.set("timeframe", timeframe);
    if (typeof flags.team === "string") query.set("teamId", flags.team.trim());
    if (typeof flags.workspace === "string") query.set("workspaceId", flags.workspace.trim());
    const qs = `?${query.toString()}`;

    const insights = await call<any>(
      instance,
      `/api/v1/organizations/${encodeURIComponent(orgSlug)}/insights${qs}`,
    );

    if (flags.json === true) {
      emit(JSON.stringify(insights, null, 2) + "\n");
      return 0;
    }

    const { kpis, metrics, calibration, governance } = insights;

    const outputRows = [
      row(
        0,
        [badge("memcell"), label("organization insights"), value(orgSlug), place(instance)],
        [variant(timeframe)],
      ),
      row(
        1,
        [label("Dead-End Avoidance:")],
        [
          kpis.deadEndAvoidanceRate >= 95
            ? good(`${kpis.deadEndAvoidanceRate.toFixed(1)}%`)
            : warn(`${kpis.deadEndAvoidanceRate.toFixed(1)}%`),
        ],
        [label("Recall Precision:")],
        [good(`${kpis.recallPrecisionRate.toFixed(1)}%`)],
        [label("Recall Utilization:")],
        [value(`${kpis.recallUtilizationRate.toFixed(1)}%`)],
      ),
      row(
        1,
        [label("Memory Convergence:")],
        [value(`${kpis.memoryConvergenceRate.toFixed(1)}%`)],
        [label("Converged Memories:")],
        [value(`${metrics.convergedMemories ?? 0} / ${metrics.totalMemories ?? 0}`)],
      ),
      row(
        1,
        [label("Tokens Saved:")],
        [good(kpis.tokensSaved.toLocaleString())],
        [label("Estimated Cost Savings:")],
        [good(`$${kpis.estimatedCostSavedUsd.toFixed(2)} USD`)],
      ),
      row(
        1,
        [label("Telemetry Latency:")],
        [label("p50:")],
        [value(`${kpis.latencyMs.p50}ms`)],
        [label("p95:")],
        [value(`${kpis.latencyMs.p95}ms`)],
        [label("p99:")],
        [value(`${kpis.latencyMs.p99}ms`)],
      ),
      row(
        1,
        [label("Execution Summary:")],
        [value(`${metrics.totalRecalls} total recalls`)],
        [good(`${metrics.workedRecalls} worked`)],
        metrics.failedRecalls > 0
          ? [warn(`${metrics.failedRecalls} dead-ends`)]
          : [label("0 dead-ends")],
      ),
    ];

    if (calibration) {
      const ecePct =
        typeof calibration.expectedCalibrationError === "number"
          ? `${(calibration.expectedCalibrationError * 100).toFixed(1)}%`
          : "n/a";
      outputRows.push(
        row(
          1,
          [label("Confidence Calibration:")],
          [label("ECE:")],
          [calibration.expectedCalibrationError !== null ? good(ecePct) : value(ecePct)],
          [label("High-Trust Worked:")],
          [good(formatCalibrationMetric(calibration.highConfidenceWorkedRate, "%"))],
          [label("Samples:")],
          [value(String(calibration.totalSamples ?? 0))],
        ),
      );
    }

    if (governance) {
      outputRows.push(
        row(
          1,
          [label("Governance Shield:")],
          [label("enforced guards:")],
          [good(String(governance.enforcedGuardCount ?? 0))],
          [label("quarantined user-scope:")],
          [value(String(governance.quarantinedUserScopeCount ?? 0))],
          [label("approved promotions:")],
          [value(String(governance.approvedPromotionsCount ?? 0))],
        ),
      );
    }

    say(...outputRows);
    return 0;
  } catch (err) {
    return refused(instance, err as Error);
  }
}
