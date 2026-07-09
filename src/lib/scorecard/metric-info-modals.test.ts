import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { METRIC_DEFINITIONS, type MetricKey } from "@/lib/metric-definitions";

// The 5 Operating Performance metrics that get an "i" info modal (spec:
// docs/superpowers/specs/2026-07-08-metric-info-modals-design.md).
const OP_KEYS: MetricKey[] = [
  "dom",
  "tenancy",
  "rentPerformance",
  "marketing",
  "communityVisibility",
];

test("every Operating Performance metric has a complete info-modal definition", () => {
  // Guards against a key rename / missing entry that would blank a modal.
  for (const k of OP_KEYS) {
    const d = METRIC_DEFINITIONS[k];
    assert.ok(d, `metric-definitions missing entry for ${k}`);
    assert.ok(d.name.length > 0, `${k}: empty name`);
    assert.ok(d.definition.length > 0, `${k}: empty definition`);
    assert.ok(d.cohortScope.length > 0, `${k}: empty cohortScope`);
    assert.ok(Array.isArray(d.caveats), `${k}: caveats must be an array`);
  }
});

test("MetricInfoModal is wired into the live Operating Performance cards", () => {
  const src = readFileSync(
    join(
      process.cwd(),
      "src/components/scorecard/redesign/OperatingPerformanceSection.tsx"
    ),
    "utf8"
  );
  assert.ok(
    src.includes('import { MetricInfoModal }'),
    "OperatingPerformanceSection must import MetricInfoModal"
  );
  assert.ok(
    src.includes("<MetricInfoModal metricKey={metric.key}"),
    "each metric card must render <MetricInfoModal metricKey={metric.key} />"
  );
});

test("MetricInfoModal is wired into the home-page sample cards", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/homepage/SampleScorecards.tsx"),
    "utf8"
  );
  assert.ok(
    src.includes("MetricInfoModal"),
    "SampleScorecards must import MetricInfoModal"
  );
  assert.ok(
    /metricKey=\{metricKey\}/.test(src),
    "the Cell component must render <MetricInfoModal metricKey={metricKey} />"
  );
  // The four sample tiles pass their fixed Operating Performance keys.
  for (const k of ["dom", "tenancy", "rentPerformance", "marketing"]) {
    assert.ok(
      src.includes(`metricKey="${k}"`),
      `sample cards must pass metricKey="${k}"`
    );
  }
});
