import type { MarketIqMarketActivityAvailability } from "@/lib/market-iq/listing-events";

export type MarketIqDailyEditionCandidate<T> = {
  id: string;
  generatedAt: string;
  availability: MarketIqMarketActivityAvailability | undefined;
  value: T;
};

export type MarketIqDailyEdition<T> = {
  id: string;
  observedAt: string;
  state: MarketIqMarketActivityAvailability["state"];
  value: T;
};

export type MarketIqDailyEditionArchive<T> = {
  current: MarketIqDailyEdition<T> | null;
  latest: MarketIqDailyEdition<T> | null;
  previous: MarketIqDailyEdition<T> | null;
  next: MarketIqDailyEdition<T> | null;
  recent: MarketIqDailyEdition<T>[];
  requestedEditionMissing: boolean;
};

function observationTime(availability: MarketIqMarketActivityAvailability | undefined) {
  if (!availability) return null;
  return availability.state === "available"
    ? availability.activity.asOf
    : availability.attemptedAt;
}

function localDay(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function selectMarketIqDailyEditionArchive<T>(input: {
  candidates: MarketIqDailyEditionCandidate<T>[];
  requestedEditionId?: string;
  timeZone: string;
  recentLimit?: number;
}): MarketIqDailyEditionArchive<T> {
  const byDay = new Map<string, MarketIqDailyEdition<T>>();
  const ordered = [...input.candidates].sort((left, right) =>
    (Date.parse(right.generatedAt) || 0) - (Date.parse(left.generatedAt) || 0)
  );

  for (const candidate of ordered) {
    const availability = candidate.availability;
    if (!availability) continue;
    const observedAt = observationTime(availability);
    if (!observedAt) continue;
    const day = localDay(observedAt, input.timeZone);
    if (!day || byDay.has(day)) continue;
    byDay.set(day, {
      id: candidate.id,
      observedAt,
      state: availability.state,
      value: candidate.value,
    });
  }

  const editions = [...byDay.values()];
  const requestedIndex = input.requestedEditionId
    ? editions.findIndex((edition) => edition.id === input.requestedEditionId)
    : 0;
  const current = requestedIndex >= 0 ? editions[requestedIndex] : null;

  return {
    current,
    latest: editions[0] ?? null,
    previous: current ? editions[requestedIndex + 1] ?? null : null,
    next: current && requestedIndex > 0 ? editions[requestedIndex - 1] ?? null : null,
    recent: editions.slice(0, input.recentLimit ?? 14),
    requestedEditionMissing: Boolean(input.requestedEditionId && !current),
  };
}
