// Coverage for countOperatorStars — the single source of truth for
// per-metric gold + silver star totals across the market list, the
// scorecard hero, the operator profile, the compare table, and the
// homepage sample cards.
//
// PR #75 extends the file with coverage for the prospect-share
// helpers (goldMetricNames, starableAxisCount,
// buildCohortFramingSentence). The cohort sentence powers the
// muted lead above the Synthesis section and the bottom line of
// the dynamic OG image; the helpers must handle every star-count
// permutation without throwing.

import test from "node:test";
import { strict as assert } from "node:assert";
import {
  buildCohortFramingSentence,
  countOperatorStars,
  goldMetricNames,
  starableAxisCount,
} from "./stars";
import type { ScorecardData, StarLevel } from "@/lib/types";

/** Build a minimal ScorecardData shaped to test the five star
 *  fields. Everything else is filled with stand-ins that satisfy
 *  the TS shape; the function under test only reads the star
 *  fields.
 *
 *  PR #75 — added pm.name + market.name + rank.compositeCohortName
 *  to the fixture so the cohort framing sentence tests have a
 *  realistic operator + cohort to format. Optional overrides via
 *  the second arg keep existing tests untouched. */
function makeScorecard(
  stars: {
    dom?: StarLevel;
    rent?: StarLevel;
    marketing?: StarLevel;
    tenancy?: StarLevel;
    community?: StarLevel;
  },
  overrides: {
    name?: string;
    marketName?: string;
    compositeCohortName?: string;
  } = {}
): ScorecardData {
  return {
    pm: { name: overrides.name ?? "Test Operator" },
    market: { name: overrides.marketName ?? "Chattanooga" },
    rank: {
      compositeCohortName:
        overrides.compositeCohortName ??
        "Chattanooga MF/BTR Independent cohort",
    },
    performance: { domStar: stars.dom ?? null },
    rentPerformance: stars.rent !== undefined ? { star: stars.rent } : null,
    marketing: { star: stars.marketing ?? null },
    tenancy: { star: stars.tenancy ?? null },
    communityVisibility:
      stars.community !== undefined ? { star: stars.community } : null,
  } as unknown as ScorecardData;
}

test("counts all five gold stars when every metric earns one", () => {
  const sc = makeScorecard({
    dom: "gold",
    rent: "gold",
    marketing: "gold",
    tenancy: "gold",
    community: "gold",
  });
  const result = countOperatorStars(sc);
  assert.equal(result.goldCount, 5);
  assert.equal(result.silverCount, 0);
});

test("counts mixed gold + silver across the five metrics", () => {
  const sc = makeScorecard({
    dom: "gold",
    rent: "silver",
    marketing: "gold",
    tenancy: "silver",
    // no community star
  });
  const result = countOperatorStars(sc);
  assert.equal(result.goldCount, 2);
  assert.equal(result.silverCount, 2);
});

test("treats missing communityVisibility (SFR / Hybrid) as zero stars contributed", () => {
  // SFR operators don't have a communityVisibility scope — the field
  // is null on those scorecards. The helper must not throw or
  // double-count.
  const sc = makeScorecard({
    dom: "gold",
    rent: "silver",
    marketing: "gold",
    tenancy: "silver",
    community: undefined, // → communityVisibility: null
  });
  const result = countOperatorStars(sc);
  assert.equal(result.goldCount, 2);
  assert.equal(result.silverCount, 2);
});

test("treats null per-metric stars as zero — operator-dignity gate output", () => {
  // The v1.0 dignity gate emits null instead of a bronze tier; the
  // helper must treat null as "no star contributed".
  const sc = makeScorecard({
    dom: null,
    rent: null,
    marketing: null,
    tenancy: null,
    community: null,
  });
  const result = countOperatorStars(sc);
  assert.equal(result.goldCount, 0);
  assert.equal(result.silverCount, 0);
});

test("returns zero counts when every star field is undefined", () => {
  const sc = makeScorecard({});
  const result = countOperatorStars(sc);
  assert.equal(result.goldCount, 0);
  assert.equal(result.silverCount, 0);
});

test("ignores any bronze-like value that isn't gold or silver", () => {
  // Defensive: legacy or future tiers (bronze, tier-x) must NOT be
  // counted as either gold or silver. The chip exposes only the two
  // tiers per the v1.0 dignity convention.
  const sc = makeScorecard({
    dom: "bronze" as unknown as StarLevel,
    rent: "gold",
  });
  const result = countOperatorStars(sc);
  assert.equal(result.goldCount, 1);
  assert.equal(result.silverCount, 0);
});

test("the contract is read-only — does not mutate the passed scorecard", () => {
  const sc = makeScorecard({ dom: "gold", rent: "silver" });
  const before = JSON.stringify(sc);
  countOperatorStars(sc);
  assert.equal(JSON.stringify(sc), before);
});

// ─── PR #75 — Prospect-share helpers ────────────────────────────

test("goldMetricNames returns the human-readable names for gold-only axes", () => {
  const sc = makeScorecard({
    dom: "gold",
    rent: "silver",
    marketing: "gold",
    tenancy: null,
    community: "gold",
  });
  const names = goldMetricNames(sc);
  assert.deepEqual(names, [
    "Lease-up Speed",
    "Marketing Discipline",
    "Inventory Transparency",
  ]);
});

test("goldMetricNames returns an empty array when no axis earned gold", () => {
  const sc = makeScorecard({
    dom: "silver",
    rent: "silver",
    marketing: null,
    tenancy: "silver",
  });
  assert.deepEqual(goldMetricNames(sc), []);
});

test("starableAxisCount is 5 when communityVisibility.star is present, 4 otherwise", () => {
  const mfbtr = makeScorecard({ community: "silver" });
  const sfr = makeScorecard({});
  assert.equal(starableAxisCount(mfbtr), 5);
  assert.equal(starableAxisCount(sfr), 4);
});

test("buildCohortFramingSentence — all gold (5/5) → top-quartile sweep variant", () => {
  const sc = makeScorecard(
    {
      dom: "gold",
      rent: "gold",
      marketing: "gold",
      tenancy: "gold",
      community: "gold",
    },
    { name: "Vianova", compositeCohortName: "Chattanooga MF/BTR Independent cohort" }
  );
  const out = buildCohortFramingSentence(sc);
  assert.ok(
    out.includes("Vianova"),
    "must mention operator name"
  );
  assert.ok(
    out.includes("top quartile"),
    "all-gold variant must use the top-quartile sweep phrasing"
  );
  assert.ok(
    out.includes("all 5 performance dimensions"),
    "all-gold variant must say 'all 5 performance dimensions'"
  );
  assert.ok(
    out.includes("Chattanooga MF/BTR Independent cohort"),
    "must include the cohort name verbatim"
  );
});

test("buildCohortFramingSentence — all 4 gold for SFR (no community axis) reads 'all 4'", () => {
  // SFR operators only have 4 starable axes — the sweep variant
  // must say "all 4", not "all 5".
  const sc = makeScorecard(
    { dom: "gold", rent: "gold", marketing: "gold", tenancy: "gold" },
    { name: "Doorby" }
  );
  const out = buildCohortFramingSentence(sc);
  assert.ok(
    out.includes("all 4 performance dimensions"),
    "SFR sweep must use 'all 4', not 'all 5'"
  );
});

test("buildCohortFramingSentence — mixed gold/silver → above-median + gold list", () => {
  const sc = makeScorecard(
    {
      dom: "gold",
      rent: "silver",
      marketing: "gold",
      tenancy: null,
      community: "silver",
    },
    { name: "PMX" }
  );
  const out = buildCohortFramingSentence(sc);
  // 2 gold + 2 silver = 4 of 5 above median
  assert.ok(
    out.includes("4 of 5 dimensions"),
    `mixed variant must surface above-median count, got: ${out}`
  );
  assert.ok(
    out.includes("top-quartile performance on"),
    "mixed variant must include the top-quartile phrase"
  );
  assert.ok(
    out.includes("Lease-up Speed") &&
      out.includes("Marketing Discipline"),
    "mixed variant must list the gold metric names verbatim"
  );
  assert.ok(
    out.includes(" and "),
    "two-gold list must use ' and ' connector (not Oxford comma form)"
  );
});

test("buildCohortFramingSentence — single gold uses no comma list", () => {
  const sc = makeScorecard({ dom: "gold", rent: "silver" });
  const out = buildCohortFramingSentence(sc);
  assert.ok(
    out.includes("top-quartile performance on Lease-up Speed."),
    `single-gold list must be the bare metric name, got: ${out}`
  );
});

test("buildCohortFramingSentence — three gold uses Oxford-comma list", () => {
  const sc = makeScorecard({
    dom: "gold",
    rent: "gold",
    marketing: "gold",
    tenancy: "silver",
  });
  const out = buildCohortFramingSentence(sc);
  assert.ok(
    out.includes("Lease-up Speed, Rent Performance, and Marketing Discipline"),
    `three-gold list must use Oxford comma, got: ${out}`
  );
});

test("buildCohortFramingSentence — silver-only variant doesn't claim top quartile", () => {
  // Pre-fix bug magnet: a silver-only operator must NOT get the
  // mixed variant (which mentions top-quartile performance) — they
  // earned silver, not gold. Variant C handles them separately.
  const sc = makeScorecard(
    { dom: "silver", rent: "silver", marketing: null, tenancy: "silver" },
    { name: "SilverOnly" }
  );
  const out = buildCohortFramingSentence(sc);
  assert.ok(
    !out.includes("top quartile") && !out.includes("top-quartile"),
    `silver-only must NOT claim top-quartile, got: ${out}`
  );
  assert.ok(
    out.includes("above the") && out.includes("median"),
    "silver-only must use the above-median framing"
  );
  assert.ok(
    out.includes("3 of 4"),
    "silver-only count must surface as '3 of 4' for a 4-axis operator with 3 silvers"
  );
});

test("buildCohortFramingSentence — zero stars uses below-median framing", () => {
  const sc = makeScorecard({}, { name: "NoStars" });
  const out = buildCohortFramingSentence(sc);
  assert.ok(
    out.includes("below cohort median"),
    `zero-stars variant must say 'below cohort median', got: ${out}`
  );
  // Must NOT contain any "top-quartile" or "above median" language.
  assert.ok(!out.includes("top quartile"));
  assert.ok(!out.includes("top-quartile"));
  assert.ok(!out.includes("above the"));
});

test("buildCohortFramingSentence — every star-count permutation renders without throwing", () => {
  // Exhaustive guard: every gold/silver count from 0 to 5 must
  // produce a non-empty sentence and not throw. Catches regressions
  // where someone adds a new variant branch and forgets to handle
  // an edge case.
  const levels: Array<StarLevel | undefined> = [
    "gold",
    "silver",
    null as unknown as StarLevel,
    undefined,
  ];
  for (const d of levels) {
    for (const r of levels) {
      for (const m of levels) {
        for (const t of levels) {
          for (const c of levels) {
            const sc = makeScorecard({
              dom: d,
              rent: r,
              marketing: m,
              tenancy: t,
              community: c,
            });
            const out = buildCohortFramingSentence(sc);
            assert.ok(
              typeof out === "string" && out.length > 0,
              `must return non-empty string for stars=${JSON.stringify({ d, r, m, t, c })}`
            );
            assert.ok(
              out.endsWith("."),
              `sentence must end with a period (no fragments), got: ${out}`
            );
          }
        }
      }
    }
  }
});

test("buildCohortFramingSentence — falls back when compositeCohortName is missing", () => {
  // Defensive: if the v0.6.2 seed pipeline ever emits a scorecard
  // without compositeCohortName, the sentence must still produce a
  // legible cohort label rather than "undefined cohort".
  //
  // Construct the fixture manually so the makeScorecard default
  // doesn't paper over the missing field.
  const sc = {
    pm: { name: "Test Operator" },
    market: { name: "Atlanta" },
    rank: { compositeCohortName: undefined },
    performance: { domStar: "gold" },
    rentPerformance: null,
    marketing: { star: null },
    tenancy: { star: null },
    communityVisibility: null,
  } as unknown as ScorecardData;
  const out = buildCohortFramingSentence(sc);
  assert.ok(
    out.includes("Atlanta MSA cohort"),
    `fallback cohort label must be '[market] MSA cohort', got: ${out}`
  );
});

test("buildCohortFramingSentence — strips '(any scale)' parenthetical from cohort name", () => {
  // Mirrors the IdentityHero normalizeCohortName helper — keeps the
  // cohort label clean across the scorecard surface.
  const sc = makeScorecard(
    { dom: "gold" },
    { compositeCohortName: "Nashville Large MF/BTR (any scale)" }
  );
  const out = buildCohortFramingSentence(sc);
  assert.ok(
    !out.includes("(any scale)"),
    `must strip '(any scale)' parenthetical, got: ${out}`
  );
  assert.ok(out.includes("Nashville Large MF/BTR cohort"));
});
