import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ELIG_T12_MIN,
  ELIG_ADDR_MIN,
  RECENCY_GATE_DAYS,
} from "./methodology-constants";

// Drift guards — the UI explains the ranking rules to clients, so a silent
// divergence from the pipeline means the site states a rule the data doesn't
// follow. Same pattern as the MERGE_ELIGIBILITY_T12_MIN guard in
// operators/merge-candidates.test.ts.

function pipelineSrc(): string {
  return readFileSync(
    join(process.cwd(), "scripts/data-pipeline/pipeline.py"),
    "utf8"
  );
}

test("ELIG_T12_MIN matches pipeline.py", () => {
  const m = pipelineSrc().match(/^ELIG_T12_MIN\s*=\s*(\d+)/m);
  assert.ok(m, "could not find ELIG_T12_MIN in pipeline.py");
  assert.equal(
    ELIG_T12_MIN,
    Number(m[1]),
    `ELIG_T12_MIN (${ELIG_T12_MIN}) must equal pipeline.py (${m[1]}).`
  );
});

test("ELIG_ADDR_MIN matches pipeline.py", () => {
  const m = pipelineSrc().match(/^ELIG_ADDR_MIN\s*=\s*(\d+)/m);
  assert.ok(m, "could not find ELIG_ADDR_MIN in pipeline.py");
  assert.equal(
    ELIG_ADDR_MIN,
    Number(m[1]),
    `ELIG_ADDR_MIN (${ELIG_ADDR_MIN}) must equal pipeline.py (${m[1]}).`
  );
});

test("RECENCY_GATE_DAYS matches tenancy_survival.py", () => {
  const src = readFileSync(
    join(process.cwd(), "scripts/data-pipeline/tenancy_survival.py"),
    "utf8"
  );
  const m = src.match(/^RECENCY_GATE_DAYS\s*=\s*(\d+)/m);
  assert.ok(m, "could not find RECENCY_GATE_DAYS in tenancy_survival.py");
  assert.equal(
    RECENCY_GATE_DAYS,
    Number(m[1]),
    `RECENCY_GATE_DAYS (${RECENCY_GATE_DAYS}) must equal the pipeline's ` +
      `departed-operator gate (${m[1]}).`
  );
});
