import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyMarketIqRefreshFailure,
  parseRecordedMarketIqRefreshFailure,
  recordedMarketIqRefreshFailure,
  runMarketIqSourceWithRetry,
  validateMarketIqLiveReportSnapshot,
} from "@/lib/market-iq/report-refresh-reliability";
import { buildMarketIqReportSnapshot } from "@/lib/market-iq/report/report";

function liveSnapshot() {
  return buildMarketIqReportSnapshot({
    generatedAt: new Date("2026-08-22T12:00:00.000Z"),
    brand: {
      displayName: "Market IQ",
      logoUrl: null,
      primaryColor: "#173B57",
      accentColor: "#B96D3A",
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      websiteUrl: null,
    },
    scope: {
      marketId: "cleveland-elyria-mentor-oh",
      marketName: "Cleveland-Elyria, OH",
      cities: ["Cleveland"],
      zipCodes: ["44114"],
      segments: ["Apartments by bedroom"],
      periodStart: "2023-08-01",
      periodEnd: "2026-07-31",
      seededExample: false,
    },
    trendSeries: [{
      geographyType: "msa",
      geographyValue: "17460",
      geographyLabel: "Cleveland-Elyria, OH",
      propertyType: "apartment",
      bedrooms: 1,
      points: [{
        rent: 975,
        yearOverYearPct: 4,
        observations: 80,
        month: "2026-07-01",
      }],
    }],
    marketConditions: {
      heading: "Verified source fixture",
      narrative: "Test-only verified source fixture.",
      historical: null,
    },
    sources: [{
      name: "Dwellsy IQ Trends",
      availableThrough: "2026-07-31",
      observationCount: 80,
      note: "Authoritative Trends fixture.",
    }],
  });
}

test("transient source failures receive one bounded retry", async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await runMarketIqSourceWithRetry(async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error("connection timed out"), { code: "ETIMEDOUT" });
    return "verified";
  }, {
    delayMilliseconds: 25,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
  });
  assert.deepEqual(result, { value: "verified", attempts: 2 });
  assert.deepEqual(delays, [25]);
});

test("permanent source failures fail immediately and retain only a safe category", async () => {
  let calls = 0;
  await assert.rejects(
    runMarketIqSourceWithRetry(async () => {
      calls += 1;
      throw Object.assign(new Error("password authentication failed for secret-user"), { code: "28P01" });
    }, { sleep: async () => undefined }),
    (error: unknown) => {
      const recorded = recordedMarketIqRefreshFailure({ stage: "source", error });
      assert.deepEqual(recorded, {
        version: 1,
        stage: "source",
        category: "authentication",
        attempts: 1,
      });
      assert.doesNotMatch(JSON.stringify(recorded), /secret-user|password authentication/);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("error classification distinguishes operational failure stages without messages", () => {
  assert.deepEqual(
    classifyMarketIqRefreshFailure(Object.assign(new Error("permission denied"), { code: "42501" })),
    { category: "permission", retryable: false },
  );
  assert.deepEqual(
    classifyMarketIqRefreshFailure(Object.assign(new Error("socket closed"), { code: "ECONNRESET" })),
    { category: "connection", retryable: true },
  );
  const safe = recordedMarketIqRefreshFailure({
    stage: "persistence",
    error: new Error("postgres://user:password@private-host/database"),
  });
  assert.deepEqual(parseRecordedMarketIqRefreshFailure(JSON.stringify(safe)), safe);
  assert.equal(parseRecordedMarketIqRefreshFailure('{"message":"secret"}'), null);
  assert.doesNotMatch(JSON.stringify(safe), /private-host|password/);
});

test("only complete live Trends snapshots pass pre-persistence validation", () => {
  const snapshot = liveSnapshot();
  assert.deepEqual(validateMarketIqLiveReportSnapshot(snapshot), {
    observationCount: 1,
    sourceAvailableThrough: new Date("2026-07-31T00:00:00.000Z"),
  });
  assert.throws(
    () => validateMarketIqLiveReportSnapshot({
      ...snapshot,
      scope: { ...snapshot.scope, seededExample: true },
    }),
    /invalid report snapshot/,
  );
  assert.throws(
    () => validateMarketIqLiveReportSnapshot({ ...snapshot, sources: [] }),
    /invalid report snapshot/,
  );
});

test("the refresh lease, atomic commit, and read-only source boundaries remain explicit", () => {
  const server = readFileSync("src/lib/market-iq/report-refresh-reliability.server.ts", "utf8");
  const route = readFileSync("src/app/api/market-iq/source/trends/refresh/route.ts", "utf8");
  const source = readFileSync("src/lib/dwellsy-source/db.server.ts", "utf8");
  assert.match(server, /status: "running"/);
  assert.match(server, /startedAt: "asc"/);
  assert.match(server, /MARKET_IQ_REFRESH_STALE_AFTER_MS/);
  assert.match(server, /marketIqPrisma\.\$transaction/);
  assert.match(server, /storeMarketIqReportSourceSnapshot\(input\.snapshot, transaction\)/);
  assert.match(server, /status: "complete"/);
  assert.match(server, /triggerKind: input\.triggerKind \?\? "manual"/);
  assert.match(route, /status: 409/);
  assert.match(route, /Retry-After/);
  assert.doesNotMatch(route, /error\.message/);
  assert.match(source, /BEGIN READ ONLY/);
  assert.match(source, /default_transaction_read_only=on/);
});

test("the authenticated source refresh supports every configured live market", () => {
  const route = readFileSync("src/app/api/market-iq/source/trends/refresh/route.ts", "utf8");
  const builders = readFileSync("src/lib/market-iq/report/market-source-builders.server.ts", "utf8");
  assert.match(route, /MARKET_IQ_SOURCE_REFRESH_TOKEN/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /getMarketIqMarket\(requestedMarketId\)/);
  assert.match(route, /market\.status !== "live"/);
  assert.match(route, /triggerKind: tokenAuthorized \? "scheduled" : "manual"/);
  assert.match(route, /buildMarketIqReportSourceSnapshot\(market\.id\)/);
  assert.match(route, /marketId: stored\.marketId/);
  assert.match(builders, /CLEVELAND_MARKET_ID/);
  assert.match(builders, /COLUMBUS_MARKET_ID/);
  assert.match(builders, /SAN_FRANCISCO_MARKET_ID/);
  assert.match(builders, /SAN_JOSE_MARKET_ID/);
  assert.doesNotMatch(builders, /seeded/i);
});
