import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { portfolioIqSchedulerEnabled } from "@/lib/portfolio-iq/feature";

const portfolioCronRoutes = [
  "src/app/api/cron/portfolio-iq-monitoring/route.ts",
  "src/app/api/cron/portfolio-iq-pm-reminders/route.ts",
  "src/app/api/cron/portfolio-iq-digest/route.ts",
] as const;

test("Portfolio IQ scheduling fails closed unless its dedicated flag is exactly 1", () => {
  assert.equal(portfolioIqSchedulerEnabled(undefined), false);
  assert.equal(portfolioIqSchedulerEnabled(""), false);
  assert.equal(portfolioIqSchedulerEnabled("true"), false);
  assert.equal(portfolioIqSchedulerEnabled("0"), false);
  assert.equal(portfolioIqSchedulerEnabled("1"), true);
});

test("all Portfolio IQ cron routes authenticate before checking the scheduler gate", async () => {
  for (const routePath of portfolioCronRoutes) {
    const source = await readFile(routePath, "utf8");
    const authentication = source.indexOf("CRON_SECRET");
    const schedulerGate = source.indexOf("if (!portfolioIqSchedulerEnabled())");
    const scheduledWork = source.indexOf("try {");

    assert.notEqual(authentication, -1, `${routePath} must authenticate cron requests`);
    assert.notEqual(schedulerGate, -1, `${routePath} must fail closed on its scheduler gate`);
    assert.notEqual(scheduledWork, -1, `${routePath} must retain its scheduled work boundary`);
    assert.ok(authentication < schedulerGate, `${routePath} must authenticate before revealing gate state`);
    assert.ok(schedulerGate < scheduledWork, `${routePath} must gate before starting scheduled work`);
  }
});

test("Operator IQ and Market IQ schedules and Market IQ route gates remain unchanged", async () => {
  const [vercelSource, editionRoute, briefingRoute] = await Promise.all([
    readFile("vercel.json", "utf8"),
    readFile("src/app/api/cron/market-iq-editions/route.ts", "utf8"),
    readFile("src/app/api/cron/market-iq-internal-briefing/route.ts", "utf8"),
  ]);
  const config = JSON.parse(vercelSource) as {
    crons: Array<{ path: string; schedule: string }>;
  };
  const schedules = new Map(config.crons.map((cron) => [cron.path, cron.schedule]));

  assert.equal(schedules.get("/api/cron/watch-list-digest"), "0 13 * * *");
  assert.equal(schedules.get("/api/cron/brief-digest"), "0 14 * * *");
  assert.equal(schedules.get("/api/cron/market-iq-editions"), "30 12 * * *");
  assert.equal(schedules.get("/api/cron/market-iq-internal-briefing"), "0 16 * * 1");
  assert.match(editionRoute, /if \(!marketIqPreviewEnabled\(\)\)/);
  assert.match(briefingRoute, /if \(!marketIqPreviewEnabled\(\)\)/);
  assert.doesNotMatch(editionRoute, /portfolioIqSchedulerEnabled/);
  assert.doesNotMatch(briefingRoute, /portfolioIqSchedulerEnabled/);
});
