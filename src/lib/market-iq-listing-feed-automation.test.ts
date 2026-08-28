import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  ".github/workflows/market-iq-source-staleness.yml",
  "utf8",
);

test("listing feed capture is consolidated into the default-branch nightly run", () => {
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /Capture detailed listing events for launched markets/);
});

test("nightly automation verifies deployment identity before listing capture", () => {
  const identity = workflow.indexOf("Verify the Market IQ integration deployment");
  const refresh = workflow.indexOf("Capture detailed listing events for launched markets");
  assert.ok(identity >= 0);
  assert.ok(refresh > identity);
  assert.match(workflow, /EXPECTED_BRANCH: codex\/market-iq-integration/);
  assert.match(workflow, /git\/ref\/heads\/\$EXPECTED_BRANCH/);
  assert.match(workflow, /response\.commit === process\.env\.EXPECTED_SHA/);
});

test("listing capture uses scoped secrets and does not retry mutating requests", () => {
  assert.match(workflow, /secrets\.MARKET_IQ_VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.match(workflow, /secrets\.MARKET_IQ_SOURCE_REFRESH_TOKEN/);
  assert.match(workflow, /Authorization: Bearer \$MARKET_IQ_SOURCE_REFRESH_TOKEN/);

  const captureStart = workflow.indexOf("Capture detailed listing events for launched markets");
  const postStart = workflow.indexOf("--request POST", captureStart);
  const postEnd = workflow.indexOf("MARKET_ID=", postStart);
  assert.ok(postStart >= 0);
  assert.ok(postEnd > postStart);
  assert.doesNotMatch(workflow.slice(postStart, postEnd), /--retry/);
});

test("listing capture validates every launched market before health and delivery", () => {
  const capture = workflow.indexOf("Capture detailed listing events for launched markets");
  const health = workflow.indexOf("Check the verified source snapshot");
  const delivery = workflow.indexOf("Materialize and deliver personal watchlist matches");
  assert.ok(capture >= 0);
  assert.ok(health > capture);
  assert.ok(delivery > health);
  assert.match(workflow, /\["complete", "baseline_complete"\]\.includes\(response\.status\)/);
  assert.match(workflow, /response\.recordCount > 0/);
  assert.match(workflow, /failedChecks\.length === 0/);
});

test("listing feed automation targets only the integration branch deployment", () => {
  assert.match(workflow, /market-iq-git-codex-market-iq-integration-dwellsybordo\.vercel\.app/);
  assert.doesNotMatch(workflow, /market-preview\.intel\.iq\.dwellsy\.com/);
  assert.doesNotMatch(workflow, /pm-intel\.vercel\.app|https:\/\/intel\.iq\.dwellsy\.com/);
});
