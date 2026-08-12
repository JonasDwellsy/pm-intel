import { createHash } from "node:crypto";

export const PILOT_VALUE_REVIEW_VERSION = 1 as const;

export interface PilotValueReviewSnapshot {
  version: typeof PILOT_VALUE_REVIEW_VERSION;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  portfolio: { id: string; name: string; marketId: string; assetCount: number };
  successGoal: string | null;
  executiveHeadline: string;
  executiveSummary: string;
  adoption: { authorizedUsers: number; workspaceUsers: number; workspaceViews: number; latestViewAt: string | null; deliveredBriefings: number; observedClicks: number };
  findings: { surfaced: number; rated: number; useful: number; usefulRate: number | null };
  decisions: { opened: number; active: number; actionPlans: number; loopsClosed: number; attentionNow: number };
  collaboration: { pmResponses: number; acceptedPlans: number; medianResponseDays: number | null };
  outcomes: { reviewed: number; improved: number; worsened: number; inconclusive: number; implementationConfirmed: number };
  financial: { askingRentPriority: number; financiallyPrioritizedAssets: number; actionLinkedPriority: number };
  unresolved: Array<{ label: string; count: number; href: string }>;
  nextMonthPlan: string[];
  evidenceBoundary: string;
}

export function buildPilotValueReview(input: Omit<PilotValueReviewSnapshot, "version" | "executiveHeadline" | "executiveSummary" | "nextMonthPlan" | "evidenceBoundary">): PilotValueReviewSnapshot {
  const valueSignals = input.findings.useful + input.decisions.opened + input.collaboration.pmResponses + input.outcomes.reviewed;
  const executiveHeadline = input.outcomes.improved > 0
    ? `${input.outcomes.improved} reviewed outcome${input.outcomes.improved === 1 ? " shows" : "s show"} improved asking-market position`
    : input.decisions.opened > 0
      ? `${input.decisions.opened} owner decision${input.decisions.opened === 1 ? " was" : "s were"} initiated from portfolio intelligence`
      : input.findings.useful > 0
        ? `${input.findings.useful} finding${input.findings.useful === 1 ? " was" : "s were"} explicitly useful to the owner`
        : "The pilot has not yet produced a recorded owner decision";
  const executiveSummary = valueSignals > 0
    ? `During this review period, the portfolio recorded ${input.findings.useful} useful finding${input.findings.useful === 1 ? "" : "s"}, ${input.decisions.opened} decision${input.decisions.opened === 1 ? "" : "s"}, ${input.collaboration.pmResponses} property-manager response${input.collaboration.pmResponses === 1 ? "" : "s"}, and ${input.outcomes.reviewed} reviewed outcome${input.outcomes.reviewed === 1 ? "" : "s"}.`
    : "The system is active, but explicit customer value evidence has not yet been recorded for this period.";
  const nextMonthPlan: string[] = [];
  if (input.unresolved.some((item) => item.label === "Decisions needing attention" && item.count > 0)) nextMonthPlan.push("Resolve or advance every decision currently requiring owner attention.");
  if (input.unresolved.some((item) => item.label === "PM responses overdue" && item.count > 0)) nextMonthPlan.push("Close the overdue property-manager response loop and record an agreed action owner.");
  if (input.unresolved.some((item) => item.label === "Outcome reviews due" && item.count > 0)) nextMonthPlan.push("Complete due outcome reviews using newer asking-market evidence where available.");
  if (input.findings.rated === 0) nextMonthPlan.push("Review the first prioritized finding with the owner and record whether it was useful.");
  if (input.decisions.opened === 0) nextMonthPlan.push("Convert one material finding into a documented owner decision and monitoring plan.");
  if (input.adoption.workspaceUsers === 0) nextMonthPlan.push("Complete the owner’s first guided workspace review.");
  if (nextMonthPlan.length === 0) nextMonthPlan.push("Maintain the weekly review cadence and open a decision case for each material portfolio change.");
  return {
    version: PILOT_VALUE_REVIEW_VERSION,
    ...input,
    executiveHeadline,
    executiveSummary,
    nextMonthPlan: nextMonthPlan.slice(0, 4),
    evidenceBoundary: "Financial figures are asking-rent prioritization estimates based on advertised market evidence and owner assumptions. They are not occupancy, signed-lease, effective-rent, NOI, or realized-revenue results.",
  };
}

export function pilotValueReviewKey(snapshot: PilotValueReviewSnapshot): string {
  return createHash("sha256").update(`${snapshot.portfolio.id}:${snapshot.periodStart.slice(0, 10)}:${snapshot.periodEnd.slice(0, 10)}`).digest("hex");
}

export function parsePilotValueReview(value: string): PilotValueReviewSnapshot | null {
  try { const parsed = JSON.parse(value) as PilotValueReviewSnapshot; return parsed.version === PILOT_VALUE_REVIEW_VERSION && Array.isArray(parsed.nextMonthPlan) ? parsed : null; }
  catch { return null; }
}
