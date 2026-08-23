import {
  MARKET_IQ_LISTING_FEED_MAX_SOURCE_AGE_MS,
  MARKET_IQ_LISTING_FEED_MINIMUM_RECORDS,
} from "@/lib/market-iq/listing-feed";

export type NationalSupplyCoverageStatus = "eligible" | "insufficient" | "stale" | "invalid";

export type NationalListingSupplyAggregate = {
  cbsaCode: string;
  marketName: string;
  stateCodes: string[];
  timeZone: string | null;
  sourceAvailableThrough: Date | null;
  activeListings: number;
  apartmentListings: number;
  houseListings: number;
  ageObservedListings: number;
  medianActiveAgeDays: number | null;
  activeOver30Days: number;
  activeOver30SharePct: number | null;
  activatedLast7Days: number;
  activatedLast30Days: number;
  age0To7Days: number;
  age8To14Days: number;
  age15To30Days: number;
  age31To60Days: number;
  age61PlusDays: number;
};

export type AssessedNationalListingSupply = NationalListingSupplyAggregate & {
  coverageStatus: NationalSupplyCoverageStatus;
};

function nonnegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0;
}

export function assessNationalListingSupply(
  aggregate: NationalListingSupplyAggregate,
  capturedAt: Date,
): AssessedNationalListingSupply {
  const bucketTotal = aggregate.age0To7Days + aggregate.age8To14Days + aggregate.age15To30Days
    + aggregate.age31To60Days + aggregate.age61PlusDays;
  const structurallyValid = /^\d{5}$/.test(aggregate.cbsaCode)
    && aggregate.marketName.trim().length > 0
    && [
      aggregate.activeListings,
      aggregate.apartmentListings,
      aggregate.houseListings,
      aggregate.ageObservedListings,
      aggregate.activeOver30Days,
      aggregate.activatedLast7Days,
      aggregate.activatedLast30Days,
      aggregate.age0To7Days,
      aggregate.age8To14Days,
      aggregate.age15To30Days,
      aggregate.age31To60Days,
      aggregate.age61PlusDays,
    ].every(nonnegativeInteger)
    && aggregate.apartmentListings + aggregate.houseListings === aggregate.activeListings
    && aggregate.ageObservedListings <= aggregate.activeListings
    && bucketTotal === aggregate.ageObservedListings
    && aggregate.activeOver30Days === aggregate.age31To60Days + aggregate.age61PlusDays;
  if (!structurallyValid) return { ...aggregate, coverageStatus: "invalid" };

  if (!aggregate.sourceAvailableThrough) return { ...aggregate, coverageStatus: "stale" };
  const sourceAge = capturedAt.getTime() - aggregate.sourceAvailableThrough.getTime();
  if (!Number.isFinite(sourceAge) || sourceAge < 0 || sourceAge > MARKET_IQ_LISTING_FEED_MAX_SOURCE_AGE_MS) {
    return { ...aggregate, coverageStatus: "stale" };
  }
  if (aggregate.activeListings < MARKET_IQ_LISTING_FEED_MINIMUM_RECORDS) {
    return { ...aggregate, coverageStatus: "insufficient" };
  }
  return { ...aggregate, coverageStatus: "eligible" };
}

export function summarizeNationalSupplyCoverage(rows: AssessedNationalListingSupply[]) {
  return rows.reduce((summary, row) => {
    summary.totalMarkets += 1;
    summary[`${row.coverageStatus}Markets`] += 1;
    return summary;
  }, {
    totalMarkets: 0,
    eligibleMarkets: 0,
    insufficientMarkets: 0,
    staleMarkets: 0,
    invalidMarkets: 0,
  });
}
