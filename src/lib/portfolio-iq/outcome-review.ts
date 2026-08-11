import type { DecisionBaselineSnapshot } from "@/lib/portfolio-iq/decision-case";

export type OutcomeSourceHealth = "healthy" | "unchanged" | "unavailable";
export type OutcomeConclusion = "improved" | "unchanged" | "worsened" | "inconclusive";

export interface OutcomeMetric { label: string; baseline: number | null; current: number | null; delta: number | null; unit: "dollars" | "percent" | "days" | "count"; }
export interface OutcomeComparison {
  version: 1;
  generatedAt: string;
  baselineCapturedAt: string;
  baselineAvailableThrough: string | null;
  currentAvailableThrough: string | null;
  sourceHealth: OutcomeSourceHealth;
  sourceMessage: string;
  assetName: string | null;
  actionPlan: string | null;
  successMeasure: string | null;
  metrics: OutcomeMetric[];
}

function instant(value: string | null): number | null { if (!value) return null; const time = new Date(value).getTime(); return Number.isNaN(time) ? null : time; }
function metric(label: string, baseline: number | null, current: number | null, unit: OutcomeMetric["unit"]): OutcomeMetric { return { label, baseline, current, delta: baseline !== null && current !== null ? current - baseline : null, unit }; }

export function buildOutcomeComparison(input: {
  baseline: DecisionBaselineSnapshot;
  current: { availableThrough: string | null; askingRent: number | null; askingRentChange90d: number | null; medianDom: number | null; observationCount: number } | null;
  actionPlan: string | null;
  successMeasure: string | null;
  generatedAt: Date;
}): OutcomeComparison {
  const baselineCut = instant(input.baseline.property?.availableThrough ?? null);
  const currentCut = instant(input.current?.availableThrough ?? null);
  const sourceHealth: OutcomeSourceHealth = !input.current || currentCut === null ? "unavailable" : baselineCut !== null && currentCut <= baselineCut ? "unchanged" : "healthy";
  const sourceMessage = sourceHealth === "healthy" ? "A newer property-level asking-market observation is available for review." : sourceHealth === "unchanged" ? "The property source has not advanced beyond the decision baseline. No outcome conclusion is supported yet." : "Current property evidence is unavailable. No outcome conclusion is supported.";
  const baseline = input.baseline.property;
  return {
    version: 1,
    generatedAt: input.generatedAt.toISOString(),
    baselineCapturedAt: input.baseline.capturedAt,
    baselineAvailableThrough: baseline?.availableThrough ?? null,
    currentAvailableThrough: input.current?.availableThrough ?? null,
    sourceHealth,
    sourceMessage,
    assetName: input.baseline.asset?.name ?? null,
    actionPlan: input.actionPlan,
    successMeasure: input.successMeasure,
    metrics: [
      metric("Asking rent", baseline?.askingRent ?? null, sourceHealth === "healthy" ? input.current?.askingRent ?? null : null, "dollars"),
      metric("90-day asking-rent move", baseline?.askingRentChange90d ?? null, sourceHealth === "healthy" ? input.current?.askingRentChange90d ?? null : null, "percent"),
      metric("Median days on market", baseline?.medianDom ?? null, sourceHealth === "healthy" ? input.current?.medianDom ?? null : null, "days"),
      metric("Listing observations", baseline?.observationCount ?? null, sourceHealth === "healthy" ? input.current?.observationCount ?? null : null, "count"),
    ],
  };
}

export function parseOutcomeComparison(value: string): OutcomeComparison | null { try { const parsed = JSON.parse(value) as OutcomeComparison; return parsed.version === 1 && Array.isArray(parsed.metrics) ? parsed : null; } catch { return null; } }

