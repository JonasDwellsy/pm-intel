import { classifySignalEvidenceDestination, type EvidenceDestination } from "@/lib/portfolio-iq/today";

export interface PilotLaunchAssetInput {
  id: string;
  matchStatus: string;
  uruStatus: string;
  compStatus: string | null;
  operatorMatched: boolean;
  sourceAvailableThrough: Date | null;
  sourceHealth: string | null;
  signals: Array<{ category: string; severity: string; confidence: string; rankScore: number; evidence: string; assetId: string | null; id: string }>;
}

export type PilotLaunchSupportLevel = "full" | "market_only" | "setup";

export interface PilotLaunchAssetReadiness {
  gates: {
    identity: boolean;
    listingCoverage: boolean;
    comps: boolean;
    operator: boolean;
    source: boolean;
  };
  completedGateCount: number;
  readinessPercent: number;
  marketEligible: boolean;
  compEligible: boolean;
  operatorEligible: boolean;
  supportLevel: PilotLaunchSupportLevel;
  nextAction: string;
  nextTaskType: string | null;
  findingCounts: Record<EvidenceDestination, number>;
}

export function buildPilotLaunchAssetReadiness(input: PilotLaunchAssetInput): PilotLaunchAssetReadiness {
  const gates = {
    identity: input.matchStatus === "matched",
    listingCoverage: ["observed", "partial"].includes(input.uruStatus),
    comps: input.compStatus === "locked",
    operator: input.operatorMatched,
    source: Boolean(input.sourceAvailableThrough) && !["unavailable", "blocked"].includes(input.sourceHealth ?? ""),
  };
  const completedGateCount = Object.values(gates).filter(Boolean).length;
  const marketEligible = gates.identity && gates.source;
  const compEligible = marketEligible && gates.listingCoverage && gates.comps;
  const operatorEligible = marketEligible && gates.operator;
  const supportLevel: PilotLaunchSupportLevel = compEligible && operatorEligible ? "full" : marketEligible ? "market_only" : "setup";
  const next = !gates.identity
    ? { nextAction: "Confirm the Dwellsy property identity", nextTaskType: "match_review" }
    : !gates.source
      ? { nextAction: "Restore or advance the property evidence source", nextTaskType: null }
      : !gates.listingCoverage
        ? { nextAction: "Audit or issue URUs for listing coverage", nextTaskType: "issue_uru" }
        : !gates.comps
          ? { nextAction: "Review and lock the comparable set", nextTaskType: "comp_setup" }
          : !gates.operator
            ? { nextAction: "Resolve the observed operator to Operator IQ", nextTaskType: "operator_outreach" }
            : { nextAction: "Monitor for the next material change", nextTaskType: null };
  const findingCounts: Record<EvidenceDestination, number> = { today: 0, watchlist: 0, setup: 0 };
  for (const signal of input.signals) findingCounts[classifySignalEvidenceDestination(signal)] += 1;

  return {
    gates,
    completedGateCount,
    readinessPercent: Math.round((completedGateCount / 5) * 100),
    marketEligible,
    compEligible,
    operatorEligible,
    supportLevel,
    ...next,
    findingCounts,
  };
}

