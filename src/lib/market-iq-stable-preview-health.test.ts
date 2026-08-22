import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MARKET_IQ_STABLE_PREVIEW_MAX_SNAPSHOT_AGE_DAYS,
  resolveMarketIqStablePreviewHealth,
} from "@/lib/market-iq/stable-preview-health";

const NOW = new Date("2026-08-22T12:00:00.000Z");
const CURRENT_SNAPSHOT = {
  sourceAvailableThrough: new Date("2026-07-31T00:00:00.000Z"),
  generatedAt: new Date("2026-08-22T02:47:00.000Z"),
  valid: true,
};

function resolve(overrides: Partial<Parameters<typeof resolveMarketIqStablePreviewHealth>[0]> = {}) {
  return resolveMarketIqStablePreviewHealth({
    marketId: "cleveland-elyria-mentor-oh",
    now: NOW,
    databaseConfigured: true,
    databaseReachable: true,
    sourceConfigured: true,
    snapshot: CURRENT_SNAPSHOT,
    latestRefreshStatus: "complete",
    ...overrides,
  });
}

test("stable preview health is ready only when the evidence path is usable", () => {
  const health = resolve();
  assert.equal(health.status, "ready");
  assert.deepEqual(health.checks.map((check) => check.status), ["ready", "ready", "ready"]);
  assert.equal(health.sourceAvailableThrough, "2026-07-31T00:00:00.000Z");
  assert.equal(health.latestRefreshStatus, "complete");
});

test("stable preview health fails closed for database, source, snapshot, and freshness defects", () => {
  assert.equal(resolve({ databaseReachable: false }).status, "blocked");
  assert.equal(resolve({ sourceConfigured: false }).status, "blocked");
  assert.equal(resolve({ snapshot: { ...CURRENT_SNAPSHOT, valid: false } }).status, "blocked");

  const staleDate = new Date(NOW.getTime() - (MARKET_IQ_STABLE_PREVIEW_MAX_SNAPSHOT_AGE_DAYS + 1) * 86_400_000);
  const stale = resolve({ snapshot: { ...CURRENT_SNAPSHOT, sourceAvailableThrough: staleDate } });
  assert.equal(stale.status, "blocked");
  assert.equal(stale.checks.find((check) => check.id === "verified_snapshot")?.status, "blocked");
});

test("the preview health route and workflow stay isolated, sanitized, and side-effect free", () => {
  const route = readFileSync("src/app/api/market-iq-stable-preview-health/route.ts", "utf8");
  const loader = readFileSync("src/lib/market-iq/stable-preview-health.server.ts", "utf8");
  const workflow = readFileSync(".github/workflows/market-iq-stable-preview.yml", "utf8");

  assert.match(route, /VERCEL_ENV === "preview"/);
  assert.match(route, /MARKET_IQ_PREVIEW_ENABLED === "1"/);
  assert.match(route, /market-iq-mu\.vercel\.app/);
  assert.match(route, /Cache-Control/);
  assert.doesNotMatch(route, /process\.env\.[A-Z_]+\s*[,}]/);

  assert.match(loader, /marketIqReportSourceSnapshot\.findFirst/);
  assert.match(loader, /marketIqSourceRefresh\.findFirst/);
  assert.doesNotMatch(loader, /create\(|update\(|upsert\(|delete\(/);

  assert.match(workflow, /market-iq-stable-preview-health/);
  assert.match(workflow, /market-iq\/welcome/);
  assert.match(workflow, /market-iq\/daily\?market=cleveland-oh/);
  assert.match(workflow, /redirect_url/);
  assert.doesNotMatch(workflow, /continue-on-error/);
});
