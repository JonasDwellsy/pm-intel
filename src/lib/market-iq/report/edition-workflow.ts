import type { MarketIqEditionComparison, MarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import type { MarketIqCoverageStatus } from "@/lib/market-iq/report/scope";

export type MarketIqEditionCheck = {
  id: "source" | "freshness" | "period" | "scope" | "changes";
  label: string;
  status: "ready" | "review" | "blocked";
  detail: string;
};

export type MarketIqEditionWorkflow = {
  state: "launch" | "new_period" | "same_period";
  canPrepare: boolean;
  checks: MarketIqEditionCheck[];
  currentPeriodEnd: string;
  priorPeriodEnd: string | null;
};

export function buildMarketIqEditionWorkflow(input: {
  current: MarketIqReportSnapshot;
  prior: MarketIqReportSnapshot | null;
  source: "dwellsy_trends" | "verified_seed";
  coverageCounts: Record<MarketIqCoverageStatus, number>;
  comparison: MarketIqEditionComparison;
}) : MarketIqEditionWorkflow {
  const priorPeriodEnd = input.prior?.scope.periodEnd ?? null;
  const state = !input.prior ? "launch" : input.current.scope.periodEnd > (priorPeriodEnd ?? "") ? "new_period" : "same_period";
  const geographyCount = input.current.scope.cities.length + input.current.scope.zipCodes.length;
  const sourceReady = input.source === "dwellsy_trends";
  const coverageReady = input.coverageCounts.reportable > 0;
  const checks: MarketIqEditionCheck[] = [
    {
      id: "source",
      label: "Validated rent source",
      status: sourceReady ? "ready" : "blocked",
      detail: sourceReady ? "Rent levels and trajectories are loaded from Dwellsy Trends IQ." : "The live Trends IQ source is unavailable. A preview seed cannot be published as a recurring client edition.",
    },
    {
      id: "freshness",
      label: "Reportable market evidence",
      status: coverageReady ? input.coverageCounts.stale > 0 ? "review" : "ready" : "blocked",
      detail: `${input.coverageCounts.reportable} reportable cells, ${input.coverageCounts.stale} stale cells, and ${input.coverageCounts.unavailable} unavailable cells in the saved scope.`,
    },
    {
      id: "period",
      label: "New reporting period",
      status: state === "same_period" ? "review" : "ready",
      detail: state === "launch" ? `This will establish the ${input.current.scope.periodEnd} baseline.` : state === "new_period" ? `Source data advanced from ${priorPeriodEnd} to ${input.current.scope.periodEnd}.` : `The latest source date remains ${input.current.scope.periodEnd}, the same cutoff as the prior edition.`,
    },
    {
      id: "scope",
      label: "Saved audience scope",
      status: geographyCount > 0 && input.current.scope.segments.length > 0 ? "ready" : "blocked",
      detail: `${input.current.scope.cities.length} cities, ${input.current.scope.zipCodes.length} ZIPs, and ${input.current.scope.segments.length} product segments are selected.`,
    },
    {
      id: "changes",
      label: "Change review",
      status: input.comparison.state === "changed" ? "review" : "ready",
      detail: input.comparison.heading,
    },
  ];
  return {
    state,
    canPrepare: checks.every((check) => check.status !== "blocked"),
    checks,
    currentPeriodEnd: input.current.scope.periodEnd,
    priorPeriodEnd,
  };
}
