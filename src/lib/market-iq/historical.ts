export interface HistoricalActiveListing {
  city: string | null;
  askingRent: number | null;
  squareFeet: number | null;
  activatedAt: Date | null;
}

export interface HistoricalRecentListing {
  city: string | null;
  activatedAt: Date | null;
}

export interface MarketIqPlacePulse {
  name: string;
  newListings: number;
  change: number;
  medianDom: number;
  rentPerSqFt: number;
}

export interface HistoricalListingPulse {
  historicalSource: {
    name: string;
    availableThrough: string;
    recordCount: number;
  };
  historical: {
    activeAtCutoff: number;
    newListings30d: number;
    newListingsChange: number;
    medianDom: number;
    medianRentPerSqFt: number;
  };
  places: MarketIqPlacePulse[];
  decisionRead: string;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentChange(current: number, prior: number) {
  if (prior === 0) return current === 0 ? 0 : 100;
  return ((current - prior) / prior) * 100;
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function resolveHistoricalAnalysisCutoff(availableThrough: Date, metadata: string): Date {
  try {
    const parsed = JSON.parse(metadata) as { analysisCutoff?: unknown };
    if (typeof parsed.analysisCutoff !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.analysisCutoff)) {
      return availableThrough;
    }
    const declared = new Date(`${parsed.analysisCutoff}T00:00:00.000Z`);
    if (Number.isNaN(declared.getTime())) return availableThrough;
    return declared < availableThrough ? declared : availableThrough;
  } catch {
    return availableThrough;
  }
}

export function historicalWindows(availableThrough: Date) {
  const cutoffStart = startOfUtcDay(availableThrough);
  const cutoffEnd = new Date(cutoffStart.getTime() + 86_400_000 - 1);
  const currentStart = new Date(cutoffStart.getTime() - 29 * 86_400_000);
  const priorStart = new Date(currentStart.getTime() - 30 * 86_400_000);
  return { cutoffEnd, currentStart, priorStart };
}

export function buildHistoricalListingPulse(input: {
  availableThrough: Date;
  recordCount: number;
  activeListings: HistoricalActiveListing[];
  recentListings: HistoricalRecentListing[];
}): HistoricalListingPulse {
  const { cutoffEnd, currentStart } = historicalWindows(input.availableThrough);
  const current = input.recentListings.filter(
    (listing) => listing.activatedAt && listing.activatedAt >= currentStart && listing.activatedAt <= cutoffEnd
  );
  const prior = input.recentListings.filter(
    (listing) => listing.activatedAt && listing.activatedAt < currentStart
  );
  const newListingsChange = percentChange(current.length, prior.length);
  const medianDom = median(
    input.activeListings.flatMap((listing) =>
      listing.activatedAt ? [(cutoffEnd.getTime() - listing.activatedAt.getTime()) / 86_400_000] : []
    )
  );
  const medianRentPerSqFt = median(
    input.activeListings.flatMap((listing) =>
      listing.askingRent !== null && listing.squareFeet !== null && listing.squareFeet > 0
        ? [listing.askingRent / listing.squareFeet]
        : []
    )
  );

  const currentByCity = new Map<string, number>();
  const priorByCity = new Map<string, number>();
  for (const listing of current) {
    if (listing.city) currentByCity.set(listing.city, (currentByCity.get(listing.city) || 0) + 1);
  }
  for (const listing of prior) {
    if (listing.city) priorByCity.set(listing.city, (priorByCity.get(listing.city) || 0) + 1);
  }
  const places = [...currentByCity.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([name, newListings]) => {
      const cityActive = input.activeListings.filter((listing) => listing.city === name);
      return {
        name,
        newListings,
        change: percentChange(newListings, priorByCity.get(name) || 0),
        medianDom: median(
          cityActive.flatMap((listing) =>
            listing.activatedAt ? [(cutoffEnd.getTime() - listing.activatedAt.getTime()) / 86_400_000] : []
          )
        ),
        rentPerSqFt: median(
          cityActive.flatMap((listing) =>
            listing.askingRent !== null && listing.squareFeet !== null && listing.squareFeet > 0
              ? [listing.askingRent / listing.squareFeet]
              : []
          )
        ),
      };
    });

  const direction = newListingsChange >= 0 ? "increased" : "decreased";
  return {
    historicalSource: {
      name: "Cleveland historical listing export",
      availableThrough: input.availableThrough.toISOString().slice(0, 10),
      recordCount: input.recordCount,
    },
    historical: {
      activeAtCutoff: input.activeListings.length,
      newListings30d: current.length,
      newListingsChange,
      medianDom,
      medianRentPerSqFt,
    },
    places,
    decisionRead: `New apartment and house listings ${direction} ${Math.abs(newListingsChange).toFixed(1)}% versus the prior 30-day period, with ${input.activeListings.length.toLocaleString("en-US")} listings active at the export cutoff.`,
  };
}
