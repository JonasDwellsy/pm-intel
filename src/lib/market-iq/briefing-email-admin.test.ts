import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("briefing email audit is admin-only and keeps execution dry-run", async () => {
  const [page, actions, service] = await Promise.all([
    readFile("src/app/market-iq/internal/briefing-email-runs/page.tsx", "utf8"),
    readFile("src/app/market-iq/internal/briefing-email-runs/actions.ts", "utf8"),
    readFile("src/lib/market-iq/briefing-email-orchestrator.server.ts", "utf8"),
  ]);
  assert.match(page, /isAdminUser\(userId\)/);
  assert.match(page, /marketIqPreviewEnabled/);
  assert.match(page, /No automatic delivery/);
  assert.match(actions, /isAdminUser\(userId\)/);
  assert.match(actions, /runMarketIqInternalBriefingDryRun/);
  assert.doesNotMatch(`${page}\n${actions}\n${service}`, /sendEmail|deliverMarketIqBriefingEmail|marketIqReportRecipient|marketIqDistributionCampaign/);
});

test("internal navigation exposes briefing checks only inside admin surfaces", async () => {
  const [readiness, admin] = await Promise.all([
    readFile("src/app/market-iq/internal/readiness/page.tsx", "utf8"),
    readFile("src/app/market-iq/internal/admin/page.tsx", "utf8"),
  ]);
  assert.match(readiness, /market-iq\/internal\/briefing-email-runs/);
  assert.match(admin, /market-iq\/internal\/briefing-email-runs/);
});
