import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const workflowPath = join(
  process.cwd(),
  ".github/workflows/market-iq-failure-notifications.yml",
);
const workflow = readFileSync(workflowPath, "utf8");

test("Market IQ incident monitoring watches every operational safety net", () => {
  assert.match(workflow, /Market IQ listing feed refresh/);
  assert.match(workflow, /Market IQ source staleness/);
  assert.match(workflow, /Market IQ stable preview identity/);
  assert.match(workflow, /market-iq-deployment-identity/);
  assert.match(workflow, /market-iq-stable-preview-health/);
  assert.match(workflow, /\/market-iq\/welcome/);
  assert.match(workflow, /\/market-iq\/daily\?market=cleveland-oh/);
});

test("the direct preview check runs as an explicit ES module", () => {
  assert.match(workflow, /node --input-type=module <<'NODE'/);
  assert.match(workflow, /import assert from "node:assert\/strict"/);
  assert.match(workflow, /import fs from "node:fs"/);
  assert.doesNotMatch(workflow, /const assert = require\(/);
});

test("Market IQ incident monitoring has narrow write authority", () => {
  assert.match(workflow, /permissions:\n\s+actions: read\n\s+contents: read\n\s+issues: write/);
  assert.doesNotMatch(workflow, /deployments: write/);
  assert.doesNotMatch(workflow, /packages: write/);
  assert.doesNotMatch(workflow, /pull-requests: write/);
});

test("Market IQ incidents deduplicate and record recovery", () => {
  assert.match(workflow, /<!-- market-iq-failure-monitor:/);
  assert.match(workflow, /\[Market IQ\] Stable preview incident/);
  assert.match(workflow, /github\.rest\.issues\.create\(/);
  assert.match(workflow, /github\.rest\.issues\.update\(/);
  assert.match(workflow, /github\.rest\.issues\.createComment\(/);
  assert.match(workflow, /assignees: \[context\.repo\.owner\]/);
  assert.match(workflow, /state: "closed"/);
  assert.match(workflow, /state_reason: "completed"/);
});

test("Market IQ incident reporting excludes secrets and raw endpoint bodies", () => {
  assert.match(workflow, /sanitized operational state/);
  assert.doesNotMatch(workflow, /DWELLSY_DATABASE_URL/);
  assert.doesNotMatch(workflow, /MARKET_IQ_SOURCE_REFRESH_TOKEN/);
  assert.doesNotMatch(workflow, /detail:\s*(?:body|await response\.(?:text|json)\(\))/);
  assert.doesNotMatch(workflow, /raw(?:Response|Body)/);
});
