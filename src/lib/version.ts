// Single source of truth for the methodology + design version strings
// surfaced in the homepage hero, methodology footer, site footer, and any
// other "this is what you're looking at" stamp.
//
// METHODOLOGY_VERSION MUST equal the seed's data.methodologyVersion — the
// value the pipeline stamps on every scorecard. It drifted before (the
// footer + hero showed "v0.8" while every scorecard, the compare page, and
// the briefs showed "v0.6.4") because it was a hand-maintained literal.
// It is now pinned to the data value and guarded by version.test.ts, which
// fails CI if this constant and the seed disagree. Note: the portfolio
// estimator and watch-list releases advanced the product but did NOT change
// the scoring methodology (no cohort or ranking changes), so the
// methodology version legitimately stays v0.6.4.
//
// DESIGN_VERSION tracks the scorecard layout / typography spec.

export const METHODOLOGY_VERSION = "v0.6.4";
export const DESIGN_VERSION = "v1.0";
