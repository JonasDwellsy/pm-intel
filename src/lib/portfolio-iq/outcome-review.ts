import { decisionBaselineExposures, type DecisionBaselineSnapshot, type DecisionBaselinePropertySnapshot } from "@/lib/portfolio-iq/decision-case";

export type OutcomeSourceHealth = "healthy" | "unchanged" | "unavailable";
export type OutcomeConclusion = "improved" | "unchanged" | "worsened" | "inconclusive";

export interface OutcomeMetric { label: string; baseline: number | null; current: number | null; delta: number | null; unit: "dollars" | "percent" | "days" | "count"; }
export interface OutcomeExposureComparison { assetId: string; assetName: string; sourceHealth: OutcomeSourceHealth; baselineAvailableThrough: string | null; currentAvailableThrough: string | null; metrics: OutcomeMetric[]; }
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
  exposures?: OutcomeExposureComparison[];
}

function instant(value: string | null): number | null { if (!value) return null; const time = new Date(value).getTime(); return Number.isNaN(time) ? null : time; }
function metric(label: string, baseline: number | null, current: number | null, unit: OutcomeMetric["unit"]): OutcomeMetric { return { label, baseline, current, delta: baseline !== null && current !== null ? current - baseline : null, unit }; }
type CurrentOutcomeProperty = { availableThrough: string | null; askingRent: number | null; askingRentChange90d: number | null; medianDom: number | null; observationCount: number };

function compareProperty(assetId: string, assetName: string, baseline: DecisionBaselinePropertySnapshot | null, current: CurrentOutcomeProperty | null): OutcomeExposureComparison {
  const baselineCut = instant(baseline?.availableThrough ?? null);
  const currentCut = instant(current?.availableThrough ?? null);
  const sourceHealth: OutcomeSourceHealth = !current || currentCut === null ? "unavailable" : baselineCut !== null && currentCut <= baselineCut ? "unchanged" : "healthy";
  return {
    assetId,
    assetName,
    sourceHealth,
    baselineAvailableThrough: baseline?.availableThrough ?? null,
    currentAvailableThrough: current?.availableThrough ?? null,
    metrics: [
      metric("Asking rent", baseline?.askingRent ?? null, sourceHealth === "healthy" ? current?.askingRent ?? null : null, "dollars"),
      metric("90-day asking-rent move", baseline?.askingRentChange90d ?? null, sourceHealth === "healthy" ? current?.askingRentChange90d ?? null : null, "percent"),
      metric("Median days on market", baseline?.medianDom ?? null, sourceHealth === "healthy" ? current?.medianDom ?? null : null, "days"),
      metric("Listing observations", baseline?.observationCount ?? null, sourceHealth === "healthy" ? current?.observationCount ?? null : null, "count"),
    ],
  };
}

export function buildOutcomeComparison(input: {
  baseline: DecisionBaselineSnapshot;
  current: CurrentOutcomeProperty | null;
  currentExposures?: Array<{ assetId: string; property: CurrentOutcomeProperty | null }>;
  actionPlan: string | null;
  successMeasure: string | null;
  generatedAt: Date;
}): OutcomeComparison {
  const baselineExposures = decisionBaselineExposures(input.baseline);
  const currentByAsset = new Map(input.currentExposures?.map((exposure) => [exposure.assetId, exposure.property]) ?? []);
  const exposures = baselineExposures.map((exposure, index) => compareProperty(
    exposure.asset.id,
    exposure.asset.name,
    exposure.property,
    currentByAsset.get(exposure.asset.id) ?? (index === 0 ? input.current : null),
  ));
  const healthyCount = exposures.filter((exposure) => exposure.sourceHealth === "healthy").length;
  const sourceHealth: OutcomeSourceHealth = exposures.length && healthyCount === exposures.length ? "healthy" : exposures.some((exposure) => exposure.sourceHealth !== "unavailable") ? "unchanged" : "unavailable";
  const sourceMessage = sourceHealth === "healthy"
    ? exposures.length > 1 ? `Newer asking-market evidence is available for all ${exposures.length} exposed assets.` : "A newer property-level asking-market observation is available for review."
    : healthyCount > 0
      ? `${healthyCount} of ${exposures.length} exposed assets have newer evidence. A portfolio-wide outcome conclusion is not supported yet.`
      : sourceHealth === "unchanged" ? "The property source has not advanced beyond the decision baseline. No outcome conclusion is supported yet." : "Current property evidence is unavailable. No outcome conclusion is supported.";
  const baseline = input.baseline.property;
  const primary = exposures[0] ?? compareProperty("primary", input.baseline.asset?.name ?? "Portfolio", baseline, input.current);
  return {
    version: 1,
    generatedAt: input.generatedAt.toISOString(),
    baselineCapturedAt: input.baseline.capturedAt,
    baselineAvailableThrough: baseline?.availableThrough ?? null,
    currentAvailableThrough: exposures.length ? exposures.map((exposure) => exposure.currentAvailableThrough).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null : input.current?.availableThrough ?? null,
    sourceHealth,
    sourceMessage,
    assetName: input.baseline.asset?.name ?? null,
    actionPlan: input.actionPlan,
    successMeasure: input.successMeasure,
    metrics: primary.metrics,
    exposures,
  };
}

export function parseOutcomeComparison(value: string): OutcomeComparison | null { try { const parsed = JSON.parse(value) as OutcomeComparison; return parsed.version === 1 && Array.isArray(parsed.metrics) ? parsed : null; } catch { return null; } }
