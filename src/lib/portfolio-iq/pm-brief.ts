export const PM_BRIEF_VERSION = 1 as const;

export interface PortfolioIqPmBriefSnapshot {
  version: typeof PM_BRIEF_VERSION;
  publishedAt: string;
  property: {
    name: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    product: string;
  };
  issue: {
    headline: string;
    narrative: string;
    ownerQuestion: string | null;
    severity: string;
    observedAt: string;
  };
  evidence: {
    availableThrough: string | null;
    askingRent: number | null;
    askingRentChange90d: number | null;
    medianDom: number | null;
    observationCount: number;
    compStatus: string;
    compCount: number;
    compAskingRent: number | null;
    askingRentVsComps: number | null;
  };
  marketContext: { headline: string; narrative: string } | null;
  request: {
    ownerNote: string | null;
    responseDueAt: string | null;
    questions: string[];
  };
  disclosure: string;
}

export function parsePortfolioIqPmBriefSnapshot(value: string): PortfolioIqPmBriefSnapshot | null {
  try {
    const parsed = JSON.parse(value) as Partial<PortfolioIqPmBriefSnapshot>;
    return parsed.version === PM_BRIEF_VERSION && Boolean(parsed.property?.name) && Boolean(parsed.issue?.headline) && Array.isArray(parsed.request?.questions)
      ? parsed as PortfolioIqPmBriefSnapshot
      : null;
  } catch {
    return null;
  }
}

export function buildPortfolioIqPmBriefSnapshot(input: {
  publishedAt: Date;
  property: {
    name: string;
    canonicalAddress: string | null;
    suppliedAddress: string;
    city: string;
    state: string;
    postalCode: string;
    assetType: string;
  };
  signal: {
    headline: string;
    narrative: string;
    ownerQuestion: string | null;
    severity: string;
    observedAt: Date;
  };
  performance: {
    askingRent: number | null;
    askingRentChange90d: number | null;
    medianDom: number | null;
    observationCount: number;
    compAskingRent: number | null;
    askingRentVsComps: number | null;
  };
  availableThrough: Date | null;
  compStatus: string | null;
  compCount: number;
  marketContext: { headline: string; narrative: string } | null;
  ownerNote: string | null;
  responseDueAt: Date | null;
}): PortfolioIqPmBriefSnapshot {
  const compsLocked = input.compStatus === "locked";
  return {
    version: PM_BRIEF_VERSION,
    publishedAt: input.publishedAt.toISOString(),
    property: {
      name: input.property.name,
      address: input.property.canonicalAddress ?? input.property.suppliedAddress,
      city: input.property.city,
      state: input.property.state,
      postalCode: input.property.postalCode,
      product: input.property.assetType === "single_family" ? "Single-family rental" : "Multifamily",
    },
    issue: {
      headline: input.signal.headline,
      narrative: input.signal.narrative,
      ownerQuestion: input.signal.ownerQuestion,
      severity: input.signal.severity,
      observedAt: input.signal.observedAt.toISOString(),
    },
    evidence: {
      availableThrough: input.availableThrough?.toISOString() ?? null,
      askingRent: input.performance.askingRent,
      askingRentChange90d: input.performance.askingRentChange90d,
      medianDom: input.performance.medianDom,
      observationCount: input.performance.observationCount,
      compStatus: input.compStatus ?? "not_started",
      compCount: compsLocked ? input.compCount : 0,
      compAskingRent: compsLocked ? input.performance.compAskingRent : null,
      askingRentVsComps: compsLocked ? input.performance.askingRentVsComps : null,
    },
    marketContext: input.marketContext,
    request: {
      ownerNote: input.ownerNote,
      responseDueAt: input.responseDueAt?.toISOString() ?? null,
      questions: [
        input.signal.ownerQuestion ?? "What operating context should the owner consider when reviewing this evidence?",
        "What action, if any, do you recommend?",
        "When should the owner expect an update?",
      ],
    },
    disclosure: "This brief uses advertised asking-market evidence. It does not measure occupancy, signed leases, concessions, effective rent, or verify a property-management contract.",
  };
}
