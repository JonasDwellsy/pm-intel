import { summarizeFindingFeedback } from "@/lib/portfolio-iq/finding-feedback";

export const MINIMUM_CALIBRATION_SAMPLE = 3;
export const MAX_CALIBRATION_ADJUSTMENT = 15;

export type CalibrationFeedback = {
  rating: string;
  signal: { signalType: string };
};

export type CalibrationRecommendation = {
  scopeKind: "signal_type";
  scopeValue: string;
  sampleSize: number;
  usefulCount: number;
  alreadyKnownCount: number;
  noiseCount: number;
  contextErrorCount: number;
  usefulRate: number;
  proposedScoreAdjustment: number;
  rationale: string;
};

export function recommendFindingCalibrations(feedback: CalibrationFeedback[]): CalibrationRecommendation[] {
  const groups = new Map<string, CalibrationFeedback[]>();
  for (const item of feedback) {
    const group = groups.get(item.signal.signalType) ?? [];
    group.push(item);
    groups.set(item.signal.signalType, group);
  }

  return [...groups.entries()].flatMap(([scopeValue, items]) => {
    if (items.length < MINIMUM_CALIBRATION_SAMPLE) return [];
    const summary = summarizeFindingFeedback(items);
    const usefulRate = summary.usefulRate ?? 0;
    const noiseRate = summary.noise / summary.rated;
    const contextErrorRate = summary.contextErrors / summary.rated;
    const alreadyKnownRate = summary.alreadyKnown / summary.rated;
    let proposedScoreAdjustment = 0;
    let rationale = "Feedback is mixed, so no ranking change is recommended.";

    if (contextErrorRate >= 0.25) {
      proposedScoreAdjustment = -15;
      rationale = `${Math.round(contextErrorRate * 100)}% of rated findings had the wrong property or comp context.`;
    } else if (noiseRate >= 0.4) {
      proposedScoreAdjustment = -10;
      rationale = `${Math.round(noiseRate * 100)}% of rated findings were immaterial, duplicative, or stale.`;
    } else if (usefulRate >= 0.7) {
      proposedScoreAdjustment = 5;
      rationale = `${Math.round(usefulRate * 100)}% of rated findings were useful to the owner.`;
    } else if (alreadyKnownRate >= 0.5) {
      proposedScoreAdjustment = -5;
      rationale = `${Math.round(alreadyKnownRate * 100)}% of rated findings were valid but already known.`;
    }

    if (proposedScoreAdjustment === 0) return [];
    return [{
      scopeKind: "signal_type" as const,
      scopeValue,
      sampleSize: summary.rated,
      usefulCount: summary.useful,
      alreadyKnownCount: summary.alreadyKnown,
      noiseCount: summary.noise,
      contextErrorCount: summary.contextErrors,
      usefulRate,
      proposedScoreAdjustment,
      rationale,
    }];
  }).sort((left, right) => Math.abs(right.proposedScoreAdjustment) - Math.abs(left.proposedScoreAdjustment) || right.sampleSize - left.sampleSize);
}

export function calibrationAdjustmentFor(
  signal: { signalType?: string; category: string },
  adjustments: Map<string, number>
): number {
  const requested = adjustments.get(`signal_type:${signal.signalType ?? signal.category}`) ?? 0;
  return Math.max(-MAX_CALIBRATION_ADJUSTMENT, Math.min(MAX_CALIBRATION_ADJUSTMENT, requested));
}
