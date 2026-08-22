import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { marketIqReportSourceRefreshEnabled } from "./report-source-refresh";

const enabled = {
  VERCEL_ENV: "preview",
  VERCEL_PROJECT_PRODUCTION_URL: "market-iq-mu.vercel.app",
  MARKET_IQ_PREVIEW_ENABLED: "1",
  MARKET_IQ_USE_PROJECT_DATABASE: "1",
  DWELLSY_LIVE_RUNTIME_ENABLED: "1",
};

test("the report source refresh is enabled only for the isolated Market IQ preview", () => {
  assert.equal(marketIqReportSourceRefreshEnabled(enabled), true);
  for (const key of Object.keys(enabled)) {
    assert.equal(
      marketIqReportSourceRefreshEnabled({ ...enabled, [key]: undefined }),
      false,
      `${key} must fail closed`,
    );
  }
  assert.equal(
    marketIqReportSourceRefreshEnabled({ ...enabled, VERCEL_ENV: "production" }),
    false,
  );
  assert.equal(
    marketIqReportSourceRefreshEnabled({
      ...enabled,
      VERCEL_PROJECT_PRODUCTION_URL: "pm-intel.vercel.app",
    }),
    false,
  );
});

test("the runtime route requires an admin and forces the live authoritative source", () => {
  const route = readFileSync(
    "src/app/api/market-iq/source/trends/refresh/route.ts",
    "utf8",
  );
  assert.match(route, /await auth\(\)/);
  assert.match(route, /isAdminUser\(userId\)/);
  assert.match(route, /sourceMode: "live_only"/);
  assert.match(route, /beginMarketIqReportSourceRefresh/);
  assert.match(route, /runMarketIqSourceWithRetry/);
  assert.match(route, /validateMarketIqLiveReportSnapshot/);
  assert.match(route, /completeMarketIqReportSourceRefresh/);
  assert.match(route, /blockMarketIqReportSourceRefresh/);
  assert.match(route, /readiness\?refresh=stored/);
  assert.match(route, /303/);
  assert.doesNotMatch(route, /error\.message/);

  const readiness = readFileSync(
    "src/app/market-iq/internal/readiness/page.tsx",
    "utf8",
  );
  assert.match(readiness, /action="\/api\/market-iq\/source\/trends\/refresh"/);
  assert.match(readiness, /method="post"/);
  assert.match(readiness, /Refresh Cleveland from Trends/);
});

test("the Cleveland builder bypasses imported observations only when live-only is requested", () => {
  const builder = readFileSync("src/lib/market-iq/report/build.server.ts", "utf8");
  assert.match(builder, /sourceMode\?: "prefer_imported" \| "live_only"/);
  assert.match(builder, /input\?\.sourceMode === "live_only"/);
  assert.match(builder, /loadImportedTrendSource\(\)/);
});
