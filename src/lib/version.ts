// Single source of truth for methodology + design version strings
// surfaced in the homepage hero, methodology footer, site footer,
// and any other "this is what you're looking at" stamp. Pre-PR
// #46 these lived as duplicated literals on each surface and
// silently drifted (the homepage was still reading v0.6.2 long
// after the methodology bumped to v0.8). Centralized here so the
// next bump is a one-line PR.
//
// Values map to the current shipped methodology/design pair:
//   - METHODOLOGY_VERSION matches src/lib/watch-list/fields.ts and the
//     seed's data.methodologyVersion ("v0.8" at the time of PR #46;
//     the post-bump 7-cell + portfolio estimator vintage).
//   - DESIGN_VERSION tracks the scorecard layout / typography spec.

export const METHODOLOGY_VERSION = "v0.8";
export const DESIGN_VERSION = "v1.0";
