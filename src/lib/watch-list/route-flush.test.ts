// v0.18 (PR #74) — Regression guard mirroring the PR #73 webhook
// guard. Vercel serverless freezes the JS event loop after the
// lambda's HTTP response returns, so posthog-node's flushInterval
// timer can't tick and queued events sit in memory until the
// lambda dies (events lost). PR #73 fixed this for the Clerk
// webhook; this PR closes the same latent vulnerability in
// /api/watch-lists' watch_list_created capture.
//
// If anyone refactors and accidentally removes the flush call, the
// captured event will silently disappear under low-traffic
// conditions. This source-level test catches that exact regression.

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTE_SRC = readFileSync(
  join(process.cwd(), "src/app/api/watch-lists/route.ts"),
  "utf8"
);

test("watch-lists POST handler imports flushAnalyticsServer", () => {
  assert.ok(
    ROUTE_SRC.includes("flushAnalyticsServer"),
    "route must import + invoke flushAnalyticsServer to drain PostHog before lambda freeze"
  );
});

test("watch-lists POST handler awaits flushAnalyticsServer before returning Response.json", () => {
  // Order check: the awaited flush MUST precede the success
  // response return. If anyone removes or reorders the flush, the
  // batched watch_list_created event can be lost when the lambda
  // freezes post-response.
  const postMatch = ROUTE_SRC.match(
    /export async function POST[\s\S]*?\n\}/
  );
  assert.ok(postMatch, "POST handler must exist in /api/watch-lists/route.ts");
  const postBody = postMatch![0];

  const flushIdx = postBody.indexOf("await flushAnalyticsServer");
  const returnIdx = postBody.indexOf(
    `Response.json({ watchList: record }, { status: 201 })`
  );
  assert.ok(flushIdx > 0, "POST handler must await flushAnalyticsServer");
  assert.ok(
    returnIdx > 0,
    "POST handler must return Response.json({ watchList: record }, { status: 201 })"
  );
  assert.ok(
    flushIdx < returnIdx,
    "flushAnalyticsServer MUST be called before the success response is returned"
  );
});

test("watch-lists POST handler flushes AFTER the captureServerEvent call", () => {
  // Defensive ordering check: flushing before the capture is queued
  // would no-op the fix. The capture must precede the flush.
  const postMatch = ROUTE_SRC.match(
    /export async function POST[\s\S]*?\n\}/
  );
  assert.ok(postMatch, "POST handler must exist");
  const postBody = postMatch![0];

  const captureIdx = postBody.indexOf("captureServerEvent({");
  const flushIdx = postBody.indexOf("await flushAnalyticsServer");
  assert.ok(captureIdx > 0, "POST handler must call captureServerEvent");
  assert.ok(flushIdx > 0, "POST handler must await flushAnalyticsServer");
  assert.ok(
    captureIdx < flushIdx,
    "flushAnalyticsServer must run AFTER captureServerEvent, not before"
  );
});
