export const PILOT_REVIEW_TYPES = ["property", "operator", "finding"] as const;
export type PilotReviewType = (typeof PILOT_REVIEW_TYPES)[number];

export const PILOT_REVIEW_RESPONSES = ["confirmed", "useful", "investigate", "incorrect", "acted"] as const;
export type PilotReviewResponse = (typeof PILOT_REVIEW_RESPONSES)[number];

export type PilotReviewLike = {
  objectType: string;
  objectId: string;
  response: string;
};

const allowedByType: Record<PilotReviewType, ReadonlySet<PilotReviewResponse>> = {
  property: new Set(["confirmed", "incorrect"]),
  operator: new Set(["confirmed", "incorrect"]),
  finding: new Set(["useful", "investigate", "incorrect", "acted"]),
};

export function parsePilotReview(input: {
  objectType: unknown;
  response: unknown;
  note: unknown;
}): { objectType: PilotReviewType; response: PilotReviewResponse; note: string | null } | null {
  const objectType = String(input.objectType ?? "") as PilotReviewType;
  const response = String(input.response ?? "") as PilotReviewResponse;
  const note = String(input.note ?? "").trim().slice(0, 1_000) || null;
  if (!PILOT_REVIEW_TYPES.includes(objectType) || !allowedByType[objectType].has(response)) return null;
  if (response === "incorrect" && !note) return null;
  return { objectType, response, note };
}

export function pilotReviewKey(objectType: string, objectId: string): string {
  return `${objectType}:${objectId}`;
}

export function pilotAcceptanceProgress(input: {
  assetIds: string[];
  findingIds: string[];
  reviews: PilotReviewLike[];
  accepted: boolean;
}) {
  const expected = [
    ...input.assetIds.flatMap((id) => [pilotReviewKey("property", id), pilotReviewKey("operator", id)]),
    ...input.findingIds.map((id) => pilotReviewKey("finding", id)),
  ];
  const reviewed = new Set(input.reviews.map((review) => pilotReviewKey(review.objectType, review.objectId)));
  const completedReviews = expected.filter((key) => reviewed.has(key)).length;
  const total = expected.length + 1;
  const completed = completedReviews + (input.accepted ? 1 : 0);
  return {
    completed,
    total,
    completedReviews,
    totalReviews: expected.length,
    percent: total === 0 ? 100 : Math.round((completed / total) * 100),
    correctionCount: input.reviews.filter((review) => review.response === "incorrect").length,
  };
}

export function pilotSupportLabel(asset: {
  matchStatus: string;
  uruStatus: string;
  compStatus: string;
  operatorStatus: string;
}): "Full support" | "Market context" | "Setup required" {
  if (
    asset.matchStatus === "matched"
    && ["observed", "partial"].includes(asset.uruStatus)
    && asset.compStatus === "locked"
    && asset.operatorStatus === "matched"
  ) return "Full support";
  if (asset.matchStatus === "matched") return "Market context";
  return "Setup required";
}
