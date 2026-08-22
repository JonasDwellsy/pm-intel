import type {
  MarketIqMarketActivity,
  MarketIqMarketActivityAvailability,
} from "@/lib/market-iq/listing-events";

export type MarketIqDailyComparisonMetricKey =
  | "new_listings"
  | "off_market"
  | "rent_moves"
  | "concessions"
  | "aging_crossings";

export type MarketIqDailyComparisonMetric = {
  key: MarketIqDailyComparisonMetricKey;
  label: string;
  current: number;
  previous: number;
  difference: number;
};

export type MarketIqDailyEditionComparison =
  | {
    state: "available";
    currentObservedAt: string;
    previousObservedAt: string;
    metrics: MarketIqDailyComparisonMetric[];
  }
  | { state: "no_previous" }
  | {
    state: "current_unavailable" | "previous_unavailable";
    attemptedAt?: string;
  };

type PreviousEdition = {
  availability: MarketIqMarketActivityAvailability | undefined;
};

function metrics(current: MarketIqMarketActivity, previous: MarketIqMarketActivity): MarketIqDailyComparisonMetric[] {
  const values: Array<{
    key: MarketIqDailyComparisonMetricKey;
    label: string;
    current: number;
    previous: number;
  }> = [
    { key: "new_listings", label: "New listings", current: current.newListings24h, previous: previous.newListings24h },
    { key: "off_market", label: "Off market", current: current.delistings24h, previous: previous.delistings24h },
    { key: "rent_moves", label: "Rent moves", current: current.confirmedPriceChanges24h, previous: previous.confirmedPriceChanges24h },
    { key: "concessions", label: "Concessions", current: current.advertisedConcessions24h, previous: previous.advertisedConcessions24h },
    { key: "aging_crossings", label: "Aging crossings", current: current.agingThresholds24h, previous: previous.agingThresholds24h },
  ];

  return values.map((metric) => ({
    ...metric,
    difference: metric.current - metric.previous,
  }));
}

export function compareMarketIqDailyEditions(input: {
  current: MarketIqMarketActivityAvailability | undefined;
  previous: PreviousEdition | null;
}): MarketIqDailyEditionComparison {
  if (!input.current || input.current.state === "unavailable") {
    return {
      state: "current_unavailable",
      ...(input.current?.state === "unavailable" ? { attemptedAt: input.current.attemptedAt } : {}),
    };
  }

  if (!input.previous) return { state: "no_previous" };

  const previous = input.previous.availability;
  if (!previous || previous.state === "unavailable") {
    return {
      state: "previous_unavailable",
      ...(previous?.state === "unavailable" ? { attemptedAt: previous.attemptedAt } : {}),
    };
  }

  return {
    state: "available",
    currentObservedAt: input.current.activity.asOf,
    previousObservedAt: previous.activity.asOf,
    metrics: metrics(input.current.activity, previous.activity),
  };
}
