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

export type ListingSupplyHistoryPoint = {
  snapshotDate: string;
  sourceAvailableThrough: string;
  activeListings: number;
  medianActiveAgeDays: number | null;
};

export type ListingSupplyComparison = {
  requestedDays: 7 | 30;
  elapsedDays: number;
  startDate: string;
  endDate: string;
  inventoryChange: number;
  inventoryChangePct: number | null;
  medianAgeChangeDays: number | null;
};

export type ListingSupplyCondition = {
  title: string;
  detail: string;
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

function dayNumber(value: string) {
  const time = new Date(`${value.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Number.isFinite(time) ? Math.floor(time / DAY_MS) : null;
}

export function compareListingSupplyHistory(
  points: ListingSupplyHistoryPoint[],
  requestedDays: 7 | 30,
): ListingSupplyComparison | null {
  const dated = points
    .map((point) => ({ point, day: dayNumber(point.snapshotDate) }))
    .filter((entry): entry is { point: ListingSupplyHistoryPoint; day: number } => entry.day !== null)
    .sort((a, b) => a.day - b.day);
  const latest = dated.at(-1);
  if (!latest) return null;

  const toleranceDays = requestedDays === 7 ? 2 : 3;
  const candidates = dated
    .slice(0, -1)
    .map((entry) => ({ ...entry, elapsedDays: latest.day - entry.day }))
    .filter((entry) => Math.abs(entry.elapsedDays - requestedDays) <= toleranceDays)
    .sort((a, b) => Math.abs(a.elapsedDays - requestedDays) - Math.abs(b.elapsedDays - requestedDays));
  const prior = candidates[0];
  if (!prior) return null;

  const inventoryChange = latest.point.activeListings - prior.point.activeListings;
  const inventoryChangePct = prior.point.activeListings > 0
    ? roundOne((inventoryChange / prior.point.activeListings) * 100)
    : null;
  const medianAgeChangeDays = latest.point.medianActiveAgeDays !== null
    && prior.point.medianActiveAgeDays !== null
    ? latest.point.medianActiveAgeDays - prior.point.medianActiveAgeDays
    : null;

  return {
    requestedDays,
    elapsedDays: prior.elapsedDays,
    startDate: prior.point.snapshotDate,
    endDate: latest.point.snapshotDate,
    inventoryChange,
    inventoryChangePct,
    medianAgeChangeDays,
  };
}

export function interpretListingSupplyCondition(
  comparison: ListingSupplyComparison | null,
): ListingSupplyCondition | null {
  if (!comparison) return null;
  const inventoryDirection = comparison.inventoryChangePct === null || Math.abs(comparison.inventoryChangePct) < 2
    ? 0
    : Math.sign(comparison.inventoryChangePct);
  const ageDirection = comparison.medianAgeChangeDays === null || Math.abs(comparison.medianAgeChangeDays) < 2
    ? 0
    : Math.sign(comparison.medianAgeChangeDays);

  if (inventoryDirection > 0 && ageDirection > 0) return {
    title: "Supply is building and taking longer to clear",
    detail: "More homes are available than at the comparison point, and the median active listing has been marketed longer. That combination points to looser asking-market conditions.",
  };
  if (inventoryDirection < 0 && ageDirection < 0) return {
    title: "Supply is tightening and moving faster",
    detail: "Fewer homes are available than at the comparison point, and the median active listing is newer. That combination points to tighter asking-market conditions.",
  };
  if (inventoryDirection > 0 && ageDirection < 0) return {
    title: "More supply is available, but it is moving faster",
    detail: "Inventory has grown while median active listing age has declined. New supply appears to be entering without making the active pool older.",
  };
  if (inventoryDirection < 0 && ageDirection > 0) return {
    title: "Supply is thinning, while remaining listings are aging",
    detail: "Inventory has declined while median active listing age has increased. The remaining active pool may contain a larger share of harder-to-move homes.",
  };
  if (inventoryDirection > 0) return {
    title: "Available supply is increasing",
    detail: "Inventory is meaningfully higher than at the comparison point, while median active listing age has not moved enough to establish a second signal.",
  };
  if (inventoryDirection < 0) return {
    title: "Available supply is decreasing",
    detail: "Inventory is meaningfully lower than at the comparison point, while median active listing age has not moved enough to establish a second signal.",
  };
  if (ageDirection > 0) return {
    title: "Active listings are getting older",
    detail: "Median active listing age has increased while inventory is broadly stable, a sign that the available pool is taking longer to turn over.",
  };
  if (ageDirection < 0) return {
    title: "Active listings are getting newer",
    detail: "Median active listing age has declined while inventory is broadly stable, a sign that the available pool is turning over faster.",
  };
  return {
    title: "Observed supply conditions are holding steady",
    detail: "Neither inventory nor median active listing age has moved enough to establish a directional signal at this comparison interval.",
  };
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
