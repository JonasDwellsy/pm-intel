import assert from "node:assert/strict";
import test from "node:test";

import type { MarketIqMarketDefinition } from "@/data/market-iq/markets";
import { emptyListingSupplySummary } from "@/lib/market-iq/listing-supply";
import {
  MARKET_IQ_REPORT_VERSION,
  MARKET_IQ_SNAPSHOT_CONTRACT_VERSION,
  MARKET_IQ_TRENDS_HISTORY_MONTHS,
  type MarketIqReportSnapshot,
} from "@/lib/market-iq/report/report";
import { loadMarketIqMarketDataWithDependencies } from "@/lib/market-iq/data/service";
import type {
  MarketIqListingPulse,
  MarketIqMarketDataAdapter,
  MarketIqMarketDataRepository,
} from "@/lib/market-iq/data/types";

const MARKET: MarketIqMarketDefinition = {
  id: "test-market",
  slug: "test-market",
  cbsaCode: "00000",
  name: "Test Market",
  fullName: "Test Market MSA",
  shortLabel: "Test Market",
  stateCodes: ["OH"],
  timeZone: "America/New_York",
  map: { center: [-82, 40], zoom: 8 },
  status: "live",
};

const LONG_HISTORY_SEGMENTS = [
  ["apartment", 999],
  ["apartment", 0],
  ["apartment", 1],
  ["apartment", 2],
  ["house", 999],
  ["house", 2],
  ["house", 3],
  ["house", 4],
] as const;

function monthAt(offset: number) {
  return new Date(Date.UTC(2023, 7 + offset, 1)).toISOString().slice(0, 7);
}

function reportFixture(input: { availableThrough: string; historyMonths: number }): MarketIqReportSnapshot {
  const cells = LONG_HISTORY_SEGMENTS.map(([propertyType, bedrooms]) => {
    const series = Array.from({ length: input.historyMonths }, (_, index) => ({
      rent: 1_000 + index,
      yearOverYearPct: index >= 12 ? 1.2 : null,
      observations: 10,
      month: monthAt(index),
      valueBasis: "trends_value" as const,
    }));
    const latest = series.at(-1) ?? null;
    return {
      key: `test-market:${propertyType}:${bedrooms}`,
      label: `${bedrooms} ${propertyType}`,
      geographyType: "msa" as const,
      geographyValue: "test-market",
      geographyLabel: "Test Market MSA",
      propertyType,
      bedrooms,
      rent: latest?.rent ?? null,
      yearOverYearPct: latest?.yearOverYearPct ?? null,
      observations: latest?.observations ?? 0,
      month: latest?.month ?? null,
      valueBasis: latest?.valueBasis,
      series,
      status: "reportable" as const,
      suppressionReason: null,
    };
  });

  return {
    version: MARKET_IQ_REPORT_VERSION,
    dataContract: {
      version: MARKET_IQ_SNAPSHOT_CONTRACT_VERSION,
      trendsHistoryMonths: MARKET_IQ_TRENDS_HISTORY_MONTHS,
    },
    generatedAt: `${input.availableThrough}T12:00:00.000Z`,
    brand: {
      displayName: "Fixture Property Management",
      logoUrl: null,
      primaryColor: "#102247",
      accentColor: "#bf7138",
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      websiteUrl: null,
    },
    scope: {
      marketId: MARKET.id,
      marketName: MARKET.fullName,
      cities: [],
      zipCodes: [],
      segments: [],
      periodStart: "2023-08-01",
      periodEnd: input.availableThrough,
      seededExample: false,
    },
    marketRead: { heading: "Fixture", narrative: "Fixture", cells, unavailableCuts: [] },
    marketMap: { heading: "Fixture", narrative: "Fixture", points: [] },
    marketConditions: { heading: "Fixture", narrative: "Fixture", historical: null },
    sources: [{
      name: "Dwellsy IQ Trends",
      availableThrough: input.availableThrough,
      observationCount: null,
      note: "Fixture",
    }],
    methodNote: "Fixture",
    disclosure: "Fixture",
  };
}

function listingPulseFixture(): MarketIqListingPulse {
  return {
    ...emptyListingSupplySummary(),
    status: "healthy",
    sourceName: "Fixture listing source",
    sourceAvailableThrough: new Date("2026-07-31T00:00:00.000Z"),
    activeListings: 1,
    apartmentListings: 1,
    houseListings: 0,
    newEvents: 1,
    relistedEvents: 0,
    reactivatedEvents: 0,
    priceChangeEvents: 0,
    deactivatedEvents: 0,
    message: "Fixture",
  };
}

function dependencies(input: {
  persisted: MarketIqReportSnapshot | null;
  refreshed?: MarketIqReportSnapshot;
  reportError?: Error;
  listingError?: Error;
}) {
  let reportLoads = 0;
  const stored: MarketIqReportSnapshot[] = [];
  const adapter: MarketIqMarketDataAdapter = {
    marketId: MARKET.id,
    loadReport: async () => {
      reportLoads += 1;
      if (input.reportError) throw input.reportError;
      if (!input.refreshed) throw new Error("Missing refreshed fixture");
      return input.refreshed;
    },
    loadListingPulse: async () => {
      if (input.listingError) throw input.listingError;
      return listingPulseFixture();
    },
  };
  const repository: MarketIqMarketDataRepository = {
    loadPersistedReport: async () => input.persisted,
    storeReport: async (report) => {
      stored.push(report);
    },
  };
  return { adapter, repository, stored, reportLoads: () => reportLoads };
}

test("a current complete snapshot avoids an unnecessary Trends refresh", async () => {
  const persisted = reportFixture({ availableThrough: "2026-07-31", historyMonths: 36 });
  const deps = dependencies({ persisted });
  const result = await loadMarketIqMarketDataWithDependencies({
    market: MARKET,
    adapter: deps.adapter,
    repository: deps.repository,
    now: new Date("2026-08-19T00:00:00.000Z"),
  });

  assert.equal(result.report, persisted);
  assert.equal(deps.reportLoads(), 0);
  assert.equal(result.freshness, "current");
  assert.equal(result.usedPersistedSnapshot, true);
  assert.deepEqual(result.issues, []);
});

test("an interactive persisted-only read never starts a live source build", async () => {
  const deps = dependencies({
    persisted: null,
    refreshed: reportFixture({ availableThrough: "2026-07-31", historyMonths: 36 }),
  });
  const result = await loadMarketIqMarketDataWithDependencies({
    market: MARKET,
    adapter: deps.adapter,
    repository: deps.repository,
    refreshReport: false,
    now: new Date("2026-08-19T00:00:00.000Z"),
  });

  assert.equal(result.report, null);
  assert.equal(result.freshness, "missing");
  assert.equal(result.usedPersistedSnapshot, false);
  assert.equal(deps.reportLoads(), 0);
  assert.deepEqual(deps.stored, []);
});

test("a partial snapshot is replaced and persisted when refresh succeeds", async () => {
  const persisted = reportFixture({ availableThrough: "2026-07-31", historyMonths: 12 });
  const refreshed = reportFixture({ availableThrough: "2026-07-31", historyMonths: 36 });
  const deps = dependencies({ persisted, refreshed });
  const result = await loadMarketIqMarketDataWithDependencies({
    market: MARKET,
    adapter: deps.adapter,
    repository: deps.repository,
    now: new Date("2026-08-19T00:00:00.000Z"),
  });

  assert.equal(result.report, refreshed);
  assert.equal(deps.reportLoads(), 1);
  assert.deepEqual(deps.stored, [refreshed]);
  assert.equal(result.usedPersistedSnapshot, false);
  assert.equal(result.issues.some((issue) => issue.code === "partial_history"), false);
});

test("a failed refresh falls back to a stale partial snapshot honestly", async () => {
  const persisted = reportFixture({ availableThrough: "2025-12-31", historyMonths: 12 });
  const deps = dependencies({ persisted, reportError: new Error("Source offline") });
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    const result = await loadMarketIqMarketDataWithDependencies({
      market: MARKET,
      adapter: deps.adapter,
      repository: deps.repository,
      now: new Date("2026-08-19T00:00:00.000Z"),
    });

    assert.equal(result.report, persisted);
    assert.equal(result.freshness, "stale");
    assert.equal(result.usedPersistedSnapshot, true);
    assert.deepEqual(
      new Set(result.issues.map((issue) => issue.code)),
      new Set(["refresh_failed", "stale_snapshot", "partial_history"]),
    );
  } finally {
    console.warn = originalWarn;
  }
});

test("missing Trends and listing sources produce explicit unavailable states", async () => {
  const deps = dependencies({
    persisted: null,
    reportError: new Error("Trends offline"),
    listingError: new Error("Listings offline"),
  });
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    const result = await loadMarketIqMarketDataWithDependencies({
      market: MARKET,
      adapter: deps.adapter,
      repository: deps.repository,
      now: new Date("2026-08-19T00:00:00.000Z"),
    });

    assert.equal(result.report, null);
    assert.equal(result.freshness, "missing");
    assert.equal(result.listingPulse.status, "unavailable");
    assert.deepEqual(
      new Set(result.issues.map((issue) => issue.code)),
      new Set(["refresh_failed", "listing_unavailable"]),
    );
  } finally {
    console.warn = originalWarn;
  }
});
