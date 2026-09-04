import test from "node:test";
import { strict as assert } from "node:assert";
import {
  marketingAbsoluteLabel,
  metricLabels,
  MARKETING_GOLD_MIN,
  MARKETING_SILVER_MIN,
  MARKETING_WATCH_MAX,
} from "./labels";
import { buildScorecardView } from "./view-model";
import type { ScorecardData } from "@/lib/types";

// v0.8 — Marketing Discipline's star went absolute (gold 80 / silver 70) while
// its position bar and label chip stayed cohort-relative. That split was
// visible and wrong in both directions on the shipped seed:
//
//   Emerald Management (Clarksville)  composite 25.6, no star,
//                                     100th percentile -> bar pinned right,
//                                     chip read "strong"
//   CRT Management (Denver)           composite 84.3, GOLD star,
//                                     49th percentile -> bar mid-track,
//                                     chip read "neutral"
//
// 122 operators showed "strong" with no star; 14 showed gold while the chip
// said neutral or watch. These tests pin the rule that fixes it: everything a
// reader sees about marketing keys off the absolute composite, never the
// cohort.

function sc(over: Record<string, unknown> = {}): ScorecardData {
  return {
    pm: { slug: "op", name: "Op", quadrant7Cell: "SFR Independent" },
    market: { id: "chattanooga-tn", name: "Chattanooga", state: "TN", fullName: "Chattanooga MSA" },
    rank: {
      percentiles: { dom: 66, tenancy: 82, rentPerformance: 48, marketing: 100, communityVisibility: null },
      percentilesMulti: { composite: { primary: 68, msa: 62 } },
      compositeCohortUsedForStar: "primary",
    },
    performance: { domStar: "silver" }, tenancy: { star: "gold" }, rentPerformance: { star: null },
    marketing: { compositeScore: 25.6, star: null }, communityVisibility: { star: null },
    ...over,
  } as unknown as ScorecardData;
}
const view = (s: ScorecardData) =>
  buildScorecardView({ scorecard: s, pool: [], trajectory: { points: [] }, marketConcessionMedian: 0.01 });
const marketingRow = (s: ScorecardData) =>
  view(s).operating.metrics.find((m) => m.key === "marketing");

test("marketingAbsoluteLabel bands sit exactly on the star thresholds", () => {
  assert.equal(marketingAbsoluteLabel(MARKETING_GOLD_MIN), "strong");     // 80
  assert.equal(marketingAbsoluteLabel(100), "strong");
  assert.equal(marketingAbsoluteLabel(MARKETING_GOLD_MIN - 0.1), "good");
  assert.equal(marketingAbsoluteLabel(MARKETING_SILVER_MIN), "good");     // 70
  assert.equal(marketingAbsoluteLabel(MARKETING_SILVER_MIN - 0.1), "neutral");
  assert.equal(marketingAbsoluteLabel(MARKETING_WATCH_MAX), "neutral");   // 50
  assert.equal(marketingAbsoluteLabel(MARKETING_WATCH_MAX - 0.1), "watch");
  assert.equal(marketingAbsoluteLabel(0), "watch");
});

test("a missing composite is insufficient, not watch", () => {
  // Absent data must not read as a bad score.
  assert.equal(marketingAbsoluteLabel(null), "insufficient");
  assert.equal(marketingAbsoluteLabel(undefined), "insufficient");
});

test("THE EMERALD CASE — a poor score in a weak cohort cannot read 'strong'", () => {
  // 100th percentile among its peers, but the listings themselves are bad.
  const labels = metricLabels(sc());
  assert.equal(labels.marketing, "watch", "25.6 is a bottom-band score whatever the cohort does");
  // The cohort-scored metrics must be untouched by this change.
  assert.equal(labels.dom, "good");
  assert.equal(labels.tenancy, "strong");
  assert.equal(labels.rentPerformance, "neutral");
});

test("THE CRT CASE — a gold score in a strong cohort cannot read 'neutral'", () => {
  const labels = metricLabels(sc({
    rank: { percentiles: { dom: 66, tenancy: 82, rentPerformance: 48, marketing: 49.4, communityVisibility: null },
            percentilesMulti: { composite: { primary: 68, msa: 62 } }, compositeCohortUsedForStar: "primary" },
    marketing: { compositeScore: 84.3, star: "gold" },
  }));
  assert.equal(labels.marketing, "strong");
});

test("the bar plots the composite itself, not the percentile", () => {
  const row = marketingRow(sc());
  assert.ok(row, "marketing row must render");
  assert.equal(row.scale, "absolute");
  // 25.6/100 — NOT 100/100, which is where the cohort percentile would put it.
  assert.ok(Math.abs(row.position! - 0.256) < 1e-9, `expected 0.256, got ${row.position}`);
  assert.equal(row.label, "watch");
  assert.equal(row.star, null);
});

test("label, star and marker agree across the bands", () => {
  for (const [score, label, star] of [
    [92, "strong", "gold"], [80, "strong", "gold"],
    [78, "good", "silver"], [70, "good", "silver"],
    [65, "neutral", null], [30, "watch", null],
  ] as const) {
    const row = marketingRow(sc({ marketing: { compositeScore: score, star } }))!;
    assert.equal(row.label, label, `score ${score}`);
    assert.equal(row.position, score / 100, `score ${score}`);
    assert.equal(row.star, star, `score ${score}`);
  }
});

test("the other metrics stay on the cohort scale", () => {
  const v = view(sc());
  for (const m of v.operating.metrics.filter((x) => x.key !== "marketing")) {
    assert.equal(m.scale, "cohort", `${m.key} must remain cohort-scored`);
  }
});

test("marketing renders even with no cohort percentile at all", () => {
  // An absolute score needs no cohort, so a null percentile must not drop the
  // card — this is exactly the operator the old filter would have hidden.
  const row = marketingRow(sc({
    rank: { percentiles: { dom: 66, tenancy: 82, rentPerformance: 48, marketing: null, communityVisibility: null },
            percentilesMulti: { composite: { primary: 68, msa: 62 } }, compositeCohortUsedForStar: "primary" },
    marketing: { compositeScore: 88, star: "gold" },
  }));
  assert.ok(row, "an absolutely-scored metric must not need a percentile");
  assert.equal(row.position, 0.88);
  assert.equal(row.label, "strong");
});

test("the cohort-median count excludes marketing", () => {
  // "Above the cohort median on N of M" is a claim about cohorts. Marketing
  // clearing an absolute bar says nothing about peer position, so counting it
  // would make the sentence false — an 84.3 composite is gold while sitting
  // at the 49th percentile, i.e. BELOW its cohort median.
  const v = view(sc({ marketing: { compositeScore: 95, star: "gold" } }));
  const cohortCount = v.operating.metrics.filter((m) => m.scale === "cohort").length;
  assert.match(v.operating.takeaway, new RegExp(`of ${cohortCount} peer-scored dimensions`));
  assert.ok(
    !v.operating.takeaway.includes(`of ${cohortCount + 1}`),
    `marketing must not be counted as a peer-scored dimension: "${v.operating.takeaway}"`
  );
});

test("the cohort count does not move with marketing", () => {
  const strip = (t: string) => t.split(" · ")[0];
  const poor = view(sc({ marketing: { compositeScore: 10, star: null } })).operating.takeaway;
  const great = view(sc({ marketing: { compositeScore: 99, star: "gold" } })).operating.takeaway;
  assert.equal(strip(poor), strip(great), "the cohort-median half must not move with marketing");
});

test("the summary names marketing on its own terms", () => {
  // Both scales in one line, neither borrowing the other's meaning.
  for (const [score, star, expected] of [
    [95, "gold", "· marketing gold"],
    [74, "silver", "· marketing silver"],
    [61, null, "· marketing below silver"],
    [12, null, "· marketing below silver"],
  ] as const) {
    const v = view(sc({ marketing: { compositeScore: score, star } }));
    assert.ok(
      v.operating.takeaway.includes(expected),
      `score ${score}: expected "${expected}" in "${v.operating.takeaway}"`
    );
    assert.ok(
      v.readout[1].value.includes(expected),
      `score ${score}: the exec readout must say it too, got "${v.readout[1].value}"`
    );
  }
});

test("the takeaway reads as one sentence, the readout as a terse line", () => {
  const v = view(sc({ marketing: { compositeScore: 84.3, star: "gold" } }));
  assert.match(v.operating.takeaway, /^Above the cohort median on \d+ of \d+ peer-scored dimensions · marketing gold\.$/);
  assert.match(v.readout[1].value, /^Above cohort median on \d+ of \d+ peer-scored dimensions · marketing gold$/);
});

test("no marketing clause when marketing is unscored", () => {
  const v = view(sc({ marketing: {} }));
  assert.ok(
    !v.operating.takeaway.includes("marketing"),
    `an unscored marketing metric must not be named: "${v.operating.takeaway}"`
  );
  assert.match(v.operating.takeaway, /peer-scored dimensions\.$/);
});

// ── Copy that made a cohort claim about an absolutely-scored metric ────────

test("the gold watch-item makes no cohort claim", async () => {
  // "Gold-tier (top of cohort)" was true of the four peer-scored metrics and
  // false of marketing, and one sentence lists both.
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync("src/lib/scorecard/watch-items.ts", "utf8")
  );
  // Match the EMITTED string, not the bare phrase: the code comment above it
  // quotes the old wording to explain why it went, and a loose grep would
  // flag that documentation as the defect it documents.
  const emitted = src.match(/explanation: `Gold-tier[^`]*`/)?.[0] ?? "";
  assert.ok(emitted, "the gold watch-item explanation is no longer recognisable");
  assert.ok(
    !/top of cohort/.test(emitted),
    `the reader is still told gold means "top of cohort": ${emitted}`
  );
  assert.match(emitted, /^explanation: `Gold-tier on \$\{joinList/);
});

test("the metric definition no longer advertises a marketing cohort ladder", async () => {
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync("src/lib/metric-definitions.ts", "utf8")
  );
  const marketing = src.slice(src.indexOf("  marketing: {"), src.indexOf("methodologyHref: \"/methodology#marketing\""));
  assert.ok(
    !/Primary 7-cell cohort/.test(marketing),
    "the marketing info modal still describes a cohort ladder it no longer uses"
  );
  assert.match(marketing, /absolute bar/);
  assert.match(marketing, /policies/, "the formula must list all five subscores");
});

test("the PDF bar and its legend follow the same scale split", async () => {
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync("src/components/scorecard/OperatorProfilePDF.tsx", "utf8")
  );
  // The band/tick must be driven by the metric's scale, not hardcoded.
  assert.ok(
    !/left: "25%", width: "50%"/.test(src),
    "the PDF still hardcodes a cohort interquartile band for every metric"
  );
  assert.match(src, /metric\.scale === "absolute" \? ABSOLUTE_MARKS : COHORT_MARKS/);
  // And the legend must name the exception rather than describing every bar
  // as a cohort band.
  assert.match(src, /scored against a fixed\s*\n?\s*bar rather than the cohort/);
});
