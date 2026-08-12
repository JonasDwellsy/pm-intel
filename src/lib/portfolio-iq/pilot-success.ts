export type PilotLifecycleStage = "setup" | "launched" | "engaged" | "getting_value" | "at_risk";

export type PilotSuccessInput = {
  now: Date;
  createdAt: Date;
  assetCount: number;
  readyAssetCount: number;
  acceptedAt: Date | null;
  firstViewedAt: Date | null;
  lastViewedAt: Date | null;
  viewCount: number;
  findingRatings: number;
  usefulRatings: number;
  decisionCount: number;
  actionPlanCount: number;
  pmBriefSentCount: number;
  pmResponseCount: number;
  outcomeCount: number;
  digestDeliveredCount: number;
  failedDeliveryCount: number;
  openCorrectionCount: number;
};

export type PilotSuccessMilestone = { key: string; label: string; complete: boolean; detail: string };

function daysBetween(start: Date | null, end: Date): number | null {
  return start ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000 * 10) / 10) : null;
}

export function buildPilotSuccess(input: PilotSuccessInput) {
  const setupComplete = input.assetCount > 0 && input.readyAssetCount === input.assetCount;
  const launched = Boolean(input.acceptedAt);
  const viewed = Boolean(input.firstViewedAt);
  const engaged = input.findingRatings > 0 || input.decisionCount > 0;
  const gettingValue = input.usefulRatings > 0 || input.pmResponseCount > 0 || input.outcomeCount > 0;
  const daysSinceLaunch = daysBetween(input.acceptedAt, input.now);
  const daysSinceView = daysBetween(input.lastViewedAt, input.now);
  const atRisk = launched && (
    (!viewed && (daysSinceLaunch ?? 0) >= 7) ||
    (viewed && (daysSinceView ?? 0) >= 14 && !gettingValue) ||
    input.failedDeliveryCount > 0 ||
    input.openCorrectionCount >= 3
  );
  const stage: PilotLifecycleStage = atRisk ? "at_risk" : gettingValue ? "getting_value" : engaged ? "engaged" : launched ? "launched" : "setup";
  const milestones: PilotSuccessMilestone[] = [
    { key: "setup", label: "Portfolio ready", complete: setupComplete, detail: `${input.readyAssetCount}/${input.assetCount} assets ready` },
    { key: "launch", label: "Guided launch accepted", complete: launched, detail: launched ? "Owner accepted the monitored portfolio" : "Launch session not accepted" },
    { key: "view", label: "Owner entered workspace", complete: viewed, detail: viewed ? `${input.viewCount} recorded workspace views` : "No owner workspace view recorded" },
    { key: "finding", label: "First finding reviewed", complete: input.findingRatings > 0, detail: `${input.findingRatings} findings rated` },
    { key: "decision", label: "Decision work started", complete: input.decisionCount > 0, detail: `${input.decisionCount} cases opened · ${input.actionPlanCount} action plans` },
    { key: "pm", label: "PM loop completed", complete: input.pmResponseCount > 0, detail: `${input.pmBriefSentCount} briefs sent · ${input.pmResponseCount} responses` },
    { key: "outcome", label: "Outcome reviewed", complete: input.outcomeCount > 0, detail: `${input.outcomeCount} outcomes recorded` },
    { key: "briefing", label: "Recurring briefing delivered", complete: input.digestDeliveredCount > 0, detail: `${input.digestDeliveredCount} successful deliveries` },
  ];
  const score = Math.round(milestones.filter((item) => item.complete).length / milestones.length * 100);
  const nextAction = !setupComplete
    ? { label: "Finish property activation", lane: "Activation", href: "/admin/portfolio-activation" }
    : !launched
      ? { label: "Complete the guided launch session", lane: "Customer success", href: "/portfolio-iq/acceptance" }
      : !viewed
        ? { label: "Schedule the owner's first workspace review", lane: "Customer success", href: "/today" }
        : input.findingRatings === 0
          ? { label: "Review and rate the first finding with the owner", lane: "Customer success", href: "/today" }
          : input.decisionCount === 0
            ? { label: "Turn one useful finding into a decision case", lane: "Asset management", href: "/today" }
            : input.actionPlanCount === 0
              ? { label: "Document an owner and measurable action plan", lane: "Asset management", href: "/portfolio-iq/decisions" }
              : input.pmBriefSentCount === 0
                ? { label: "Send the first property-manager brief", lane: "Asset management", href: "/portfolio-iq/collaboration" }
                : input.pmResponseCount === 0
                  ? { label: "Follow up for the property-manager response", lane: "Customer success", href: "/portfolio-iq/collaboration" }
                  : input.outcomeCount === 0
                    ? { label: "Schedule and record the first outcome review", lane: "Asset management", href: "/portfolio-iq/outcomes" }
                    : input.digestDeliveredCount === 0
                      ? { label: "Verify the first weekly briefing delivery", lane: "Customer success", href: "/today#briefing" }
                      : { label: "Maintain the weekly decision cadence", lane: "Customer success", href: "/today" };
  return {
    stage,
    score,
    atRisk,
    milestones,
    nextAction,
    timeToFirstViewDays: input.firstViewedAt ? daysBetween(input.createdAt, input.firstViewedAt) : null,
    daysSinceLastView: daysSinceView,
  };
}
