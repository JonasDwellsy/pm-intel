export const IMPLEMENTATION_STATUSES = ["completed", "partially_completed", "not_completed", "unknown"] as const;
export const OUTCOME_NEXT_DECISIONS = ["continue", "adjust", "escalate", "close"] as const;

export type ImplementationStatus = (typeof IMPLEMENTATION_STATUSES)[number];
export type OutcomeNextDecision = (typeof OUTCOME_NEXT_DECISIONS)[number];

export const IMPLEMENTATION_STATUS_LABELS: Record<ImplementationStatus, string> = {
  completed: "Completed as agreed",
  partially_completed: "Partially completed",
  not_completed: "Not completed",
  unknown: "Implementation is not yet confirmed",
};

export const OUTCOME_NEXT_DECISION_LABELS: Record<OutcomeNextDecision, string> = {
  continue: "Continue the current plan",
  adjust: "Adjust the plan",
  escalate: "Escalate for owner attention",
  close: "Close the decision loop",
};

export function parseImplementationStatus(value: unknown): ImplementationStatus | null {
  return IMPLEMENTATION_STATUSES.includes(value as ImplementationStatus) ? value as ImplementationStatus : null;
}

export function parseOutcomeNextDecision(value: unknown): OutcomeNextDecision | null {
  return OUTCOME_NEXT_DECISIONS.includes(value as OutcomeNextDecision) ? value as OutcomeNextDecision : null;
}

export function implementationStatusLabel(value: string | null | undefined): string {
  return value && IMPLEMENTATION_STATUSES.includes(value as ImplementationStatus) ? IMPLEMENTATION_STATUS_LABELS[value as ImplementationStatus] : "Not recorded";
}

export function outcomeNextDecisionLabel(value: string | null | undefined): string {
  return value && OUTCOME_NEXT_DECISIONS.includes(value as OutcomeNextDecision) ? OUTCOME_NEXT_DECISION_LABELS[value as OutcomeNextDecision] : "Not recorded";
}
