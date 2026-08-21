export type ListingAgeBucket = {
  key: "0_7" | "8_14" | "15_30" | "31_60" | "61_plus";
  label: string;
  count: number;
  sharePct: number;
};

export type ListingSupplySummary = {
  ageObservedListings: number;
  medianActiveAgeDays: number | null;
  activeOver30Days: number;
  activeOver30SharePct: number | null;
  activatedLast7Days: number;
  activatedLast30Days: number;
  listingAgeBuckets: ListingAgeBucket[];
};

export type DailyListingSupplySummary = ListingSupplySummary & {
  snapshotDate: Date;
  activeListings: number;
  apartmentListings: number;
  houseListings: number;
};

const DAY_MS = 24 * 60 * 60 * 1_000;

const BUCKETS: Array<{
  key: ListingAgeBucket["key"];
  label: string;
  includes: (days: number) => boolean;
}> = [
  { key: "0_7", label: "0–7 days", includes: (days) => days <= 7 },
  { key: "8_14", label: "8–14 days", includes: (days) => days >= 8 && days <= 14 },
  { key: "15_30", label: "15–30 days", includes: (days) => days >= 15 && days <= 30 },
  { key: "31_60", label: "31–60 days", includes: (days) => days >= 31 && days <= 60 },
  { key: "61_plus", label: "61+ days", includes: (days) => days >= 61 },
];

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

export function emptyListingSupplySummary(): ListingSupplySummary {
  return {
    ageObservedListings: 0,
    medianActiveAgeDays: null,
    activeOver30Days: 0,
    activeOver30SharePct: null,
    activatedLast7Days: 0,
    activatedLast30Days: 0,
    listingAgeBuckets: BUCKETS.map(({ key, label }) => ({ key, label, count: 0, sharePct: 0 })),
  };
}

export function summarizeActiveListingSupply(
  listings: Array<{ listingCreatedAt: Date }>,
  asOf: Date,
): ListingSupplySummary {
  const asOfTime = asOf.getTime();
  if (!Number.isFinite(asOfTime)) return emptyListingSupplySummary();

  const ages = listings
    .map(({ listingCreatedAt }) => Math.floor((asOfTime - listingCreatedAt.getTime()) / DAY_MS))
    .filter((days) => Number.isFinite(days) && days >= 0)
    .sort((a, b) => a - b);

  if (!ages.length) return emptyListingSupplySummary();

  const midpoint = Math.floor(ages.length / 2);
  const medianActiveAgeDays = ages.length % 2
    ? ages[midpoint]
    : Math.round((ages[midpoint - 1] + ages[midpoint]) / 2);
  const activeOver30Days = ages.filter((days) => days >= 31).length;

  return {
    ageObservedListings: ages.length,
    medianActiveAgeDays,
    activeOver30Days,
    activeOver30SharePct: roundOne((activeOver30Days / ages.length) * 100),
    activatedLast7Days: ages.filter((days) => days <= 7).length,
    activatedLast30Days: ages.filter((days) => days <= 30).length,
    listingAgeBuckets: BUCKETS.map(({ key, label, includes }) => {
      const count = ages.filter(includes).length;
      return { key, label, count, sharePct: roundOne((count / ages.length) * 100) };
    }),
  };
}

export function summarizeDailyActiveListingSupply(
  listings: Array<{ listingCreatedAt: Date; propertyType: string }>,
  capturedAt: Date,
): DailyListingSupplySummary {
  const snapshotDate = new Date(Date.UTC(
    capturedAt.getUTCFullYear(),
    capturedAt.getUTCMonth(),
    capturedAt.getUTCDate(),
  ));
  const apartmentListings = listings.filter((listing) => listing.propertyType === "apartment").length;

  return {
    ...summarizeActiveListingSupply(listings, capturedAt),
    snapshotDate,
    activeListings: listings.length,
    apartmentListings,
    houseListings: listings.length - apartmentListings,
  };
}
