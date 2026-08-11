export type FinancialImpactDirection = "opportunity" | "pricing_exposure" | "aligned" | "unavailable";
export type FinancialImpactStatus = "estimated" | "assumptions_needed" | "comps_needed" | "subject_evidence_needed" | "aligned";

export interface FinancialImpactInput {
  askingRent: number | null;
  compAskingRent: number | null;
  observationCount: number;
  compCount: number;
  compLocked: boolean;
  inventoryUnits: number | null;
  affectedUnits: number | null;
  realizationPct: number;
  assumptionSource: "owner" | "single_family_default" | "missing";
}

export interface FinancialImpactResult {
  direction: FinancialImpactDirection;
  status: FinancialImpactStatus;
  monthlyGapPerUnit: number | null;
  annualGrossExposure: number | null;
  annualRealizationAdjusted: number | null;
  inventoryUnits: number | null;
  affectedUnits: number | null;
  realizationPct: number;
  confidence: "high" | "medium" | "low" | "not_estimated";
  assumptionSource: FinancialImpactInput["assumptionSource"];
}

function positiveInteger(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value > 0 ? value : null;
}

export function calculateFinancialImpact(input: FinancialImpactInput): FinancialImpactResult {
  const inventoryUnits = positiveInteger(input.inventoryUnits);
  const affectedUnits = positiveInteger(input.affectedUnits);
  const realizationPct = Math.min(1, Math.max(0, input.realizationPct));
  const base = { inventoryUnits, affectedUnits, realizationPct, assumptionSource: input.assumptionSource };
  if (input.askingRent === null || input.observationCount === 0) return { ...base, direction: "unavailable", status: "subject_evidence_needed", monthlyGapPerUnit: null, annualGrossExposure: null, annualRealizationAdjusted: null, confidence: "not_estimated" };
  if (!input.compLocked || input.compAskingRent === null || input.compCount < 1) return { ...base, direction: "unavailable", status: "comps_needed", monthlyGapPerUnit: null, annualGrossExposure: null, annualRealizationAdjusted: null, confidence: "not_estimated" };
  const signedGap = input.compAskingRent - input.askingRent;
  const monthlyGapPerUnit = Math.abs(signedGap);
  const direction: FinancialImpactDirection = Math.abs(signedGap) < 1 ? "aligned" : signedGap > 0 ? "opportunity" : "pricing_exposure";
  if (direction === "aligned") return { ...base, direction, status: "aligned", monthlyGapPerUnit, annualGrossExposure: 0, annualRealizationAdjusted: 0, confidence: "medium" };
  if (affectedUnits === null) return { ...base, direction, status: "assumptions_needed", monthlyGapPerUnit, annualGrossExposure: null, annualRealizationAdjusted: null, confidence: "not_estimated" };
  const annualGrossExposure = monthlyGapPerUnit * affectedUnits * 12;
  const confidence = input.assumptionSource === "owner" && input.observationCount >= 10 && input.compCount >= 3 ? "high" : input.observationCount >= 5 ? "medium" : "low";
  return { ...base, direction, status: "estimated", monthlyGapPerUnit, annualGrossExposure, annualRealizationAdjusted: annualGrossExposure * realizationPct, confidence };
}

export function financialImpactPriority(result: FinancialImpactResult): number {
  if (result.status === "estimated") return 1_000_000 + (result.annualRealizationAdjusted ?? 0);
  if (result.status === "assumptions_needed") return 500_000 + (result.monthlyGapPerUnit ?? 0) * 12;
  if (result.status === "aligned") return 100_000;
  return result.status === "comps_needed" ? 20_000 : 10_000;
}

export function financialImpactStatusLabel(status: FinancialImpactStatus): string {
  const labels: Record<FinancialImpactStatus, string> = {
    estimated: "Financial estimate ready",
    assumptions_needed: "Affected units needed",
    comps_needed: "Approved comps needed",
    subject_evidence_needed: "Subject evidence needed",
    aligned: "Asking rent aligned",
  };
  return labels[status];
}

export const FINANCIAL_IMPACT_DISCLOSURE = "Gross asking-rent prioritization only. This estimate does not represent occupancy, signed leases, concessions, effective rent, NOI, or guaranteed revenue.";
