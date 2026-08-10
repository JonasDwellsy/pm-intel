import { buildSubjectPerformance, type SubjectListingObservation } from "@/lib/portfolio-iq/property";

export interface BedroomCompObservation {
  propertyLabel: string;
  address: string;
  bedrooms: number | null;
  askingRent: number | null;
  squareFeet: number | null;
  reviewStatus: string;
}

export interface BedroomSegmentReview {
  bedrooms: number;
  status: string;
}

function propertyKey(row: BedroomCompObservation): string {
  return (row.propertyLabel || row.address).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function bedroomLabel(bedrooms: number): string {
  return bedrooms === 0 ? "Studio" : `${bedrooms}-bedroom`;
}

export function buildBedroomSegments(input: {
  observations: SubjectListingObservation[];
  compMembers: BedroomCompObservation[];
  reviews?: BedroomSegmentReview[];
  availableThrough: Date;
  bedrooms?: number[];
}) {
  const reviews = new Map((input.reviews ?? []).map((review) => [review.bedrooms, review.status]));
  return (input.bedrooms ?? [0, 1, 2, 3]).map((bedrooms) => {
    const subject = input.observations.filter((row) => row.bedrooms === bedrooms);
    const uniqueComps = new Map<string, BedroomCompObservation>();
    for (const member of input.compMembers) {
      if (member.reviewStatus === "excluded" || member.bedrooms !== bedrooms) continue;
      const key = propertyKey(member);
      if (!key || uniqueComps.has(key)) continue;
      uniqueComps.set(key, member);
    }
    const comps = [...uniqueComps.values()];
    const performance = buildSubjectPerformance({
      observations: subject,
      availableThrough: input.availableThrough,
      compAskingRents: comps.flatMap((member) => member.askingRent && member.askingRent > 0 ? [member.askingRent] : []),
      compRentPerSqFt: comps.flatMap((member) => member.askingRent && member.squareFeet && member.squareFeet > 0 ? [member.askingRent / member.squareFeet] : []),
    });
    const storedStatus = reviews.get(bedrooms) ?? "proposed";
    const evidenceStatus = performance.observationCount === 0
      ? "not_observed"
      : comps.length < 3
        ? "needs_comps"
        : storedStatus === "locked"
          ? "locked"
          : "ready_to_lock";
    return {
      bedrooms,
      label: bedroomLabel(bedrooms),
      compPropertyCount: comps.length,
      evidenceStatus,
      isLocked: evidenceStatus === "locked",
      performance,
      comps,
    };
  });
}
