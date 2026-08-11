export type DecisionLedgerStage = "action_planned" | "awaiting_pm" | "owner_review" | "monitoring" | "outcome_due" | "follow_up" | "closed";

export interface DecisionLedgerFinancialPriority {
  assetId: string;
  amount: number;
}

export interface DecisionLedgerRow {
  signalId: string;
  state: string;
  stage: DecisionLedgerStage;
  assignedTo: string | null;
  hasActionPlan: boolean;
  acceptedPmPlan: boolean;
  pmResponseDays: number | null;
  pmRespondedOnTime: boolean | null;
  implementationStatus: string | null;
  outcomeConclusion: string | null;
  nextDecision: string | null;
  financialPriorities: DecisionLedgerFinancialPriority[];
}

export const DECISION_LEDGER_STAGE_LABELS: Record<DecisionLedgerStage, string> = {
  action_planned: "Action planned",
  awaiting_pm: "Awaiting PM",
  owner_review: "Owner review",
  monitoring: "Monitoring",
  outcome_due: "Outcome due",
  follow_up: "Follow-up required",
  closed: "Closed loop",
};

export function deriveDecisionLedgerStage(input: {
  decisionState: string;
  baselineCapturedAt: Date | null;
  dueAt: Date | null;
  briefStatus: string | null;
  pmDisposition: string | null;
  latestOutcome: { status: string; nextDecision: string | null } | null;
  now: Date;
}): DecisionLedgerStage {
  if (input.decisionState === "resolved" || input.latestOutcome?.nextDecision === "close") return "closed";
  if (input.pmDisposition === "pending") return "owner_review";
  if (input.briefStatus === "published") return "awaiting_pm";
  if (input.latestOutcome?.status === "reviewed" && ["adjust", "escalate"].includes(input.latestOutcome.nextDecision ?? "")) return "follow_up";
  if (input.baselineCapturedAt && input.dueAt && input.dueAt <= input.now) return "outcome_due";
  if (input.baselineCapturedAt) return "monitoring";
  return "action_planned";
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeDecisionLedger(rows: DecisionLedgerRow[]) {
  const financialByAsset = new Map<string, number>();
  for (const row of rows) {
    for (const priority of row.financialPriorities) financialByAsset.set(priority.assetId, Math.max(financialByAsset.get(priority.assetId) ?? 0, priority.amount));
  }
  const responseRows = rows.filter((row) => row.pmResponseDays !== null);
  return {
    decisionsOpened: rows.length,
    activeDecisions: rows.filter((row) => row.stage !== "closed").length,
    attentionNow: rows.filter((row) => ["owner_review", "outcome_due", "follow_up"].includes(row.stage)).length,
    acceptedPmPlans: rows.filter((row) => row.acceptedPmPlan).length,
    outcomesReviewed: rows.filter((row) => row.outcomeConclusion !== null).length,
    loopsClosed: rows.filter((row) => row.stage === "closed").length,
    implementationConfirmed: rows.filter((row) => ["completed", "partially_completed"].includes(row.implementationStatus ?? "")).length,
    improvedOutcomes: rows.filter((row) => row.outcomeConclusion === "improved").length,
    worsenedOutcomes: rows.filter((row) => row.outcomeConclusion === "worsened").length,
    medianPmResponseDays: median(responseRows.flatMap((row) => row.pmResponseDays === null ? [] : [row.pmResponseDays])),
    onTimePmResponses: responseRows.filter((row) => row.pmRespondedOnTime === true).length,
    measuredPmResponses: responseRows.filter((row) => row.pmRespondedOnTime !== null).length,
    askingRentPriority: [...financialByAsset.values()].reduce((sum, amount) => sum + amount, 0),
    financiallyPrioritizedAssets: financialByAsset.size,
  };
}
