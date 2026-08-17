export type RecurringEditionDecision =
  | { action: "create" }
  | { action: "skip"; reason: "source_unavailable" | "baseline_required" | "same_period" | "blocked" | "draft_exists" };

export function decideRecurringEdition(input: {
  source: "dwellsy_trends" | "verified_seed";
  currentPeriodEnd: string | null;
  priorPeriodEnd: string | null;
  readinessPassed: boolean;
  draftExists: boolean;
}): RecurringEditionDecision {
  if (input.source !== "dwellsy_trends" || !input.currentPeriodEnd) return { action: "skip", reason: "source_unavailable" };
  if (!input.priorPeriodEnd) return { action: "skip", reason: "baseline_required" };
  if (!input.readinessPassed) return { action: "skip", reason: "blocked" };
  if (input.currentPeriodEnd <= input.priorPeriodEnd) return { action: "skip", reason: "same_period" };
  if (input.draftExists) return { action: "skip", reason: "draft_exists" };
  return { action: "create" };
}
