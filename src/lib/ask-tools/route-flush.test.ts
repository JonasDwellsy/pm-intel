// v0.18 (PR #74) — Regression guard mirroring the PR #73 webhook
// guard. Vercel serverless freezes the JS event loop after the
// lambda's HTTP response returns, so posthog-node's flushInterval
// timer can't tick and queued events sit in memory until the
// lambda dies (events lost). PR #73 fixed this for the Clerk
// webhook; this PR closes the same latent vulnerability in
// /api/ask's askai_query_submitted capture.
//
// /api/ask returns an SSE stream rather than a plain Response.json
// — the stream keeps the lambda alive while open, but a fast
// disconnect or early error can still leave the queued PostHog
// event stranded. The flush is invoked just before `new Response`
// returns, mirroring the webhook pattern.

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTE_SRC = readFileSync(
  join(process.cwd(), "src/app/api/ask/route.ts"),
  "utf8"
);

test("ask POST handler imports flushAnalyticsServer", () => {
  assert.ok(
    ROUTE_SRC.includes("flushAnalyticsServer"),
    "route must import + invoke flushAnalyticsServer to drain PostHog before lambda freeze"
  );
});

test("ask POST handler awaits flushAnalyticsServer before returning the streaming Response", () => {
  // Order check: the awaited flush MUST precede the SSE Response
  // return. If anyone removes or reorders the flush, the queued
  // askai_query_submitted event can be lost when the lambda
  // freezes post-response.
  const postMatch = ROUTE_SRC.match(
    /export async function POST[\s\S]*?\n\}/
  );
  assert.ok(postMatch, "POST handler must exist in /api/ask/route.ts");
  const postBody = postMatch![0];

  const flushIdx = postBody.indexOf("await flushAnalyticsServer");
  const returnIdx = postBody.indexOf("return new Response(stream");
  assert.ok(flushIdx > 0, "POST handler must await flushAnalyticsServer");
  assert.ok(
    returnIdx > 0,
    "POST handler must return new Response(stream, ...) for SSE"
  );
  assert.ok(
    flushIdx < returnIdx,
    "flushAnalyticsServer MUST be called before the streaming response is returned"
  );
});

test("ask POST handler flushes AFTER the captureServerEvent call", () => {
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
