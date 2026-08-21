import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveMarketIqRecordedSourceReadiness } from "./market-iq/source-readiness";

const attempt = {
  status: "blocked",
  startedAt: new Date("2026-08-19T20:00:00.000Z"),
  completedAt: new Date("2026-08-19T20:00:30.000Z"),
};

test("recorded readiness distinguishes all five source states without a live source call", () => {
  assert.deepEqual(resolveMarketIqRecordedSourceReadiness({
    sourceConfigured: false,
    evidenceStoreReachable: true,
    savedSnapshot: null,
    lastAttempt: null,
  }), { state: "source_not_configured" });
  assert.deepEqual(resolveMarketIqRecordedSourceReadiness({
    sourceConfigured: true,
    evidenceStoreReachable: true,
    savedSnapshot: null,
    lastAttempt: attempt,
  }), { state: "source_unreachable", lastAttempt: attempt });
  assert.deepEqual(resolveMarketIqRecordedSourceReadiness({
    sourceConfigured: true,
    evidenceStoreReachable: true,
    savedSnapshot: null,
    lastAttempt: null,
  }), { state: "no_saved_report", lastAttempt: null });
  const savedSnapshot = {
    sourceAvailableThrough: new Date("2026-07-31T00:00:00.000Z"),
    generatedAt: new Date("2026-08-19T21:00:00.000Z"),
    contractCompatible: true,
  };
  assert.deepEqual(resolveMarketIqRecordedSourceReadiness({
    sourceConfigured: true,
    evidenceStoreReachable: true,
    savedSnapshot,
    lastAttempt: attempt,
  }), {
    state: "saved_report_available",
    sourceAvailableThrough: savedSnapshot.sourceAvailableThrough,
    generatedAt: savedSnapshot.generatedAt,
    lastAttempt: attempt,
  });

  assert.deepEqual(resolveMarketIqRecordedSourceReadiness({
    sourceConfigured: true,
    evidenceStoreReachable: true,
    savedSnapshot: { ...savedSnapshot, contractCompatible: false },
    lastAttempt: attempt,
  }), {
    state: "saved_report_incompatible",
    sourceAvailableThrough: savedSnapshot.sourceAvailableThrough,
    generatedAt: savedSnapshot.generatedAt,
    lastAttempt: attempt,
  });
});

test("internal readiness reads recorded evidence and never opens the Dwellsy source", async () => {
  const [page, loader, snapshotLoader] = await Promise.all([
    readFile("src/app/market-iq/internal/readiness/page.tsx", "utf8"),
    readFile("src/lib/market-iq/source-readiness.server.ts", "utf8"),
    readFile("src/lib/market-iq/report/source-snapshot.server.ts", "utf8"),
  ]);
  assert.match(page, /loadMarketIqRecordedSourceReadiness/);
  assert.doesNotMatch(page, /build\.server|dwellsy-source|loadCachedClevelandMarketIqReportSnapshot/);
  assert.match(loader, /marketIqReportSourceSnapshot\.findMany/);
  assert.match(loader, /parseCurrentMarketIqReportSourceSnapshot/);
  assert.match(loader, /compatibleSnapshot/);
  assert.match(loader, /marketIqSourceRefresh\.findFirst/);
  assert.doesNotMatch(loader, /dwellsy-source|loadDwellsy|DWELLSY_DATABASE_URL[^?]*\)/);
  assert.doesNotMatch(`${page}\n${loader}`, /process\.env\[[^\]]+\][^\n]*(detail|return)|password|connection string/i);
  assert.match(page, /older analytical contract/);
  assert.match(page, /Refresh Cleveland from Trends/);
  assert.match(snapshotLoader, /findMany/);
  assert.match(snapshotLoader, /parseCurrentMarketIqReportSourceSnapshot/);
  assert.match(snapshotLoader, /if \(snapshot\) return snapshot/);
});

test("public reports distinguish unknown tokens from known unavailable evidence", async () => {
  const [loader, page] = await Promise.all([
    readFile("src/lib/market-iq/report/build.server.ts", "utf8"),
    readFile("src/app/reports/market/[publicToken]/page.tsx", "utf8"),
  ]);
  assert.match(loader, /state: "not_found"/);
  assert.match(loader, /state: "unavailable"/);
  assert.match(loader, /state: "available", report/);
  assert.match(page, /result\.state === "not_found"\) notFound\(\)/);
  assert.match(page, /result\.state === "unavailable"/);
  assert.match(page, /MarketIqDataUnavailable/);
  assert.match(page, /MarketIqPublicReport report=\{result\.report\}/);
});

test("authenticated Market IQ routes fail closed without fabricated values", async () => {
  const files = await Promise.all([
    "src/app/market-iq/market/page.tsx",
    "src/app/market-iq/report/page.tsx",
    "src/app/market-iq/editions/page.tsx",
    "src/app/market-iq/report/actions.ts",
    "src/app/market-iq/editions/actions.ts",
    "src/components/market-iq/MarketIqMarketPreparing.tsx",
  ].map((file) => readFile(file, "utf8")));
  const [market, report, editions, reportActions, editionActions, preparing] = files;
  assert.match(market, /state="source_unavailable"/);
  assert.match(report, /MarketIqDataUnavailable/);
  assert.match(editions, /MarketIqDataUnavailable/);
  assert.match(reportActions, /reviewed report evidence is unavailable/);
  assert.match(editionActions, /ensureRecurringMarketIqEditionDraft/);
  assert.match(editionActions, /refresh=\$\{result\.state\}/);
  assert.match(preparing, /Nothing has been substituted/);
  assert.doesNotMatch(files.join("\n"), /seededClevelandMarketReport|SEEDED_CLEVELAND_TREND_SERIES/);
});

test("failure presentation does not claim the outage is temporary", async () => {
  const files = await Promise.all([
    "src/app/market-iq/briefing/page.tsx",
    "src/app/market-iq/editions/page.tsx",
    "src/app/market-iq/report/page.tsx",
    "src/app/reports/market/[publicToken]/page.tsx",
    "src/components/market-iq/MarketIqDataUnavailable.tsx",
    "src/components/market-iq/MarketIqMarketPreparing.tsx",
  ].map((file) => readFile(file, "utf8")));
  assert.doesNotMatch(files.join("\n"), /temporarily|taking too long|did not respond in time/i);
});
