// Simultaneity guardrail for dormancy alerts.
//
// WHY THIS EXISTS. Bridge went dormant in 13 markets inside 7 days. No operator
// changes behaviour in thirteen cities in the same week — that is a syndication
// or feed change on our side, and reporting it as thirteen separate "stopped
// listing" alerts would tell a client their operator collapsed nationwide when
// nothing happened at all. It is the single most damaging thing this alert
// could get wrong, because it is both alarming and false.
//
// Riparian is the case that must still fire: Pittsburgh went quiet while
// Baltimore kept listing. One market quiet, others active, is real operator
// behaviour and exactly the signal a monitoring product exists to surface.
//
// THE RULE. Group an operator's per-market dormancy events. If two or more
// markets entered dormancy and their last-listing dates all fall inside a
// 14-day window, replace them with ONE neutral coverage note. Otherwise leave
// the per-market alerts alone.
//
// Deliberately NOT scoped to "all of the operator's markets": we only see the
// markets in the client's watch list, and an operator's true footprint may be
// wider. Requiring "all" would silently fail to suppress whenever the client
// watches a subset — which is the common case.

import type { OperatorChange } from "./change-detection";

/** Days within which simultaneous quiet reads as a coverage artefact rather
 *  than operator behaviour. Two weeks is wide enough to absorb a staggered
 *  feed migration and narrow enough that genuinely independent decisions in
 *  different cities still surface separately. */
export const SIMULTANEITY_WINDOW_DAYS = 14;

/** Minimum markets going quiet together before we treat it as coverage. One
 *  market quiet is always operator behaviour — that's Riparian. */
export const SIMULTANEITY_MIN_MARKETS = 2;

export interface DormancyEvent {
  /** Groups per-market rows into one operator. Falls back to the PM slug for
   *  single-market operators, which can never trip the guardrail. */
  operatorKey: string;
  pmSlug: string;
  lastListingDate: string | null;
}

/** UTC-parsed day number; null for missing or malformed dates. */
function dayNumber(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? null : Math.floor(t / 86_400_000);
}

export interface GuardrailDecision {
  /** PM slugs whose per-market dormancy alert must be dropped. */
  suppressedPmSlugs: Set<string>;
  /** One coverage note per operator that tripped the guardrail. */
  coverageNotes: Map<string, Extract<OperatorChange, { type: "coverage_note" }>>;
}

/**
 * Decide which per-market dormancy alerts to collapse.
 *
 * Pure: takes the events, returns the decision. The caller applies it.
 */
export function applySimultaneityGuardrail(
  events: DormancyEvent[]
): GuardrailDecision {
  const byOperator = new Map<string, DormancyEvent[]>();
  for (const e of events) {
    const list = byOperator.get(e.operatorKey) ?? [];
    list.push(e);
    byOperator.set(e.operatorKey, list);
  }

  const suppressedPmSlugs = new Set<string>();
  const coverageNotes = new Map<
    string,
    Extract<OperatorChange, { type: "coverage_note" }>
  >();

  for (const [operatorKey, group] of byOperator) {
    if (group.length < SIMULTANEITY_MIN_MARKETS) continue;

    const days = group.map((e) => dayNumber(e.lastListingDate));
    // A missing date means we cannot show the events were simultaneous. Leave
    // the per-market alerts standing: reporting a real quiet market is a
    // smaller error than silently swallowing it on incomplete data.
    if (days.some((d) => d === null)) continue;

    const known = days as number[];
    const spread = Math.max(...known) - Math.min(...known);
    if (spread > SIMULTANEITY_WINDOW_DAYS) continue;

    for (const e of group) suppressedPmSlugs.add(e.pmSlug);
    coverageNotes.set(operatorKey, {
      type: "coverage_note",
      marketsQuiet: group.length,
      windowDays: spread,
      // The latest date across the group — the point after which we saw
      // nothing anywhere.
      lastListingDate: group
        .map((e) => e.lastListingDate)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1) ?? null,
    });
  }

  return { suppressedPmSlugs, coverageNotes };
}
