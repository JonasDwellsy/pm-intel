export type PortfolioWatchSeverity = "high" | "medium" | "info";
export type PortfolioWatchCategory = "performance" | "market" | "readiness";

export interface PortfolioWatchAssetInput {
  portfolioId: string;
  assetId: string;
  assetSlug: string;
  assetName: string;
  matchStatus: string;
  uruStatus: string;
  compStatus: string | null;
  observationCount: number;
  askingRentVsComps: number | null;
  rentPerSqFtVsComps: number | null;
  askingRentChange90d: number | null;
  medianDom: number | null;
  marketAlert?: {
    id: string;
    severity: string;
    headline: string;
    narrative: string;
    observedAt: Date;
  } | null;
  observedAt: Date;
}

export interface PortfolioWatchDraft {
  portfolioId: string;
  assetId: string;
  fingerprint: string;
  signalType: string;
  category: PortfolioWatchCategory;
  severity: PortfolioWatchSeverity;
  confidence: "high" | "medium" | "setup";
  rankScore: number;
  headline: string;
  narrative: string;
  ownerQuestion: string | null;
  evidence: string;
  observedAt: Date;
}

function draft(input: PortfolioWatchAssetInput, values: Omit<PortfolioWatchDraft, "portfolioId" | "assetId" | "fingerprint" | "observedAt"> & { sourceKey?: string; observedAt?: Date }): PortfolioWatchDraft {
  const { sourceKey, observedAt, ...signalValues } = values;
  return {
    portfolioId: input.portfolioId,
    assetId: input.assetId,
    fingerprint: `${input.portfolioId}:${input.assetId}:${values.signalType}:${sourceKey ?? "current"}`,
    observedAt: observedAt ?? input.observedAt,
    ...signalValues,
  };
}

export function buildPortfolioWatchDrafts(input: PortfolioWatchAssetInput): PortfolioWatchDraft[] {
  const signals: PortfolioWatchDraft[] = [];
  const lockedEvidence = input.compStatus === "locked" && input.observationCount >= 2;

  if (lockedEvidence && input.askingRentVsComps !== null && input.askingRentVsComps <= -5) {
    signals.push(draft(input, {
      signalType: "rent_below_comps",
      category: "performance",
      severity: input.askingRentVsComps <= -10 ? "high" : "medium",
      confidence: input.observationCount >= 3 ? "high" : "medium",
      rankScore: input.askingRentVsComps <= -10 ? 96 : 82,
      headline: `${input.assetName} is priced below approved comps`,
      narrative: `Observed asking rent is ${Math.abs(input.askingRentVsComps).toFixed(1)}% below the locked comparable-set median.`,
      ownerQuestion: "Should the property manager test a higher asking rent on the next available unit?",
      evidence: JSON.stringify({ askingRentVsComps: input.askingRentVsComps, observations: input.observationCount }),
    }));
  }
  if (lockedEvidence && input.askingRentVsComps !== null && input.askingRentVsComps >= 8) {
    signals.push(draft(input, {
      signalType: "rent_above_comps",
      category: "performance",
      severity: "high",
      confidence: input.observationCount >= 3 ? "high" : "medium",
      rankScore: 91,
      headline: `${input.assetName} is priced above approved comps`,
      narrative: `Observed asking rent is ${input.askingRentVsComps.toFixed(1)}% above the locked comparable-set median.`,
      ownerQuestion: "Is the premium supported by condition and amenities, or is it slowing leasing velocity?",
      evidence: JSON.stringify({ askingRentVsComps: input.askingRentVsComps, observations: input.observationCount }),
    }));
  }
  if (lockedEvidence && input.rentPerSqFtVsComps !== null && Math.abs(input.rentPerSqFtVsComps) >= 5) {
    const above = input.rentPerSqFtVsComps > 0;
    signals.push(draft(input, {
      signalType: above ? "rent_psf_above_comps" : "rent_psf_below_comps",
      category: "performance",
      severity: Math.abs(input.rentPerSqFtVsComps) >= 10 ? "high" : "medium",
      confidence: input.observationCount >= 3 ? "high" : "medium",
      rankScore: Math.abs(input.rentPerSqFtVsComps) >= 10 ? 90 : 84,
      headline: `${input.assetName} rent per square foot is ${above ? "above" : "below"} approved comps`,
      narrative: `Observed asking rent per square foot is ${Math.abs(input.rentPerSqFtVsComps).toFixed(1)}% ${above ? "above" : "below"} the locked comparable-set median.`,
      ownerQuestion: above
        ? "Is the pricing premium supported by condition, amenities, and current listing velocity?"
        : "Is there room to test higher pricing without compromising listing velocity?",
      evidence: JSON.stringify({ rentPerSqFtVsComps: input.rentPerSqFtVsComps, observations: input.observationCount }),
    }));
  }
  if (lockedEvidence && input.askingRentChange90d !== null && input.askingRentChange90d <= -3) {
    signals.push(draft(input, {
      signalType: "rent_softening",
      category: "performance",
      severity: "high",
      confidence: "medium",
      rankScore: 93,
      headline: `${input.assetName} asking rent is softening`,
      narrative: `Recent observed asking rent is down ${Math.abs(input.askingRentChange90d).toFixed(1)}% from the prior 90-day window.`,
      ownerQuestion: "What changed in pricing, product mix, or leasing strategy during the latest quarter?",
      evidence: JSON.stringify({ askingRentChange90d: input.askingRentChange90d }),
    }));
  }
  if (lockedEvidence && input.medianDom !== null && input.medianDom >= 45) {
    signals.push(draft(input, {
      signalType: "listing_velocity_slow",
      category: "performance",
      severity: "high",
      confidence: "medium",
      rankScore: 88,
      headline: `${input.assetName} listings are moving slowly`,
      narrative: `Matched listings show a median advertised-market duration of ${Math.round(input.medianDom)} days.`,
      ownerQuestion: "Are pricing, lead response, or unit readiness contributing to the slower listing velocity?",
      evidence: JSON.stringify({ medianDom: input.medianDom, observations: input.observationCount }),
    }));
  }

  if (input.marketAlert) {
    signals.push(draft(input, {
      signalType: "local_market_change",
      sourceKey: input.marketAlert.id,
      category: "market",
      severity: input.marketAlert.severity === "material" ? "high" : "medium",
      confidence: "high",
      rankScore: input.marketAlert.severity === "material" ? 86 : 70,
      headline: `${input.assetName}: ${input.marketAlert.headline}`,
      narrative: input.marketAlert.narrative,
      ownerQuestion: "Does the current property pricing and marketing plan reflect this local-market change?",
      evidence: JSON.stringify({ alertId: input.marketAlert.id }),
      observedAt: input.marketAlert.observedAt,
    }));
  }

  if (input.matchStatus !== "matched") {
    signals.push(draft(input, {
      signalType: "property_match_pending",
      category: "readiness",
      severity: "medium",
      confidence: "setup",
      rankScore: 58,
      headline: `${input.assetName} property match needs confirmation`,
      narrative: "Dwellsy is resolving the supplied property to its canonical community and building records before performance conclusions are enabled.",
      ownerQuestion: null,
      evidence: JSON.stringify({ matchStatus: input.matchStatus }),
    }));
  }
  if (!['observed', 'partial'].includes(input.uruStatus)) {
    signals.push(draft(input, {
      signalType: "listing_coverage_pending",
      category: "readiness",
      severity: "info",
      confidence: "setup",
      rankScore: 42,
      headline: `${input.assetName} listing coverage is being activated`,
      narrative: "Dwellsy is auditing or issuing URUs so future listing activity can be attributed to this property.",
      ownerQuestion: null,
      evidence: JSON.stringify({ uruStatus: input.uruStatus }),
    }));
  }
  if (input.compStatus !== "locked") {
    signals.push(draft(input, {
      signalType: "comp_review_pending",
      category: "readiness",
      severity: "info",
      confidence: "setup",
      rankScore: 36,
      headline: `${input.assetName} comparable set is in review`,
      narrative: "Proposed comparable properties remain visible as context, but Portfolio IQ will not issue comp-relative performance conclusions until the set is reviewed and locked.",
      ownerQuestion: null,
      evidence: JSON.stringify({ compStatus: input.compStatus ?? "not_started" }),
    }));
  }
  return signals.sort((left, right) => right.rankScore - left.rankScore);
}
