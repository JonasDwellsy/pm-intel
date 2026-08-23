import "server-only";

import { loadNationalListingSupply } from "@/lib/dwellsy-source/national-listing-supply.server";
import {
  assessNationalListingSupply,
  summarizeNationalSupplyCoverage,
} from "@/lib/market-iq/national-listing-supply";
import { marketIqPrisma } from "@/lib/market-iq/prisma";

function utcDate(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export async function runNationalListingSupplyCapture(capturedAt = new Date()) {
  const source = await loadNationalListingSupply(capturedAt);
  if (!source.length) throw new Error("Dwellsy returned no MSA listing-supply aggregates.");

  const assessed = source.map((row) => assessNationalListingSupply(row, capturedAt));
  const coverage = summarizeNationalSupplyCoverage(assessed);
  if (coverage.eligibleMarkets === 0) {
    throw new Error("No Dwellsy MSA passed the national listing-supply coverage contract.");
  }

  const snapshotDate = utcDate(capturedAt);
  await marketIqPrisma.$transaction(
    assessed.map((row) => {
      const snapshot = {
        marketName: row.marketName,
        stateCodes: JSON.stringify(row.stateCodes),
        timeZone: row.timeZone,
        coverageStatus: row.coverageStatus,
        sourceAvailableThrough: row.sourceAvailableThrough,
        activeListings: row.activeListings,
        apartmentListings: row.apartmentListings,
        houseListings: row.houseListings,
        ageObservedListings: row.ageObservedListings,
        medianActiveAgeDays: row.medianActiveAgeDays,
        activeOver30Days: row.activeOver30Days,
        activeOver30SharePct: row.activeOver30SharePct,
        activatedLast7Days: row.activatedLast7Days,
        activatedLast30Days: row.activatedLast30Days,
        age0To7Days: row.age0To7Days,
        age8To14Days: row.age8To14Days,
        age15To30Days: row.age15To30Days,
        age31To60Days: row.age31To60Days,
        age61PlusDays: row.age61PlusDays,
        capturedAt,
      };
      return marketIqPrisma.marketIqNationalSupplySnapshot.upsert({
        where: { cbsaCode_snapshotDate: { cbsaCode: row.cbsaCode, snapshotDate } },
        create: { cbsaCode: row.cbsaCode, snapshotDate, ...snapshot },
        update: snapshot,
      });
    }),
  );

  const eligibleSourceTimes = assessed
    .filter((row) => row.coverageStatus === "eligible" && row.sourceAvailableThrough)
    .map((row) => row.sourceAvailableThrough as Date);
  const sourceAvailableThrough = eligibleSourceTimes.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return {
    status: "stored" as const,
    snapshotDate: snapshotDate.toISOString().slice(0, 10),
    capturedAt: capturedAt.toISOString(),
    sourceAvailableThrough: sourceAvailableThrough?.toISOString() ?? null,
    ...coverage,
  };
}
