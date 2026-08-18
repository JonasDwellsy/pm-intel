import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("pilot telemetry migration is additive and isolated", async () => {
  const migration = await readFile("prisma/migrations/20260818010000_market_iq_pilot_telemetry/migration.sql", "utf8");
  assert.match(migration, /CREATE TABLE "MarketIqJourneyEvent"/);
  assert.match(migration, /MarketIqJourneyEvent_dedupeKey_key/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "MarketIqReport"|ALTER TABLE "MarketIqSubscription"/);
});

test("explicit workflow boundaries record the seven pilot milestones", async () => {
  const files = await Promise.all([
    readFile("src/lib/market-iq/billing/provisioning.server.ts", "utf8"),
    readFile("src/app/market-iq/get-started/actions.ts", "utf8"),
    readFile("src/app/market-iq/report/actions.ts", "utf8"),
    readFile("src/app/market-iq/launch/actions.ts", "utf8"),
    readFile("src/app/market-iq/distribution/actions.ts", "utf8"),
  ]);
  const source = files.join("\n");
  for (const milestone of ["access", "setup", "edition", "test", "recipient", "audience", "delivery"]) {
    assert.match(source, new RegExp(`milestone: \\"${milestone}\\"`));
  }
  assert.match(source, /marketIqMilestoneDedupeKey/);
  assert.match(source, /recipient_delivery_failed/);
});

test("support view is admin-only and excludes sensitive journey data", async () => {
  const page = await readFile("src/app/market-iq/internal/pilot-telemetry/page.tsx", "utf8");
  assert.match(page, /isAdminUser\(userId\)/);
  assert.match(page, /It does not collect page views, report content, recipient addresses/);
  assert.match(page, /reconciled from existing business records/);
  assert.doesNotMatch(page, /recipientEmail|snapshot|defaultZipCodes|defaultCities/);
});
