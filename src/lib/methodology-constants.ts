// Ranking-eligibility constants, mirrored from scripts/data-pipeline (the
// pipeline is the source of truth; these are the UI-side copies so surfaces can
// explain the rules without hardcoding numbers inline).
//
// An operator is ranked in a market only if it clears ALL of:
//   1. >= ELIG_T12_MIN listings in the trailing 12 months
//   2. listings at >= ELIG_ADDR_MIN distinct addresses (or one big community)
//   3. a listing event within RECENCY_GATE_DAYS (otherwise classified DORMANT
//      — see is_departed in tenancy_survival.py, which names the check, not
//      the outcome: a dormant operator keeps its scorecard, it just leaves the
//      ranked set and the cohort baselines)
//
// Rule 1 is the one people assume, but it isn't the common reason an operator
// is unranked: 318 operators currently sit above the listing threshold and are
// still unranked because of rules 2 or 3 — several with thousands of listings.
// Any copy that explains "why isn't this operator ranked?" has to account for
// all three, or it will state something false about a large, obviously-active
// operator.
//
// Rule 3 in particular is a statement about our LISTING RECORD, never about
// the business. Copy says "no new listings observed since <date>" — never
// "inactive", "departed", "left the market", or anything else asserting the
// operator stopped operating.
//
// src/lib/methodology-constants.test.ts asserts these stay in lock-step with
// the pipeline; bump both together.

/** Minimum trailing-12-month listing count for ranking. */
export const ELIG_T12_MIN = 30;

/** Minimum distinct addresses in the T12 window (big communities exempt). */
export const ELIG_ADDR_MIN = 3;

/** An operator with no listing event in this many days is held out of the
 *  ranked set as inactive. */
export const RECENCY_GATE_DAYS = 60;
