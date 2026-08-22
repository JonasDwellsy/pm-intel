import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MARKET_IQ_REFRESH_STALE_AFTER_MS } from "@/lib/market-iq/report-refresh-reliability";
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
    latestRefresh: {
      status: "complete",
      startedAt: new Date("2026-08-22T02:46:00.000Z"),
      completedAt: new Date("2026-08-22T02:47:00.000Z"),
    },
    ...overrides,
  });
}

test("stable preview health is ready only when the evidence path is usable", () => {
  const health = resolve();
  assert.equal(health.status, "ready");
  assert.deepEqual(health.checks.map((check) => check.status), ["ready", "ready", "ready", "ready"]);
  assert.equal(health.sourceAvailableThrough, "2026-07-31T00:00:00.000Z");
  assert.equal(health.latestRefreshStatus, "complete");
});

test("stable preview health blocks a failed authoritative refresh", () => {
  const health = resolve({
    latestRefresh: {
      status: "blocked",
      startedAt: new Date("2026-08-22T11:55:00.000Z"),
      completedAt: new Date("2026-08-22T11:56:00.000Z"),
    },
  });

  assert.equal(health.status, "blocked");
  assert.equal(health.latestRefreshStatus, "blocked");
  assert.equal(health.checks.find((check) => check.id === "refresh_attempt")?.status, "blocked");
});

test("stable preview health allows only the bounded running window", () => {
  const withinWindow = resolve({
    latestRefresh: {
      status: "running",
      startedAt: new Date(NOW.getTime() - MARKET_IQ_REFRESH_STALE_AFTER_MS),
      completedAt: null,
    },
  });
  assert.equal(withinWindow.status, "ready");

  const outsideWindow = resolve({
    latestRefresh: {
      status: "running",
      startedAt: new Date(NOW.getTime() - MARKET_IQ_REFRESH_STALE_AFTER_MS - 1),
      completedAt: null,
    },
  });
  assert.equal(outsideWindow.status, "blocked");
  assert.match(
    outsideWindow.checks.find((check) => check.id === "refresh_attempt")?.detail ?? "",
    /exceeded/,
  );
});

test("stable preview health supports imported snapshots without a refresh record and rejects unknown states", () => {
  assert.equal(resolve({ latestRefresh: null }).status, "ready");
  assert.equal(resolve({
    latestRefresh: {
      status: "unexpected",
      startedAt: new Date("2026-08-22T11:55:00.000Z"),
      completedAt: null,
    },
  }).status, "blocked");
});

test("stable preview health fails closed when refresh status and completion disagree", () => {
  assert.equal(resolve({
    latestRefresh: {
      status: "complete",
      startedAt: new Date("2026-08-22T11:55:00.000Z"),
      completedAt: null,
    },
  }).status, "blocked");
  assert.equal(resolve({
    latestRefresh: {
      status: "running",
      startedAt: new Date("2026-08-22T11:55:00.000Z"),
      completedAt: new Date("2026-08-22T11:56:00.000Z"),
    },
  }).status, "blocked");
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
  assert.equal(loader.match(/requiredManifest: reportRefreshManifest/g)?.length, 2);
  assert.match(loader, /completedAt: null/);
  assert.match(loader, /completedAt: \{ not: null \}/);
  assert.doesNotMatch(loader, /create\(|update\(|upsert\(|delete\(/);

  assert.match(workflow, /market-iq-stable-preview-health/);
  assert.match(workflow, /market-iq\/welcome/);
  assert.match(workflow, /market-iq\/daily\?market=cleveland-oh/);
  assert.match(workflow, /redirect_url/);
  assert.doesNotMatch(workflow, /continue-on-error/);
});
