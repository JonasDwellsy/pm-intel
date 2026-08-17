import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("scheduled edition orchestration is additive and isolated", async () => {
  const migration = await readFile("prisma/migrations/20260816150000_market_iq_edition_orchestration/migration.sql", "utf8");
  assert.match(migration, /CREATE TABLE "MarketIqEditionOrchestrationRun"/);
  assert.match(migration, /CREATE TABLE "MarketIqEditionOrchestrationItem"/);
  assert.doesNotMatch(migration, /ALTER TABLE "PM"|ALTER TABLE "OperatorSnapshot"|ALTER TABLE "PortfolioIq|DROP TABLE|DROP COLUMN/);
});

test("recurring enrollment is additive and opt-in", async () => {
  const [migration, schema, orchestrator] = await Promise.all([
    readFile("prisma/migrations/20260817033000_market_iq_edition_enrollment/migration.sql", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
    readFile("src/lib/market-iq/report/edition-orchestrator.server.ts", "utf8"),
  ]);
  assert.match(migration, /ADD COLUMN "recurringEditionsEnabled" BOOLEAN NOT NULL DEFAULT false/);
  assert.doesNotMatch(migration, /ALTER TABLE "PM"|ALTER TABLE "OperatorSnapshot"|ALTER TABLE "PortfolioIq|DROP TABLE|DROP COLUMN/);
  assert.match(schema, /recurringEditionsEnabled Boolean\s+@default\(false\)/);
  assert.match(orchestrator, /recurringEditionsEnabled: true/);
});

test("scheduled endpoint is authenticated and fail-closed behind Market IQ", async () => {
  const [route, vercel] = await Promise.all([
    readFile("src/app/api/cron/market-iq-editions/route.ts", "utf8"),
    readFile("vercel.json", "utf8"),
  ]);
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /Bearer/);
  assert.match(route, /marketIqPreviewEnabled/);
  assert.match(vercel, /api\/cron\/market-iq-editions/);
});

test("orchestrator can create only private drafts", async () => {
  const service = await readFile("src/lib/market-iq/report/edition-orchestrator.server.ts", "utf8");
  assert.match(service, /ensureRecurringMarketIqEditionDraft/);
  assert.doesNotMatch(service, /marketIqReport\.create|marketIqDistributionCampaign\.create|marketIqReportSend\.create|sendgrid|sendMarketIq/);
});
