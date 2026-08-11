import type { ScorecardData } from "@/lib/types";
import { countOperatorStars } from "@/lib/operators/stars";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";

export interface OperatorResponseCandidate {
  slug: string;
  name: string;
  canonicalOperatorId: string | null;
  canonicalOperatorName: string | null;
  marketId: string;
  scorecard: ScorecardData;
  market: { city: string; state: string };
}

export interface OperatorResponseContext {
  status: "matched" | "unmatched" | "ambiguous";
  observedOperatorName: string;
  verificationStatus: string;
  operatorName: string | null;
  scorecardHref: string | null;
  dataAsOf: string | null;
  methodologyVersion: string | null;
  classification: string | null;
  overallRank: number | null;
  overallRankTotal: number | null;
  t12Listings: number | null;
  leaseUpDom: number | null;
  marketDom: number | null;
  rentPerformanceDelta: number | null;
  rentPerformanceState: "positive" | "neutral" | "negative" | null;
  goldCount: number;
  silverCount: number;
  liveResponseAvailable: false;
}

export function normalizedOperatorName(value: string): string {
  const legalSuffixes = new Set([
    "inc", "incorporated", "llc", "llp", "lp", "ltd", "limited",
    "corp", "corporation", "company", "partnership",
  ]);
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token && !legalSuffixes.has(token))
    .join(" ");
}

export function selectExactOperatorCandidate(
  observedOperatorName: string,
  candidates: OperatorResponseCandidate[]
): { status: "matched"; candidate: OperatorResponseCandidate } | { status: "unmatched" | "ambiguous" } {
  const observed = normalizedOperatorName(observedOperatorName);
  if (!observed) return { status: "unmatched" };

  const matches = candidates.filter((candidate) => {
    const names = [candidate.name, candidate.canonicalOperatorName].filter(
      (name): name is string => Boolean(name)
    );
    return names.some((name) => normalizedOperatorName(name) === observed);
  });
  if (matches.length === 0) return { status: "unmatched" };

  const identities = new Set(matches.map((candidate) => candidate.canonicalOperatorId ?? candidate.slug));
  if (identities.size !== 1) return { status: "ambiguous" };
  return { status: "matched", candidate: matches[0] };
}

export function buildOperatorResponseContext(input: {
  observedOperatorName: string;
  verificationStatus: string;
  candidates: OperatorResponseCandidate[];
}): OperatorResponseContext {
  const selected = selectExactOperatorCandidate(input.observedOperatorName, input.candidates);
  if (selected.status !== "matched") {
    return {
      status: selected.status,
      observedOperatorName: input.observedOperatorName,
      verificationStatus: input.verificationStatus,
      operatorName: null,
      scorecardHref: null,
      dataAsOf: null,
      methodologyVersion: null,
      classification: null,
      overallRank: null,
      overallRankTotal: null,
      t12Listings: null,
      leaseUpDom: null,
      marketDom: null,
      rentPerformanceDelta: null,
      rentPerformanceState: null,
      goldCount: 0,
      silverCount: 0,
      liveResponseAvailable: false,
    };
  }

  const candidate = selected.candidate;
  const scorecard = candidate.scorecard;
  const stars = countOperatorStars(scorecard);
  return {
    status: "matched",
    observedOperatorName: input.observedOperatorName,
    verificationStatus: input.verificationStatus,
    operatorName: candidate.canonicalOperatorName ?? candidate.name,
    scorecardHref: `/property-managers/${stateCodeToSlug(candidate.market.state)}/${citySlug(candidate.market.city)}/${candidate.slug}`,
    dataAsOf: scorecard.dataAsOf ?? null,
    methodologyVersion: scorecard.methodologyVersion ?? null,
    classification: scorecard.pm.quadrant7Cell ?? scorecard.pm.quadrant ?? null,
    overallRank: scorecard.rank.overall ?? null,
    overallRankTotal: scorecard.rank.overallTotal ?? null,
    t12Listings: scorecard.coverage.t12Listings ?? null,
    leaseUpDom: scorecard.performance.domT12 ?? null,
    marketDom: scorecard.performance.marketDomT12 ?? null,
    rentPerformanceDelta: scorecard.rentPerformance?.delta ?? null,
    rentPerformanceState: scorecard.rentPerformance?.state ?? null,
    goldCount: stars.goldCount,
    silverCount: stars.silverCount,
    liveResponseAvailable: false,
  };
}
