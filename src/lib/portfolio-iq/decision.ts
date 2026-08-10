export type PortfolioSignalDecisionState = "open" | "acknowledged" | "snoozed" | "resolved";

export interface PortfolioSignalDecisionView {
  state: string;
  snoozedUntil: Date | null;
}

export function isPortfolioSignalActionable(
  decision: PortfolioSignalDecisionView | null | undefined,
  now: Date = new Date()
): boolean {
  if (!decision) return true;
  if (decision.state === "resolved") return false;
  if (decision.state === "snoozed" && decision.snoozedUntil && decision.snoozedUntil > now) return false;
  return true;
}

export function portfolioDecisionLabel(state: string | null | undefined): string {
  const labels: Record<string, string> = {
    open: "Open",
    acknowledged: "Acknowledged",
    snoozed: "Snoozed",
    resolved: "Resolved",
  };
  return labels[state ?? "open"] ?? "Open";
}
