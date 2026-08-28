import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/market-iq-source-staleness.yml", "utf8");

test("Market IQ snapshots publish nightly inside the requested Pacific window", () => {
  assert.match(workflow, /cron: "0 9 \* \* \*"/);
  assert.match(workflow, /2:00 a\.m\. PDT and 1:00 a\.m\. PST/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /market-iq-git-codex-market-iq-integration-dwellsybordo\.vercel\.app/);
  assert.doesNotMatch(workflow, /market-preview\.intel\.iq\.dwellsy\.com/);
});

test("the nightly publisher covers every configured Market IQ market", () => {
  assert.match(workflow, /cleveland-elyria-mentor-oh/);
  assert.match(workflow, /columbus-oh/);
  assert.match(workflow, /san-francisco-oakland-berkeley-ca/);
  assert.match(workflow, /san-jose-sunnyvale-santa-clara-ca/);
  assert.match(workflow, /request POST/);
  assert.match(workflow, /MARKET_IQ_SOURCE_REFRESH_TOKEN/);
  assert.match(workflow, /MARKET_IQ_VERCEL_AUTOMATION_BYPASS_SECRET/);
});

test("delivery runs only after every snapshot is stored and health is verified", () => {
  const identity = workflow.indexOf("Verify the Market IQ integration deployment");
  const publication = workflow.indexOf("Publish every configured market snapshot");
  const health = workflow.indexOf("Check the verified source snapshot");
  const delivery = workflow.indexOf("Materialize and deliver personal watchlist matches");
  assert.ok(identity >= 0 && publication > identity && health > publication && delivery > health);
  assert.match(workflow, /response\.branch === process\.env\.EXPECTED_BRANCH/);
  assert.match(workflow, /response\.commit === process\.env\.EXPECTED_SHA/);
  assert.match(workflow, /response\.status === "stored"/);
  assert.match(workflow, /response\.marketId === marketId/);
  assert.match(workflow, /response\.status === "complete"/);
  assert.match(workflow, /daily-watchlist-delivery/);
});

test("the nightly national capture requires all 25 selected markets", () => {
  assert.match(workflow, /response\.trackedMarketCount === 25/);
  assert.match(workflow, /response\.trackedMarketsObserved === 25/);
  assert.match(workflow, /Selected markets observed:/);
});
