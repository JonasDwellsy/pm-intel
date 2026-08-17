import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("launch verification ledger is additive and isolated from customer delivery", async () => {
  const migration = await readFile("prisma/migrations/20260817233000_market_iq_launch_readiness/migration.sql", "utf8");
  assert.match(migration, /CREATE TABLE "MarketIqTestDelivery"/);
  assert.doesNotMatch(migration, /ALTER TABLE "MarketIqReportSend"|ALTER TABLE "MarketIqReportRecipient"|ALTER TABLE "MarketIqDistributionCampaign"|DROP TABLE|DROP COLUMN/);
});

test("safe test delivery targets only the signed-in Clerk email", async () => {
  const action = await readFile("src/app/market-iq/launch/actions.ts", "utf8");
  assert.match(action, /currentUser\(\)/);
  assert.match(action, /confirmation !== email/);
  assert.match(action, /marketIqTestDelivery\.create/);
  assert.match(action, /market_iq_test_delivery/);
  assert.match(action, /preview-bootstrap/);
  assert.match(action, /market-iq-baseline/);
  assert.match(action, /No client or prospect received it/);
  assert.doesNotMatch(action, /marketIqReportRecipient\.(create|upsert)|marketIqDistributionCampaign\.create|deliverMarketIqReportToRecipient/);
});

test("launch checklist and internal diagnostics keep their boundaries explicit", async () => {
  const [launch, readiness] = await Promise.all([
    readFile("src/app/market-iq/launch/page.tsx", "utf8"),
    readFile("src/app/market-iq/internal/readiness/page.tsx", "utf8"),
  ]);
  assert.match(launch, /Send a test to yourself/);
  assert.match(launch, /No client or prospect can receive this test/);
  assert.match(launch, /Six steps from setup to verified delivery/);
  assert.match(readiness, /isAdminUser\(userId\)/);
  assert.match(readiness, /Secret values are never displayed/);
  assert.match(readiness, /Diagnostics never display secret values, send email, run a scheduler, publish a report/);
});
