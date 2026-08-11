export const PM_ASSESSMENTS = ["agree", "partially_agree", "disagree", "need_more_information"] as const;
export const PM_RECOMMENDATIONS = ["hold_pricing", "raise_pricing", "reduce_pricing", "refresh_marketing", "investigate", "no_change", "other"] as const;

export type PmAssessment = (typeof PM_ASSESSMENTS)[number];
export type PmRecommendation = (typeof PM_RECOMMENDATIONS)[number];

export const PM_ASSESSMENT_LABELS: Record<PmAssessment, string> = {
  agree: "The evidence matches what we are seeing",
  partially_agree: "The direction is right, but context is missing",
  disagree: "The evidence does not match property conditions",
  need_more_information: "More information is needed before deciding",
};

export const PM_RECOMMENDATION_LABELS: Record<PmRecommendation, string> = {
  hold_pricing: "Hold current asking rents",
  raise_pricing: "Test higher asking rents",
  reduce_pricing: "Reduce asking rents",
  refresh_marketing: "Refresh listing or merchandising",
  investigate: "Investigate before changing course",
  no_change: "No operating change",
  other: "Other action",
};

export function parsePmAssessment(value: unknown): PmAssessment | null {
  return PM_ASSESSMENTS.includes(value as PmAssessment) ? value as PmAssessment : null;
}

export function parsePmRecommendation(value: unknown): PmRecommendation | null {
  return PM_RECOMMENDATIONS.includes(value as PmRecommendation) ? value as PmRecommendation : null;
}

export function assessmentLabel(value: string | null | undefined): string {
  return value && PM_ASSESSMENTS.includes(value as PmAssessment) ? PM_ASSESSMENT_LABELS[value as PmAssessment] : "Not structured";
}

export function recommendationLabel(value: string | null | undefined): string {
  return value && PM_RECOMMENDATIONS.includes(value as PmRecommendation) ? PM_RECOMMENDATION_LABELS[value as PmRecommendation] : "Not structured";
}

export function monitoringDays(submittedAt: Date, followUpDate: Date): number {
  const elapsed = Math.ceil((followUpDate.getTime() - submittedAt.getTime()) / 86_400_000);
  return Math.max(1, Math.min(365, elapsed));
}
