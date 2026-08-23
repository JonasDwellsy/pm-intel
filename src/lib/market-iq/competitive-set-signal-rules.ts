import type { MarketIqCompetitiveSetBrief, MarketIqCompetitiveSetBriefEvent, MarketIqCompetitiveSetBriefPeriod } from "@/lib/market-iq/competitive-set-brief";
import { MARKET_IQ_DAILY_WATCHLIST_EVENT_TYPES, type MarketIqDailyWatchlistEventType } from "@/lib/market-iq/daily-watchlists";

export const MARKET_IQ_COMPETITIVE_SIGNAL_SCOPES = ["peers", "subject", "all"] as const;
export const MARKET_IQ_COMPETITIVE_SIGNAL_WINDOWS = [1, 7] as const;
export const MARKET_IQ_COMPETITIVE_SIGNAL_CONDITIONS = ["count_at_least", "increase_at_least"] as const;

export type MarketIqCompetitiveSignalScope = typeof MARKET_IQ_COMPETITIVE_SIGNAL_SCOPES[number];
export type MarketIqCompetitiveSignalWindowDays = typeof MARKET_IQ_COMPETITIVE_SIGNAL_WINDOWS[number];
export type MarketIqCompetitiveSignalCondition = typeof MARKET_IQ_COMPETITIVE_SIGNAL_CONDITIONS[number];

export type MarketIqCompetitiveSetSignalRuleInput = {
  eventType: MarketIqDailyWatchlistEventType;
  propertyScope: MarketIqCompetitiveSignalScope;
  windowDays: MarketIqCompetitiveSignalWindowDays;
  condition: MarketIqCompetitiveSignalCondition;
  threshold: number;
  enabled: boolean;
};

export type MarketIqCompetitiveSetSignalRuleView = MarketIqCompetitiveSetSignalRuleInput & {
  id: string;
  watchlistId: string;
  createdAt: string;
  updatedAt: string;
};

export type MarketIqCompetitiveSetSignalRuleActionResult =
  | { ok: true; rule?: MarketIqCompetitiveSetSignalRuleView }
  | { ok: false; message: string };

export type MarketIqCompetitiveSetSignalEvaluation =
  | { state: "unavailable"; reason: "source_unavailable" | "coverage_incomplete" | "subject_unidentified" }
  | { state: "below_threshold"; current: number; previous: number | null; difference: number | null }
  | {
    state: "triggered";
    current: number;
    previous: number | null;
    difference: number | null;
    headline: string;
    detail: string;
    observedAt: string;
    windowStartAt: string;
    windowEndAt: string;
    evidence: MarketIqCompetitiveSetBriefEvent[];
  };

const EVENT_LABELS: Record<MarketIqDailyWatchlistEventType, { singular: string; plural: string }> = {
  new_to_market: { singular: "new listing", plural: "new listings" },
  rent_changes: { singular: "rent move", plural: "rent moves" },
  off_market: { singular: "off-market departure", plural: "off-market departures" },
  aging_watch: { singular: "aging threshold crossing", plural: "aging threshold crossings" },
  concessions: { singular: "advertised concession", plural: "advertised concessions" },
  lease_up: { singular: "lease-up alert", plural: "lease-up alerts" },
};

function includes<T extends string | number>(values: readonly T[], value: unknown): value is T {
  return values.includes(value as T);
}

export function parseMarketIqCompetitiveSetSignalRuleInput(value: unknown):
  | { ok: true; value: MarketIqCompetitiveSetSignalRuleInput }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Choose a valid competitive-set signal rule." };
  const candidate = value as Record<string, unknown>;
  if (!includes(MARKET_IQ_DAILY_WATCHLIST_EVENT_TYPES, candidate.eventType)
    || !includes(MARKET_IQ_COMPETITIVE_SIGNAL_SCOPES, candidate.propertyScope)
    || !includes(MARKET_IQ_COMPETITIVE_SIGNAL_WINDOWS, candidate.windowDays)
    || !includes(MARKET_IQ_COMPETITIVE_SIGNAL_CONDITIONS, candidate.condition)
    || !Number.isInteger(candidate.threshold) || (candidate.threshold as number) < 1 || (candidate.threshold as number) > 50
    || typeof candidate.enabled !== "boolean") {
    return { ok: false, error: "Choose a supported event, scope, window, and threshold from 1 to 50." };
  }
  if (candidate.condition === "increase_at_least" && candidate.windowDays !== 7) {
    return { ok: false, error: "Prior-period increase rules require a seven-day evidence window." };
  }
  return { ok: true, value: candidate as MarketIqCompetitiveSetSignalRuleInput };
}

function scopedEvents(period: MarketIqCompetitiveSetBriefPeriod, rule: MarketIqCompetitiveSetSignalRuleInput) {
  return period.events.filter((event) => event.eventType === rule.eventType
    && (rule.propertyScope === "all" || (rule.propertyScope === "subject") === event.isSubject));
}

function scopeLabel(scope: MarketIqCompetitiveSignalScope) {
  if (scope === "peers") return "peer";
  if (scope === "subject") return "subject-property";
  return "competitive-set";
}

function periodLabel(days: MarketIqCompetitiveSignalWindowDays) {
  return days === 1 ? "24 hours" : "seven days";
}

export function evaluateMarketIqCompetitiveSetSignalRule(input: {
  rule: MarketIqCompetitiveSetSignalRuleInput;
  brief: MarketIqCompetitiveSetBrief;
}): MarketIqCompetitiveSetSignalEvaluation {
  if (input.brief.state !== "available") return { state: "unavailable", reason: "source_unavailable" };
  if (input.rule.propertyScope === "subject" && !input.brief.subjectPropertyId) {
    return { state: "unavailable", reason: "subject_unidentified" };
  }
  const currentPeriod = input.rule.windowDays === 1 ? input.brief.current24h : input.brief.current7d;
  if (!currentPeriod.complete) return { state: "unavailable", reason: "coverage_incomplete" };
  const evidence = scopedEvents(currentPeriod, input.rule);
  const current = evidence.length;
  let previous: number | null = null;
  let difference: number | null = null;
  if (input.rule.condition === "increase_at_least") {
    if (!input.brief.comparison.available || !input.brief.prior7d.complete) {
      return { state: "unavailable", reason: "coverage_incomplete" };
    }
    previous = scopedEvents(input.brief.prior7d, input.rule).length;
    difference = current - previous;
    if (difference < input.rule.threshold) return { state: "below_threshold", current, previous, difference };
  } else if (current < input.rule.threshold) {
    return { state: "below_threshold", current, previous, difference };
  }
  const latest = evidence.reduce<MarketIqCompetitiveSetBriefEvent | null>((result, event) =>
    !result || Date.parse(event.observedAt) > Date.parse(result.observedAt) ? event : result, null);
  if (!latest) return { state: "below_threshold", current, previous, difference };
  const labels = EVENT_LABELS[input.rule.eventType];
  const eventLabel = current === 1 ? labels.singular : labels.plural;
  const scope = scopeLabel(input.rule.propertyScope);
  const window = periodLabel(input.rule.windowDays);
  const headline = input.rule.condition === "increase_at_least"
    ? `${scope[0]?.toUpperCase()}${scope.slice(1)} ${labels.plural} increased by ${difference} versus the prior seven days`
    : `${current} ${scope} ${eventLabel} observed within ${window}`;
  const detail = input.rule.condition === "increase_at_least"
    ? `${current} unique events were retained in the current seven-day window, compared with ${previous} in the complete prior window. This grouped signal contains ${evidence.length} supporting event ${evidence.length === 1 ? "record" : "records"}.`
    : `The configured threshold of ${input.rule.threshold} was met with ${current} unique retained event ${current === 1 ? "record" : "records"}. Each supporting item keeps its original observation time.`;
  return {
    state: "triggered",
    current,
    previous,
    difference,
    headline,
    detail,
    observedAt: latest.observedAt,
    windowStartAt: currentPeriod.startAt,
    windowEndAt: currentPeriod.endAt,
    evidence,
  };
}
