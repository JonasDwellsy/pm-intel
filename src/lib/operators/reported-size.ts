// Operator-reported unit counts — pure helpers. NO IO.
//
// What these are for: three CEO conversations put our size estimate materially
// below what the operator says they run (Fischer 1,400 vs 790 estimated;
// Income Property Specialists 3,000 vs 803). A full-book calibration found the
// gap is dominated by COVERAGE — units that never list with Dwellsy at all —
// which no multiplier recovers. So the way forward isn't a better formula, it's
// a growing set of ground-truth counts to check the formula against.
//
// What these are NOT for: nothing here changes a displayed figure, a size band,
// a cohort, a rank, or a peer set. See the model doc in prisma/schema.prisma —
// a number fed into the estimator can no longer validate it.

/** Where a reported count came from. Enumerated so sources can be weighted
 *  later — a public filing is stronger evidence than a remark on a call —
 *  without having to re-read every note to work out which is which. */
export const REPORTED_SIZE_SOURCE_KINDS = [
  "ceo_call",
  "operator_email",
  "public_filing",
  "website",
  "other",
] as const;

export type ReportedSizeSourceKind = (typeof REPORTED_SIZE_SOURCE_KINDS)[number];

export const SOURCE_KIND_LABELS: Record<ReportedSizeSourceKind, string> = {
  ceo_call: "Call with the operator",
  operator_email: "Email from the operator",
  public_filing: "Public filing",
  website: "Operator's website",
  other: "Other",
};

export function isReportedSizeSourceKind(v: unknown): v is ReportedSizeSourceKind {
  return (
    typeof v === "string" &&
    (REPORTED_SIZE_SOURCE_KINDS as readonly string[]).includes(v)
  );
}

/** Upper sanity bound on a single reported count. The largest operator we
 *  observe anywhere is ~15k estimated units; 500k is far above any plausible
 *  single-company US portfolio, so anything past it is a typo (an extra zero,
 *  or a dollar figure pasted into the wrong box) rather than a real answer.
 *  Deliberately loose — this catches fat fingers, it does not second-guess
 *  what an operator told us. */
export const MAX_REPORTED_UNITS = 500_000;

export interface ParsedReportedSize {
  reportedUnits: number;
  reportedAsOf: Date;
  sourceKind: ReportedSizeSourceKind;
  sourceNote: string | null;
}

/** Validate the admin form's raw strings. Returns a typed record or the first
 *  problem as a human sentence — the caller renders it verbatim, so these read
 *  as guidance rather than error codes. */
export function parseReportedSizeInput(input: {
  reportedUnits: string;
  reportedAsOf: string;
  sourceKind: string;
  sourceNote: string;
  /** Injected so this stays pure and testable; the caller passes new Date(). */
  now: Date;
}): { ok: true; value: ParsedReportedSize } | { ok: false; error: string } {
  const units = Number(input.reportedUnits.trim().replace(/[, ]/g, ""));
  if (!Number.isFinite(units) || !Number.isInteger(units) || units <= 0) {
    return { ok: false, error: "Reported units must be a whole number above zero." };
  }
  if (units > MAX_REPORTED_UNITS) {
    return {
      ok: false,
      error: `${units.toLocaleString()} units looks like a typo — the cap is ${MAX_REPORTED_UNITS.toLocaleString()}.`,
    };
  }

  if (!input.reportedAsOf.trim()) {
    return { ok: false, error: "As-of date is required — a count's age is part of its weight." };
  }
  // Parse as UTC midnight. A bare `new Date("2026-08-07")` is already UTC, but
  // being explicit keeps this from drifting a day for admins west of GMT.
  const asOf = new Date(`${input.reportedAsOf.trim()}T00:00:00.000Z`);
  if (Number.isNaN(asOf.getTime())) {
    return { ok: false, error: "As-of date isn't a valid date." };
  }
  // A future as-of date means the form was mis-filled; it would also quietly
  // outrank every real count in any recency-weighted calibration.
  if (asOf.getTime() > input.now.getTime() + 24 * 60 * 60 * 1000) {
    return { ok: false, error: "As-of date can't be in the future." };
  }

  if (!isReportedSizeSourceKind(input.sourceKind)) {
    return { ok: false, error: "Pick where this count came from." };
  }

  const note = input.sourceNote.trim();
  return {
    ok: true,
    value: {
      reportedUnits: units,
      reportedAsOf: asOf,
      sourceKind: input.sourceKind,
      sourceNote: note === "" ? null : note,
    },
  };
}

/**
 * How far our estimate sits from what the operator reports, as a multiple.
 * 3.7 means they report 3.7x what we estimate — i.e. we're low.
 *
 * This is the number the whole feature exists to accumulate. Returns null when
 * there is nothing to compare, so a caller renders the absence rather than a
 * misleading 0 or Infinity.
 */
export function reportedVsEstimateRatio(
  reportedUnits: number,
  estimatedUnits: number | null | undefined
): number | null {
  if (estimatedUnits == null || !Number.isFinite(estimatedUnits) || estimatedUnits <= 0) {
    return null;
  }
  return reportedUnits / estimatedUnits;
}

/** "3.7× our estimate" / "0.8× our estimate" / null when incomparable. */
export function formatRatio(ratio: number | null): string | null {
  if (ratio === null) return null;
  return `${ratio.toFixed(1)}× our estimate`;
}
