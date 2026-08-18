import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildMarketIqInternalBriefingEmail } from "./briefing-email";
import type { MarketIqBriefingArchivePayload } from "./weekly-briefing";

const payload: MarketIqBriefingArchivePayload = {
  version: 1,
  preparedAt: "2026-08-18T12:00:00.000Z",
  weekOf: "2026-08-17",
  headline: "One market has a new edition to review",
  counts: { markets: 3, currentSources: 3, reviews: 1, exceptions: 0 },
  reviews: [],
  currentMoves: [{ marketId: "cleveland", marketName: "Cleveland", geographyLabel: "ZIP 44113", segmentLabel: "1-bed apartments", rent: 1050, yearOverYearPct: -1.5, sourcePeriodEnd: "2026-07-31" }],
  exceptions: [],
  sourcePeriods: { cleveland: "2026-07-31" },
};

test("internal briefing email links to the frozen archive and states the client boundary", () => {
  const message = buildMarketIqInternalBriefingEmail({ payload, briefingUrl: "https://market.example/market-iq/briefing/one", recipientName: "Jordan" });
  assert.match(message.subject, /Market IQ weekly briefing/);
  assert.match(message.html, /market-iq\/briefing\/one/);
  assert.match(message.text, /separate from Client Advisory/);
  assert.match(message.text, /ZIP 44113/);
});

test("internal briefing email escapes stored narrative", () => {
  const message = buildMarketIqInternalBriefingEmail({ ...{ payload: { ...payload, headline: "<script>bad</script>" }, briefingUrl: "https://market.example/briefing" } });
  assert.doesNotMatch(message.html, /<script>bad<\/script>/);
  assert.match(message.html, /&lt;script&gt;bad&lt;\/script&gt;/);
});

test("internal briefing migration is additive and separate from Client Advisory", async () => {
  const migration = await readFile("prisma/migrations/20260818153000_market_iq_internal_briefing_email/migration.sql", "utf8");
  assert.match(migration, /CREATE TABLE "MarketIqBriefingEmailPreference"/);
  assert.match(migration, /CREATE TABLE "MarketIqBriefingEmailDelivery"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|MarketIqReportRecipient|MarketIqReportSend/);
});

test("self delivery requires opt-in and never reads the client recipient directory", async () => {
  const [actions, delivery] = await Promise.all([
    readFile("src/app/market-iq/briefing/actions.ts", "utf8"),
    readFile("src/lib/market-iq/briefing-email.server.ts", "utf8"),
  ]);
  assert.match(actions, /currentUser\(\)/);
  assert.match(actions, /sendLatestMarketIqBriefingToMe/);
  assert.match(actions, /enabled: true/);
  assert.match(actions, /recipientEmail: email/);
  assert.match(delivery, /preference\?\.enabled/);
  assert.match(delivery, /snapshotId_userId/);
  assert.doesNotMatch(`${actions}\n${delivery}`, /marketIqReportRecipient|marketIqDistributionCampaign/);
});
