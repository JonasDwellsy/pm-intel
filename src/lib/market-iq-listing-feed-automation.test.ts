import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  ".github/workflows/market-iq-listing-feed-refresh.yml",
  "utf8",
);

test("listing feed automation is scheduled only from the default branch", () => {
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("listing feed automation verifies deployment identity before capture", () => {
  const identity = workflow.indexOf("Verify the stable preview serves integration HEAD");
  const refresh = workflow.indexOf("Capture the active listing feed once");
  assert.ok(identity >= 0);
  assert.ok(refresh > identity);
  assert.match(workflow, /EXPECTED_BRANCH: codex\/market-iq-integration/);
  assert.match(workflow, /git\/ref\/heads\/\$EXPECTED_BRANCH/);
  assert.match(workflow, /response\.commit === process\.env\.EXPECTED_SHA/);
});

test("listing feed automation uses scoped secrets and never retries the POST", () => {
  assert.match(workflow, /secrets\.MARKET_IQ_VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.match(workflow, /secrets\.MARKET_IQ_SOURCE_REFRESH_TOKEN/);
  assert.match(workflow, /authorization: Bearer \$MARKET_IQ_SOURCE_REFRESH_TOKEN/);

  const postStart = workflow.indexOf("--request POST");
  const postEnd = workflow.indexOf("REFRESH_STATUS=", postStart);
  assert.ok(postStart >= 0);
  assert.ok(postEnd > postStart);
  assert.doesNotMatch(workflow.slice(postStart, postEnd), /--retry/);
});

test("listing feed automation validates the capture and both persisted health checks", () => {
  assert.match(workflow, /response\.recordCount >= 250/);
  assert.match(workflow, /response\.apartmentCount \+ response\.houseCount === response\.recordCount/);
  assert.match(workflow, /"listing_snapshot", "listing_refresh_attempt"/);
  assert.match(workflow, /listingChecks\.length === listingCheckIds\.size/);
  assert.match(workflow, /failedChecks\.length === 0/);
});

test("listing feed automation targets only the stable Market IQ preview", () => {
  assert.match(workflow, /https:\/\/market-preview\.intel\.iq\.dwellsy\.com/);
  assert.doesNotMatch(workflow, /pm-intel\.vercel\.app|https:\/\/intel\.iq\.dwellsy\.com/);
});
