export const MONITORING_WINDOWS = [7, 14, 30, 60, 90] as const;

export interface DecisionBaselinePropertySnapshot {
  availableThrough: string | null;
  askingRent: number | null;
  askingRentChange90d: number | null;
  medianDom: number | null;
  observationCount: number;
  compStatus: string | null;
  compCount: number;
}

export interface DecisionBaselineOperatorSnapshot {
  status: string;
  operatorName: string | null;
  dataAsOf: string | null;
  overallRank: number | null;
  overallRankTotal: number | null;
  leaseUpDom: number | null;
  t12Listings: number | null;
}

export interface DecisionBaselineExposureSnapshot {
  asset: {
    id: string;
    slug: string;
    name: string;
    city: string;
    postalCode: string;
    observedOperatorName: string | null;
  };
  relevanceScore: number;
  property: DecisionBaselinePropertySnapshot | null;
  operator: DecisionBaselineOperatorSnapshot | null;
}

export interface DecisionBaselineSnapshot {
  version: 1;
  capturedAt: string;
  signal: {
    headline: string;
    narrative: string;
    category: string;
    severity: string;
    confidence: string;
    observedAt: string;
    evidence: string;
  };
  asset: {
    name: string;
    city: string;
    postalCode: string;
    observedOperatorName: string | null;
  } | null;
  sources: string[];
  property: DecisionBaselinePropertySnapshot | null;
  operator: DecisionBaselineOperatorSnapshot | null;
  exposures?: DecisionBaselineExposureSnapshot[];
}

export function decisionBaselineExposures(baseline: DecisionBaselineSnapshot): DecisionBaselineExposureSnapshot[] {
  if (baseline.exposures?.length) return baseline.exposures;
  if (!baseline.asset) return [];
  return [{
    asset: {
      id: "legacy-primary",
      slug: "",
      name: baseline.asset.name,
      city: baseline.asset.city,
      postalCode: baseline.asset.postalCode,
      observedOperatorName: baseline.asset.observedOperatorName,
    },
    relevanceScore: 0,
    property: baseline.property,
    operator: baseline.operator,
  }];
}

export function parseMonitoringWindow(value: unknown): number | null {
  const parsed = Number(value);
  return MONITORING_WINDOWS.includes(parsed as (typeof MONITORING_WINDOWS)[number]) ? parsed : null;
}

export function parseDecisionBaseline(value: string | null | undefined): DecisionBaselineSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as DecisionBaselineSnapshot;
    return parsed?.version === 1 && parsed.signal && Array.isArray(parsed.sources) && (!parsed.exposures || Array.isArray(parsed.exposures)) ? parsed : null;
  } catch {
    return null;
  }
}

export function monitoringStatus(input: {
  state: string | null | undefined;
  dueAt: Date | null | undefined;
  baselineCapturedAt: Date | null | undefined;
  now?: Date;
}): "not_started" | "monitoring" | "due" | "resolved" {
  if (input.state === "resolved") return "resolved";
  if (!input.baselineCapturedAt) return "not_started";
  if (input.dueAt && input.dueAt.getTime() < (input.now ?? new Date()).getTime()) return "due";
  return "monitoring";
}
