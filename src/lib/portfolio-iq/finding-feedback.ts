export const FINDING_FEEDBACK_RATINGS = [
  "useful",
  "already_known",
  "immaterial",
  "duplicate",
  "stale",
  "wrong_context",
] as const;

export type FindingFeedbackRating = (typeof FINDING_FEEDBACK_RATINGS)[number];

export const FINDING_FEEDBACK_LABELS: Record<FindingFeedbackRating, string> = {
  useful: "Useful",
  already_known: "Already known",
  immaterial: "Not material",
  duplicate: "Duplicate",
  stale: "Stale",
  wrong_context: "Wrong property or comp context",
};

export function isFindingFeedbackRating(value: string): value is FindingFeedbackRating {
  return FINDING_FEEDBACK_RATINGS.includes(value as FindingFeedbackRating);
}

export function suppressesFinding(rating: FindingFeedbackRating): boolean {
  return rating !== "useful";
}

export type FindingFeedbackSummary = {
  rated: number;
  useful: number;
  alreadyKnown: number;
  noise: number;
  contextErrors: number;
  usefulRate: number | null;
  validContextRate: number | null;
};

export function summarizeFindingFeedback(feedback: Array<{ rating: string }>): FindingFeedbackSummary {
  const rated = feedback.length;
  const useful = feedback.filter((item) => item.rating === "useful").length;
  const alreadyKnown = feedback.filter((item) => item.rating === "already_known").length;
  const noise = feedback.filter((item) => ["immaterial", "duplicate", "stale"].includes(item.rating)).length;
  const contextErrors = feedback.filter((item) => item.rating === "wrong_context").length;
  return {
    rated,
    useful,
    alreadyKnown,
    noise,
    contextErrors,
    usefulRate: rated ? useful / rated : null,
    validContextRate: rated ? (rated - contextErrors) / rated : null,
  };
}
