// Single source of truth for the methodology + design version strings
// surfaced in the homepage hero, methodology footer, site footer, and any
// other "this is what you're looking at" stamp.
//
// METHODOLOGY_VERSION MUST equal the seed's data.methodologyVersion — the
// value the pipeline stamps on every scorecard. It drifted before (the
// footer + hero showed one version while the methodology page, compare page,
// and briefs showed another) because it was a hand-maintained literal. It is
// pinned to the data value and guarded by version.test.ts, which fails CI if
// this constant and the seed disagree. The v0.7 methodology overhaul (#208)
// bumped the seed to v0.7 / design v2.0; keep this constant in lockstep
// whenever the pipeline bumps markets.json's methodologyVersion.
//
// DESIGN_VERSION tracks the scorecard layout / typography spec.

export const METHODOLOGY_VERSION = "v0.7";
export const DESIGN_VERSION = "v2.0";
