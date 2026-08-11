export const MONITORING_WINDOWS = [7, 14, 30, 60, 90] as const;

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
  property: {
    availableThrough: string | null;
    askingRent: number | null;
    askingRentChange90d: number | null;
    medianDom: number | null;
    observationCount: number;
    compStatus: string | null;
    compCount: number;
  } | null;
  operator: {
    status: string;
    operatorName: string | null;
    dataAsOf: string | null;
    overallRank: number | null;
    overallRankTotal: number | null;
    leaseUpDom: number | null;
    t12Listings: number | null;
  } | null;
}

export function parseMonitoringWindow(value: unknown): number | null {
  const parsed = Number(value);
  return MONITORING_WINDOWS.includes(parsed as (typeof MONITORING_WINDOWS)[number]) ? parsed : null;
}

export function parseDecisionBaseline(value: string | null | undefined): DecisionBaselineSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as DecisionBaselineSnapshot;
    return parsed?.version === 1 && parsed.signal && Array.isArray(parsed.sources) ? parsed : null;
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
