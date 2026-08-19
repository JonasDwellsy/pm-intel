import assert from "node:assert/strict";
import test from "node:test";

import {
  MARKET_IQ_CRONS,
  MARKET_IQ_VERCEL_PROJECT_ID,
  SHARED_PLATFORM_CRONS,
  assertMarketIqCronBoundary,
  cronsForProject,
} from "../../vercel";

test("the isolated Market IQ project schedules only Market IQ work", () => {
  assert.deepEqual(cronsForProject(MARKET_IQ_VERCEL_PROJECT_ID), [
    { path: "/api/cron/market-iq-editions", schedule: "30 12 * * *" },
    {
      path: "/api/cron/market-iq-internal-briefing",
      schedule: "0 16 * * 1",
    },
  ]);
  assert.deepEqual(cronsForProject(MARKET_IQ_VERCEL_PROJECT_ID), MARKET_IQ_CRONS);
});

test("the shared production project retains its complete schedule", () => {
  assert.deepEqual(cronsForProject("prj_shared_platform"), SHARED_PLATFORM_CRONS);
  assert.equal(SHARED_PLATFORM_CRONS.length, 7);
});

test("the Market IQ boundary rejects an unrelated scheduled route", () => {
  assert.throws(
    () =>
      assertMarketIqCronBoundary([
        { path: "/api/cron/watch-list-digest", schedule: "0 13 * * *" },
      ]),
    /cannot schedule unrelated route/
  );
});
